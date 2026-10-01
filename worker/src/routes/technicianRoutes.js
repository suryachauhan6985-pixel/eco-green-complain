import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../auth.js';

const technicianRoutes = new Hono();

// GET /api/technicians
technicianRoutes.get('/technicians', authenticateToken, async (c) => {
  try {
    const res = await query(
      `SELECT t.*, 
        COUNT(CASE WHEN c.status IN ('Assigned', 'In Progress', 'On Hold') THEN 1 END) as active_jobs_count
       FROM technicians t
       LEFT JOIN complaints c ON t.id = c.assigned_technician_id
       GROUP BY t.id
       ORDER BY t.name ASC`,
      [],
      c.env,
      c.executionCtx
    );
    return c.json({ technicians: res.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/technicians/:id/availability
technicianRoutes.put('/technicians/:id/availability', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { is_available } = body;
    await query(
      'UPDATE technicians SET is_available = $1 WHERE id = $2',
      [is_available ? 1 : 0, id],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/technicians/:id
technicianRoutes.put('/technicians/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { name, phone, area_zone, specialization } = body;
    await query(
      `UPDATE technicians
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           area_zone = COALESCE($3, area_zone),
           specialization = COALESCE($4, specialization)
       WHERE id = $5`,
      [name || null, phone || null, area_zone || null, specialization || null, id],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/technicians/:id
technicianRoutes.delete('/technicians/:id', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM technicians WHERE id = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Technician deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/tour-vouchers/next-sequence
technicianRoutes.get('/tour-vouchers/next-sequence', authenticateToken, async (c) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `EXP-${currentYear}-`;
    const res = await query(
      `SELECT voucher_no FROM technician_tour_expenses 
       WHERE voucher_no LIKE $1 
       ORDER BY voucher_no DESC LIMIT 1`,
      [`${prefix}%`],
      c.env,
      c.executionCtx
    );
    if (!res.rows.length) return c.json({ next_voucher_no: `${prefix}000101` });
    const lastNo = res.rows[0].voucher_no;
    const num = parseInt(lastNo.split('-').pop(), 10) || 100;
    return c.json({ next_voucher_no: `${prefix}${String(num + 1).padStart(6, '0')}` });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/tour-ledger
technicianRoutes.get('/tour-ledger', authenticateToken, async (c) => {
  try {
    const { technician_id } = c.req.query();
    const user = c.get('user');

    let targetTechId = user.role === 'technician'
      ? (user.technician_id || user.id)
      : technician_id;

    let advWhere = '';
    let expWhere = '';
    let stlWhere = '';
    const advParams = [];
    const expParams = [];
    const stlParams = [];

    if (targetTechId && String(targetTechId).trim() !== '' && targetTechId !== 'all') {
      advParams.push(String(targetTechId).trim());
      advWhere = `WHERE a.technician_id::text = $1`;
      expParams.push(String(targetTechId).trim());
      expWhere = `WHERE e.technician_id::text = $1`;
      stlParams.push(String(targetTechId).trim());
      stlWhere = `WHERE s.technician_id::text = $1`;
    }

    const [advRes, expRes, stlRes] = await Promise.all([
      query(`
        SELECT a.*, a.allocated_by as allocated_by_name, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_advances a
        LEFT JOIN technicians t ON t.id::text = a.technician_id::text
        ${advWhere}
        ORDER BY a.allocated_at DESC
      `, advParams, c.env, c.executionCtx),
      query(`
        SELECT e.*, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_expenses e
        LEFT JOIN technicians t ON t.id::text = e.technician_id::text
        ${expWhere}
        ORDER BY e.expense_date DESC, e.created_at DESC
      `, expParams, c.env, c.executionCtx),
      query(`
        SELECT s.*, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_settlements s
        LEFT JOIN technicians t ON t.id::text = s.technician_id::text
        ${stlWhere}
        ORDER BY s.settled_at DESC
      `, stlParams, c.env, c.executionCtx)
    ]);

    const advances = advRes.rows;
    const expenses = expRes.rows;
    const settlements = stlRes.rows;

    const totalAdvance = advances.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    const approvedExpenses = expenses.filter(e => (e.status || '').toLowerCase() === 'approved').reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const totalReturned = settlements.reduce((sum, s) => sum + parseFloat(s.returned_amount || s.amount || 0), 0);
    const totalReimbursed = settlements.reduce((sum, s) => sum + parseFloat(s.reimbursed_amount || 0), 0);
    const currentBalance = (totalAdvance + totalReimbursed) - (approvedExpenses + totalReturned);

    return c.json({
      success: true,
      advances,
      expenses,
      settlements,
      summary: {
        total_advance: totalAdvance,
        approved_expenses: approvedExpenses,
        total_expenses: totalExpenses,
        total_returned: totalReturned,
        total_reimbursed: totalReimbursed,
        net_balance: currentBalance,
        totalAdvance,
        approvedExpenses,
        totalExpenses,
        totalReturned,
        totalReimbursed,
        currentBalance
      }
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-advances
technicianRoutes.post('/tour-advances', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { technician_id, amount, tour_title, purpose, payment_mode, reference_no, notes, allocated_at } = body;
    const user = c.get('user');

    if (!technician_id || !amount || parseFloat(amount) <= 0) {
      return c.json({ error: 'Technician and valid advance amount are required' }, 400);
    }

    const r = await query(`
      INSERT INTO technician_tour_advances (
        technician_id, amount, allocated_by, allocated_at, payment_mode, reference_no, tour_title, notes, purpose
      ) VALUES ($1, $2, $3, COALESCE($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      String(technician_id).trim(),
      parseFloat(amount),
      user.name || 'Admin',
      allocated_at || null,
      payment_mode || 'Cash',
      reference_no || null,
      tour_title || purpose || 'Service Tour',
      notes || null,
      purpose || tour_title || 'Tour Advance for Field Tasks'
    ], c.env, c.executionCtx);

    return c.json({ success: true, advance: r.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-expenses
technicianRoutes.post('/tour-expenses', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const {
      technician_id,
      tour_advance_id,
      expense_date,
      category,
      amount,
      description,
      receipt_url,
      receipt_data,
      receipt_name,
      ticket_id,
      voucher_no
    } = body;

    const targetTechId = user.role === 'technician'
      ? (user.technician_id || user.id)
      : technician_id;

    if (!targetTechId || !amount || parseFloat(amount) <= 0) {
      return c.json({ error: 'Technician and valid amount are required' }, 400);
    }

    const r = await query(`
      INSERT INTO technician_tour_expenses (
        technician_id, tour_advance_id, expense_date, category, amount, description,
        receipt_url, receipt_data, receipt_name, ticket_id, voucher_no, status, created_by
      ) VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11, 'Pending', $12)
      RETURNING *
    `, [
      String(targetTechId).trim(),
      tour_advance_id || null,
      expense_date || null,
      category || 'Travel',
      parseFloat(amount),
      description || '',
      receipt_url || null,
      receipt_data || null,
      receipt_name || null,
      ticket_id || null,
      voucher_no || `EXP-${Date.now()}`,
      user.name || 'Technician'
    ], c.env, c.executionCtx);

    return c.json({ success: true, expense: r.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/tour-expenses/:id/status
technicianRoutes.put('/tour-expenses/:id/status', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { status } = body;
    const user = c.get('user');

    if (!['Approved', 'Rejected', 'Pending'].map(s => s.toLowerCase()).includes((status || '').toLowerCase())) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const normStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    await query(
      `UPDATE technician_tour_expenses 
       SET status = $1, approved_by_name = $2
       WHERE id = $3`,
      [normStatus, user.name || 'Staff', id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-settlements
technicianRoutes.post('/tour-settlements', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { technician_id, advance_amount, expense_amount, returned_amount, reimbursed_amount, notes, tour_advance_id } = body;
    const user = c.get('user');

    if (!technician_id) return c.json({ error: 'Technician required' }, 400);

    const r = await query(`
      INSERT INTO technician_tour_settlements (
        technician_id, advance_amount, expense_amount, returned_amount, reimbursed_amount, notes, tour_advance_id, settled_by, settled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      String(technician_id).trim(),
      parseFloat(advance_amount || 0),
      parseFloat(expense_amount || 0),
      parseFloat(returned_amount || 0),
      parseFloat(reimbursed_amount || 0),
      notes || null,
      tour_advance_id || null,
      user.name || 'Staff'
    ], c.env, c.executionCtx);

    return c.json({ success: true, settlement: r.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/technicians/:id/settle-all - Batch settle all collected cash for a technician
technicianRoutes.post('/technicians/:id/settle-all', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const techId = c.req.param('id');
    const user = c.get('user');

    const techRes = await query('SELECT * FROM technicians WHERE id = $1', [techId], c.env, c.executionCtx);
    if (!techRes.rows.length) return c.json({ error: 'Technician not found' }, 404);
    const tech = techRes.rows[0];

    // Find unsettled complaints
    const compRes = await query(`
      SELECT id, ticket_id, payment_collected
      FROM complaints
      WHERE (assigned_technician_id = $1 OR secondary_technician_id = $1::text OR resolved_by_technician_id = $1::text)
        AND COALESCE(payment_collected, 0) > 0
        AND COALESCE(company_settlement_status, '') != 'Settled with Company'
    `, [techId], c.env, c.executionCtx);

    const unsettledJobs = compRes.rows;
    if (unsettledJobs.length === 0) {
      return c.json({ success: true, message: 'No unsettled cash balances for this technician', settledCount: 0, totalAmount: 0 });
    }

    const totalAmount = unsettledJobs.reduce((sum, j) => sum + Number(j.payment_collected || 0), 0);
    const settler = user.name || 'Admin';

    for (const job of unsettledJobs) {
      await query(`
        UPDATE complaints
        SET company_settlement_status = 'Settled with Company',
            company_settled_at = CURRENT_TIMESTAMP,
            company_settled_by = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [settler, job.id], c.env, c.executionCtx);

      await query(`
        INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
        VALUES ($1, 'Cash Settled with Company', $2, $3, $4, 0)
      `, [job.id, `Company confirmed receipt of ₹${job.payment_collected} collected by technician ${tech.name} into company account via batch settlement.`, settler, user.role || 'admin'], c.env, c.executionCtx);
    }

    return c.json({
      success: true,
      message: `Successfully settled ₹${totalAmount} across ${unsettledJobs.length} complaints for ${tech.name}`,
      settledCount: unsettledJobs.length,
      totalAmount
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default technicianRoutes;
