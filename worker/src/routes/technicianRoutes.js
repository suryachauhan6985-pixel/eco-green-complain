import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../auth.js';
import { deleteR2Object } from '../r2.js';

const technicianRoutes = new Hono();

async function verifyAdminPassword(c) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return { valid: false, status: 403, error: 'Unauthorized: Admin role required' };
  }

  const body = await c.req.json().catch(() => ({}));
  const password = body?.password;
  if (!password || typeof password !== 'string' || !password.trim()) {
    return { valid: false, status: 400, error: 'Administrator password is required to authorize ledger reset' };
  }

  const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [user.id], c.env, c.executionCtx);
  if (!userRes.rows.length || !userRes.rows[0].password_hash) {
    return { valid: false, status: 404, error: 'Administrator user record not found' };
  }

  const isMatch = await bcrypt.compare(password.trim(), userRes.rows[0].password_hash);
  if (!isMatch) {
    return { valid: false, status: 401, error: 'Incorrect administrator password. Ledger reset denied.' };
  }

  return { valid: true };
}

function getISTDateString(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getISTTimeString(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Helper: Calculate Centralized Financial Ledger & Statement with Viewer Accounting Perspective
function buildLedgerAndStatement(advances, expenses, settlements, options = {}) {
  const { fromDate, toDate, ticketId, transactionType, statusFilter, technician, perspective = 'company' } = options;
  const isTech = perspective === 'technician';

  const rawEvents = [];

  // 1. Advance Issued Events
  for (const adv of advances) {
    if ((adv.status || '').toLowerCase() === 'cancelled') continue;
    const advAmt = parseFloat(adv.amount || 0);
    if (advAmt <= 0) continue;

    const ref = adv.reference_no || `ADV-${String(adv.id).padStart(6, '0')}`;
    const rawDate = adv.allocated_at || adv.advance_date || adv.created_at || new Date().toISOString();
    const actualTs = new Date(adv.allocated_at || adv.created_at || rawDate).getTime();

    rawEvents.push({
      id: `adv_${adv.id}`,
      raw_id: adv.id,
      entity_type: 'advance',
      date: rawDate,
      calendar_date: getISTDateString(rawDate),
      actual_timestamp: actualTs,
      time_formatted: getISTTimeString(actualTs),
      reference_no: ref,
      technician_id: String(adv.technician_id),
      technician_name: adv.technician_name || technician?.name || 'Technician',
      ticket_id: adv.ticket_id || null,
      complaint_id: adv.complaint_id || null,
      tx_type: 'advance',
      amount: advAmt,
      description: adv.purpose || adv.tour_title || 'Tour Travel Advance',
      payment_mode: adv.payment_mode || 'Cash',
      status: adv.status || 'Active',
      created_by: adv.allocated_by || adv.allocated_by_name || 'Admin',
      notes: adv.notes || null
    });
  }

  // 2. Expense Vouchers (grouped by voucher_no to maintain voucher identity)
  const voucherMap = new Map();
  for (const exp of expenses) {
    const vNo = exp.voucher_no || `EXP-${exp.id}`;
    if (!voucherMap.has(vNo)) {
      voucherMap.set(vNo, {
        voucher_no: vNo,
        technician_id: String(exp.technician_id),
        technician_name: exp.technician_name || technician?.name || 'Technician',
        ticket_id: exp.ticket_id || null,
        complaint_id: exp.complaint_id || null,
        expense_date: exp.expense_date || exp.created_at,
        created_at: exp.created_at,
        approved_at: exp.approved_at,
        created_by: exp.created_by,
        approved_by_name: exp.approved_by_name,
        receipt_url: exp.receipt_url,
        items: [],
        total_amount: 0,
        approved_amount: 0,
        status: exp.status || 'Submitted'
      });
    }
    const grp = voucherMap.get(vNo);
    const amt = parseFloat(exp.amount || 0);
    grp.items.push(exp);
    grp.total_amount += amt;
    const isAppr = (exp.status || '').toLowerCase() === 'approved' || (exp.status || '').toLowerCase() === 'verified';
    if (isAppr) grp.approved_amount += amt;
    grp.status = exp.status;
    if (exp.approved_at && !grp.approved_at) grp.approved_at = exp.approved_at;
  }

  for (const vch of voucherMap.values()) {
    const isApproved = (vch.status || '').toLowerCase() === 'approved' || (vch.status || '').toLowerCase() === 'verified';
    const isRejected = (vch.status || '').toLowerCase() === 'rejected';

    const catList = Array.from(new Set(vch.items.map(it => it.category).filter(Boolean)));
    const catDesc = catList.join(' + ') || 'Tour Expense';
    const rawDate = vch.expense_date || vch.created_at || new Date().toISOString();
    const actualTs = new Date(vch.approved_at || vch.created_at || rawDate).getTime();

    if (isApproved && vch.approved_amount > 0) {
      rawEvents.push({
        id: `vch_${vch.voucher_no}`,
        raw_id: vch.voucher_no,
        entity_type: 'expense_voucher',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: vch.voucher_no,
        technician_id: vch.technician_id,
        technician_name: vch.technician_name,
        ticket_id: vch.ticket_id,
        complaint_id: vch.complaint_id,
        tx_type: 'expense',
        amount: vch.approved_amount,
        description: `Approved Tour Expense: ${catDesc} (${vch.items.length} items)`,
        payment_mode: 'Voucher Claim',
        status: 'Approved',
        created_by: vch.approved_by_name || 'Admin',
        receipt_url: vch.receipt_url,
        items: vch.items
      });
    } else if (isRejected) {
      rawEvents.push({
        id: `vch_${vch.voucher_no}`,
        raw_id: vch.voucher_no,
        entity_type: 'expense_voucher',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: vch.voucher_no,
        technician_id: vch.technician_id,
        technician_name: vch.technician_name,
        ticket_id: vch.ticket_id,
        complaint_id: vch.complaint_id,
        tx_type: 'rejected_expense',
        amount: 0,
        description: `Rejected Tour Expense: ${catDesc}`,
        payment_mode: 'Voucher Claim',
        status: 'Rejected',
        created_by: vch.approved_by_name || 'Admin',
        receipt_url: vch.receipt_url,
        items: vch.items
      });
    } else {
      rawEvents.push({
        id: `vch_${vch.voucher_no}`,
        raw_id: vch.voucher_no,
        entity_type: 'expense_voucher',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: vch.voucher_no,
        technician_id: vch.technician_id,
        technician_name: vch.technician_name,
        ticket_id: vch.ticket_id,
        complaint_id: vch.complaint_id,
        tx_type: 'pending_expense',
        amount: 0,
        description: `Submitted Tour Expense: ${catDesc} (Pending Verification)`,
        payment_mode: 'Voucher Claim',
        status: 'Pending',
        created_by: vch.created_by || 'Technician',
        receipt_url: vch.receipt_url,
        items: vch.items
      });
    }
  }

  // 3. Settlement Events (Returns, Reimbursements, Adjustments)
  for (const stl of settlements) {
    if ((stl.status || '').toLowerCase() === 'cancelled') continue;
    const isReversed = (stl.status || '').toLowerCase() === 'reversed';
    const retAmt = parseFloat(stl.returned_amount || 0);
    const reimAmt = parseFloat(stl.reimbursed_amount || 0);
    const adjAmt = parseFloat(stl.adjustment_amount || 0);
    const rawDate = stl.settled_at || stl.created_at || new Date().toISOString();
    const actualTs = new Date(stl.settled_at || stl.created_at || rawDate).getTime();

    if (retAmt > 0) {
      rawEvents.push({
        id: `stl_ret_${stl.id}`,
        raw_id: stl.id,
        entity_type: 'settlement_return',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: stl.reference_no || `RET-${String(stl.id).padStart(6, '0')}`,
        technician_id: String(stl.technician_id),
        technician_name: stl.technician_name || technician?.name || 'Technician',
        ticket_id: stl.ticket_id || null,
        complaint_id: null,
        tx_type: 'return',
        amount: retAmt,
        is_reversed: isReversed,
        description: isReversed
          ? `Reversal of Return ${stl.reference_no || ''}: ${stl.reversal_reason || 'Reversed'}`
          : (isTech
              ? `Amount Returned to Company (${stl.payment_mode || 'Cash'}) - ${stl.notes || 'Tour surplus deposit'}`
              : `Amount Returned by Technician (${stl.payment_mode || 'Cash'}) - ${stl.notes || 'Tour surplus deposit'}`),
        payment_mode: stl.payment_mode || 'Cash',
        status: stl.status || 'Settled',
        created_by: stl.settled_by || 'Staff',
        notes: stl.notes
      });
    }

    if (reimAmt > 0) {
      rawEvents.push({
        id: `stl_reim_${stl.id}`,
        raw_id: stl.id,
        entity_type: 'settlement_reimbursement',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: stl.reference_no || `REIM-${String(stl.id).padStart(6, '0')}`,
        technician_id: String(stl.technician_id),
        technician_name: stl.technician_name || technician?.name || 'Technician',
        ticket_id: stl.ticket_id || null,
        complaint_id: null,
        tx_type: 'reimbursement',
        amount: reimAmt,
        is_reversed: isReversed,
        description: isReversed
          ? `Reversal of Reimbursement ${stl.reference_no || ''}: ${stl.reversal_reason || 'Reversed'}`
          : (isTech
              ? `Reimbursement Received from Company (${stl.payment_mode || 'Bank Transfer'}) - ${stl.notes || 'Tour expense claim'}`
              : `Reimbursement Paid to Technician (${stl.payment_mode || 'Bank Transfer'}) - ${stl.notes || 'Tour expense reimbursement'}`),
        payment_mode: stl.payment_mode || 'Bank Transfer',
        status: stl.status || 'Settled',
        created_by: stl.settled_by || 'Staff',
        notes: stl.notes
      });
    }

    if (adjAmt !== 0) {
      rawEvents.push({
        id: `stl_adj_${stl.id}`,
        raw_id: stl.id,
        entity_type: 'settlement_adjustment',
        date: rawDate,
        calendar_date: getISTDateString(rawDate),
        actual_timestamp: actualTs,
        time_formatted: getISTTimeString(actualTs),
        reference_no: stl.reference_no || `ADJ-${String(stl.id).padStart(6, '0')}`,
        technician_id: String(stl.technician_id),
        technician_name: stl.technician_name || technician?.name || 'Technician',
        ticket_id: stl.ticket_id || null,
        complaint_id: null,
        tx_type: 'adjustment',
        amount: adjAmt,
        description: `Balance Adjustment: ${stl.notes || 'Tour balance adjustment'}`,
        payment_mode: 'Adjustment',
        status: stl.status || 'Settled',
        created_by: stl.settled_by || 'Staff',
        notes: stl.notes
      });
    }
  }

  // 4. Chronological sort (oldest to newest for correct running balance)
  // Strict timestamp order like a bank statement
  const fallbackTypeOrder = {
    advance: 1,
    expense_voucher: 2,
    settlement_return: 3,
    settlement_reimbursement: 4,
    settlement_adjustment: 5
  };

  rawEvents.sort((a, b) => {
    const tsA = Number(a.actual_timestamp) || 0;
    const tsB = Number(b.actual_timestamp) || 0;
    if (tsA !== tsB) return tsA - tsB;
    // Tie-breaker only if timestamps are identical down to the millisecond
    const pA = fallbackTypeOrder[a.entity_type] || 99;
    const pB = fallbackTypeOrder[b.entity_type] || 99;
    if (pA !== pB) return pA - pB;
    return String(a.raw_id || a.id || '').localeCompare(String(b.raw_id || b.id || ''));
  });

  // 5. Compute Opening Balance and Statement for specified date range
  let openingBalance = 0;
  const filteredEvents = [];

  const fromTime = fromDate ? new Date(`${fromDate}T00:00:00+05:30`).getTime() : null;
  const toTime = toDate ? new Date(`${toDate}T23:59:59.999+05:30`).getTime() : null;

  for (const ev of rawEvents) {
    const evTime = ev.actual_timestamp || new Date(ev.date).getTime();

    if (ticketId && ticketId !== 'all' && String(ev.ticket_id || '').toLowerCase() !== String(ticketId).toLowerCase()) {
      continue;
    }

    if (transactionType && transactionType !== 'all') {
      if (ev.tx_type !== transactionType && !ev.entity_type.toLowerCase().includes(transactionType.toLowerCase())) {
        continue;
      }
    }

    // Determine perspective-aware Debit, Credit, and Delta
    let debit = 0;
    let credit = 0;
    let delta = 0;
    let particulars = ev.description;
    let typeLabel = ev.entity_type;

    if (ev.entity_type === 'advance') {
      if (isTech) {
        credit = ev.amount;
        delta = ev.amount;
        particulars = 'Tour Advance Received';
        typeLabel = 'Advance Received';
      } else {
        debit = ev.amount;
        delta = ev.amount;
        particulars = 'Tour Advance Given';
        typeLabel = 'Tour Advance';
      }
    } else if (ev.entity_type === 'expense_voucher') {
      if (ev.status === 'Approved' || ev.status === 'Verified') {
        if (isTech) {
          debit = ev.amount;
          delta = -ev.amount;
          particulars = ev.description;
          typeLabel = 'Approved Expense';
        } else {
          credit = ev.amount;
          delta = -ev.amount;
          particulars = ev.description;
          typeLabel = 'Approved Expense';
        }
      } else {
        debit = 0;
        credit = 0;
        delta = 0;
        particulars = ev.description;
        typeLabel = ev.status === 'Rejected' ? 'Rejected Expense' : 'Submitted Expense (Pending)';
      }
    } else if (ev.entity_type === 'settlement_return') {
      if (ev.is_reversed) {
        if (isTech) {
          credit = ev.amount;
          delta = ev.amount;
          typeLabel = 'Return Reversed';
        } else {
          debit = ev.amount;
          delta = ev.amount;
          typeLabel = 'Return Reversed';
        }
      } else {
        if (isTech) {
          debit = ev.amount;
          delta = -ev.amount;
          particulars = 'Amount Returned to Company';
          typeLabel = 'Amount Returned';
        } else {
          credit = ev.amount;
          delta = -ev.amount;
          particulars = 'Amount Returned by Technician';
          typeLabel = 'Amount Returned';
        }
      }
    } else if (ev.entity_type === 'settlement_reimbursement') {
      if (ev.is_reversed) {
        if (isTech) {
          debit = ev.amount;
          delta = -ev.amount;
          typeLabel = 'Reimbursement Reversed';
        } else {
          credit = ev.amount;
          delta = -ev.amount;
          typeLabel = 'Reimbursement Reversed';
        }
      } else {
        if (isTech) {
          credit = ev.amount;
          delta = ev.amount;
          particulars = 'Reimbursement Received from Company';
          typeLabel = 'Reimbursement Received';
        } else {
          debit = ev.amount;
          delta = ev.amount;
          particulars = 'Reimbursement Paid to Technician';
          typeLabel = 'Reimbursement Paid';
        }
      }
    } else if (ev.entity_type === 'settlement_adjustment') {
      if (isTech) {
        if (ev.amount > 0) { credit = ev.amount; delta = ev.amount; }
        else { debit = Math.abs(ev.amount); delta = -Math.abs(ev.amount); }
        typeLabel = 'Balance Adjustment';
      } else {
        if (ev.amount > 0) { debit = ev.amount; delta = ev.amount; }
        else { credit = Math.abs(ev.amount); delta = -Math.abs(ev.amount); }
        typeLabel = 'Balance Adjustment';
      }
    }

    ev.debit = debit;
    ev.credit = credit;
    ev.delta = delta;
    ev.particulars = particulars;
    ev.type_label = typeLabel;

    if (fromTime && evTime < fromTime) {
      openingBalance += delta;
    } else if (toTime && evTime > toTime) {
      continue;
    } else {
      filteredEvents.push(ev);
    }
  }

  // 6. Calculate sequential historical running balance after EACH transaction
  let currentRunning = openingBalance;
  let periodDebit = 0;
  let periodCredit = 0;
  let totalAdvances = 0;
  let totalApprovedExpenses = 0;
  let totalReturns = 0;
  let totalReimbursements = 0;
  let totalAdjustments = 0;

  for (const ev of filteredEvents) {
    currentRunning = currentRunning + ev.delta;
    ev.running_balance = currentRunning;
    periodDebit += ev.debit;
    periodCredit += ev.credit;

    if (isTech) {
      if (currentRunning > 0) {
        ev.balance_direction = 'Cr';
        ev.balance_formatted = `₹${currentRunning.toLocaleString('en-IN')} Cr`;
        ev.balance_label = `₹${currentRunning.toLocaleString('en-IN')} Returnable to Company`;
      } else if (currentRunning < 0) {
        ev.balance_direction = 'Dr';
        ev.balance_formatted = `₹${Math.abs(currentRunning).toLocaleString('en-IN')} Dr`;
        ev.balance_label = `₹${Math.abs(currentRunning).toLocaleString('en-IN')} Reimbursement Receivable from Company`;
      } else {
        ev.balance_direction = 'Settled';
        ev.balance_formatted = '₹0';
        ev.balance_label = '₹0 – Account Settled';
      }
    } else {
      if (currentRunning > 0) {
        ev.balance_direction = 'Dr';
        ev.balance_formatted = `₹${currentRunning.toLocaleString('en-IN')} Dr`;
        ev.balance_label = `₹${currentRunning.toLocaleString('en-IN')} Recoverable from Technician`;
      } else if (currentRunning < 0) {
        ev.balance_direction = 'Cr';
        ev.balance_formatted = `₹${Math.abs(currentRunning).toLocaleString('en-IN')} Cr`;
        ev.balance_label = `₹${Math.abs(currentRunning).toLocaleString('en-IN')} Payable to Technician`;
      } else {
        ev.balance_direction = 'Settled';
        ev.balance_formatted = '₹0';
        ev.balance_label = '₹0 – Account Settled';
      }
    }

    if (ev.entity_type === 'advance') {
      totalAdvances += ev.amount;
    } else if (ev.entity_type === 'expense_voucher' && (ev.status === 'Approved' || ev.status === 'Verified')) {
      totalApprovedExpenses += ev.amount;
    } else if (ev.entity_type === 'settlement_return') {
      totalReturns += ev.amount;
    } else if (ev.entity_type === 'settlement_reimbursement') {
      totalReimbursements += ev.amount;
    } else if (ev.entity_type === 'settlement_adjustment') {
      totalAdjustments += ev.amount;
    }
  }

  const closingBalance = currentRunning;

  let finalPositionType = 'settled';
  let finalPositionLabel = '₹0 – Account Settled';
  let closingFormatted = '₹0';
  let closingDirection = 'Settled';

  if (isTech) {
    if (closingBalance > 0) {
      finalPositionType = 'returnable';
      closingDirection = 'Cr';
      closingFormatted = `₹${closingBalance.toLocaleString('en-IN')} Cr`;
      finalPositionLabel = `₹${closingBalance.toLocaleString('en-IN')} Returnable to Company`;
    } else if (closingBalance < 0) {
      finalPositionType = 'receivable';
      closingDirection = 'Dr';
      closingFormatted = `₹${Math.abs(closingBalance).toLocaleString('en-IN')} Dr`;
      finalPositionLabel = `₹${Math.abs(closingBalance).toLocaleString('en-IN')} Reimbursement Receivable from Company`;
    }
  } else {
    if (closingBalance > 0) {
      finalPositionType = 'recoverable';
      closingDirection = 'Dr';
      closingFormatted = `₹${closingBalance.toLocaleString('en-IN')} Dr`;
      finalPositionLabel = `₹${closingBalance.toLocaleString('en-IN')} Recoverable from Technician`;
    } else if (closingBalance < 0) {
      finalPositionType = 'payable';
      closingDirection = 'Cr';
      closingFormatted = `₹${Math.abs(closingBalance).toLocaleString('en-IN')} Cr`;
      finalPositionLabel = `₹${Math.abs(closingBalance).toLocaleString('en-IN')} Payable to Technician`;
    }
  }

  return {
    perspective,
    perspective_title: isTech ? 'My Account Statement' : 'Technician Account Statement',
    technician: technician || null,
    columns: {
      debit_header: isTech ? 'Debit (Expense / Return)' : 'Debit (Advance Given)',
      credit_header: isTech ? 'Credit (Advance Received)' : 'Credit (Expense / Return)',
      balance_header: 'Running Balance'
    },
    opening_balance: openingBalance,
    opening_balance_formatted: isTech
      ? (openingBalance > 0 ? `₹${openingBalance.toLocaleString('en-IN')} Cr` : (openingBalance < 0 ? `₹${Math.abs(openingBalance).toLocaleString('en-IN')} Dr` : '₹0'))
      : (openingBalance > 0 ? `₹${openingBalance.toLocaleString('en-IN')} Dr` : (openingBalance < 0 ? `₹${Math.abs(openingBalance).toLocaleString('en-IN')} Cr` : '₹0')),
    period_debit: periodDebit,
    period_credit: periodCredit,
    closing_balance: closingBalance,
    closing_balance_formatted: closingFormatted,
    closing_direction: closingDirection,
    total_advances: totalAdvances,
    total_approved_expenses: totalApprovedExpenses,
    total_returns: totalReturns,
    total_reimbursements: totalReimbursements,
    total_adjustments: totalAdjustments,
    status_label: finalPositionLabel,
    position_label: finalPositionLabel,
    final_position: {
      type: finalPositionType,
      amount: Math.abs(closingBalance),
      label: finalPositionLabel,
      direction: closingDirection
    },
    // Strictly actual transactions (WITHOUT opening or closing fake rows)
    transactions: filteredEvents,
    transaction_count: filteredEvents.length
  };
}

// GET /api/technicians
technicianRoutes.get('/technicians', authenticateToken, async (c) => {
  try {
    const res = await query(
      `SELECT t.*, 
        (SELECT COUNT(*) FROM complaints c WHERE (c.assigned_technician_id::text = t.id::text OR c.secondary_technician_id::text = t.id::text) AND c.status IN ('Assigned', 'In Progress', 'On Hold', 'Reopened')) as active_tickets_count,
        (SELECT COUNT(*) FROM complaints c WHERE (c.assigned_technician_id::text = t.id::text OR c.secondary_technician_id::text = t.id::text) AND c.status IN ('Assigned', 'In Progress', 'On Hold', 'Reopened')) as active_jobs_count,
        (SELECT COUNT(*) FROM complaints c WHERE (c.assigned_technician_id::text = t.id::text OR c.secondary_technician_id::text = t.id::text) AND c.status IN ('Resolved', 'Closed')) as resolved_tickets_count
       FROM technicians t
       ORDER BY t.name ASC`,
      [],
      c.env,
      c.executionCtx
    );
    const mapped = (res.rows || []).map(r => ({
      ...r,
      active_tickets_count: parseInt(r.active_tickets_count || 0, 10),
      active_jobs_count: parseInt(r.active_jobs_count || 0, 10),
      resolved_tickets_count: parseInt(r.resolved_tickets_count || 0, 10)
    }));
    return c.json({ technicians: mapped });
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
    const { name, phone, email, area_zone, specialization } = body;
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanName = name ? name.trim() : null;
    const cleanEmail = email ? email.trim() : null;

    // 1. Fetch current technician to get user_id and existing phone
    const currentRes = await query('SELECT * FROM technicians WHERE id = $1', [id], c.env, c.executionCtx);
    if (!currentRes.rows || currentRes.rows.length === 0) {
      return c.json({ error: 'Technician not found' }, 404);
    }
    const currentTech = currentRes.rows[0];

    // 2. Update technicians table
    await query(
      `UPDATE technicians
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           area_zone = COALESCE($4, area_zone),
           specialization = COALESCE($5, specialization)
       WHERE id = $6`,
      [cleanName, cleanPhone || null, cleanEmail, area_zone || null, specialization || null, id],
      c.env,
      c.executionCtx
    );

    // 3. Find and sync linked user in users table
    let targetUserId = currentTech.user_id;
    if (!targetUserId) {
      const userRes = await query(
        `SELECT id FROM users 
         WHERE role = 'technician' 
           AND (
             ($1 != '' AND phone LIKE '%' || $1)
             OR ($2 != '' AND LOWER(email) = LOWER($2))
           )
         ORDER BY id DESC LIMIT 1`,
        [cleanPhone || (currentTech.phone || ''), cleanEmail || (currentTech.email || '')],
        c.env,
        c.executionCtx
      );
      if (userRes.rows && userRes.rows.length > 0) {
        targetUserId = userRes.rows[0].id;
        await query('UPDATE technicians SET user_id = $1 WHERE id = $2', [targetUserId, id], c.env, c.executionCtx).catch(() => {});
      }
    }

    if (targetUserId) {
      await query(
        `UPDATE users 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             email = COALESCE($3, email)
         WHERE id = $4`,
        [cleanName, cleanPhone || null, cleanEmail, targetUserId],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    // 4. Update technician_name on assigned complaints
    if (cleanName) {
      await query(
        'UPDATE complaints SET technician_name = $1 WHERE assigned_technician_id = $2',
        [cleanName, id],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    return c.json({ success: true, message: 'Technician profile and linked user account updated successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/technicians/:id
technicianRoutes.delete('/technicians/:id', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');

    // 1. Delete and clean receipts from Cloudflare R2 for technician tour expenses
    const expRes = await query(
      'SELECT receipt_url FROM technician_tour_expenses WHERE technician_id::text = $1',
      [String(id)],
      c.env,
      c.executionCtx
    ).catch(() => ({ rows: [] }));

    if (expRes.rows && expRes.rows.length > 0 && c.env.MEDIA_BUCKET) {
      for (const exp of expRes.rows) {
        if (exp.receipt_url) {
          const match = exp.receipt_url.match(/\/api\/attachments\/r2\/(.+)$/);
          if (match && match[1]) {
            await deleteR2Object(c.env.MEDIA_BUCKET, decodeURIComponent(match[1])).catch(() => {});
          }
        }
      }
    }

    // 2. Cascade delete tour expenses, advances, and settlements for this technician
    await query('DELETE FROM technician_tour_expenses WHERE technician_id::text = $1', [String(id)], c.env, c.executionCtx).catch(() => {});
    await query('DELETE FROM technician_tour_advances WHERE technician_id::text = $1', [String(id)], c.env, c.executionCtx).catch(() => {});
    await query('DELETE FROM technician_tour_settlements WHERE technician_id::text = $1', [String(id)], c.env, c.executionCtx).catch(() => {});

    // 3. Unassign this technician from any active complaints
    await query(
      'UPDATE complaints SET assigned_technician_id = NULL, technician_name = NULL WHERE assigned_technician_id::text = $1',
      [String(id)],
      c.env,
      c.executionCtx
    ).catch(() => {});

    // 4. Delete the technician profile
    await query('DELETE FROM technicians WHERE id::text = $1', [String(id)], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Technician profile and all associated tour advances, vouchers, and settlements deleted permanently' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-ledger/clear-all - Reset all tour advances, vouchers, and settlements (Admin Only)
technicianRoutes.post('/tour-ledger/clear-all', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const authCheck = await verifyAdminPassword(c);
    if (!authCheck.valid) {
      return c.json({ error: authCheck.error }, authCheck.status);
    }

    // Delete all tour records cleanly
    await query('DELETE FROM technician_tour_settlements', [], c.env, c.executionCtx);
    await query('DELETE FROM technician_tour_expenses', [], c.env, c.executionCtx);
    await query('DELETE FROM technician_tour_advances', [], c.env, c.executionCtx);
    return c.json({ 
      success: true, 
      message: 'All tour advances, expense vouchers, and settlements cleared successfully. Account balances reset to zero.' 
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

async function getVoucherSequenceConfig(env, ctx) {
  try {
    const res = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'voucher_sequence_config' LIMIT 1",
      [],
      env,
      ctx
    );
    if (res.rows && res.rows.length > 0) {
      const parsed = JSON.parse(res.rows[0].setting_value);
      return {
        prefix: parsed.prefix || 'TT-',
        starting_number: parseInt(parsed.starting_number, 10) || 341
      };
    }
  } catch (_) {}
  return { prefix: 'TT-', starting_number: 341 };
}

// GET /api/tour-vouchers/settings - Get voucher sequence prefix and starting number
technicianRoutes.get('/tour-vouchers/settings', authenticateToken, async (c) => {
  try {
    const config = await getVoucherSequenceConfig(c.env, c.executionCtx);
    const res = await query(
      `SELECT voucher_no FROM technician_tour_expenses 
       WHERE voucher_no IS NOT NULL AND voucher_no != ''`,
      [],
      c.env,
      c.executionCtx
    );
    let maxSeq = Math.max(0, config.starting_number - 1);
    for (const row of res.rows) {
      const v = String(row.voucher_no || '');
      const match = v.match(/\d+/g);
      if (match) {
        const num = parseInt(match[match.length - 1], 10);
        if (!isNaN(num) && num > maxSeq && num < 1000000) {
          maxSeq = num;
        }
      }
    }
    const nextSeq = maxSeq + 1;
    const nextVoucherNo = `${config.prefix}${nextSeq}`;
    return c.json({
      success: true,
      prefix: config.prefix,
      starting_number: config.starting_number,
      next_seq: String(nextSeq),
      next_voucher_no: nextVoucherNo
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-vouchers/settings - Admin update voucher sequence configuration
technicianRoutes.post('/tour-vouchers/settings', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const prefix = String(body.prefix || 'TT-').trim();
    const starting_number = parseInt(body.starting_number, 10) || 1;

    const payload = JSON.stringify({ prefix, starting_number });
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by)
       VALUES ('voucher_sequence_config', $1, CURRENT_TIMESTAMP, $2)
       ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2`,
      [payload, user?.name || user?.username || 'Admin'],
      c.env,
      c.executionCtx
    );

    return c.json({
      success: true,
      message: 'Voucher sequence settings saved successfully',
      prefix,
      starting_number
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/tour-vouchers/next-sequence
technicianRoutes.get('/tour-vouchers/next-sequence', authenticateToken, async (c) => {
  try {
    const config = await getVoucherSequenceConfig(c.env, c.executionCtx);
    const res = await query(
      `SELECT voucher_no FROM technician_tour_expenses 
       WHERE voucher_no IS NOT NULL AND voucher_no != ''`,
      [],
      c.env,
      c.executionCtx
    );
    let maxSeq = Math.max(0, config.starting_number - 1);
    for (const row of res.rows) {
      const v = String(row.voucher_no || '');
      const match = v.match(/\d+/g);
      if (match) {
        const num = parseInt(match[match.length - 1], 10);
        if (!isNaN(num) && num > maxSeq && num < 1000000) {
          maxSeq = num;
        }
      }
    }
    const nextSeq = maxSeq + 1;
    const nextVoucherNo = `${config.prefix}${nextSeq}`;
    return c.json({ success: true, next_voucher_no: nextVoucherNo, next_seq: String(nextSeq), prefix: config.prefix });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

async function allocateNextVoucherNumbers(count = 1, env, ctx) {
  const config = await getVoucherSequenceConfig(env, ctx);
  const res = await query(
    `SELECT voucher_no FROM technician_tour_expenses 
     WHERE voucher_no IS NOT NULL AND voucher_no != ''`,
    [],
    env,
    ctx
  );
  let maxSeq = Math.max(0, config.starting_number - 1);
  for (const row of res.rows) {
    const v = String(row.voucher_no || '');
    const match = v.match(/\d+/g);
    if (match) {
      const num = parseInt(match[match.length - 1], 10);
      if (!isNaN(num) && num > maxSeq && num < 1000000) {
        maxSeq = num;
      }
    }
  }
  const vouchers = [];
  for (let i = 1; i <= count; i++) {
    vouchers.push(`${config.prefix}${maxSeq + i}`);
  }
  return vouchers;
}

/**
 * Split items into multiple vouchers such that every single voucher
 * is strictly less than 10,000 (< 10,000, i.e. <= maxCap).
 * If total >= 10,000, it guarantees at least 2 distinct vouchers.
 */
export function partitionItemsUnderCap(items, maxCap = 9999) {
  const valid = items
    .map(it => ({ ...it, amount: parseFloat(it.amount || 0) }))
    .filter(it => it.amount > 0);

  const total = valid.reduce((s, it) => s + it.amount, 0);
  if (total < 10000) {
    return [valid];
  }

  // Minimum vouchers needed: at least 2, or ceil(total / maxCap)
  const minBuckets = Math.max(2, Math.ceil(total / maxCap));
  const targetCap = Math.min(maxCap, Math.ceil(total / minBuckets));

  // Step 1: Expand any single item that is >= 10000 (or >= targetCap if single item) into parts
  const expandedItems = [];
  for (const it of valid) {
    if (it.amount >= 10000 || (valid.length === 1 && it.amount >= 10000)) {
      const partsCount = Math.max(2, Math.ceil(it.amount / maxCap));
      const basePart = Math.floor((it.amount / partsCount) * 100) / 100;
      let running = 0;
      for (let p = 1; p <= partsCount; p++) {
        const partAmt = (p === partsCount) ? Math.round((it.amount - running) * 100) / 100 : basePart;
        running += partAmt;
        expandedItems.push({
          ...it,
          amount: partAmt,
          description: it.description ? `${it.description} (Part ${p}/${partsCount})` : `(Part ${p}/${partsCount})`,
          title: it.title ? `${it.title} (Part ${p}/${partsCount})` : (it.description || 'Expense')
        });
      }
    } else {
      expandedItems.push(it);
    }
  }

  // Step 2: Bin-pack expanded items into buckets
  const buckets = [];
  let currentBucket = [];
  let currentBucketTotal = 0;

  for (const it of expandedItems) {
    if (currentBucket.length > 0 && (currentBucketTotal + it.amount >= 10000 || (buckets.length + 1 < minBuckets && currentBucketTotal >= targetCap))) {
      buckets.push(currentBucket);
      currentBucket = [it];
      currentBucketTotal = it.amount;
    } else if (it.amount >= 10000) {
      const half1 = Math.floor(it.amount / 2);
      const half2 = it.amount - half1;
      if (currentBucket.length > 0) {
        buckets.push(currentBucket);
        currentBucket = [];
        currentBucketTotal = 0;
      }
      buckets.push([{ ...it, amount: half1, description: `${it.description || ''} (Part 1/2)`.trim() }]);
      currentBucket = [{ ...it, amount: half2, description: `${it.description || ''} (Part 2/2)`.trim() }];
      currentBucketTotal = half2;
    } else {
      currentBucket.push(it);
      currentBucketTotal += it.amount;
    }
  }
  if (currentBucket.length > 0) {
    buckets.push(currentBucket);
  }

  // Guarantee at least 2 buckets if total was >= 10000
  if (buckets.length === 1 && total >= 10000) {
    const bItems = buckets[0];
    if (bItems.length === 1) {
      const single = bItems[0];
      const half1 = Math.floor(single.amount / 2);
      const half2 = single.amount - half1;
      return [
        [{ ...single, amount: half1, description: `${single.description || ''} (Part 1/2)`.trim() }],
        [{ ...single, amount: half2, description: `${single.description || ''} (Part 2/2)`.trim() }]
      ];
    } else {
      const mid = Math.ceil(bItems.length / 2);
      return [bItems.slice(0, mid), bItems.slice(mid)];
    }
  }

  return buckets;
}

// PUT /api/tour-vouchers/:voucherNo - Update an existing tour expense voucher and items
technicianRoutes.put('/tour-vouchers/:voucherNo', authenticateToken, async (c) => {
  try {
    const voucherNo = c.req.param('voucherNo');
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const { items, ticket_id, complaint_id, expense_date, receipt_url, receipt_name } = body;

    const existing = await query(
      'SELECT * FROM technician_tour_expenses WHERE voucher_no = $1',
      [voucherNo],
      c.env,
      c.executionCtx
    );

    if (!existing.rows || existing.rows.length === 0) {
      return c.json({ error: 'Voucher not found' }, 404);
    }

    const first = existing.rows[0];
    const targetTechId = first.technician_id;
    const tourAdvanceId = first.tour_advance_id;
    const prevStatus = first.status || 'Pending';

    // Delete existing records under this voucher_no
    await query('DELETE FROM technician_tour_expenses WHERE voucher_no = $1', [voucherNo], c.env, c.executionCtx);

    const rawItems = Array.isArray(items) && items.length > 0
      ? items
      : [{
          category: body.category || 'Other Expense',
          amount: body.amount,
          description: body.description || body.title || ''
        }];

    // Partition items so each resulting voucher is strictly < 10,000
    const buckets = partitionItemsUnderCap(rawItems, 9999);
    let extraVouchers = [];
    if (buckets.length > 1) {
      extraVouchers = await allocateNextVoucherNumbers(buckets.length - 1, c.env, c.executionCtx);
    }
    const allAssignedVouchers = [voucherNo, ...extraVouchers];

    const created = [];
    for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
      const bucketItems = buckets[bIdx];
      const assignedVoucherNo = allAssignedVouchers[bIdx];

      for (const it of bucketItems) {
        const itAmt = parseFloat(it.amount);
        if (!itAmt || itAmt <= 0) continue;

        const r = await query(`
          INSERT INTO technician_tour_expenses (
            technician_id, tour_advance_id, voucher_no, expense_date, category, amount, description,
            receipt_url, receipt_name, ticket_id, complaint_id, status, created_by, approved_by_name
          ) VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `, [
          String(targetTechId).trim(),
          tourAdvanceId || null,
          assignedVoucherNo,
          it.expense_date || expense_date || first.expense_date || null,
          it.category || 'Other Expense',
          itAmt,
          it.description || it.title || '',
          it.receipt_url !== undefined ? it.receipt_url : (receipt_url || first.receipt_url || null),
          it.receipt_name !== undefined ? it.receipt_name : (receipt_name || first.receipt_name || null),
          it.ticket_id || ticket_id || first.ticket_id || null,
          it.complaint_id || complaint_id || first.complaint_id || null,
          prevStatus,
          first.created_by || user.name || 'Technician',
          first.approved_by_name || null
        ], c.env, c.executionCtx);

        if (r.rows[0]) created.push(r.rows[0]);
      }
    }

    return c.json({
      success: true,
      updated: created.length,
      voucher_no: voucherNo,
      voucher_nos: allAssignedVouchers,
      is_split: allAssignedVouchers.length > 1,
      items: created
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/tour-vouchers/:voucherNo/status - Batch approve or reject all items in a voucher
technicianRoutes.put('/tour-vouchers/:voucherNo/status', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const voucherNo = c.req.param('voucherNo');
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const { status, rejection_reason } = body;

    if (!['Approved', 'Rejected', 'Pending'].map(s => s.toLowerCase()).includes((status || '').toLowerCase())) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const normStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    await query(
      `UPDATE technician_tour_expenses
       SET status = $1, approved_by_name = $2, approved_at = CURRENT_TIMESTAMP, rejection_reason = $3
       WHERE voucher_no = $4`,
      [normStatus, user.name || 'Staff', rejection_reason || null, voucherNo],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, voucher_no: voucherNo, status: normStatus });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/tour-ledger - Unified Ledger, Account Balance, Statements & Reconciliation
technicianRoutes.get('/tour-ledger', authenticateToken, async (c) => {
  try {
    const { 
      technician_id, 
      from_date, 
      to_date, 
      ticket_id, 
      transaction_type, 
      status: statusFilter 
    } = c.req.query();
    const user = c.get('user');

    // Strict role check: technician can only access their own financial records
    let targetTechId = null;
    if (user.role === 'technician') {
      let tid = user.technician_id;
      if (!tid) {
        const tr = await query(`SELECT id FROM technicians WHERE user_id = $1 LIMIT 1`, [user.id], c.env, c.executionCtx);
        tid = tr.rows[0]?.id;
      }
      targetTechId = String(tid || user.id).trim();
    } else {
      // Admin / Staff: Require exactly ONE specific technician
      if (technician_id && String(technician_id).trim() !== '' && technician_id !== 'all') {
        targetTechId = String(technician_id).trim();
      } else {
        // Fallback to the first registered technician
        const firstTech = await query(`SELECT id FROM technicians ORDER BY name ASC LIMIT 1`, [], c.env, c.executionCtx);
        targetTechId = firstTech.rows[0]?.id ? String(firstTech.rows[0].id) : null;
      }
    }

    if (!targetTechId) {
      return c.json({ error: 'A specific technician must be selected for account statements' }, 400);
    }

    const techInfoRes = await query(
      `SELECT id, name, phone, area_zone FROM technicians WHERE id::text = $1 LIMIT 1`,
      [targetTechId],
      c.env,
      c.executionCtx
    );
    const targetTechnician = techInfoRes.rows[0] || {
      id: targetTechId,
      name: user.role === 'technician' ? user.name : 'Technician',
      phone: user.phone || '',
      area_zone: 'General Field Zone'
    };

    const advParams = [targetTechId];
    const expParams = [targetTechId];
    const stlParams = [targetTechId];
    const advWhere = `WHERE a.technician_id::text = $1`;
    const expWhere = `WHERE e.technician_id::text = $1`;
    const stlWhere = `WHERE s.technician_id::text = $1`;

    const [advRes, expRes, stlRes, allTechsRes] = await Promise.all([
      query(`
        SELECT a.*, a.allocated_by as allocated_by_name, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_advances a
        LEFT JOIN technicians t ON t.id::text = a.technician_id::text
        ${advWhere}
        ORDER BY a.allocated_at DESC, a.id DESC
      `, advParams, c.env, c.executionCtx),
      query(`
        SELECT e.*, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_expenses e
        LEFT JOIN technicians t ON t.id::text = e.technician_id::text
        ${expWhere}
        ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
      `, expParams, c.env, c.executionCtx),
      query(`
        SELECT s.*, t.name as technician_name, t.phone as technician_phone
        FROM technician_tour_settlements s
        LEFT JOIN technicians t ON t.id::text = s.technician_id::text
        ${stlWhere}
        ORDER BY s.settled_at DESC, s.id DESC
      `, stlParams, c.env, c.executionCtx),
      query(`SELECT id, name, phone, area_zone FROM technicians ORDER BY name ASC`, [], c.env, c.executionCtx)
    ]);

    const advances = advRes.rows || [];
    const expenses = expRes.rows || [];
    const settlements = stlRes.rows || [];
    const allTechnicians = allTechsRes.rows || [];

    // Filter out cancelled advances
    const activeAdvances = advances.filter(a => (a.status || '').toLowerCase() !== 'cancelled');
    const totalAdvance = activeAdvances.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);

    const approvedExpenses = expenses
      .filter(e => ['approved', 'verified'].includes((e.status || '').toLowerCase()))
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const pendingExpenses = expenses
      .filter(e => ['pending', 'submitted'].includes((e.status || '').toLowerCase()))
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const rejectedExpenses = expenses
      .filter(e => (e.status || '').toLowerCase() === 'rejected')
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const activeSettlements = settlements.filter(s => (s.status || '').toLowerCase() !== 'cancelled');
    const totalReturned = activeSettlements.reduce((sum, s) => {
      const isReversed = (s.status || '').toLowerCase() === 'reversed';
      const val = parseFloat(s.returned_amount || 0);
      return sum + (isReversed ? 0 : val);
    }, 0);

    const totalReimbursed = activeSettlements.reduce((sum, s) => {
      const isReversed = (s.status || '').toLowerCase() === 'reversed';
      const val = parseFloat(s.reimbursed_amount || 0);
      return sum + (isReversed ? 0 : val);
    }, 0);

    const totalAdjustments = activeSettlements.reduce((sum, s) => sum + parseFloat(s.adjustment_amount || 0), 0);

    // Standardized Balance Formula: (Advances + Reimbursed) - (Approved Expenses + Returned) + Adjustments
    const netBalance = (totalAdvance + totalReimbursed) - (approvedExpenses + totalReturned) + totalAdjustments;
    const recoverableFromTech = netBalance > 0 ? netBalance : 0;
    const payableToTech = netBalance < 0 ? Math.abs(netBalance) : 0;

    const isTech = user.role === 'technician';
    const perspective = isTech ? 'technician' : 'company';

    let settlementStatus = 'SETTLED';
    let settlementStatusLabel = '₹0 – Account Settled';
    if (netBalance > 0) {
      settlementStatus = isTech ? 'RETURN_PENDING' : 'RECOVERABLE_FROM_TECH';
      settlementStatusLabel = isTech
        ? `₹${netBalance.toLocaleString('en-IN')} Returnable to Company`
        : `₹${netBalance.toLocaleString('en-IN')} Recoverable from Technician`;
    } else if (netBalance < 0) {
      settlementStatus = isTech ? 'REIMBURSEMENT_RECEIVABLE' : 'REIMBURSEMENT_PAYABLE';
      settlementStatusLabel = isTech
        ? `₹${Math.abs(netBalance).toLocaleString('en-IN')} Reimbursement Receivable from Company`
        : `₹${Math.abs(netBalance).toLocaleString('en-IN')} Reimbursement Payable to Technician`;
    }

    // Build Chronological Statement & Ledger with perspective
    const statementData = buildLedgerAndStatement(activeAdvances, expenses, activeSettlements, {
      fromDate: from_date,
      toDate: to_date,
      ticketId: ticket_id,
      transactionType: transaction_type,
      statusFilter,
      technician: targetTechnician,
      perspective
    });

    // Complaint-wise settlement summary
    const complaintSummaryMap = new Map();
    activeAdvances.forEach(adv => {
      if (adv.ticket_id) {
        const tkt = adv.ticket_id;
        if (!complaintSummaryMap.has(tkt)) {
          complaintSummaryMap.set(tkt, {
            ticket_id: tkt,
            complaint_id: adv.complaint_id || null,
            technician_id: adv.technician_id,
            technician_name: adv.technician_name,
            advance_issued: 0,
            approved_expenses: 0,
            returned: 0,
            reimbursed: 0
          });
        }
        complaintSummaryMap.get(tkt).advance_issued += parseFloat(adv.amount || 0);
      }
    });

    expenses.forEach(exp => {
      if (exp.ticket_id) {
        const tkt = exp.ticket_id;
        if (!complaintSummaryMap.has(tkt)) {
          complaintSummaryMap.set(tkt, {
            ticket_id: tkt,
            complaint_id: exp.complaint_id || null,
            technician_id: exp.technician_id,
            technician_name: exp.technician_name,
            advance_issued: 0,
            approved_expenses: 0,
            returned: 0,
            reimbursed: 0
          });
        }
        const isAppr = ['approved', 'verified'].includes((exp.status || '').toLowerCase());
        if (isAppr) {
          complaintSummaryMap.get(tkt).approved_expenses += parseFloat(exp.amount || 0);
        }
      }
    });

    activeSettlements.forEach(stl => {
      if (stl.ticket_id) {
        const tkt = stl.ticket_id;
        if (complaintSummaryMap.has(tkt)) {
          const isReversed = (stl.status || '').toLowerCase() === 'reversed';
          if (!isReversed) {
            complaintSummaryMap.get(tkt).returned += parseFloat(stl.returned_amount || 0);
            complaintSummaryMap.get(tkt).reimbursed += parseFloat(stl.reimbursed_amount || 0);
          }
        }
      }
    });

    const complaintSettlements = Array.from(complaintSummaryMap.values()).map(cs => {
      const net = (cs.advance_issued + cs.reimbursed) - (cs.approved_expenses + cs.returned);
      let status = 'Settled';
      let statusLabel = 'Settled';
      if (net > 0) {
        status = 'Return Pending';
        statusLabel = `₹${net.toLocaleString('en-IN')} Returnable by Technician`;
      } else if (net < 0) {
        status = 'Reimbursement Due';
        statusLabel = `₹${Math.abs(net).toLocaleString('en-IN')} Reimbursement Due`;
      }
      return {
        ...cs,
        net_balance: net,
        status,
        status_label: statusLabel
      };
    });

    // Consolidated Per-Technician Summary (for Admin view)
    const techniciansSummary = allTechnicians.map(t => {
      const techIdStr = String(t.id);
      const tAdvs = activeAdvances.filter(a => String(a.technician_id) === techIdStr);
      const tExps = expenses.filter(e => String(e.technician_id) === techIdStr);
      const tStls = activeSettlements.filter(s => String(s.technician_id) === techIdStr);

      const advSum = tAdvs.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
      const expApproved = tExps
        .filter(e => ['approved', 'verified'].includes((e.status || '').toLowerCase()))
        .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const expTotal = tExps.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

      const retSum = tStls.reduce((sum, s) => {
        const isReversed = (s.status || '').toLowerCase() === 'reversed';
        return sum + (isReversed ? 0 : parseFloat(s.returned_amount || 0));
      }, 0);

      const reimSum = tStls.reduce((sum, s) => {
        const isReversed = (s.status || '').toLowerCase() === 'reversed';
        return sum + (isReversed ? 0 : parseFloat(s.reimbursed_amount || 0));
      }, 0);

      const tNet = (advSum + reimSum) - (expApproved + retSum);
      let tStatus = 'Settled';
      let tStatusLabel = 'Settled';
      if (tNet > 0) {
        tStatus = 'Payable by Technician';
        tStatusLabel = `₹${tNet.toLocaleString('en-IN')} Recoverable`;
      } else if (tNet < 0) {
        tStatus = 'Payable to Technician';
        tStatusLabel = `₹${Math.abs(tNet).toLocaleString('en-IN')} Reimbursement Due`;
      }

      return {
        id: t.id,
        technician_id: t.id,
        name: t.name,
        technician_name: t.name,
        phone: t.phone,
        technician_phone: t.phone,
        area_zone: t.area_zone || 'General Zone',
        total_advance: advSum,
        total_advances: advSum,
        total_expenses: expTotal,
        approved_expenses: expApproved,
        total_returned: retSum,
        total_reimbursed: reimSum,
        net_balance: tNet,
        recoverable_amount: tNet > 0 ? tNet : 0,
        recoverable_from_tech: tNet > 0 ? tNet : 0,
        payable_amount: tNet < 0 ? Math.abs(tNet) : 0,
        payable_to_tech: tNet < 0 ? Math.abs(tNet) : 0,
        status: tStatus,
        status_label: tStatusLabel
      };
    });

    // Company-level financial KPIs
    const companyKPIs = {
      total_advances_issued: techniciansSummary.reduce((sum, t) => sum + t.total_advance, 0),
      total_advances_outstanding: techniciansSummary.reduce((sum, t) => sum + t.total_advance, 0),
      total_approved_expenses: techniciansSummary.reduce((sum, t) => sum + t.approved_expenses, 0),
      total_returnable: techniciansSummary.reduce((sum, t) => sum + t.recoverable_amount, 0),
      total_reimbursement_payable: techniciansSummary.reduce((sum, t) => sum + t.payable_amount, 0),
      total_settled_accounts: techniciansSummary.filter(t => t.net_balance === 0).length,
      total_settled_tours: techniciansSummary.filter(t => t.net_balance === 0).length,
      total_pending_accounts: techniciansSummary.filter(t => t.net_balance !== 0).length
    };

    // System Reconciliation Check
    const calculatedDiscrepancy = Math.abs((totalAdvance + totalReimbursed) - (approvedExpenses + totalReturned) - netBalance);
    const reconciliation = {
      is_balanced: calculatedDiscrepancy < 0.01,
      total_advance: totalAdvance,
      approved_expenses: approvedExpenses,
      total_returned: totalReturned,
      total_reimbursed: totalReimbursed,
      net_calculated_balance: netBalance,
      discrepancy: calculatedDiscrepancy
    };

    return c.json({
      success: true,
      technician: targetTechnician,
      advances: activeAdvances,
      expenses,
      settlements: activeSettlements,
      statement: statementData,
      complaint_settlements: complaintSettlements,
      technicians_summary: techniciansSummary,
      company_kpis: companyKPIs,
      reconciliation,
      summary: {
        total_advance: totalAdvance,
        approved_expenses: approvedExpenses,
        pending_expenses: pendingExpenses,
        rejected_expenses: rejectedExpenses,
        total_expenses: totalExpenses,
        total_returned: totalReturned,
        total_reimbursed: totalReimbursed,
        total_adjustments: totalAdjustments,
        net_balance: netBalance,
        recoverable_from_technician: recoverableFromTech,
        payable_to_technician: payableToTech,
        settlement_status: settlementStatus,
        settlement_status_label: settlementStatusLabel,
        totalAdvance,
        approvedExpenses,
        totalExpenses,
        totalReturned,
        totalReimbursed,
        currentBalance: netBalance
      }
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-advances - Issue Tour Advance with Optional Previous Balance Adjustment
technicianRoutes.post('/tour-advances', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { 
      technician_id, 
      amount, 
      tour_title, 
      purpose, 
      payment_mode, 
      reference_no, 
      notes, 
      allocated_at,
      ticket_id,
      adjust_previous_balance,
      adjusted_amount
    } = body;
    const user = c.get('user');

    if (!technician_id || !amount || parseFloat(amount) <= 0) {
      return c.json({ error: 'Technician and valid advance amount are required' }, 400);
    }

    const currentYear = new Date().getFullYear();
    const autoRef = reference_no || `ADV-${currentYear}-${Date.now().toString().slice(-6)}`;

    const r = await query(`
      INSERT INTO technician_tour_advances (
        technician_id, amount, allocated_by, allocated_at, payment_mode, reference_no, tour_title, notes, purpose, ticket_id, status
      ) VALUES ($1, $2, $3, COALESCE($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9, $10, 'Active')
      RETURNING *
    `, [
      String(technician_id).trim(),
      parseFloat(amount),
      user.name || 'Admin',
      allocated_at || null,
      payment_mode || 'Cash',
      autoRef,
      tour_title || purpose || 'Service Tour',
      notes || null,
      purpose || tour_title || 'Tour Advance for Field Tasks',
      ticket_id || null
    ], c.env, c.executionCtx);

    const advance = r.rows[0];

    // If an explicit previous balance adjustment was authorized:
    if (adjust_previous_balance && parseFloat(adjusted_amount) > 0) {
      const adjRef = `ADJ-${currentYear}-${Date.now().toString().slice(-6)}`;
      await query(`
        INSERT INTO technician_tour_settlements (
          technician_id, settlement_type, advance_amount, expense_amount, returned_amount, reimbursed_amount, adjustment_amount,
          notes, tour_advance_id, settled_by, settled_at, payment_mode, reference_no, status
        ) VALUES ($1, 'adjustment', 0, 0, $2, 0, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'Adjustment', $6, 'Settled')
      `, [
        String(technician_id).trim(),
        parseFloat(adjusted_amount),
        `Previous outstanding recoverable balance adjusted against new advance ${autoRef}`,
        advance.id,
        user.name || 'Admin',
        adjRef
      ], c.env, c.executionCtx);
    }

    return c.json({ success: true, advance });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-advances/:id/cancel - Cancel an unspent advance with audit trail
technicianRoutes.post('/tour-advances/:id/cancel', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const { cancellation_reason } = body;

    await query(
      `UPDATE technician_tour_advances 
       SET status = 'Cancelled', cancellation_reason = $1, notes = COALESCE(notes, '') || ' [Cancelled by ' || $2 || ']'
       WHERE id = $3`,
      [cancellation_reason || 'Advance Cancelled by Administrator', user.name || 'Admin', id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Advance marked as cancelled' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/tour-advances/:id - Edit an advance (Amount, Purpose, Date, Mode, Ref)
technicianRoutes.put('/tour-advances/:id', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { amount, purpose, notes, payment_mode, reference_no, allocated_at, technician_id } = body;

    const existing = await query('SELECT * FROM technician_tour_advances WHERE id::text = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!existing.rows.length) return c.json({ error: 'Tour advance not found' }, 404);

    const r = await query(`
      UPDATE technician_tour_advances
      SET 
        amount = COALESCE($1, amount),
        purpose = COALESCE($2, purpose),
        tour_title = COALESCE($2, tour_title),
        notes = COALESCE($3, notes),
        payment_mode = COALESCE($4, payment_mode),
        reference_no = COALESCE($5, reference_no),
        allocated_at = COALESCE($6, allocated_at),
        technician_id = COALESCE($7, technician_id)
      WHERE id::text = $8
      RETURNING *
    `, [
      amount !== undefined ? parseFloat(amount) : null,
      purpose !== undefined ? purpose : null,
      notes !== undefined ? notes : null,
      payment_mode !== undefined ? payment_mode : null,
      reference_no !== undefined ? reference_no : null,
      allocated_at !== undefined ? allocated_at : null,
      technician_id !== undefined ? String(technician_id) : null,
      id
    ], c.env, c.executionCtx);

    return c.json({ success: true, advance: r.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/tour-advances/:id - Delete an advance
technicianRoutes.delete('/tour-advances/:id', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM technician_tour_advances WHERE id::text = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Tour advance deleted successfully' });
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
      voucher_no,
      items
    } = body;

    const targetTechId = user.role === 'technician'
      ? (user.technician_id || user.id)
      : technician_id;

    if (!targetTechId) {
      return c.json({ error: 'Technician is required' }, 400);
    }

    // Support multi-item submission in a single call
    const rawLineItems = Array.isArray(items) && items.length > 0
      ? items
      : [{
          category: category || 'Travel',
          amount: parseFloat(amount || 0),
          description: description || ''
        }];

    const validItems = rawLineItems
      .map(it => ({
        ...it,
        amount: parseFloat(it.amount || 0)
      }))
      .filter(it => it.amount > 0);

    if (validItems.length === 0) {
      return c.json({ error: 'Please provide at least one valid expense amount' }, 400);
    }

    const totalSubmissionAmount = validItems.reduce((acc, it) => acc + it.amount, 0);

    // Auto-split rule: Each single voucher must be strictly less than ₹10,000 (< 10,000).
    // If total submission >= 10,000, automatically partition into 2 or more vouchers.
    const buckets = partitionItemsUnderCap(validItems, 9999);
    let allAssignedVouchers = [];

    if (buckets.length === 1) {
      // Total < 10,000: Check if an unapproved voucher for this ticket already exists
      let chosenVoucherNo = null;
      if (ticket_id && String(ticket_id).trim()) {
        const trimmedTicket = String(ticket_id).trim();
        const existingUnapproved = await query(
          `SELECT voucher_no, COALESCE(SUM(amount), 0) as current_total 
           FROM technician_tour_expenses 
           WHERE technician_id = $1 
             AND (ticket_id = $2 OR ticket_id ILIKE $3)
             AND LOWER(COALESCE(status, 'pending')) NOT IN ('approved', 'verified')
             AND voucher_no IS NOT NULL AND voucher_no != ''
           GROUP BY voucher_no
           ORDER BY MAX(id) DESC LIMIT 1`,
          [String(targetTechId).trim(), trimmedTicket, `%${trimmedTicket}%`],
          c.env,
          c.executionCtx
        );

        if (existingUnapproved.rows.length > 0 && existingUnapproved.rows[0].voucher_no) {
          const currentTotal = parseFloat(existingUnapproved.rows[0].current_total || 0);
          // Only merge if existing total + new amount will remain strictly less than 10,000!
          if (currentTotal + totalSubmissionAmount < 10000) {
            chosenVoucherNo = existingUnapproved.rows[0].voucher_no;
          }
        }
      }

      if (!chosenVoucherNo && voucher_no && !voucher_no.startsWith('EXP-')) {
        chosenVoucherNo = voucher_no;
      }

      if (!chosenVoucherNo) {
        const nextList = await allocateNextVoucherNumbers(1, c.env, c.executionCtx);
        chosenVoucherNo = nextList[0];
      }
      allAssignedVouchers = [chosenVoucherNo];
    } else {
      // Total >= 10,000: Auto-split into buckets.length vouchers with sequential numbers
      allAssignedVouchers = await allocateNextVoucherNumbers(buckets.length, c.env, c.executionCtx);
    }

    const created = [];
    for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
      const bucketItems = buckets[bIdx];
      const assignedVoucherNo = allAssignedVouchers[bIdx];

      for (const it of bucketItems) {
        const itAmt = parseFloat(it.amount || 0);
        if (itAmt <= 0) continue;

        const r = await query(`
          INSERT INTO technician_tour_expenses (
            technician_id, tour_advance_id, expense_date, category, amount, description,
            receipt_url, receipt_data, receipt_name, ticket_id, voucher_no, status, created_by
          ) VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11, 'Pending', $12)
          RETURNING *
        `, [
          String(targetTechId).trim(),
          tour_advance_id || null,
          it.expense_date || expense_date || null,
          it.category || category || 'Travel',
          itAmt,
          it.description || it.title || description || '',
          it.receipt_url !== undefined ? it.receipt_url : (receipt_url || null),
          receipt_data || null,
          it.receipt_name !== undefined ? it.receipt_name : (receipt_name || null),
          it.ticket_id || ticket_id || null,
          assignedVoucherNo,
          user.name || 'Technician'
        ], c.env, c.executionCtx);

        if (r.rows[0]) created.push(r.rows[0]);
      }
    }

    return c.json({
      success: true,
      count: created.length,
      voucher_no: allAssignedVouchers[0],
      voucher_nos: allAssignedVouchers,
      is_split: allAssignedVouchers.length > 1,
      items: created,
      message: allAssignedVouchers.length > 1
        ? `Voucher claim of ₹${totalSubmissionAmount} automatically split into ${allAssignedVouchers.length} vouchers (${allAssignedVouchers.join(', ')}) strictly under ₹10,000 each.`
        : `Voucher ${allAssignedVouchers[0]} saved successfully.`
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/tour-expenses/:id/status
technicianRoutes.put('/tour-expenses/:id/status', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { status, rejection_reason, approved_by_name } = body;
    const user = c.get('user');

    const allowed = ['approved', 'rejected', 'pending', 'submitted'];
    if (!allowed.includes((status || '').toLowerCase())) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const isAppr = (status || '').toLowerCase() === 'approved';
    const isRej = (status || '').toLowerCase() === 'rejected';
    const normStatus = isAppr ? 'Approved' : (isRej ? 'Rejected' : 'Pending');
    const approver = isAppr ? (approved_by_name || user.name || 'Admin') : null;

    await query(
      `UPDATE technician_tour_expenses 
       SET status = $1, 
           approved_by_name = $2, 
           approved_at = CASE WHEN $1 = 'Approved' THEN CURRENT_TIMESTAMP ELSE NULL END, 
           rejection_reason = $3
       WHERE id = $4`,
      [normStatus, approver, rejection_reason || null, id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, status: normStatus });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/tour-expenses/:id - Delete single expense item
technicianRoutes.delete('/tour-expenses/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const isAdminOrStaff = ['admin', 'staff'].includes(user.role);

    // Fetch existing expense item to check permissions & voucher status
    const existing = await query('SELECT * FROM technician_tour_expenses WHERE id::text = $1', [id], c.env, c.executionCtx);
    if (existing.rows.length === 0) {
      return c.json({ success: true, message: 'Tour expense item already removed or not found' });
    }

    const exp = existing.rows[0];

    // If technician, can only delete their own non-approved expenses
    if (!isAdminOrStaff) {
      const techId = String(user.technicianId || user.technician_id || user.id);
      if (String(exp.technician_id) !== techId) {
        return c.json({ error: 'Unauthorized to delete this expense' }, 403);
      }
      if ((exp.status || '').toLowerCase() === 'approved') {
        return c.json({ error: 'Approved expense items cannot be deleted' }, 400);
      }
    }

    await query('DELETE FROM technician_tour_expenses WHERE id::text = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Tour expense deleted successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/tour-vouchers/:voucherNo - Delete an entire voucher and all its line items
technicianRoutes.delete('/tour-vouchers/:voucherNo', authenticateToken, async (c) => {
  try {
    const rawVoucherNo = c.req.param('voucherNo');
    const voucherNo = decodeURIComponent(rawVoucherNo).trim();
    const user = c.get('user');
    const isAdminOrStaff = ['admin', 'staff'].includes(user.role);

    if (!voucherNo) {
      return c.json({ error: 'Voucher number is required' }, 400);
    }

    // Check if voucher exists and check permissions
    const existing = await query(
      'SELECT id, status, technician_id FROM technician_tour_expenses WHERE voucher_no = $1',
      [voucherNo],
      c.env,
      c.executionCtx
    );

    if (existing.rows.length === 0) {
      return c.json({ success: true, message: 'Voucher not found or already deleted' });
    }

    if (!isAdminOrStaff) {
      const techId = String(user.technicianId || user.technician_id || user.id);
      const isOwner = existing.rows.every(r => String(r.technician_id) === techId);
      if (!isOwner) {
        return c.json({ error: 'Unauthorized to delete this voucher' }, 403);
      }
      const hasApproved = existing.rows.some(r => (r.status || '').toLowerCase() === 'approved');
      if (hasApproved) {
        return c.json({ error: 'Approved voucher cannot be deleted. Contact Admin to revert approval first.' }, 400);
      }
    }

    await query('DELETE FROM technician_tour_expenses WHERE voucher_no = $1', [voucherNo], c.env, c.executionCtx);
    return c.json({ success: true, message: `Voucher ${voucherNo} deleted successfully` });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-settlements - Record Return, Reimbursement or Adjustment
technicianRoutes.post('/tour-settlements', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { 
      technician_id, 
      settlement_type = 'return',
      returned_amount = 0, 
      reimbursed_amount = 0, 
      adjustment_amount = 0,
      payment_mode = 'Cash',
      reference_no,
      ticket_id,
      notes, 
      tour_advance_id 
    } = body;
    const user = c.get('user');

    if (!technician_id) return c.json({ error: 'Technician is required' }, 400);

    const ret = parseFloat(returned_amount || 0);
    const reim = parseFloat(reimbursed_amount || 0);
    const adj = parseFloat(adjustment_amount || 0);

    if (ret <= 0 && reim <= 0 && adj === 0) {
      return c.json({ error: 'Valid return, reimbursement, or adjustment amount is required' }, 400);
    }

    const currentYear = new Date().getFullYear();
    let autoRef = reference_no;
    if (!autoRef) {
      if (ret > 0) autoRef = `RET-${currentYear}-${Date.now().toString().slice(-6)}`;
      else if (reim > 0) autoRef = `REIM-${currentYear}-${Date.now().toString().slice(-6)}`;
      else autoRef = `ADJ-${currentYear}-${Date.now().toString().slice(-6)}`;
    }

    const r = await query(`
      INSERT INTO technician_tour_settlements (
        technician_id, settlement_type, advance_amount, expense_amount, returned_amount, reimbursed_amount, adjustment_amount,
        payment_mode, reference_no, ticket_id, notes, tour_advance_id, settled_by, settled_at, status
      ) VALUES ($1, $2, 0, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, 'Settled')
      RETURNING *
    `, [
      String(technician_id).trim(),
      settlement_type,
      ret,
      reim,
      adj,
      payment_mode || 'Cash',
      autoRef,
      ticket_id || null,
      notes || null,
      tour_advance_id || null,
      user.name || 'Staff'
    ], c.env, c.executionCtx);

    return c.json({ success: true, settlement: r.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/tour-settlements/:id/reverse - Reverse a settlement transaction preserving audit history
technicianRoutes.post('/tour-settlements/:id/reverse', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const { reversal_reason } = body;

    if (!reversal_reason || !reversal_reason.trim()) {
      return c.json({ error: 'Reversal reason is required for audit history' }, 400);
    }

    await query(
      `UPDATE technician_tour_settlements
       SET status = 'Reversed', reversal_reason = $1, notes = COALESCE(notes, '') || ' [Reversed by ' || $2 || ': ' || $1 || ']'
       WHERE id = $3`,
      [reversal_reason.trim(), user.name || 'Admin', id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Settlement transaction marked as reversed' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/tour-settlements/:id - Permanently delete a settlement/deposit record
technicianRoutes.delete('/tour-settlements/:id', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const res = await query('DELETE FROM technician_tour_settlements WHERE id::text = $1 RETURNING *', [String(id)], c.env, c.executionCtx);
    if (!res.rows.length) {
      return c.json({ error: 'Settlement record not found' }, 404);
    }
    return c.json({ success: true, message: 'Settlement record deleted permanently. Deposit balance updated.' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/technicians/:id/reset-tour-ledger - Reset specific technician's tour ledger (advances, expenses, settlements) to zero
technicianRoutes.post('/technicians/:id/reset-tour-ledger', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const authCheck = await verifyAdminPassword(c);
    if (!authCheck.valid) {
      return c.json({ error: authCheck.error }, authCheck.status);
    }

    const techId = c.req.param('id');
    await query('DELETE FROM technician_tour_settlements WHERE technician_id::text = $1', [String(techId)], c.env, c.executionCtx);
    await query('DELETE FROM technician_tour_expenses WHERE technician_id::text = $1', [String(techId)], c.env, c.executionCtx);
    await query('DELETE FROM technician_tour_advances WHERE technician_id::text = $1', [String(techId)], c.env, c.executionCtx);
    return c.json({
      success: true,
      message: 'Technician tour ledger, deposits, and balances reset to zero successfully.'
    });
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

    // Find unsettled complaints for primary technician
    const compRes = await query(`
      SELECT id, ticket_id, payment_collected
      FROM complaints
      WHERE (assigned_technician_id = $1 OR (assigned_technician_id IS NULL AND resolved_by_technician_id = $1::text))
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
