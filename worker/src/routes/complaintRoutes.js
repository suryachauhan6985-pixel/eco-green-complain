import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { sendWhatsApp } from '../whatsapp.js';
import { deleteR2Object, moveR2Object } from '../r2.js';
import { dispatchPushToRoles, dispatchPushToTechnician } from '../services/webPushService.js';

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

export function isSurveyTicket(productType, issueCategory) {
  const p = String(productType || '').toUpperCase();
  const c = String(issueCategory || '').toUpperCase();
  return p.includes('SURVEY') || c.includes('SURVEY');
}

// Self-healing check for retention schema
let retentionSchemaEnsured = false;
async function ensureRetentionSchema(env, ctx) {
  if (retentionSchemaEnsured) return;
  try {
    await query(`
      ALTER TABLE complaints ADD COLUMN IF NOT EXISTS documents_purged INT DEFAULT 0;
      ALTER TABLE complaints ADD COLUMN IF NOT EXISTS documents_purged_at TIMESTAMP;
      ALTER TABLE complaint_attachments ADD COLUMN IF NOT EXISTS is_purged INT DEFAULT 0;
    `, [], env, ctx);
    retentionSchemaEnsured = true;
  } catch (_) {}
}

/**
 * Purge all R2 media files for a complaint closed > 30 days ago
 * Preserves the complaint row, customer data, and attachment metadata in database.
 */
export async function purgeComplaintDocumentsIfExpired(complaint, env, ctx) {
  if (!complaint) return false;
  await ensureRetentionSchema(env, ctx);

  const isClosed = ['Closed', 'closed'].includes(complaint.status);
  const closedDate = complaint.closed_at ? new Date(complaint.closed_at) : null;
  if (!isClosed || !closedDate || isNaN(closedDate.getTime())) return false;

  const msIn30Days = 30 * 24 * 60 * 60 * 1000;
  const isPast30Days = (Date.now() - closedDate.getTime()) >= msIn30Days;
  if (!isPast30Days) return false;

  // Already purged
  if (Number(complaint.documents_purged) === 1) return true;

  try {
    const bucket = env?.MEDIA_BUCKET;
    const ticketId = complaint.ticket_id;
    const compId = complaint.id;

    // 1. Fetch attachments
    const atts = await query(
      'SELECT id, file_url, file_data, file_name FROM complaint_attachments WHERE complaint_id = $1',
      [compId],
      env,
      ctx
    );

    const keysToDelete = new Set();

    // From attachments rows
    for (const row of atts.rows) {
      const candidates = [row.file_url, row.file_data].filter(Boolean);
      for (const u of candidates) {
        const match = u.match(/(?:complaints\/[^\s"']+)/);
        if (match) keysToDelete.add(decodeURIComponent(match[0]));
      }
    }

    // From closing photo
    if (complaint.closing_photo_url) {
      const match = complaint.closing_photo_url.match(/(?:complaints\/[^\s"']+)/);
      if (match) keysToDelete.add(decodeURIComponent(match[0]));
    }

    // List R2 objects under complaints/${ticketId}/ prefix to ensure 100% complete purge of all media
    if (bucket && typeof bucket.list === 'function' && ticketId) {
      try {
        const listed = await bucket.list({ prefix: `complaints/${ticketId}/` });
        if (listed && listed.objects) {
          for (const obj of listed.objects) {
            keysToDelete.add(obj.key);
          }
        }
      } catch (err) {
        console.warn(`[R2 List Purge Error for ${ticketId}]`, err.message);
      }
    }

    // Delete all collected objects from Cloudflare R2
    if (bucket && keysToDelete.size > 0) {
      for (const key of keysToDelete) {
        try {
          await deleteR2Object(bucket, key);
        } catch (delErr) {
          console.warn(`[Purge R2 Object Error] Key: ${key}:`, delErr.message);
        }
      }
    }

    // Update database: mark attachments as purged while preserving file_name & upload info
    await query(
      'UPDATE complaint_attachments SET is_purged = 1, file_url = NULL, file_data = NULL WHERE complaint_id = $1',
      [compId],
      env,
      ctx
    ).catch(() => {});

    // Update complaint record
    await query(
      `UPDATE complaints 
       SET documents_purged = 1, 
           documents_purged_at = CURRENT_TIMESTAMP, 
           closing_photo_url = NULL 
       WHERE id = $1`,
      [compId],
      env,
      ctx
    ).catch(() => {});

    // Log in complaint timeline for full enterprise audit
    await query(
      `INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
       VALUES ($1, 'Documents Purged', 'All attachments and closing media were automatically removed from Cloudflare R2 storage in accordance with the 30-day post-closure retention policy. Complaint details and records remain permanently archived.', 'Automated Lifecycle System', 'system', 0)`,
      [compId],
      env,
      ctx
    ).catch(() => {});

    complaint.documents_purged = 1;
    complaint.documents_purged_at = new Date().toISOString();
    complaint.closing_photo_url = null;
    return true;
  } catch (e) {
    console.error(`[Purge Expired Docs Error] Ticket ${complaint.ticket_id}:`, e);
    return false;
  }
}

/**
 * Batch process all closed complaints older than 30 days
 */
export async function runBatchExpiredDocumentsPurge(env, ctx) {
  await ensureRetentionSchema(env, ctx);

  const sql = `
    SELECT id, ticket_id, status, closed_at, documents_purged, closing_photo_url
    FROM complaints
    WHERE status IN ('Closed', 'closed')
      AND closed_at IS NOT NULL
      AND closed_at < (NOW() - INTERVAL '30 days')
      AND (documents_purged IS NULL OR documents_purged = 0)
    ORDER BY closed_at ASC
    LIMIT 100
  `;
  const res = await query(sql, [], env, ctx);
  let purgedCount = 0;
  const purgedTickets = [];

  for (const comp of res.rows) {
    const ok = await purgeComplaintDocumentsIfExpired(comp, env, ctx);
    if (ok) {
      purgedCount++;
      purgedTickets.push(comp.ticket_id);
    }
  }

  return { 
    success: true, 
    purgedCount, 
    purgedTickets, 
    message: `Successfully purged expired documents for ${purgedCount} complaints older than 30 days.` 
  };
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
        LOWER(COALESCE(c.order_no, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.dealer_name, '')) LIKE $${params.length}
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

// POST /api/complaints/purge-expired-documents - Batch Lifecycle Purge (>30 days closed)
complaintRoutes.post('/purge-expired-documents', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const res = await runBatchExpiredDocumentsPurge(c.env, c.executionCtx);
    return c.json(res);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/complaints/purge-expired-documents - Trigger Alias
complaintRoutes.get('/purge-expired-documents', optionalAuth, async (c) => {
  try {
    const res = await runBatchExpiredDocumentsPurge(c.env, c.executionCtx);
    return c.json(res);
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

    // Check and auto-purge documents from R2 if complaint closed > 30 days
    await purgeComplaintDocumentsIfExpired(complaint, c.env, c.executionCtx);

    const atts = await query(
      'SELECT id, file_name, file_url, file_type, uploaded_by, COALESCE(is_purged, 0) as is_purged, created_at FROM complaint_attachments WHERE complaint_id = $1 ORDER BY created_at ASC',
      [complaint.id],
      c.env,
      c.executionCtx
    );

    // Auto-relocate any legacy attachments stuck in complaints/temp/ to complaints/${complaint.ticket_id}/ in R2
    if (c.env?.MEDIA_BUCKET && complaint.ticket_id && atts.rows.length > 0) {
      for (const row of atts.rows) {
        if (row.file_url && row.file_url.includes('complaints/temp/')) {
          const oldKey = row.file_url.replace(/^.*\/api\/attachments\/r2\//, '').replace(/^\/+/, '');
          const newKey = oldKey.replace(/^complaints\/temp\//, `complaints/${complaint.ticket_id}/`);
          try {
            const moved = await moveR2Object(c.env.MEDIA_BUCKET, oldKey, newKey);
            if (moved) {
              const newUrl = `/api/attachments/r2/${newKey}`;
              row.file_url = newUrl;
              await query(
                'UPDATE complaint_attachments SET file_url = $1, file_data = $1 WHERE id = $2',
                [newUrl, row.id],
                c.env,
                c.executionCtx
              ).catch(() => {});
            }
          } catch (e) {
            console.error('Failed to auto-relocate legacy temp attachment in R2:', e);
          }
        }
      }
    }

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
      complaint: fullDetail,
      attachments: atts.rows,
      timeline: timeline.rows
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Helper for Complaint Creation
async function handleCreateComplaint(c, isPublic = false) {
  let body = {};
  const cType = c.req.header('content-type') || '';
  if (cType.includes('multipart/form-data') || cType.includes('application/x-www-form-urlencoded')) {
    body = await c.req.parseBody().catch(() => ({}));
  } else {
    body = await c.req.json().catch(() => ({}));
  }

  const customer_name = (body.customer_name || '').trim();
  const raw_phone = (body.customer_phone || '').trim();
  const cleanDigits = raw_phone.replace(/[^0-9]/g, '');
  const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';
  const product_type = (body.product_type || '').trim();
  const dealer_name = (body.dealer_name || '').trim();

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
      dealer_name, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26,
      $27, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
    (() => {
      const raw = (body.priority || 'Medium').toString().trim().toLowerCase();
      if (raw === 'urgent') return 'Urgent';
      if (raw === 'high') return 'High';
      if (raw === 'low') return 'Low';
      return 'Medium';
    })(),
    body.assigned_technician_id ? 'Assigned' : 'Unassigned',
    body.assigned_technician_id || null,
    body.expected_visit_date || null,
    user?.id || null,
    dealer_name
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
      let fileUrl = att.file_url || att.storage_key || '';
      // If file was uploaded to complaints/temp/ prior to ticket registration, relocate to complaints/${newComp.ticket_id}/ in R2!
      if (fileUrl && fileUrl.includes('complaints/temp/') && c.env?.MEDIA_BUCKET && newComp.ticket_id) {
        const oldKey = fileUrl.replace(/^.*\/api\/attachments\/r2\//, '').replace(/^\/+/, '');
        const newKey = oldKey.replace(/^complaints\/temp\//, `complaints/${newComp.ticket_id}/`);
        try {
          const moved = await moveR2Object(c.env.MEDIA_BUCKET, oldKey, newKey);
          if (moved) {
            fileUrl = `/api/attachments/r2/${newKey}`;
          }
        } catch (e) {
          console.error('Failed to relocate temp attachment in R2 during ticket creation:', e);
        }
      }

      await query(`
        INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        newComp.id,
        att.file_name || 'Document',
        fileUrl,
        att.file_type || 'application/octet-stream',
        fileUrl,
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

  // OS Background Web Push for Admin & Staff
  c.executionCtx?.waitUntil?.(
    dispatchPushToRoles(['admin', 'staff'], {
      title: `☀️ New Ticket: ${newComp.ticket_id}`,
      body: `${newComp.customer_name} • ${newComp.product_type} (${newComp.issue_category})`,
      ticketId: newComp.ticket_id,
      url: `/complaints?ticket=${newComp.ticket_id}`,
      tag: `ticket-${newComp.ticket_id}`
    }, c.env, c.executionCtx).catch(() => {})
  );

  // WhatsApp Notification in Background
  let waResult = null;
  const isSurvey = isSurveyTicket(newComp.product_type, newComp.issue_category);
  const regTemplate = isSurvey ? 'site_survey_registered' : 'complaint_registered';
  c.executionCtx?.waitUntil?.(
    sendWhatsApp({
      to: newComp.customer_phone,
      templateName: regTemplate,
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

    const isReassignment = Boolean(complaint.assigned_technician_id && String(complaint.assigned_technician_id) !== String(primaryTech.id));
    let previousTech = null;
    if (isReassignment) {
      const prevRes = await query('SELECT id, name, phone FROM technicians WHERE id = $1', [complaint.assigned_technician_id], c.env, c.executionCtx);
      if (prevRes.rows.length) previousTech = prevRes.rows[0];
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
    let desc = secondaryTech
      ? `Assigned to ${primaryTech.name} (Primary) & ${secondaryTech.name} (Co-Partner).`
      : `Assigned to ${primaryTech.name}.`;
    if (isReassignment && previousTech) {
      desc = `Reassigned from ${previousTech.name} to ${primaryTech.name}${secondaryTech ? ` & ${secondaryTech.name}` : ''}.`;
    }

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, isReassignment ? 'Reassigned' : 'Assigned', desc + (notes ? ` Note: ${notes}` : ''), assigner, user?.role || 'staff'],
      c.env,
      c.executionCtx
    );

    // 1. Send WhatsApp to Customer (customer_technician_reassigned if reassigned, site_survey_assigned or technician_assigned if new)
    const isSurvey = isSurveyTicket(complaint.product_type, complaint.issue_category);
    const custTemplate = isSurvey ? 'site_survey_assigned' : (isReassignment ? 'customer_technician_reassigned' : 'technician_assigned');
    const custPromise = complaint.customer_phone ? sendWhatsApp({
      to: complaint.customer_phone,
      templateName: custTemplate,
      variables: {
        ticket_id: complaint.ticket_id,
        complaint_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        product_type: complaint.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar System'),
        technician_name: secondaryTech ? `${primaryTech.name} & ${secondaryTech.name}` : primaryTech.name,
        technician_phone: primaryTech.phone || '',
        expected_visit_date: expected_visit_date ? String(expected_visit_date).split('T')[0] : 'Immediate',
        db_complaint_id: complaint.id
      },
      env: c.env
    }) : Promise.resolve({ success: false, error: 'Customer has no phone number on file' });

    // 2. If reassigned, notify previous technician about job transfer
    let prevTechPromise = Promise.resolve(null);
    if (isReassignment && previousTech && previousTech.phone) {
      prevTechPromise = sendWhatsApp({
        to: previousTech.phone,
        templateName: 'technician_reassigned',
        variables: {
          technician_name: previousTech.name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          new_technician_name: primaryTech.name,
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch((err) => ({ success: false, error: err.message }));
    }

    // 3. Send WhatsApp Work Order to Primary Technician
    const isTeam = Boolean(secondaryTech);
    const primaryTechTemplate = isSurvey 
      ? 'site_survey_work_order' 
      : (isTeam 
          ? 'technician_team_work_order' 
          : (isReassignment 
              ? 'technician_reassigned_work_order' 
              : 'technician_work_order'));

    const techPromise = primaryTech.phone ? sendWhatsApp({
      to: primaryTech.phone,
      templateName: primaryTechTemplate,
      variables: {
        technician_name: primaryTech.name,
        partner_technician_name: secondaryTech?.name || '',
        partner_technician_phone: secondaryTech?.phone || '',
        all_technicians_names: secondaryTech ? `${primaryTech.name} & ${secondaryTech.name}` : primaryTech.name,
        ticket_id: complaint.ticket_id,
        complaint_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
        product_type: complaint.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar Rooftop Systems'),
        issue_category: complaint.issue_category || (isSurvey ? 'Site Survey Feasibility' : 'Service Request'),
        notes: (secondaryTech 
          ? `[Team Partner: ${secondaryTech.name}${secondaryTech.phone ? ' (' + secondaryTech.phone + ')' : ''}] ${complaint.issue_description || notes || ''}`
          : (complaint.issue_description || notes || (isSurvey ? 'Conduct rooftop / electrical site survey and feasibility assessment' : 'Inspect and diagnose site'))
        ).slice(0, 1000),
        priority: complaint.priority || 'Medium',
        expected_visit_date: expected_visit_date ? String(expected_visit_date).split('T')[0] : 'Immediate',
        db_complaint_id: complaint.id
      },
      env: c.env
    }) : Promise.resolve({ success: false, error: `Assigned technician "${primaryTech.name}" has no phone number on file.` });

    // 4. Send WhatsApp to Secondary Technician (if assigned)
    const secTechTemplate = isSurvey ? 'site_survey_work_order' : 'technician_team_work_order';
    const secTechPromise = (secondaryTech && secondaryTech.phone) ? sendWhatsApp({
      to: secondaryTech.phone,
      templateName: secTechTemplate,
      variables: {
        technician_name: secondaryTech.name,
        partner_technician_name: primaryTech.name,
        partner_technician_phone: primaryTech.phone || '',
        all_technicians_names: `${primaryTech.name} & ${secondaryTech.name}`,
        ticket_id: complaint.ticket_id,
        complaint_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
        product_type: complaint.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar Rooftop Systems'),
        issue_category: complaint.issue_category || (isSurvey ? 'Site Survey Feasibility' : 'Service Request'),
        notes: `[Team Lead: ${primaryTech.name}${primaryTech.phone ? ' (' + primaryTech.phone + ')' : ''}] ${complaint.issue_description || notes || (isSurvey ? 'Conduct rooftop / electrical site survey and feasibility assessment' : 'Inspect and diagnose site')}`.slice(0, 1000),
        priority: complaint.priority || 'Medium',
        expected_visit_date: expected_visit_date ? String(expected_visit_date).split('T')[0] : 'Immediate',
        db_complaint_id: complaint.id
      },
      env: c.env
    }) : Promise.resolve(null);

    const [custResult, prevTechResult, techResult, secTechResult] = await Promise.all([custPromise, prevTechPromise, techPromise, secTechPromise]);

    let warningMsg = null;
    if (!techResult?.success) {
      warningMsg = `Technician assigned, but WhatsApp dispatch to technician failed: ${techResult?.error || 'Meta API error'}`;
    }
    if (!custResult?.success) {
      warningMsg = (warningMsg ? `${warningMsg}. ` : '') + `WhatsApp dispatch to customer failed: ${custResult?.error || 'Meta API error'}`;
    }

    // Dispatch OS Background Web Push to Assigned Technician(s) and Staff
    c.executionCtx?.waitUntil?.(
      (async () => {
        // Push to primary technician
        await dispatchPushToTechnician(primaryTech.id, primaryTech.phone, {
          title: `🔧 Work Order Assigned: ${complaint.ticket_id}`,
          body: `${complaint.customer_name} • ${complaint.product_type} (${complaint.city || 'Site Visit'})`,
          ticketId: complaint.ticket_id,
          url: `/technician?ticket=${complaint.ticket_id}`,
          tag: `assign-${complaint.ticket_id}`
        }, c.env, c.executionCtx).catch(() => {});

        // Push to secondary technician if team assignment
        if (secondaryTech) {
          await dispatchPushToTechnician(secondaryTech.id, secondaryTech.phone, {
            title: `🔧 Team Work Order: ${complaint.ticket_id}`,
            body: `Co-assigned with ${primaryTech.name}: ${complaint.customer_name}`,
            ticketId: complaint.ticket_id,
            url: `/technician?ticket=${complaint.ticket_id}`,
            tag: `assign-${complaint.ticket_id}`
          }, c.env, c.executionCtx).catch(() => {});
        }

        // Push update to Admin & Staff
        await dispatchPushToRoles(['admin', 'staff'], {
          title: `Technician Assigned: ${complaint.ticket_id}`,
          body: `${primaryTech.name} assigned to ${complaint.customer_name}`,
          ticketId: complaint.ticket_id,
          url: `/complaints?ticket=${complaint.ticket_id}`,
          tag: `assign-${complaint.ticket_id}`
        }, c.env, c.executionCtx).catch(() => {});
      })()
    );

    return c.json({
      success: true,
      message: isReassignment ? 'Job reassigned and transferred successfully' : 'Technician assigned successfully',
      is_reassignment: isReassignment,
      warning: warningMsg,
      customer_whatsapp: custResult,
      previous_technician_whatsapp: prevTechResult,
      technician_whatsapp: techResult,
      secondary_technician_whatsapp: secTechResult
    });
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
    const { note, notes, status, notify_customer } = body;
    const actualNote = (notes !== undefined && notes !== null ? notes : note) || '';

    const compRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id], c.env, c.executionCtx);
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    // Co-partner access check
    if (user.role === 'technician' && user.technician_id) {
      if (String(complaint.secondary_technician_id) === String(user.technician_id) && String(complaint.assigned_technician_id) !== String(user.technician_id)) {
        return c.json({ error: 'Co-partner technician is restricted to view-only access. Stage updates must be submitted by the primary technician.' }, 403);
      }
    }

    let normalizedStatus = null;
    if (status) {
      const s = status.toString().trim().toLowerCase().replace(/_/g, ' ');
      if (s === 'registered') normalizedStatus = 'Registered';
      else if (s === 'unassigned') normalizedStatus = 'Unassigned';
      else if (s === 'assigned') normalizedStatus = 'Assigned';
      else if (s === 'in progress') normalizedStatus = 'In Progress';
      else if (s === 'on hold') normalizedStatus = 'On Hold';
      else if (s === 'resolved') normalizedStatus = 'Resolved';
      else if (s === 'closed') normalizedStatus = 'Closed';
      else if (s === 'reopened') normalizedStatus = 'Reopened';
      else normalizedStatus = status;
    }

    if (normalizedStatus && normalizedStatus !== complaint.status) {
      await query('UPDATE complaints SET status = $1, status_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [normalizedStatus, complaint.id], c.env, c.executionCtx);
    }

    const author = user?.name || user?.username || 'Technician';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        complaint.id, 
        normalizedStatus ? `Status: ${normalizedStatus}` : 'Visit Note Added', 
        actualNote || (normalizedStatus ? `Status updated to ${normalizedStatus}` : 'Follow-up update recorded'), 
        author, 
        user?.role || 'staff', 
        notify_customer ? 1 : 0
      ],
      c.env,
      c.executionCtx
    );

    if (notify_customer && complaint.customer_phone) {
      c.executionCtx?.waitUntil?.(
        sendWhatsApp({
          to: complaint.customer_phone,
          message: `*Eco Green Solar Alert*\n\nUpdate on Complaint *${complaint.ticket_id}* (${complaint.product_type}):\nStatus: *${status || complaint.status}*\nNotes: ${actualNote}\n\n- Eco Green Solar Care`,
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
    const contentType = c.req.header('content-type') || '';
    let body = {};
    if (contentType.includes('multipart/form-data')) {
      body = await c.req.parseBody().catch(() => ({}));
    } else {
      body = await c.req.json().catch(() => ({}));
    }
    const resolution_notes = body.resolution_notes || body.notes || '';
    let closing_photo_url = body.closing_photo_url || '';
    const spare_parts_used = body.spare_parts_used || body.spareParts || '';
    const performed_by = body.technician_name || body.resolved_by_technician_name || body.performed_by || user?.name || 'Technician';

    let uploadedAttachments = [];
    if (body.attachment_urls) {
      try {
        uploadedAttachments = typeof body.attachment_urls === 'string'
          ? JSON.parse(body.attachment_urls)
          : body.attachment_urls;
      } catch (_) {}
    }
    if (!closing_photo_url && uploadedAttachments.length > 0) {
      closing_photo_url = uploadedAttachments[0].file_url || uploadedAttachments[0].storage_key || '';
    }

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
      [
        complaint.id, 
        'Resolved', 
        `Marked as Resolved by ${solver}.${resolution_notes ? ` Notes: ${resolution_notes}` : ' Issue resolved and inspected on site.'}`, 
        solver, 
        user?.role || 'technician'
      ],
      c.env,
      c.executionCtx
    );

    // Save closing photo in attachments if provided
    if (Array.isArray(uploadedAttachments) && uploadedAttachments.length > 0) {
      for (const att of uploadedAttachments) {
        await query(
          `INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [complaint.id, att.file_name || 'Resolution_Proof.jpg', att.file_url || att.storage_key, att.file_type || 'image/jpeg', att.file_url || att.storage_key, solver],
          c.env,
          c.executionCtx
        ).catch(() => {});
      }
    } else if (closing_photo_url) {
      await query(
        `INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
         VALUES ($1, 'Resolution_Proof.jpg', $2, 'image/jpeg', $2, $3)`,
        [complaint.id, closing_photo_url, solver],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    // Notify Customer asynchronously
    const isSurvey = isSurveyTicket(complaint.product_type, complaint.issue_category);
    const resolvedTemplate = isSurvey ? 'site_survey_resolved' : 'complaint_resolved';
    c.executionCtx?.waitUntil?.(
      sendWhatsApp({
        to: complaint.customer_phone,
        templateName: resolvedTemplate,
        variables: {
          ticket_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          technician_name: solver,
          resolution_notes: resolution_notes || (isSurvey ? 'Site survey report, shadow analysis, and technical feasibility completed.' : 'Service successfully completed.')
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

    // If no technician assigned, allow direct office collection for admin/staff only
    if (!complaint.assigned_technician_id && !['admin', 'staff'].includes(user.role)) {
      return c.json({ error: 'Technicians can only collect payments on tickets assigned to them.' }, 403);
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

    const isAlreadyCollected = complaint.payment_status === 'Collected' || (Number(complaint.payment_collected || 0) > 0 && Number(complaint.payment_collected || 0) >= estCharges);
    if (isAlreadyCollected && user.role === 'technician') {
      return c.json({ error: 'Payment has already been collected in full for this ticket.' }, 400);
    }

    const collector = user?.name || user?.username || 'Staff';
    const isDirectOffice = !complaint.assigned_technician_id;
    const actionName = isAlreadyCollected ? 'Payment Updated' : 'Payment Collected';
    const noteText = isAlreadyCollected
      ? `Payment record updated from ₹${complaint.payment_collected || 0} to ₹${collectedAmt} via ${payment_mode || 'Cash'}.${collection_reason ? ` Reason: ${collection_reason}` : ''}`
      : (isDirectOffice
        ? `Direct office payment of ₹${collectedAmt} collected via ${payment_mode || 'Cash'}. Note: Collected without assigned field technician.`
        : `Payment of ₹${collectedAmt} collected via ${payment_mode || 'Cash'}.`);

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, actionName, noteText, collector, user?.role || 'staff'],
      c.env,
      c.executionCtx
    );

    return c.json({
      success: true,
      message: isAlreadyCollected ? 'Payment record updated successfully' : 'Payment recorded successfully'
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/settle-company - Settle Collected Cash into Company Account
complaintRoutes.post('/:id/settle-company', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { notes = '', amount_received } = body;

    const compRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_id = $1 LIMIT 1
    `, [id], c.env, c.executionCtx);

    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    const settledAmt = amount_received !== undefined ? Number(amount_received) : (Number(complaint.payment_collected) || 0);
    const actorName = user ? (user.name || user.username) : 'Company Finance/Admin';
    const actorRole = user ? user.role : 'admin';

    await query(`
      UPDATE complaints
      SET company_settlement_status = 'Settled with Company',
          company_settled_at = CURRENT_TIMESTAMP,
          company_settled_by = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [actorName, complaint.id], c.env, c.executionCtx);

    const techLabel = complaint.technician_name || (complaint.assigned_technician_id ? `Technician #${complaint.assigned_technician_id}` : 'Direct Office Collection');
    const timelineMsg = `Company confirmed receipt of ₹${settledAmt} (${techLabel}) into company account.${notes ? ` • Note: ${notes}` : ''}`;

    await query(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES ($1, 'Cash Settled with Company', $2, $3, $4, 0)
    `, [complaint.id, timelineMsg, actorName, actorRole], c.env, c.executionCtx);

    const updated = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = $1
    `, [complaint.id], c.env, c.executionCtx);

    return c.json({
      success: true,
      message: 'Payment settled with company successfully',
      complaint: updated.rows[0]
    });
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

    // Send WhatsApp notification to customer using approved template
    let waResult = null;
    if (complaint.customer_phone) {
      waResult = await sendWhatsApp({
        to: complaint.customer_phone,
        templateName: 'complaint_closed',
        variables: {
          customer_name: complaint.customer_name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          closure_remarks: closure_remarks || 'Issue resolved and verified.',
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch((err) => {
        console.warn('[WhatsApp Closure Notice Error]', err.message);
        return { success: false, error: err.message };
      });
    }

    return c.json({
      success: true,
      message: 'Complaint closed successfully',
      whatsapp: waResult
    });
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
    const { reason, technician_id } = body;

    const compRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_id = $1 LIMIT 1
    `, [id], c.env, c.executionCtx);

    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    // Determine target technician
    let targetTech = null;
    let isReassignedOnReopen = false;
    if (technician_id) {
      const techRes = await query('SELECT id, name, phone FROM technicians WHERE id = $1', [technician_id], c.env, c.executionCtx);
      if (techRes.rows.length) {
        targetTech = techRes.rows[0];
        if (complaint.assigned_technician_id && String(complaint.assigned_technician_id) !== String(targetTech.id)) {
          isReassignedOnReopen = true;
        }
      }
    }
    if (!targetTech && complaint.assigned_technician_id) {
      targetTech = {
        id: complaint.assigned_technician_id,
        name: complaint.technician_name,
        phone: complaint.technician_phone
      };
    }

    await query(
      `UPDATE complaints
       SET status = 'Reopened',
           assigned_technician_id = COALESCE($1, assigned_technician_id),
           status_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [targetTech ? targetTech.id : null, complaint.id],
      c.env,
      c.executionCtx
    );

    const reopener = user?.name || user?.username || 'Customer';
    const techNoticeText = targetTech ? ` (Assigned to ${targetTech.name})` : '';
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [complaint.id, 'Reopened', `Complaint reopened. Reason: ${reason || 'Issue recurred'}${techNoticeText}`, reopener, user?.role || 'customer'],
      c.env,
      c.executionCtx
    );

    // Send WhatsApp notification to customer using approved template
    let waResult = null;
    if (complaint.customer_phone) {
      waResult = await sendWhatsApp({
        to: complaint.customer_phone,
        templateName: 'complaint_reopened',
        variables: {
          customer_name: complaint.customer_name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          reason: reason || 'Service follow-up required',
          technician_name: targetTech?.name || complaint.technician_name || 'Field Technician',
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch((err) => {
        console.warn('[WhatsApp Reopen Customer Notice Error]', err.message);
        return { success: false, error: err.message };
      });
    }

    // Notify assigned technician about reopened work order
    let techWaResult = null;
    if (targetTech?.phone) {
      techWaResult = await sendWhatsApp({
        to: targetTech.phone,
        templateName: 'technician_reopened_work_order',
        variables: {
          technician_name: targetTech.name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          customer_phone: complaint.customer_phone,
          customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
          product_type: complaint.product_type || 'Solar System',
          issue_category: complaint.issue_category || 'Service Request',
          reopen_reason: reason || 'Customer requested re-inspection / service follow-up',
          reason: reason || 'Customer requested re-inspection / service follow-up',
          priority: 'High',
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch((err) => {
        console.warn('[WhatsApp Reopen Technician Notice Error]', err.message);
        return { success: false, error: err.message };
      });
    }

    // If reassigned to a different technician on reopen, notify previous technician
    if (isReassignedOnReopen && complaint.technician_phone && complaint.technician_name) {
      sendWhatsApp({
        to: complaint.technician_phone,
        templateName: 'technician_reopen_job_transferred',
        variables: {
          technician_name: complaint.technician_name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          new_technician_name: targetTech.name,
          reopen_reason: reason || 'Customer requested follow-up inspection',
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch(() => {});
    }

    return c.json({
      success: true,
      message: 'Complaint reopened successfully',
      whatsapp: waResult,
      technician_whatsapp: techWaResult
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/complaints/:id/feedback - Customer CSAT Feedback Submission
complaintRoutes.post('/:id/feedback', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { rating, feedback_comments } = body;

    const parsedRating = Number(rating);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return c.json({ error: 'Rating must be between 1 and 5 stars' }, 400);
    }

    const compRes = await query(
      'SELECT id, ticket_id, customer_name FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
      [id],
      c.env,
      c.executionCtx
    );
    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    await query(
      `UPDATE complaints
       SET rating = $1,
           feedback_comments = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [parsedRating, (feedback_comments || '').trim() || null, complaint.id],
      c.env,
      c.executionCtx
    );

    await query(
      `INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
       VALUES ($1, 'Feedback Received', $2, $3, 'customer', 0)`,
      [
        complaint.id,
        `Customer submitted ${parsedRating}-Star rating: "${(feedback_comments || '').trim() || 'No comment'}"`,
        complaint.customer_name || 'Customer'
      ],
      c.env,
      c.executionCtx
    );

    return c.json({
      success: true,
      message: 'Thank you! Your feedback has been recorded.'
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Helper for Resending Technician Work Order
async function handleResendTechnicianWorkOrder(c) {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    const compRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone,
             st.name as secondary_technician_name, st.phone as secondary_technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      LEFT JOIN technicians st ON c.secondary_technician_id = st.id::text
      WHERE c.id::text = $1 OR c.ticket_id = $1 LIMIT 1
    `, [id], c.env, c.executionCtx);

    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    if (!complaint.assigned_technician_id && !complaint.technician_name) {
      return c.json({ error: 'No technician is assigned to this complaint. Please assign a technician first.' }, 400);
    }
    if (!complaint.technician_phone) {
      return c.json({ error: `Assigned technician "${complaint.technician_name || 'Technician'}" has no phone number on file.` }, 400);
    }

    const isSurvey = isSurveyTicket(complaint.product_type, complaint.issue_category);
    const hasSecTech = Boolean(complaint.secondary_technician_phone || complaint.secondary_technician_id);
    const primaryTemplate = isSurvey 
      ? 'site_survey_work_order' 
      : (hasSecTech ? 'technician_team_work_order' : 'technician_work_order');

    const techRes = await sendWhatsApp({
      to: complaint.technician_phone,
      templateName: primaryTemplate,
      variables: {
        technician_name: complaint.technician_name || 'Technician',
        partner_technician_name: complaint.secondary_technician_name || '',
        partner_technician_phone: complaint.secondary_technician_phone || '',
        all_technicians_names: complaint.secondary_technician_name 
          ? `${complaint.technician_name} & ${complaint.secondary_technician_name}` 
          : complaint.technician_name,
        ticket_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
        product_type: complaint.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar Rooftop Systems'),
        issue_category: complaint.issue_category || (isSurvey ? 'Site Survey Feasibility' : 'Service Request'),
        notes: (hasSecTech 
          ? `[Team Partner: ${complaint.secondary_technician_name || 'Co-Specialist'}${complaint.secondary_technician_phone ? ' (' + complaint.secondary_technician_phone + ')' : ''}] ${complaint.issue_description || ''}`
          : (complaint.issue_description || (isSurvey ? 'Conduct rooftop / electrical site survey and feasibility assessment' : 'Inspect and diagnose site'))
        ).slice(0, 1000),
        priority: complaint.priority || 'Medium',
        expected_visit_date: complaint.expected_visit_date ? String(complaint.expected_visit_date).split('T')[0] : 'Immediate',
        db_complaint_id: complaint.id
      },
      env: c.env
    });

    if (complaint.secondary_technician_phone) {
      const secTemplate = isSurvey ? 'site_survey_work_order' : 'technician_team_work_order';
      sendWhatsApp({
        to: complaint.secondary_technician_phone,
        templateName: secTemplate,
        variables: {
          technician_name: complaint.secondary_technician_name || 'Co-Specialist',
          partner_technician_name: complaint.technician_name || 'Lead Specialist',
          partner_technician_phone: complaint.technician_phone || '',
          all_technicians_names: `${complaint.technician_name} & ${complaint.secondary_technician_name}`,
          ticket_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          customer_phone: complaint.customer_phone,
          customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
          product_type: complaint.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar Rooftop Systems'),
          issue_category: complaint.issue_category || (isSurvey ? 'Site Survey Feasibility' : 'Service Request'),
          notes: `[Team Lead: ${complaint.technician_name || 'Technician'}${complaint.technician_phone ? ' (' + complaint.technician_phone + ')' : ''}] ${complaint.issue_description || (isSurvey ? 'Conduct rooftop / electrical site survey and feasibility assessment' : 'Inspect and diagnose site')}`.slice(0, 1000),
          priority: complaint.priority || 'Medium',
          expected_visit_date: complaint.expected_visit_date ? String(complaint.expected_visit_date).split('T')[0] : 'Immediate',
          db_complaint_id: complaint.id
        },
        env: c.env
      }).catch(() => {});
    }

    const sender = user?.name || user?.username || 'Staff';
    await query(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES ($1, 'Work Order Resent', $2, $3, $4, 0)
    `, [
      complaint.id,
      `Work order resent to technician ${complaint.technician_name} (${complaint.technician_phone}) via WhatsApp. Status: ${techRes.success ? 'Delivered' : 'Failed: ' + (techRes.error || 'Meta Error')}`,
      sender,
      user?.role || 'staff'
    ], c.env, c.executionCtx);

    if (!techRes.success) {
      return c.json({
        success: false,
        error: `Failed to deliver WhatsApp template to ${complaint.technician_name} (${complaint.technician_phone}): ${techRes.error || 'Meta API error'}`
      }, 400);
    }

    return c.json({
      success: true,
      message: `Work order dispatched to ${complaint.technician_name} via WhatsApp!`,
      wamid: techRes.wamid
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
}

// POST /api/complaints/:id/resend-technician and alias /resend-work-order
complaintRoutes.post('/:id/resend-technician', authenticateToken, requireRole('admin', 'staff'), handleResendTechnicianWorkOrder);
complaintRoutes.post('/:id/resend-work-order', authenticateToken, requireRole('admin', 'staff'), handleResendTechnicianWorkOrder);

// Helper for Sending Technician Reminder
async function handleSendTechnicianReminder(c) {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    const compRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_id = $1 LIMIT 1
    `, [id], c.env, c.executionCtx);

    if (!compRes.rows.length) return c.json({ error: 'Complaint not found' }, 404);
    const complaint = compRes.rows[0];

    if (!complaint.assigned_technician_id && !complaint.technician_name) {
      return c.json({ error: 'No technician is assigned to this complaint. Please assign a technician first.' }, 400);
    }
    if (!complaint.technician_phone) {
      return c.json({ error: `Assigned technician "${complaint.technician_name || 'Technician'}" has no phone number on file.` }, 400);
    }

    const techRes = await sendWhatsApp({
      to: complaint.technician_phone,
      templateName: 'technician_reminder',
      variables: {
        technician_name: complaint.technician_name || 'Technician',
        ticket_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: [complaint.customer_address, complaint.city].filter(Boolean).join(', ') || 'On File',
        expected_visit_date: complaint.expected_visit_date ? String(complaint.expected_visit_date).split('T')[0] : 'Today',
        db_complaint_id: complaint.id
      },
      env: c.env
    });

    const sender = user?.name || user?.username || 'Staff';
    await query(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES ($1, 'Visit Reminder Sent', $2, $3, $4, 0)
    `, [
      complaint.id,
      `Pending visit reminder sent to technician ${complaint.technician_name} (${complaint.technician_phone}) via WhatsApp.`,
      sender,
      user?.role || 'staff'
    ], c.env, c.executionCtx);

    if (!techRes.success) {
      return c.json({
        success: false,
        error: `Failed to deliver WhatsApp reminder to ${complaint.technician_name}: ${techRes.error || 'Meta API error'}`
      }, 400);
    }

    return c.json({
      success: true,
      message: `Reminder WhatsApp sent to ${complaint.technician_name}!`,
      wamid: techRes.wamid
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
}

// POST /api/complaints/:id/send-reminder and alias /remind-tech
complaintRoutes.post('/:id/send-reminder', authenticateToken, handleSendTechnicianReminder);
complaintRoutes.post('/:id/remind-tech', authenticateToken, handleSendTechnicianReminder);

// PUT /api/complaints/:id - Update Complaint
complaintRoutes.put('/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const existingComp = await query(
      'SELECT id, ticket_id, customer_name, customer_phone, product_type, issue_category, status, is_in_warranty, estimated_charges, notify_charges FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
      [id],
      c.env,
      c.executionCtx
    );
    if (!existingComp.rows.length) {
      return c.json({ error: 'Complaint not found' }, 404);
    }
    const current = existingComp.rows[0];
    if (['Resolved', 'Closed'].includes(current.status)) {
      return c.json({ error: `Complaint cannot be edited while in "${current.status}" status. Please reopen the complaint first to make changes.` }, 400);
    }

    let b = {};
    const cType = c.req.header('content-type') || '';
    if (cType.includes('multipart/form-data') || cType.includes('application/x-www-form-urlencoded')) {
      b = await c.req.parseBody().catch(() => ({}));
    } else {
      b = await c.req.json().catch(() => ({}));
    }

    const cleanIsInWarranty = b.is_in_warranty !== undefined
      ? ((b.is_in_warranty === 'true' || b.is_in_warranty === 1 || b.is_in_warranty === true || b.is_in_warranty === '1') ? 1 : 0)
      : current.is_in_warranty;

    const cleanEstimatedCharges = b.estimated_charges !== undefined && b.estimated_charges !== null && b.estimated_charges !== ''
      ? (parseFloat(b.estimated_charges) || 0)
      : (current.estimated_charges !== null ? (parseFloat(current.estimated_charges) || 0) : 0);

    const cleanNotifyCharges = b.notify_charges !== undefined
      ? ((b.notify_charges === 'true' || b.notify_charges === 1 || b.notify_charges === true || b.notify_charges === '1') ? 1 : 0)
      : (cleanEstimatedCharges > 0 ? 1 : (current.notify_charges ? 1 : 0));

    let newPaymentStatus = current.payment_status;
    if (cleanEstimatedCharges > 0 && (!current.payment_status || current.payment_status === 'Not Applicable')) {
      newPaymentStatus = 'Unpaid';
    } else if (cleanEstimatedCharges === 0 && (!current.payment_status || current.payment_status === 'Unpaid')) {
      newPaymentStatus = 'Not Applicable';
    }

    await query(`
      UPDATE complaints SET
        customer_name = COALESCE($1, customer_name),
        customer_phone = COALESCE($2, customer_phone),
        customer_email = COALESCE($3, customer_email),
        customer_address = COALESCE($4, customer_address),
        city = COALESCE($5, city),
        consumer_no = COALESCE($6, consumer_no),
        order_no = COALESCE($7, order_no),
        product_type = COALESCE($8, product_type),
        product_serial = COALESCE($9, product_serial),
        issue_category = COALESCE($10, issue_category),
        issue_description = COALESCE($11, issue_description),
        priority = COALESCE($12, priority),
        status = COALESCE($13, status),
        is_in_warranty = $14,
        estimated_charges = $15,
        notify_charges = $16,
        payment_status = $17,
        invoice_no = COALESCE($18, invoice_no),
        invoice_date = COALESCE($19, invoice_date),
        location_url = COALESCE($20, location_url),
        installation_id = COALESCE($21, installation_id),
        dealer_name = COALESCE($22, dealer_name),
        updated_at = CURRENT_TIMESTAMP,
        status_updated_at = CURRENT_TIMESTAMP
      WHERE id = $23
    `, [
      b.customer_name !== undefined ? (b.customer_name ? b.customer_name.trim() : null) : null,
      b.customer_phone !== undefined ? (b.customer_phone ? b.customer_phone.trim() : null) : null,
      b.customer_email !== undefined ? (b.customer_email ? b.customer_email.trim() : null) : null,
      b.customer_address !== undefined ? (b.customer_address ? b.customer_address.trim() : null) : null,
      b.city !== undefined ? (b.city ? b.city.trim() : null) : null,
      b.consumer_no !== undefined ? (b.consumer_no ? b.consumer_no.trim() : null) : null,
      b.order_no !== undefined ? (b.order_no ? b.order_no.trim() : null) : null,
      b.product_type !== undefined ? (b.product_type ? b.product_type.trim() : null) : null,
      b.product_serial !== undefined ? (b.product_serial ? b.product_serial.trim() : null) : null,
      b.issue_category !== undefined ? (b.issue_category ? b.issue_category.trim() : null) : null,
      b.issue_description !== undefined ? (b.issue_description ? b.issue_description.trim() : null) : null,
      b.priority !== undefined ? (b.priority ? b.priority.trim() : null) : null,
      b.status !== undefined ? (b.status ? b.status.trim() : null) : null,
      cleanIsInWarranty,
      cleanEstimatedCharges,
      cleanNotifyCharges,
      newPaymentStatus,
      b.invoice_no !== undefined ? (b.invoice_no ? b.invoice_no.trim() : null) : null,
      b.invoice_date !== undefined ? (b.invoice_date ? b.invoice_date.trim() : null) : null,
      b.location_url !== undefined ? (b.location_url ? b.location_url.trim() : null) : null,
      b.installation_id !== undefined ? (b.installation_id ? b.installation_id.trim() : null) : null,
      b.dealer_name !== undefined ? (b.dealer_name ? b.dealer_name.trim() : null) : null,
      current.id
    ], c.env, c.executionCtx);

    let newAttachments = [];
    if (b.attachment_urls) {
      try {
        const parsed = typeof b.attachment_urls === 'string' ? JSON.parse(b.attachment_urls) : b.attachment_urls;
        if (Array.isArray(parsed)) newAttachments = parsed;
      } catch (_) {}
    }
    if (newAttachments.length > 0) {
      const user = c.get('user');
      const uploaderName = user?.name || user?.username || 'Helpdesk';
      const targetFolder = current.ticket_id || current.id;
      for (const att of newAttachments) {
        let fileUrl = att.file_url || (att.storage_key ? `/api/attachments/r2/${att.storage_key}` : '');
        if (!fileUrl && !att.file_name) continue;

        if (fileUrl && fileUrl.includes('complaints/temp/') && c.env?.MEDIA_BUCKET && targetFolder) {
          const oldKey = fileUrl.replace(/^.*\/api\/attachments\/r2\//, '').replace(/^\/+/, '');
          const newKey = oldKey.replace(/^complaints\/temp\//, `complaints/${targetFolder}/`);
          try {
            const moved = await moveR2Object(c.env.MEDIA_BUCKET, oldKey, newKey);
            if (moved) {
              fileUrl = `/api/attachments/r2/${newKey}`;
            }
          } catch (e) {
            console.error('Failed to relocate temp attachment in R2 during ticket update:', e);
          }
        }

        await query(
          `INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            current.id,
            att.file_name || 'Document',
            fileUrl,
            att.file_type || 'application/octet-stream',
            fileUrl,
            uploaderName
          ],
          c.env,
          c.executionCtx
        ).catch(() => {});
      }
    }

    // Trigger WhatsApp notification if service charges were added, updated, or removed
    const prevCharges = parseFloat(current.estimated_charges) || 0;
    const prevNotify = Boolean(current.notify_charges === 1 || current.notify_charges === '1' || current.notify_charges === true);
    const newCharges = cleanEstimatedCharges;
    const newNotify = cleanNotifyCharges === 1;

    let chargeAction = null;
    if (newCharges > 0 && newNotify) {
      if (prevCharges === 0 || Math.abs(prevCharges - newCharges) >= 0.01) {
        chargeAction = 'charges_added';
      }
    } else if (prevCharges > 0 && (newCharges === 0 || !newNotify)) {
      chargeAction = 'charges_removed';
    }

    const targetPhone = b.customer_phone ? b.customer_phone.trim() : current.customer_phone;
    const custName = b.customer_name ? b.customer_name.trim() : current.customer_name;
    const prodType = b.product_type ? b.product_type.trim() : current.product_type;
    const issueCat = b.issue_category ? b.issue_category.trim() : current.issue_category;

    let waNotified = false;
    let waResult = null;
    if (chargeAction && targetPhone) {
      const user = c.get('user');
      const actorName = user?.name || user?.username || 'Customer Care';
      const actorRole = user?.role || 'staff';

      try {
        waResult = await sendWhatsApp({
          to: targetPhone,
          templateName: chargeAction,
          variables: {
            customer_name: custName,
            ticket_id: current.ticket_id,
            complaint_id: current.ticket_id,
            product_type: prodType,
            issue_category: issueCat,
            estimated_charges: newCharges,
            db_complaint_id: current.id
          },
          env: c.env
        });
        waNotified = Boolean(waResult && (waResult.success !== false));
      } catch (err) {
        console.warn('[Charges WhatsApp Alert Error]', err.message);
      }

      const tlNotes = chargeAction === 'charges_added'
        ? `Estimated service charges updated to ₹${newCharges}. Customer notified via WhatsApp.`
        : `Service charges waived / removed (₹0). Customer notified via WhatsApp.`;
      const tlAction = chargeAction === 'charges_added' ? 'Charges Updated' : 'Charges Waived';

      await query(`
        INSERT INTO complaint_timelines (
          complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at
        ) VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
      `, [current.id, tlAction, tlNotes, actorName, actorRole], c.env, c.executionCtx).catch(() => {});
    }

    const updated = await query('SELECT * FROM complaints WHERE id = $1', [current.id], c.env, c.executionCtx);
    return c.json({
      message: 'Complaint updated successfully',
      complaint: updated.rows[0],
      ticket: updated.rows[0],
      whatsapp_notified: waNotified,
      whatsapp: waResult,
      charge_action: chargeAction
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/complaints/:id
complaintRoutes.delete('/:id', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    
    // 1. Fetch complaint to get ticket_id
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [id], c.env, c.executionCtx);
    const comp = compRes.rows && compRes.rows[0] ? compRes.rows[0] : null;
    const ticketId = comp ? comp.ticket_id : null;

    // 2. Cascade delete and remove files from Cloudflare R2 for attachments
    const attRes = await query('SELECT file_url FROM complaint_attachments WHERE complaint_id = $1', [id], c.env, c.executionCtx);
    if (attRes.rows && attRes.rows.length > 0 && c.env.MEDIA_BUCKET) {
      for (const att of attRes.rows) {
        if (att.file_url) {
          const match = att.file_url.match(/\/api\/attachments\/r2\/(.+)$/);
          if (match && match[1]) {
            await deleteR2Object(c.env.MEDIA_BUCKET, decodeURIComponent(match[1])).catch(() => {});
          }
        }
      }
    }

    // 3. Cascade delete and remove receipts from Cloudflare R2 for tour expenses
    const expQuery = ticketId 
      ? 'SELECT receipt_url FROM technician_tour_expenses WHERE complaint_id = $1 OR ticket_id = $2'
      : 'SELECT receipt_url FROM technician_tour_expenses WHERE complaint_id = $1';
    const expParams = ticketId ? [id, ticketId] : [id];
    const expRes = await query(expQuery, expParams, c.env, c.executionCtx).catch(() => ({ rows: [] }));
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

    // 4. Delete related tour expenses, advances, and settlements referencing this complaint or ticket
    if (ticketId) {
      await query('DELETE FROM technician_tour_expenses WHERE complaint_id = $1 OR ticket_id = $2', [id, ticketId], c.env, c.executionCtx).catch(() => {});
      await query('DELETE FROM technician_tour_advances WHERE complaint_id = $1 OR ticket_id = $2', [id, ticketId], c.env, c.executionCtx).catch(() => {});
      await query('DELETE FROM technician_tour_settlements WHERE ticket_id = $1', [ticketId], c.env, c.executionCtx).catch(() => {});
    } else {
      await query('DELETE FROM technician_tour_expenses WHERE complaint_id = $1', [id], c.env, c.executionCtx).catch(() => {});
      await query('DELETE FROM technician_tour_advances WHERE complaint_id = $1', [id], c.env, c.executionCtx).catch(() => {});
    }

    // 5. Delete attachments, timelines, in-app notifications, and the complaint itself
    await query('DELETE FROM complaint_attachments WHERE complaint_id = $1', [id], c.env, c.executionCtx);
    await query('DELETE FROM complaint_timelines WHERE complaint_id = $1', [id], c.env, c.executionCtx);
    if (ticketId) {
      await query('DELETE FROM in_app_notifications WHERE complaint_id = $1 OR ticket_id = $2 OR message LIKE $3', [String(id), String(ticketId), `%${ticketId}%`], c.env, c.executionCtx).catch(() => {});
    } else {
      await query('DELETE FROM in_app_notifications WHERE complaint_id = $1', [String(id)], c.env, c.executionCtx).catch(() => {});
    }
    await query('DELETE FROM complaints WHERE id = $1', [id], c.env, c.executionCtx);

    return c.json({ success: true, message: 'Complaint and all associated attachments, tour records, and vouchers deleted permanently' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default complaintRoutes;
