import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { sendWhatsApp } from '../whatsapp.js';

const complaintRoutes = new Hono();

// Generate Next Ticket ID (e.g., EGS-2026-000115)
async function generateNextTicketId(env, ctx) {
  const currentYear = new Date().getFullYear();
  const prefix = `EGS-${currentYear}-`;
  const res = await query(
    `SELECT ticket_id FROM complaints 
     WHERE ticket_id LIKE $1 
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`],
    env,
    ctx
  );
  let nextNum = 101;
  if (res.rows.length > 0) {
    const parts = res.rows[0].ticket_id.split('-');
    if (parts[2]) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed) && parsed >= nextNum) nextNum = parsed + 1;
    }
  }
  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

// GET /api/complaints - Filtered List
complaintRoutes.get('/', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const { status, priority, product, technician_id, search } = c.req.query();

    let sql = `
      SELECT 
        c.*,
        t.name as technician_name,
        t.phone as technician_phone,
        st.name as secondary_technician_name,
        st.phone as secondary_technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      LEFT JOIN technicians st ON c.secondary_technician_id = st.id::text
      WHERE 1=1
    `;
    const params = [];

    // Role-based visibility
    if (user.role === 'technician') {
      const techId = user.technician_id || user.id;
      if (techId) {
        params.push(String(techId));
        sql += ` AND (c.assigned_technician_id::text = $${params.length} OR c.secondary_technician_id = $${params.length})`;
      } else {
        return c.json({ complaints: [] });
      }
    } else if (user.role === 'customer') {
      const cleanPhone = (user.phone || '').replace(/\D/g, '');
      const last10 = cleanPhone.slice(-10);
      params.push(last10);
      sql += ` AND (c.customer_phone LIKE '%' || $${params.length})`;
    }

    if (status && status !== 'All Statuses') {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }

    if (priority && priority !== 'All Priorities') {
      params.push(priority);
      sql += ` AND c.priority = $${params.length}`;
    }

    if (product && product !== 'All Products') {
      params.push(product);
      sql += ` AND c.product_type = $${params.length}`;
    }

    if (technician_id && technician_id !== 'All Technicians') {
      params.push(String(technician_id));
      sql += ` AND (c.assigned_technician_id::text = $${params.length} OR c.secondary_technician_id = $${params.length})`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(c.ticket_id) LIKE $${params.length} OR
        LOWER(c.customer_name) LIKE $${params.length} OR
        c.customer_phone LIKE $${params.length} OR
        LOWER(COALESCE(c.city, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.consumer_no, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.order_no, '')) LIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY c.created_at DESC';
    const r = await query(sql, params, c.env, c.executionCtx);
    return c.json({ complaints: r.rows, tickets: r.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/complaints/customer-history
complaintRoutes.get('/customer-history', authenticateToken, async (c) => {
  try {
    const phone = c.req.query('phone') || '';
    const cleanDigits = phone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 5) return c.json({ history: [] });

    const last10 = cleanDigits.slice(-10);
    const r = await query(
      `SELECT c.id, c.ticket_id, c.product_type, c.issue_category, c.status, c.created_at, c.resolved_at,
              t.name as technician_name
       FROM complaints c
       LEFT JOIN technicians t ON c.assigned_technician_id = t.id
       WHERE c.customer_phone LIKE '%' || $1
       ORDER BY c.created_at DESC LIMIT 15`,
      [last10],
      c.env,
      c.executionCtx
    );
    return c.json({ history: r.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/complaints/check-active
complaintRoutes.get('/check-active', optionalAuth, async (c) => {
  try {
    const phone = c.req.query('phone') || '';
    const name = c.req.query('name') || '';
    const product_type = c.req.query('product_type') || '';
    const cleanDigits = phone.replace(/\D/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';

    if (!last10 && name.trim().length < 3) {
      return c.json({ hasActiveComplaint: false, complaint: null, has_active: false });
    }

    const checkSql = `
      SELECT id, ticket_id, customer_name, customer_phone, product_type, status, priority, issue_category, created_at
      FROM complaints
      WHERE (
        ($1 != '' AND RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1)
        OR ($2 != '' AND LOWER(TRIM(customer_name)) = LOWER(TRIM($2)))
      )
      AND ($3 = '' OR LOWER(TRIM(product_type)) = LOWER(TRIM($3)))
      AND LOWER(status) NOT IN ('closed', 'cancelled')
      ORDER BY id DESC
      LIMIT 1
    `;
    const r = await query(checkSql, [last10, name.trim(), product_type.trim()], c.env, c.executionCtx);
    if (r.rows.length > 0) {
      return c.json({
        hasActiveComplaint: true,
        has_active: true,
        complaint: r.rows[0],
        active_complaint: r.rows[0]
      });
    }
    return c.json({ hasActiveComplaint: false, has_active: false, complaint: null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/complaints/track/:query (Public)
complaintRoutes.get('/track/:query', async (c) => {
  try {
    const rawQ = (c.req.param('query') || '').trim();
    if (!rawQ) return c.json({ error: 'Search query required' }, 400);

    const searchPhone = rawQ.replace(/\D/g, '').slice(-10);
    const upperTicket = rawQ.toUpperCase();

    const compRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON t.id = c.assigned_technician_id
      WHERE UPPER(c.ticket_id) = $1 
         OR c.ticket_id ILIKE $2
         OR ($3 != '' AND RIGHT(REGEXP_REPLACE(COALESCE(c.customer_phone, ''), '\\D', '', 'g'), 10) = $3)
      ORDER BY c.created_at DESC LIMIT 5
    `, [upperTicket, `%${upperTicket}%`, searchPhone], c.env, c.executionCtx);

    if (compRes.rows.length === 0) return c.json({ error: 'Complaint ticket not found' }, 404);
    const complaint = compRes.rows[0];

    const tlRes = await query(
      'SELECT id, action, notes, performed_by_name, performed_by_role, created_at FROM complaint_timelines WHERE complaint_id = $1 AND notify_customer = 1 ORDER BY created_at ASC', 
      [complaint.id],
      c.env,
      c.executionCtx
    );
    const attRes = await query(
      'SELECT id, file_name, file_url, file_type, created_at FROM complaint_attachments WHERE complaint_id = $1 ORDER BY id ASC', 
      [complaint.id],
      c.env,
      c.executionCtx
    );

    // Sanitize PII for public tracking
    const cleanPhone = complaint.customer_phone || '';
    const maskedPhone = cleanPhone.length >= 4 ? `******${cleanPhone.slice(-4)}` : '******';
    const cleanEmail = complaint.customer_email || '';
    const maskedEmail = cleanEmail.includes('@') ? `${cleanEmail.slice(0, 2)}***@${cleanEmail.split('@')[1]}` : '';

    const publicComplaint = {
      id: complaint.id,
      ticket_id: complaint.ticket_id,
      customer_name: complaint.customer_name,
      customer_phone: maskedPhone,
      customer_email: maskedEmail,
      city: complaint.city,
      customer_address: complaint.city ? `${complaint.city}` : 'On File',
      product_type: complaint.product_type,
      product_serial: complaint.product_serial ? `***${complaint.product_serial.slice(-4)}` : null,
      issue_category: complaint.issue_category,
      issue_description: complaint.issue_description,
      description: complaint.issue_description,
      priority: complaint.priority,
      status: complaint.status,
      technician_name: complaint.technician_name || null,
      technician_phone: complaint.technician_name ? '1800-ECO-SOLAR' : null,
      expected_visit_date: complaint.expected_visit_date,
      created_at: complaint.created_at,
      status_updated_at: complaint.status_updated_at,
      resolved_at: complaint.resolved_at,
      rating: complaint.rating,
      feedback_comments: complaint.feedback_comments,
      attachments: attRes.rows,
      timeline: tlRes.rows
    };

    return c.json({
      success: true,
      ticket: publicComplaint,
      complaint: publicComplaint,
      tickets: [publicComplaint]
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/complaints/:id - Detail
complaintRoutes.get('/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const compRes = await query(
      `SELECT 
        c.*,
        t.name as technician_name,
        t.phone as technician_phone,
        st.name as secondary_technician_name,
        st.phone as secondary_technician_phone
       FROM complaints c
       LEFT JOIN technicians t ON c.assigned_technician_id = t.id
       LEFT JOIN technicians st ON c.secondary_technician_id = st.id::text
       WHERE c.id::text = $1 OR c.ticket_id = $1 LIMIT 1`,
      [id],
      c.env,
      c.executionCtx
    );
    if (compRes.rows.length === 0) return c.json({ error: 'Complaint not found' }, 404);

    const complaint = compRes.rows[0];
    const atts = await query(
      'SELECT id, file_name, file_url, file_type, uploaded_by, created_at FROM complaint_attachments WHERE complaint_id = $1 ORDER BY created_at ASC',
      [complaint.id],
      c.env,
      c.executionCtx
    );
    const timeline = await query(
      'SELECT id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at FROM complaint_timelines WHERE complaint_id = $1 ORDER BY created_at ASC',
      [complaint.id],
      c.env,
      c.executionCtx
    );

    const fullDetail = {
      ...complaint,
      description: complaint.issue_description,
      attachments: atts.rows,
      timeline: timeline.rows
    };

    return c.json({
      ticket: fullDetail,
      complaint: fullDetail
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Helper for Complaint Creation
async function handleCreateComplaint(c, isPublic = false) {
  const body = await c.req.json().catch(() => ({}));
  const customer_name = (body.customer_name || '').trim();
  const raw_phone = (body.customer_phone || '').trim();
  const cleanDigits = raw_phone.replace(/[^0-9]/g, '');
  const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';
  const product_type = (body.product_type || '').trim();

  if (!customer_name || !last10) {
    return c.json({ error: 'Customer name and a valid 10-digit mobile number are required' }, 400);
  }

  // Duplicate Check
  const activeCheckSql = `
    SELECT id, ticket_id, customer_name, customer_phone, product_type, status, created_at
    FROM complaints
    WHERE (
      (RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1 AND LENGTH($1) >= 10)
      OR (LOWER(TRIM(customer_name)) = LOWER(TRIM($2)) AND LENGTH(TRIM($2)) >= 3)
    )
    AND ($3 = '' OR LOWER(TRIM(product_type)) = LOWER(TRIM($3)))
    AND LOWER(status) NOT IN ('closed', 'cancelled')
    ORDER BY id DESC
    LIMIT 1
  `;
  const activeRes = await query(activeCheckSql, [last10, customer_name, product_type], c.env, c.executionCtx);
  if (activeRes.rows.length > 0) {
    const activeTicket = activeRes.rows[0];
    return c.json({
      error: `Active complaint #${activeTicket.ticket_id} is already open for this customer for "${activeTicket.product_type || product_type}" (${activeTicket.customer_name}, Phone: ${activeTicket.customer_phone}, Status: ${activeTicket.status}). Duplicate complaints for the same product cannot be registered until the existing ticket is Closed.`,
      duplicate: true,
      existingTicket: activeTicket
    }, 400);
  }

  const canonicalPhone = `+91${last10}`;
  const ticket_id = await generateNextTicketId(c.env, c.executionCtx);
  const user = c.get('user');

  const insertSql = `
    INSERT INTO complaints (
      ticket_id, customer_name, customer_phone, customer_email, customer_address,
      city, consumer_no, order_no, invoice_no, invoice_date, location_url,
      is_in_warranty, estimated_charges, notify_charges, payment_collected, payment_status,
      product_type, product_serial, installation_id, issue_category, issue_description,
      priority, status, assigned_technician_id, expected_visit_date, registered_by_user_id,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING *
  `;

  const values = [
    ticket_id,
    customer_name,
    canonicalPhone,
    body.customer_email || '',
    body.customer_address || '',
    body.city || '',
    body.consumer_no || '',
    body.order_no || '',
    body.invoice_no || '',
    body.invoice_date || '',
    body.location_url || '',
    (body.is_in_warranty === 1 || body.is_in_warranty === true || body.is_in_warranty === '1' || body.is_in_warranty === 'true') ? 1 : 0,
    Number(body.estimated_charges || 0),
    (body.notify_charges === 1 || body.notify_charges === true || body.notify_charges === '1' || body.notify_charges === 'true') ? 1 : 0,
    0,
    Number(body.estimated_charges || 0) > 0 ? 'Unpaid' : 'Not Applicable',
    body.product_type || 'Solar Rooftop Systems',
    body.product_serial || '',
    body.installation_id || '',
    body.issue_category || 'Service Request',
    body.issue_description || body.description || '',
    body.priority || 'Medium',
    body.assigned_technician_id ? 'Assigned' : 'Unassigned',
    body.assigned_technician_id || null,
    body.expected_visit_date || null,
    user?.id || null
  ];

  const r = await query(insertSql, values, c.env, c.executionCtx);
  const newComp = r.rows[0];

  // Save Direct Attachments
  let directAttachments = [];
  if (body.attachment_urls) {
    try {
      directAttachments = typeof body.attachment_urls === 'string' ? JSON.parse(body.attachment_urls) : body.attachment_urls;
    } catch (_) {}
  } else if (Array.isArray(body.attachments)) {
    directAttachments = body.attachments;
  }

  if (Array.isArray(directAttachments) && directAttachments.length > 0) {
    for (const att of directAttachments) {
      await query(`
        INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        newComp.id,
        att.file_name || 'Document',
        att.file_url || att.storage_key || '',
        att.file_type || 'application/octet-stream',
        att.file_url || att.storage_key || '',
        user?.name || 'Helpdesk'
      ], c.env, c.executionCtx).catch(() => {});
    }
  }

  // Initial Timeline Log
  await query(
    'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
    [newComp.id, 'Registered', `Service ticket registered for ${newComp.product_type}. Issue: ${newComp.issue_category}`, user?.name || (isPublic ? 'Customer' : 'Helpdesk'), user?.role || (isPublic ? 'customer' : 'staff')],
    c.env,
    c.executionCtx
  );

  // In-app notification for Staff
  await query(`
    INSERT INTO in_app_notifications (
      id, type, ticket_id, complaint_id, title, message, customer_name,
      target_role, performed_by_name, performed_by_role
    ) VALUES ($1, 'new_ticket', $2, $3, $4, $5, $6, 'admin', $7, $8)
    ON CONFLICT (id) DO NOTHING
  `, [
    `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    newComp.ticket_id,
    newComp.id,
    `New Ticket Registered: ${newComp.ticket_id}`,
    `New complaint ticket #${newComp.ticket_id} registered for ${newComp.customer_name} (${newComp.product_type} - ${newComp.issue_category}).`,
    newComp.customer_name,
    user?.name || (isPublic ? 'Customer' : 'Helpdesk'),
    user?.role || (isPublic ? 'customer' : 'staff')
  ], c.env, c.executionCtx).catch(() => {});

  // WhatsApp Notification in Background
  let waResult = null;
  c.executionCtx?.waitUntil?.(
    sendWhatsApp({
      to: newComp.customer_phone,
      templateName: 'complaint_registered',
      variables: {
        customer_name: newComp.customer_name,
        ticket_id: newComp.ticket_id,
        product_type: newComp.product_type,
        issue_category: newComp.issue_category,
        estimated_charges: newComp.estimated_charges,
        notify_charges: newComp.notify_charges,
        db_complaint_id: newComp.id
      },
      env: c.env
    }).then(res => { waResult = res; }).catch((waErr) => {
      console.warn('[WhatsApp Notify Note]', waErr.message);
    })
  );

  return c.json({
    message: 'Complaint registered successfully',
    complaint: newComp,
    ticket: newComp,
    whatsapp: waResult
  }, 201);
}

// POST /api/complaints - Register Complaint (Admin / Staff)
complaintRoutes.post('/', optionalAuth, async (c) => {
  return handleCreateComplaint(c, false);
});

// POST /api/complaints/public-register (Public customer portal)
complaintRoutes.post('/public-register', async (c) => {
  return handleCreateComplaint(c, true);
});

// POST /api/complaints/:id/assign - Assign Technician
complaintRoutes.post('/:id/assign', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { technician_id, secondary_technician_id, expected_visit_date, notes } = body;

    if (!technician_id) return c.json({ error: 'Primary Technician is required' }, 400);

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    const techRes = await query('SELECT id, name, phone FROM technicians WHERE id = $1', [technician_id], c.env, c.executionCtx);
    if (!techRes.rows.length) return c.json({ error: 'Primary Technician not found' }, 404);
    const primaryTech = techRes.rows[0];

    let secondaryTech = null;
    if (secondary_technician_id) {
      const stRes = await query('SELECT id, name, phone FROM technicians WHERE id = $1', [secondary_technician_id], c.env, c.executionCtx);
      if (stRes.rows.length) secondaryTech = stRes.rows[0];
    }

    await query(
      `UPDATE complaints
       SET assigned_technician_id = $1,
           secondary_technician_id = $2,
           status = 'Assigned',
           expected_visit_date = COALESCE($3, expected_visit_date),
           assigned_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [primaryTech.id, secondaryTech ? String(secondaryTech.id) : null, expected_visit_date || null, complaint.id],
      c.env,
      c.executionCtx
    );

    const user = c.get('user');
    const assigner = user?.name || user?.username || 'Staff';
    const desc = secondaryTech
      ? `Assigned to ${primaryTech.name} (Primary) & ${secondaryTech.name} (Co-Partner).`
      : `Assigned to ${primaryTech.name}.`;

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Assigned', desc + (notes ? ` Note: ${notes}` : ''), assigner, user?.role || 'staff'],
      c.env,
      c.executionCtx
    );

    // Send WhatsApp to Customer & Primary Technician
    c.executionCtx?.waitUntil?.(
      Promise.allSettled([
        sendWhatsApp({
          to: complaint.customer_phone,
          templateName: 'technician_assigned',
          variables: {
            ticket_id: complaint.ticket_id,
            customer_name: complaint.customer_name,
            technician_name: primaryTech.name
          },
          env: c.env
        }),
        primaryTech.phone ? sendWhatsApp({
          to: primaryTech.phone,
          message: `*Eco Green Solar - New Service Work Order*\n\nTicket No.: *${complaint.ticket_id}*\nCustomer: ${complaint.customer_name} (${complaint.customer_phone})\nAddress: ${complaint.customer_address}\nProduct: ${complaint.product_type}\nIssue: ${complaint.issue_category}\nExpected Visit: ${expected_visit_date || 'Immediate'}\n\nPlease attend to this ticket promptly.`,
          env: c.env
        }) : Promise.resolve()
      ])
    );

    return c.json({ success: true, message: 'Technician assigned successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/note - Status & Follow-up Note (Co-Partner Restricted)
complaintRoutes.post('/:id/note', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { note, status, notify_customer } = body;

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    // Co-partner access check
    if (user.role === 'technician' && user.technician_id) {
      if (String(complaint.secondary_technician_id) === String(user.technician_id) && String(complaint.assigned_technician_id) !== String(user.technician_id)) {
        return c.json({ error: 'Co-partner technician is restricted to view-only access. Stage updates must be submitted by the primary technician.' }, 403);
      }
    }

    if (status && status !== complaint.status) {
      await query('UPDATE complaints SET status = $1, status_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, complaint.id], c.env, c.executionCtx);
    }

    const author = user?.name || user?.username || 'Technician';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, $6)',
      [complaint.id, status ? `Status: ${status}` : 'Visit Note Added', note || 'Follow-up update recorded', author, user?.role || 'staff', notify_customer ? 1 : 0],
      c.env,
      c.executionCtx
    );

    if (notify_customer && complaint.customer_phone) {
      c.executionCtx?.waitUntil?.(
        sendWhatsApp({
          to: complaint.customer_phone,
          message: `*Eco Green Solar Alert*\n\nUpdate on Complaint *${complaint.ticket_id}* (${complaint.product_type}):\nStatus: *${status || complaint.status}*\nNotes: ${note}\n\n- Eco Green Solar Care`,
          env: c.env
        }).catch(() => {})
      );
    }

    return c.json({ success: true, message: 'Note saved' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/resolve - Mark Resolved (Co-Partner Restricted)
complaintRoutes.post('/:id/resolve', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { resolution_notes, closing_photo_url, performed_by, spare_parts_used } = body;

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    // Co-partner technician restricted
    if (user.role === 'technician' && user.technician_id) {
      if (String(complaint.secondary_technician_id) === String(user.technician_id) && String(complaint.assigned_technician_id) !== String(user.technician_id)) {
        return c.json({ error: 'Co-partner technician cannot resolve complaints. Only the primary technician can submit resolution proof.' }, 403);
      }
    }

    const solver = performed_by || user?.name || user?.username || 'Technician';

    await query(
      `UPDATE complaints
       SET status = 'Resolved',
           resolution_notes = $1,
           closing_photo_url = COALESCE($2, closing_photo_url),
           spare_parts_used = COALESCE($3, spare_parts_used),
           resolved_by_technician_id = $4,
           resolved_by_technician_name = $5,
           resolved_at = CURRENT_TIMESTAMP,
           status_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [resolution_notes || '', closing_photo_url || null, spare_parts_used || null, String(user?.technician_id || user?.id || ''), solver, complaint.id],
      c.env,
      c.executionCtx
    );

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Resolved', `Marked as Resolved by ${solver}. Notes: ${resolution_notes || 'All checks passed'}`, solver, user?.role || 'technician'],
      c.env,
      c.executionCtx
    );

    // Save closing photo in attachments if provided
    if (closing_photo_url) {
      await query(
        `INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
         VALUES ($1, 'Resolution_Proof.jpg', $2, 'image/jpeg', $2, $3)`,
        [complaint.id, closing_photo_url, solver],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    // Notify Customer asynchronously
    c.executionCtx?.waitUntil?.(
      sendWhatsApp({
        to: complaint.customer_phone,
        templateName: 'complaint_resolved',
        variables: {
          ticket_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          technician_name: solver,
          resolution_notes: resolution_notes || 'Service successfully completed.'
        },
        env: c.env
      }).catch(() => {})
    );

    return c.json({ success: true, message: 'Complaint resolved successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/payment - Collect Service Charge (Co-Partner Restricted)
complaintRoutes.post('/:id/payment', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { payment_collected, payment_mode, payment_notes, collection_reason } = body;

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    // Co-partner check
    if (user.role === 'technician' && user.technician_id) {
      if (String(complaint.secondary_technician_id) === String(user.technician_id) && String(complaint.assigned_technician_id) !== String(user.technician_id)) {
        return c.json({ error: 'Co-partner technician is restricted to view-only. Only primary technician can collect payments.' }, 403);
      }
    }

    const collectedAmt = Number(payment_collected || 0);
    const estCharges = Number(complaint.estimated_charges || 0);
    const status = collectedAmt >= estCharges ? 'Collected' : 'Partially Paid';

    await query(
      `UPDATE complaints
       SET payment_collected = $1,
           payment_status = $2,
           payment_mode = $3,
           payment_notes = $4,
           collection_reason = $5,
           payment_collected_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [collectedAmt, status, payment_mode || 'Cash', payment_notes || '', collection_reason || '', complaint.id],
      c.env,
      c.executionCtx
    );

    const collector = user?.name || user?.username || 'Staff';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Payment Collected', `Payment of ₹${collectedAmt} collected via ${payment_mode || 'Cash'}.`, collector, user?.role || 'staff'],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Payment recorded' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/close - Quality Desk Final Closure
complaintRoutes.post('/:id/close', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { closure_remarks, rating, feedback_comments } = body;

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    await query(
      `UPDATE complaints
       SET status = 'Closed',
           rating = COALESCE($1, rating),
           feedback_comments = COALESCE($2, feedback_comments),
           closed_at = CURRENT_TIMESTAMP,
           status_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [rating ? Number(rating) : null, feedback_comments || null, complaint.id],
      c.env,
      c.executionCtx
    );

    const closer = user?.name || user?.username || 'Quality Desk';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Closed', `Ticket verified and closed. Remarks: ${closure_remarks || 'Work completed to standard.'}`, closer, user?.role || 'staff'],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Complaint closed successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/reopen
complaintRoutes.post('/:id/reopen', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { reason } = body;

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    await query(
      `UPDATE complaints
       SET status = 'Reopened',
           status_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [complaint.id],
      c.env,
      c.executionCtx
    );

    const reopener = user?.name || user?.username || 'Customer';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Reopened', `Complaint reopened. Reason: ${reason || 'Issue recurred'}`, reopener, user?.role || 'customer'],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Complaint reopened' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/complaints/:id
complaintRoutes.delete('/:id', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM complaint_attachments WHERE complaint_id = $1', [id], c.env, c.executionCtx);
    await query('DELETE FROM complaint_timelines WHERE complaint_id = $1', [id], c.env, c.executionCtx);
    await query('DELETE FROM complaints WHERE id = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Complaint deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default complaintRoutes;
