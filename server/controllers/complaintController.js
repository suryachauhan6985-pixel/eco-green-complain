const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const notificationService = require('../services/notificationService');
const realtimeService = require('../services/realtimeService');

// Helper to generate unique sequential Ticket ID (e.g., EGS-2026-000123)
function generateTicketId() {
  const currentYear = new Date().getFullYear();
  const prefix = `EGS-${currentYear}-`;

  const rows = db.prepare(`
    SELECT ticket_id FROM complaints 
    WHERE ticket_id LIKE ?
  `).all(`${prefix}%`);

  let maxNumber = 100; // start counting from 100 so next is at least 101
  for (const r of rows) {
    if (r.ticket_id) {
      const parts = r.ticket_id.split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  }

  const nextNumber = maxNumber + 1;
  const paddedNum = String(nextNumber).padStart(6, '0');
  return `${prefix}${paddedNum}`;
}

function listComplaints(req, res) {
  try {
    const {
      search,
      status,
      priority,
      product_type,
      technician_id,
      from_date,
      to_date,
      page = 1,
      limit = 50
    } = req.query;

    let query = `
      SELECT 
        c.*,
        t.name as technician_name,
        t.phone as technician_phone,
        t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based scoping: Technicians can only see their assigned complaints
    if (req.user && req.user.role === 'technician') {
      let userTechId = req.user.technicianId;
      if (!userTechId) {
        const tRow = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(req.user.id);
        if (tRow) userTechId = tRow.id;
      }
      if (!userTechId) {
        const tRow = db.prepare('SELECT id FROM technicians WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)').get(req.user.email || '', req.user.name || '');
        if (tRow) userTechId = tRow.id;
      }
      query += ` AND c.assigned_technician_id = ? `;
      params.push(userTechId || -1);
    } else if (technician_id) {
      query += ` AND c.assigned_technician_id = ? `;
      params.push(technician_id);
    }

    if (search) {
      query += ` AND (c.ticket_id LIKE ? OR c.customer_name LIKE ? OR c.customer_phone LIKE ? OR c.product_serial LIKE ? OR c.city LIKE ? OR c.consumer_no LIKE ? OR c.order_no LIKE ? OR c.invoice_no LIKE ?) `;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term, term);
    }

    if (status && status !== 'all') {
      query += ` AND c.status = ? `;
      params.push(status);
    }

    if (priority && priority !== 'all') {
      query += ` AND c.priority = ? `;
      params.push(priority);
    }

    if (product_type && product_type !== 'all') {
      query += ` AND c.product_type = ? `;
      params.push(product_type);
    }

    if (from_date) {
      query += ` AND date(c.created_at) >= date(?) `;
      params.push(from_date);
    }

    if (to_date) {
      query += ` AND date(c.created_at) <= date(?) `;
      params.push(to_date);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ? `;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const complaints = db.prepare(query).all(...params);

    res.json({ complaints });
  } catch (err) {
    console.error('List complaints error:', err);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
}

function getComplaintById(req, res) {
  try {
    const { id } = req.params;

    const complaint = db.prepare(`
      SELECT 
        c.*,
        t.name as technician_name,
        t.phone as technician_phone,
        t.area_zone as technician_zone,
        t.specialization as technician_specialization
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ? OR c.ticket_id = ?
    `).get(id, id);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    // Auto-repair if ticket has Assigned status or notes but assigned_technician_id was unlinked
    if (!complaint.assigned_technician_id && complaint.status !== 'Unassigned') {
      const assignedTimeline = db.prepare("SELECT notes FROM complaint_timelines WHERE complaint_id = ? AND action = 'Assigned' ORDER BY id DESC LIMIT 1").get(complaint.id);
      if (assignedTimeline && assignedTimeline.notes) {
        const techs = db.prepare('SELECT id, name, phone, area_zone, specialization FROM technicians').all();
        for (const t of techs) {
          if (assignedTimeline.notes.includes(t.name)) {
            complaint.assigned_technician_id = t.id;
            complaint.technician_name = t.name;
            complaint.technician_phone = t.phone;
            complaint.technician_zone = t.area_zone;
            complaint.technician_specialization = t.specialization;
            try {
              db.prepare('UPDATE complaints SET assigned_technician_id = ? WHERE id = ?').run(t.id, complaint.id);
            } catch (_) {}
            break;
          }
        }
      }
    }

    // Role check: Technician can only access their assigned ticket
    if (req.user && req.user.role === 'technician') {
      let userTechId = req.user.technicianId;
      if (!userTechId) {
        const tRow = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(req.user.id);
        if (tRow) userTechId = tRow.id;
      }
      if (userTechId && complaint.assigned_technician_id && String(complaint.assigned_technician_id) !== String(userTechId)) {
        return res.status(403).json({ error: 'Access denied to this ticket' });
      }
    }

    const rawAttachments = db.prepare('SELECT * FROM complaint_attachments WHERE complaint_id = ? ORDER BY id DESC').all(complaint.id);
    const attachments = rawAttachments.map(att => {
      const isBase64 = att.file_data && att.file_data.startsWith('data:');
      return {
        ...att,
        file_url: isBase64 ? att.file_data : (att.file_url && att.file_url.startsWith('/api/') ? att.file_url : `/api/attachments/${att.id}`)
      };
    });
    const timeline = db.prepare('SELECT * FROM complaint_timelines WHERE complaint_id = ? ORDER BY created_at DESC').all(complaint.id);
    const notifications = db.prepare('SELECT * FROM notification_logs WHERE complaint_id = ? ORDER BY created_at DESC').all(complaint.id);

    res.json({
      complaint,
      attachments,
      timeline,
      notifications
    });
  } catch (err) {
    console.error('Get complaint error:', err);
    res.status(500).json({ error: 'Failed to fetch complaint details' });
  }
}

function getCustomerHistory(req, res) {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const history = db.prepare(`
      SELECT 
        c.*,
        t.name as technician_name
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.customer_phone LIKE ?
      ORDER BY c.created_at DESC
    `).all(`%${cleanPhone.slice(-10)}%`);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
}

// Public tracking endpoint (no auth required)
function trackTicket(req, res) {
  try {
    const { query } = req.params; // ticket_id or phone

    const complaint = db.prepare(`
      SELECT 
        c.id, c.ticket_id, c.customer_name, c.product_type, c.issue_category,
        c.issue_description, c.priority, c.status, c.expected_visit_date,
        c.resolution_notes, c.rating, c.feedback_comments, c.created_at,
        c.assigned_at, c.resolved_at, c.closed_at,
        t.name as technician_name,
        t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.ticket_id = ? OR c.customer_phone = ?
      ORDER BY c.created_at DESC
      LIMIT 1
    `).get(query, query);

    if (!complaint) {
      return res.status(404).json({ error: 'No complaint found matching this ticket ID or phone number' });
    }

    const timeline = db.prepare(`
      SELECT action, notes, performed_by_role, created_at 
      FROM complaint_timelines 
      WHERE complaint_id = ? 
      ORDER BY created_at ASC
    `).all(complaint.id);

    res.json({ complaint, timeline });
  } catch (err) {
    res.status(500).json({ error: 'Failed to track ticket' });
  }
}

async function createComplaint(req, res) {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      city,
      consumer_no,
      order_no,
      invoice_no,
      invoice_date,
      location_url,
      is_in_warranty,
      estimated_charges = 0,
      notify_charges = 0,
      product_type,
      product_serial,
      installation_id,
      issue_category,
      issue_description,
      priority = 'Medium'
    } = req.body;

    if (!customer_name || !customer_phone || !customer_address || !product_type || !issue_category || !issue_description) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const ticketId = generateTicketId();
    const registeredByUserId = req.user ? req.user.id : null;
    const actorName = req.user ? req.user.name : 'Customer (Online Self-Service)';
    const actorRole = req.user ? req.user.role : 'customer';

    const cleanCharges = parseFloat(estimated_charges) || 0;
    const shouldNotifyCharges = (notify_charges === 'true' || notify_charges === 1 || notify_charges === true || notify_charges === '1') ? 1 : 0;
    const warrantyVal = (is_in_warranty === 'true' || is_in_warranty === 1 || is_in_warranty === true || is_in_warranty === '1') ? 1 : 0;

    const insertStmt = db.prepare(`
      INSERT INTO complaints (
        ticket_id, customer_name, customer_phone, customer_email, customer_address,
        city, consumer_no, order_no, invoice_no, invoice_date, location_url, is_in_warranty,
        estimated_charges, notify_charges, payment_collected, payment_status,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status, registered_by_user_id, created_at, status_updated_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 0, 'Unpaid',
        ?, ?, ?, ?, ?,
        ?, 'Unassigned', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = insertStmt.run(
      ticketId,
      customer_name.trim(),
      customer_phone.trim(),
      customer_email ? customer_email.trim() : null,
      customer_address.trim(),
      city ? city.trim() : null,
      consumer_no ? consumer_no.trim() : null,
      order_no ? order_no.trim() : null,
      invoice_no ? invoice_no.trim() : null,
      invoice_date ? invoice_date.trim() : null,
      location_url ? location_url.trim() : null,
      warrantyVal,
      cleanCharges,
      shouldNotifyCharges,
      product_type,
      product_serial ? product_serial.trim() : null,
      installation_id ? installation_id.trim() : null,
      issue_category,
      issue_description.trim(),
      priority,
      registeredByUserId
    );

    const complaintId = result.lastInsertRowid;

    // Save attachments if uploaded
    if (req.files && req.files.length > 0) {
      const attachStmt = db.prepare(`
        INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const f of req.files) {
        let base64Data = null;
        try {
          if (fs.existsSync(f.path)) {
            const fileBuf = fs.readFileSync(f.path);
            base64Data = `data:${f.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
          }
        } catch (err) {
          console.warn('Could not encode file to base64:', err.message);
        }
        const insertRes = attachStmt.run(complaintId, f.originalname, `/uploads/${f.filename}`, f.mimetype, base64Data, actorName);
        const attId = insertRes.lastInsertRowid;
        db.prepare('UPDATE complaint_attachments SET file_url = ? WHERE id = ?').run(`/api/attachments/${attId}`, attId);
      }
    }

    // Initial timeline record
    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, 'Unassigned', ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(complaintId, `Complaint registered for ${product_type}. Issue: ${issue_category}`, actorName, actorRole);

    // Auto-dispatch WhatsApp & Email notification asynchronously
    notificationService.dispatchAsync({
      complaintId,
      templateKey: 'complaint_registered',
      data: {
        customer_name,
        ticket_id: ticketId,
        product_type,
        issue_category,
        status: 'Unassigned',
        phone: customer_phone,
        email: customer_email,
        estimated_charges: cleanCharges,
        notify_charges: shouldNotifyCharges
      }
    });

    // In-App Notification for Admin & Desk
    try {
      const regNotifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role, read_by, created_at
        ) VALUES (?, 'new_ticket', ?, ?, ?, ?, ?, 'admin', ?, ?, '[]', CURRENT_TIMESTAMP)
      `).run(
        regNotifId,
        ticketId,
        complaintId,
        `New Complaint Registered: ${ticketId}`,
        `New ticket #${ticketId} registered for ${customer_name} (${product_type} - ${issue_category}). Priority: ${priority}`,
        customer_name,
        actorName,
        actorRole
      );
    } catch (notifErr) {
      console.warn('In-app notification on complaint registration error:', notifErr.message);
    }

    const newTicket = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    realtimeService.notifyComplaintUpdate({ id: complaintId, action: 'created', status: 'Unassigned' });
    res.status(201).json({
      message: 'Complaint registered successfully',
      complaint: newTicket
    });
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Failed to register complaint: ' + err.message });
  }
}

async function updateComplaint(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      city,
      consumer_no,
      order_no,
      invoice_no,
      invoice_date,
      location_url,
      is_in_warranty,
      estimated_charges,
      notify_charges,
      product_type,
      product_serial,
      installation_id,
      issue_category,
      issue_description,
      priority
    } = req.body;

    const warrantyVal = is_in_warranty !== undefined
      ? ((is_in_warranty === 'true' || is_in_warranty === 1 || is_in_warranty === true || is_in_warranty === '1') ? 1 : 0)
      : existing.is_in_warranty;

    const cleanCharges = estimated_charges !== undefined ? parseFloat(estimated_charges) || 0 : existing.estimated_charges;
    const shouldNotifyCharges = notify_charges !== undefined
      ? (notify_charges === 'true' || notify_charges === 1 || notify_charges === true || notify_charges === '1' ? 1 : 0)
      : existing.notify_charges;

    db.prepare(`
      UPDATE complaints SET
        customer_name = ?,
        customer_phone = ?,
        customer_email = ?,
        customer_address = ?,
        city = ?,
        consumer_no = ?,
        order_no = ?,
        invoice_no = ?,
        invoice_date = ?,
        location_url = ?,
        is_in_warranty = ?,
        estimated_charges = ?,
        notify_charges = ?,
        product_type = ?,
        product_serial = ?,
        installation_id = ?,
        issue_category = ?,
        issue_description = ?,
        priority = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      customer_name !== undefined ? customer_name.trim() : existing.customer_name,
      customer_phone !== undefined ? customer_phone.trim() : existing.customer_phone,
      customer_email !== undefined ? (customer_email ? customer_email.trim() : null) : existing.customer_email,
      customer_address !== undefined ? customer_address.trim() : existing.customer_address,
      city !== undefined ? (city ? city.trim() : null) : existing.city,
      consumer_no !== undefined ? (consumer_no ? consumer_no.trim() : null) : existing.consumer_no,
      order_no !== undefined ? (order_no ? order_no.trim() : null) : existing.order_no,
      invoice_no !== undefined ? (invoice_no ? invoice_no.trim() : null) : existing.invoice_no,
      invoice_date !== undefined ? (invoice_date ? invoice_date.trim() : null) : existing.invoice_date,
      location_url !== undefined ? (location_url ? location_url.trim() : null) : existing.location_url,
      warrantyVal,
      cleanCharges,
      shouldNotifyCharges,
      product_type || existing.product_type,
      product_serial !== undefined ? (product_serial ? product_serial.trim() : null) : existing.product_serial,
      installation_id !== undefined ? (installation_id ? installation_id.trim() : null) : existing.installation_id,
      issue_category || existing.issue_category,
      issue_description !== undefined ? issue_description.trim() : existing.issue_description,
      priority || existing.priority,
      id
    );

    const actorName = req.user ? req.user.name : 'Supervisor';
    const actorRole = req.user ? req.user.role : 'staff';

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, 'Details Updated', 'Complaint parameters and customer details updated', ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, actorName, actorRole);

    const updated = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone, t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(id);

    realtimeService.notifyComplaintUpdate({ id, action: 'updated', status: updated?.status });
    res.json({ message: 'Complaint updated successfully', complaint: updated });
  } catch (err) {
    console.error('Update complaint error:', err);
    res.status(500).json({ error: 'Failed to update complaint: ' + err.message });
  }
}

async function recordPayment(req, res) {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const { payment_collected, payment_mode = 'Cash', notes = '' } = req.body;
    const amount = parseFloat(payment_collected) || 0;
    const estimated = parseFloat(complaint.estimated_charges) || 0;

    const isDirectPayment = payment_mode && (
      payment_mode.toLowerCase().includes('online') || 
      payment_mode.toLowerCase().includes('bank') ||
      payment_mode.toLowerCase().includes('upi')
    );

    // Enforce: ALL payment collection strictly requires an assigned technician!
    if (amount > 0 && !complaint.assigned_technician_id) {
      return res.status(400).json({ 
        error: 'Cannot record payment on an unassigned complaint. Please assign a technician to this ticket first.' 
      });
    }

    let paymentStatus = 'Collected';
    if (amount === 0) {
      paymentStatus = 'Unpaid';
    } else if (estimated > 0 && amount < estimated) {
      paymentStatus = 'Partially Paid';
    }

    // Direct office payments are already with the company; technician cash is pending settlement until deposited
    const actorName = req.user ? req.user.name : (complaint.assigned_technician_id ? 'Field Technician' : 'Office Staff');
    const actorRole = req.user ? req.user.role : (complaint.assigned_technician_id ? 'technician' : 'staff');

    let settlementStatus = complaint.company_settlement_status || 'Pending Settlement';
    let settledAt = complaint.company_settled_at;
    let settledBy = complaint.company_settled_by;

    if (isDirectPayment && amount > 0) {
      settlementStatus = 'Settled with Company';
      settledAt = new Date().toISOString();
      settledBy = actorName;
    }

    db.prepare(`
      UPDATE complaints SET
        payment_collected = ?,
        payment_collected_at = CURRENT_TIMESTAMP,
        payment_mode = ?,
        payment_status = ?,
        company_settlement_status = ?,
        company_settled_at = ?,
        company_settled_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, payment_mode, paymentStatus, settlementStatus, settledAt, settledBy, id);

    const noteText = `Payment of ₹${amount} recorded via ${payment_mode}.${estimated > 0 ? ` (Quoted: ₹${estimated})` : ''} ${notes ? `• ${notes}` : ''}`;

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, 'Payment Recorded', ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, noteText, actorName, actorRole);

    const updated = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone, t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(id);

    realtimeService.notifyComplaintUpdate({ id, action: 'payment' });
    res.json({ message: 'Payment recorded successfully', complaint: updated });
  } catch (err) {
    console.error('Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment: ' + err.message });
  }
}

async function settleCompanyPayment(req, res) {
  try {
    const { id } = req.params;
    const { notes = '', amount_received } = req.body;

    const complaint = db.prepare(`
      SELECT c.*, t.name as tech_name 
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(id);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!complaint.assigned_technician_id) {
      return res.status(400).json({ 
        error: 'Cannot settle technician cash on an unassigned complaint. Please assign a technician first.' 
      });
    }

    const settledAmt = amount_received !== undefined ? parseFloat(amount_received) : (parseFloat(complaint.payment_collected) || 0);
    const actorName = req.user ? req.user.name : 'Company Finance/Admin';
    const actorRole = req.user ? req.user.role : 'admin';

    db.prepare(`
      UPDATE complaints SET
        company_settlement_status = 'Settled with Company',
        company_settled_at = CURRENT_TIMESTAMP,
        company_settled_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(actorName, id);

    const timelineMsg = `Company confirmed receipt of ₹${settledAmt} collected by technician ${complaint.tech_name || 'N/A'} into company account.${notes ? ` • Note: ${notes}` : ''}`;

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, 'Cash Settled with Company', ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, timelineMsg, actorName, actorRole);

    const updated = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone, t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(id);

    realtimeService.notifyComplaintUpdate({ id, action: 'settle_payment' });
    res.json({ message: 'Payment settled with company successfully', complaint: updated });
  } catch (err) {
    console.error('Settle company payment error:', err);
    res.status(500).json({ error: 'Failed to settle payment with company: ' + err.message });
  }
}

// ================= CATEGORY MANAGEMENT CONTROLLERS =================
async function listCategories(req, res) {
  try {
    const { product_type } = req.query;
    let query = 'SELECT * FROM issue_categories';
    const params = [];
    if (product_type) {
      query += ' WHERE product_type = ?';
      params.push(product_type);
    }
    query += ' ORDER BY product_type ASC, is_default DESC, category_name ASC';
    const categories = db.prepare(query).all(...params);
    res.json({ categories });
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
  }
}

async function addCategory(req, res) {
  try {
    const { product_type, category_name } = req.body;
    if (!product_type || !category_name || !category_name.trim()) {
      return res.status(400).json({ error: 'Product type and category name are required' });
    }
    const cleanCat = category_name.trim();
    const existing = db.prepare('SELECT id FROM issue_categories WHERE product_type = ? AND LOWER(category_name) = LOWER(?)').get(product_type, cleanCat);
    if (existing) {
      return res.status(400).json({ error: 'This category already exists for ' + product_type });
    }
    const result = db.prepare(`
      INSERT INTO issue_categories (product_type, category_name, is_default)
      VALUES (?, ?, 0)
    `).run(product_type, cleanCat);

    const created = db.prepare('SELECT * FROM issue_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Category added successfully', category: created });
  } catch (err) {
    console.error('Add category error:', err);
    res.status(500).json({ error: 'Failed to add category: ' + err.message });
  }
}

async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const category = db.prepare('SELECT * FROM issue_categories WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    db.prepare('DELETE FROM issue_categories WHERE id = ?').run(id);
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
}

async function assignTechnician(req, res) {
  try {
    const { id } = req.params;
    const { technician_id, expected_visit_date } = req.body;

    if (!technician_id) {
      return res.status(400).json({ error: 'Technician selection is required' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const technician = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technician_id);
    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    // Update complaint
    db.prepare(`
      UPDATE complaints 
      SET assigned_technician_id = ?, 
          expected_visit_date = ?, 
          status = 'Assigned', 
          assigned_at = CURRENT_TIMESTAMP, 
          status_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(technician_id, expected_visit_date || null, id);

    // Add timeline
    const performer = req.user ? req.user.name : 'Support Desk';
    const role = req.user ? req.user.role : 'staff';
    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Assigned', ?, ?, ?, 1)
    `).run(id, `Assigned to ${technician.name} (${technician.area_zone}). Expected visit: ${expected_visit_date || 'Within 24-48 hrs'}`, performer, role);

    // Check if technician is already the same technician (e.g. re-dispatching, retrying or re-saving)
    const isSameTechnician = complaint.assigned_technician_id && String(complaint.assigned_technician_id) === String(technician_id);
    const explicitNotifyCustomer = req.body.notify_customer !== undefined ? Boolean(req.body.notify_customer) : null;

    // Check if customer was already notified for technician assignment
    const alreadyNotifiedCustomer = db.prepare(`
      SELECT id FROM notification_logs 
      WHERE complaint_id = ? AND template_key = 'technician_assigned' AND status = 'sent'
      LIMIT 1
    `).get(id);

    // Only notify customer if:
    // 1. Explicitly requested: notify_customer === true
    // OR 2. Not the same technician OR customer was never notified before
    const shouldNotifyCustomer = explicitNotifyCustomer !== null
      ? explicitNotifyCustomer
      : (!isSameTechnician || !alreadyNotifiedCustomer);

    const isReassignment = complaint.assigned_technician_id && String(complaint.assigned_technician_id) !== String(technician_id);

    if (shouldNotifyCustomer) {
      // 1. Notify Customer via WhatsApp & Email
      const custTemplateKey = isReassignment ? 'customer_technician_reassigned' : 'technician_assigned';
      notificationService.dispatchAsync({
        complaintId: id,
        templateKey: custTemplateKey,
        data: {
          customer_name: complaint.customer_name,
          ticket_id: complaint.ticket_id,
          complaint_id: complaint.ticket_id,
          product_type: complaint.product_type || 'Solar System',
          technician_name: technician.name,
          technician_phone: technician.phone || '',
          expected_visit_date: expected_visit_date || 'Within 24-48 Hours'
        }
      });
    }

    // 2. Notify Technician via WhatsApp (Direct dispatch using configured notification template)
    if (technician.phone) {
      const techTemplateKey = isReassignment ? 'technician_reassigned_work_order' : 'technician_work_order';
      notificationService.dispatchAsync({
        complaintId: id,
        templateKey: techTemplateKey,
        channels: ['whatsapp'],
        forceWhatsAppTo: technician.phone,
        data: {
          technician_name: technician.name,
          ticket_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          customer_phone: complaint.customer_phone,
          customer_address: complaint.customer_address + (complaint.city ? ` (${complaint.city})` : ''),
          product_type: complaint.product_type,
          issue_category: complaint.issue_category,
          issue_description: complaint.issue_description,
          priority: complaint.priority,
          expected_visit_date: expected_visit_date || 'Within 24-48 Hours',
          notes: complaint.issue_description
        }
      });
    }

    // If reassigned from an existing technician, notify previous technician (Tech A) WITHOUT disclosing new technician details
    if (complaint.assigned_technician_id && String(complaint.assigned_technician_id) !== String(technician_id)) {
      try {
        const prevTech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(complaint.assigned_technician_id);
        if (prevTech) {
          if (prevTech.phone) {
            notificationService.dispatchAsync({
              complaintId: id,
              templateKey: 'technician_reassigned',
              channels: ['whatsapp'],
              forceWhatsAppTo: prevTech.phone,
              data: {
                technician_name: prevTech.name,
                ticket_id: complaint.ticket_id,
                customer_name: complaint.customer_name,
                notes: `Complaint #${complaint.ticket_id} has been assigned to another technician.`
              }
            });
          }

          // Persist in-app notification for Previous Technician (Tech A)
          const reassignNotifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          db.prepare(`
            INSERT INTO in_app_notifications (
              id, type, ticket_id, complaint_id, title, message, customer_name,
              target_role, target_technician_id, target_technician_name,
              performed_by_name, performed_by_role, read_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', CURRENT_TIMESTAMP)
          `).run(
            reassignNotifId,
            'reassigned',
            complaint.ticket_id,
            complaint.id,
            `Ticket ${complaint.ticket_id} Reassigned`,
            `Complaint #${complaint.ticket_id} (${complaint.customer_name}) has been assigned to another technician. It has been removed from your active schedule.`,
            complaint.customer_name,
            'technician',
            prevTech.id,
            prevTech.name,
            performer,
            role
          );
        }
      } catch (reassignErr) {
        console.warn('Technician reassign notify note:', reassignErr.message);
      }
    }

    // Persist in-app notification for Newly Assigned Technician (Tech B)
    try {
      const newTechNotifId = `notif_${Date.now() + 1}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role, read_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', CURRENT_TIMESTAMP)
      `).run(
        newTechNotifId,
        'assignment',
        complaint.ticket_id,
        complaint.id,
        `New Ticket Assigned: ${complaint.ticket_id}`,
        `You have been assigned to customer ${complaint.customer_name} (${complaint.product_type} - ${complaint.issue_category}). Expected visit: ${expected_visit_date || 'Within 24 Hours'}`,
        complaint.customer_name,
        'technician',
        technician.id,
        technician.name,
        performer,
        role
      );
    } catch (newTechNotifErr) {
      console.warn('New tech notification save note:', newTechNotifErr.message);
    }

    // Persist in-app notification for Admin & Help Desk
    try {
      const adminNotifId = `notif_${Date.now() + 2}_${Math.random().toString(36).slice(2, 7)}`;
      const adminTitle = isReassignment ? `Ticket ${complaint.ticket_id} Reassigned` : `Ticket ${complaint.ticket_id} Assigned`;
      const adminMessage = isReassignment
        ? `Ticket #${complaint.ticket_id} (${complaint.customer_name}) was reassigned to ${technician.name} by ${performer}.`
        : `Ticket #${complaint.ticket_id} (${complaint.customer_name}) was assigned to ${technician.name} by ${performer}. Expected visit: ${expected_visit_date || 'Within 24 Hours'}`;
      db.prepare(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role, read_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, '[]', CURRENT_TIMESTAMP)
      `).run(
        adminNotifId,
        isReassignment ? 'reassigned' : 'assignment',
        complaint.ticket_id,
        complaint.id,
        adminTitle,
        adminMessage,
        complaint.customer_name,
        technician.id,
        technician.name,
        performer,
        role
      );
    } catch (adminNotifErr) {
      console.warn('Admin notification save note:', adminNotifErr.message);
    }

    const updated = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone, t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(id);

    realtimeService.notifyComplaintUpdate({ id, action: 'assigned', status: 'Assigned' });
    res.json({ message: 'Technician assigned successfully', complaint: updated });
  } catch (err) {
    console.error('Assign technician error:', err);
    res.status(500).json({ error: 'Failed to assign technician' });
  }
}

async function remindTechnician(req, res) {
  try {
    const { id } = req.params;
    const complaint = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone, t.area_zone as technician_zone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ? OR c.ticket_id = ?
    `).get(id, id);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!complaint.assigned_technician_id || !complaint.technician_phone) {
      return res.status(400).json({ error: 'No technician assigned or technician contact phone missing' });
    }

    const performer = req.user ? req.user.name : 'Dispatcher';
    const role = req.user ? req.user.role : 'staff';

    // Log timeline note
    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Visit Reminder Sent', ?, ?, ?, 0)
    `).run(
      complaint.id,
      `Sent pending visit reminder to technician ${complaint.technician_name} (${complaint.technician_phone}) via WhatsApp`,
      performer,
      role
    );

    // Dispatch WhatsApp reminder
    notificationService.dispatchAsync({
      complaintId: complaint.id,
      templateKey: 'technician_reminder',
      channels: ['whatsapp'],
      forceWhatsAppTo: complaint.technician_phone,
      data: {
        technician_name: complaint.technician_name,
        ticket_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: complaint.customer_address + (complaint.city ? ` (${complaint.city})` : ''),
        expected_visit_date: complaint.expected_visit_date || 'Today / Scheduled Time'
      }
    });

    res.json({ success: true, message: `Reminder WhatsApp sent to ${complaint.technician_name}` });
  } catch (err) {
    console.error('Remind technician error:', err);
    res.status(500).json({ error: 'Failed to send technician reminder: ' + err.message });
  }
}

async function addTimelineNote(req, res) {
  try {
    const { id } = req.params;
    const { notes, status, notify_customer = false } = req.body;

    if (!notes) {
      return res.status(400).json({ error: 'Note description is required' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const performer = req.user ? req.user.name : 'Service Staff';
    const role = req.user ? req.user.role : 'staff';

    // Requirement 10: Role-based status transition restrictions for field visits
    if (role === 'technician' && status) {
      if (!['In Progress', 'On Hold'].includes(status)) {
        return res.status(400).json({ error: 'Technicians can only update status to In Progress or On Hold in visit notes' });
      }
    }

    const newStatus = status || complaint.status;

    if (status && status !== complaint.status) {
      db.prepare('UPDATE complaints SET status = ?, status_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    }

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, status ? `Status: ${status}` : 'Follow-up Note', notes, performer, role, notify_customer ? 1 : 0);

    // User requirement: Do NOT send WhatsApp messages for technician work process updates (In Progress, On Hold, or field visit notes).
    // The pipeline/tracking page reflects the progress, but no WhatsApp message should spam the customer.
    const isWorkProcessStatus = ['In Progress', 'On Hold'].includes(status) || role === 'technician';
    if (notify_customer && !isWorkProcessStatus) {
      notificationService.dispatchAsync({
        complaintId: id,
        templateKey: 'status_update',
        data: {
          customer_name: complaint.customer_name,
          ticket_id: complaint.ticket_id,
          product_type: complaint.product_type,
          status: newStatus,
          notes: notes
        }
      });
    }

    // Broadcast real-time update to all connected Staff and Admin screens
    realtimeService.notifyComplaintUpdate({ id, action: 'status_or_note', status: newStatus });

    res.json({ message: 'Timeline note recorded successfully', status: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add timeline note' });
  }
}

async function resolveComplaint(req, res) {
  try {
    const { id } = req.params;
    const { resolution_notes, spare_parts_used, closing_photo_url } = req.body;

    if (!resolution_notes) {
      return res.status(400).json({ error: 'Resolution notes are required' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const performer = req.user ? req.user.name : 'Technician';
    const role = req.user ? req.user.role : 'technician';

    let photoUrl = closing_photo_url || null;
    if (req.file) {
      let base64Data = null;
      try {
        if (fs.existsSync(req.file.path)) {
          const fileBuf = fs.readFileSync(req.file.path);
          base64Data = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
        }
      } catch (err) {
        console.warn('Could not encode closing photo to base64:', err.message);
      }
      const attachRes = db.prepare(`
        INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, req.file.originalname || 'Closing_Photo.jpg', `/uploads/${req.file.filename}`, req.file.mimetype, base64Data, performer);
      const attId = attachRes.lastInsertRowid;
      photoUrl = base64Data || `/api/attachments/${attId}`;
      db.prepare('UPDATE complaint_attachments SET file_url = ? WHERE id = ?').run(`/api/attachments/${attId}`, attId);
    }

    db.prepare(`
      UPDATE complaints 
      SET status = 'Resolved',
          resolution_notes = ?,
          spare_parts_used = ?,
          closing_photo_url = COALESCE(?, closing_photo_url),
          resolved_at = CURRENT_TIMESTAMP,
          status_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resolution_notes, spare_parts_used || null, photoUrl, id);

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Resolved', ?, ?, ?, 1)
    `).run(
      id,
      `Issue resolved. Summary: ${resolution_notes}${spare_parts_used ? ' | Spares: ' + spare_parts_used : ''}`,
      performer,
      role
    );

    // Notify customer that work is complete
    notificationService.dispatchAsync({
      complaintId: id,
      templateKey: 'complaint_resolved',
      data: {
        customer_name: complaint.customer_name,
        ticket_id: complaint.ticket_id,
        technician_name: performer,
        notes: resolution_notes
      }
    });

    // In-App Notification for Admin & Desk
    try {
      const resNotifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role, read_by, created_at
        ) VALUES (?, 'resolved', ?, ?, ?, ?, ?, 'admin', ?, ?, '[]', CURRENT_TIMESTAMP)
      `).run(
        resNotifId,
        complaint.ticket_id,
        complaint.id,
        `Ticket Marked Resolved: ${complaint.ticket_id}`,
        `Technician ${performer} marked ticket #${complaint.ticket_id} (${complaint.customer_name}) as Resolved. Notes: ${resolution_notes}`,
        complaint.customer_name,
        performer,
        role
      );
    } catch (notifErr) {
      console.warn('In-app notification on resolve error:', notifErr.message);
    }

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    realtimeService.notifyComplaintUpdate({ id, action: 'resolved', status: 'Resolved' });
    res.json({ message: 'Complaint marked as resolved', complaint: updated });
  } catch (err) {
    console.error('Resolve complaint error:', err);
    res.status(500).json({ error: 'Failed to resolve complaint' });
  }
}

async function closeComplaint(req, res) {
  try {
    const { id } = req.params;
    const { closure_remarks } = req.body;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const performer = req.user ? req.user.name : 'Support Supervisor';
    const role = req.user ? req.user.role : 'staff';

    db.prepare(`
      UPDATE complaints 
      SET status = 'Closed',
          closed_at = CURRENT_TIMESTAMP,
          status_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Closed', ?, ?, ?, 1)
    `).run(id, closure_remarks || 'Ticket reviewed and closed with customer confirmation.', performer, role);

    // Send closure notification with rating request
    notificationService.dispatchAsync({
      complaintId: id,
      templateKey: 'complaint_closed',
      data: {
        customer_name: complaint.customer_name,
        ticket_id: complaint.ticket_id
      }
    });

    // In-App Notification for Admin & Desk
    try {
      const closeNotifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role, read_by, created_at
        ) VALUES (?, 'closed', ?, ?, ?, ?, ?, 'admin', ?, ?, '[]', CURRENT_TIMESTAMP)
      `).run(
        closeNotifId,
        complaint.ticket_id,
        complaint.id,
        `Ticket Closed: ${complaint.ticket_id}`,
        `Ticket #${complaint.ticket_id} for ${complaint.customer_name} closed by ${performer}. Remarks: ${closure_remarks || 'Reviewed and closed'}`,
        complaint.customer_name,
        performer,
        role
      );
    } catch (notifErr) {
      console.warn('In-app notification on close error:', notifErr.message);
    }

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    realtimeService.notifyComplaintUpdate({ id, action: 'closed', status: 'Closed' });
    res.json({ message: 'Complaint closed successfully', complaint: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close complaint' });
  }
}

async function reopenComplaint(req, res) {
  try {
    const { id } = req.params;
    const { reason, technician_id, performer_name, performer_role } = req.body || {};

    const complaint = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ? OR c.ticket_id = ?
    `).get(id, id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const newTechId = technician_id ? Number(technician_id) : complaint.assigned_technician_id;
    const performer = performer_name || (req.user ? req.user.name : complaint.customer_name + ' (Customer Portal)');
    const role = performer_role || (req.user ? req.user.role : 'customer');

    // Ensure columns exist in SQLite if needed
    try {
      db.prepare('ALTER TABLE complaints ADD COLUMN previous_technician_id INTEGER').run();
    } catch (_) {}
    try {
      db.prepare('ALTER TABLE complaints ADD COLUMN previous_technician_name TEXT').run();
    } catch (_) {}

    db.prepare(`
      UPDATE complaints 
      SET status = 'Reopened',
          assigned_technician_id = ?,
          previous_technician_id = ?,
          previous_technician_name = ?,
          closed_at = null,
          status_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newTechId, complaint.assigned_technician_id || null, complaint.technician_name || null, complaint.id);

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Reopened', ?, ?, ?, 1)
    `).run(complaint.id, reason ? `Ticket reopened: ${reason}` : 'Customer requested ticket reopening due to persistent issue.', performer, role);

    const updated = db.prepare(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone 
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id = ?
    `).get(complaint.id);

    // Notify customer with technician details
    notificationService.dispatchAsync({
      complaintId: complaint.id,
      templateKey: 'complaint_reopened',
      data: {
        customer_name: complaint.customer_name,
        ticket_id: complaint.ticket_id,
        reason: reason || 'Issue recurring / follow-up requested',
        technician_name: updated?.technician_name || '',
        technician_phone: updated?.technician_phone || ''
      }
    });

    // Notify technician of reopened ticket
    notificationService.dispatchAsync({
      complaintId: complaint.id,
      templateKey: 'technician_reopened_work_order',
      data: {
        technician_name: updated?.technician_name || 'Technician',
        complaint_id: complaint.ticket_id,
        ticket_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: complaint.customer_address || complaint.city || '',
        reopen_reason: reason || 'Issue recurring / follow-up requested',
        previous_technician_name: complaint.technician_name || ''
      }
    });

    // If reopened and transferred to another technician, alert previous technician
    if (complaint.assigned_technician_id && assigned_technician_id && String(complaint.assigned_technician_id) !== String(assigned_technician_id)) {
      notificationService.dispatchAsync({
        complaintId: complaint.id,
        templateKey: 'technician_reopen_job_transferred',
        data: {
          technician_name: complaint.technician_name,
          complaint_id: complaint.ticket_id,
          ticket_id: complaint.ticket_id,
          customer_name: complaint.customer_name,
          new_technician_name: updated?.technician_name || 'another specialist',
          reopen_reason: reason || 'Follow-up requested'
        }
      });
    }

    realtimeService.notifyComplaintUpdate({ id: complaint.id, action: 'reopened', status: 'Reopened' });
    res.json({ message: 'Complaint reopened successfully', complaint: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reopen complaint' });
  }
}

async function deleteComplaint(req, res) {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? OR ticket_id = ?').get(id, id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const compId = complaint.id;

    // Delete related child records cleanly in a transaction
    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM complaint_timelines WHERE complaint_id = ?').run(compId);
      db.prepare('DELETE FROM complaint_attachments WHERE complaint_id = ?').run(compId);
      db.prepare('DELETE FROM notification_logs WHERE complaint_id = ?').run(compId);
      db.prepare('UPDATE whatsapp_messages SET complaint_id = NULL WHERE complaint_id = ?').run(compId);
      db.prepare('DELETE FROM complaints WHERE id = ?').run(compId);
    });

    deleteTx();

    console.log(`[ComplaintController] Deleted ticket #${complaint.ticket_id} (ID: ${compId})`);
    realtimeService.notifyComplaintUpdate({ id: compId, action: 'deleted' });
    res.json({
      success: true,
      message: `Complaint ticket #${complaint.ticket_id} has been permanently deleted`,
      deletedId: compId,
      deletedTicketId: complaint.ticket_id
    });
  } catch (err) {
    console.error('Delete complaint error:', err);
    res.status(500).json({ error: 'Failed to delete complaint: ' + err.message });
  }
}

function submitFeedback(req, res) {
  try {
    const { id } = req.params;
    const { rating, feedback_comments } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? OR ticket_id = ?').get(id, id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    db.prepare(`
      UPDATE complaints 
      SET rating = ?, feedback_comments = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rating, feedback_comments || null, complaint.id);

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Feedback Received', ?, 'Customer', 'customer', 0)
    `).run(complaint.id, `Customer submitted ${rating}-Star rating: "${feedback_comments || 'No comment'}"`);

    res.json({ message: 'Thank you! Your feedback has been recorded.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
}

// Bulk sync / restore complaints from browser client backup or persistent store
function syncBackupComplaints(req, res) {
  try {
    const { complaints } = req.body;
    if (!Array.isArray(complaints) || complaints.length === 0) {
      return res.json({ synced: 0, message: 'No complaints to sync' });
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO complaints (
        ticket_id, customer_name, customer_phone, customer_email, customer_address,
        city, consumer_no, order_no, location_url, is_in_warranty,
        estimated_charges, notify_charges, payment_collected, payment_status,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status, assigned_technician_id, expected_visit_date, resolution_notes,
        created_at, status_updated_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    let syncedCount = 0;
    const syncTx = db.transaction(() => {
      for (const c of complaints) {
        if (!c.ticket_id || !c.customer_name || !c.customer_phone) continue;
        const existing = db.prepare('SELECT id FROM complaints WHERE ticket_id = ?').get(c.ticket_id);
        if (!existing) {
          insertStmt.run(
            c.ticket_id,
            c.customer_name,
            c.customer_phone,
            c.customer_email || null,
            c.customer_address || 'Address',
            c.city || null,
            c.consumer_no || null,
            c.order_no || null,
            c.location_url || null,
            c.is_in_warranty !== undefined ? c.is_in_warranty : 1,
            c.estimated_charges || 0,
            c.notify_charges || 0,
            c.payment_collected || 0,
            c.payment_status || 'Unpaid',
            c.product_type || 'Solar Rooftop Systems',
            c.product_serial || null,
            c.installation_id || null,
            c.issue_category || 'Service Request',
            c.issue_description || 'Service complaint',
            c.priority || 'Medium',
            c.status || 'Unassigned',
            c.assigned_technician_id || null,
            c.expected_visit_date || null,
            c.resolution_notes || null,
            c.created_at || new Date().toISOString(),
            c.status_updated_at || c.created_at || new Date().toISOString(),
            c.updated_at || new Date().toISOString()
          );
          syncedCount++;
        }
      }
    });

    syncTx();
    console.log(`[BackupSync] Restored/Synced ${syncedCount} complaints to database.`);
    res.json({ success: true, synced: syncedCount });
  } catch (err) {
    console.error('Sync backup error:', err);
    res.status(500).json({ error: 'Failed to sync backup: ' + err.message });
  }
}

async function addAttachments(req, res) {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const actorName = req.user ? req.user.name : 'Staff';
    const attachStmt = db.prepare(`
      INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, file_data, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const added = [];
    for (const f of req.files) {
      let base64Data = null;
      try {
        if (fs.existsSync(f.path)) {
          const fileBuf = fs.readFileSync(f.path);
          base64Data = `data:${f.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
        }
      } catch (err) {
        console.warn('Could not encode file buffer:', err.message);
      }
      const insertRes = attachStmt.run(id, f.originalname, `/uploads/${f.filename}`, f.mimetype, base64Data, actorName);
      const attId = insertRes.lastInsertRowid;
      const permUrl = `/api/attachments/${attId}`;
      db.prepare('UPDATE complaint_attachments SET file_url = ? WHERE id = ?').run(permUrl, attId);
      added.push({
        id: attId,
        complaint_id: id,
        file_name: f.originalname,
        file_url: base64Data || permUrl,
        file_type: f.mimetype,
        uploaded_by: actorName
      });
    }

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Attachment Added', ?, ?, ?, 0)
    `).run(id, `Added ${req.files.length} document/photo proof: ${req.files.map(f => f.originalname).join(', ')}`, actorName, req.user?.role || 'staff');

    res.json({ message: 'Attachments uploaded successfully', attachments: added });
  } catch (err) {
    console.error('Add attachments error:', err);
    res.status(500).json({ error: 'Failed to upload attachments: ' + err.message });
  }
}

/**
 * Re-send work order directly to technician via WhatsApp Cloud API
 * Does NOT notify or bother the customer
 */
function resendTechnicianWorkOrder(req, res) {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (!complaint.assigned_technician_id) {
      return res.status(400).json({ error: 'No technician assigned to this complaint' });
    }
    const technician = db.prepare('SELECT * FROM technicians WHERE id = ?').get(complaint.assigned_technician_id);
    if (!technician || !technician.phone) {
      return res.status(400).json({ error: 'Technician phone number not found' });
    }

    notificationService.dispatchAsync({
      complaintId: id,
      templateKey: 'technician_work_order',
      channels: ['whatsapp'],
      forceWhatsAppTo: technician.phone,
      data: {
        technician_name: technician.name,
        ticket_id: complaint.ticket_id,
        customer_name: complaint.customer_name,
        customer_phone: complaint.customer_phone,
        customer_address: complaint.customer_address + (complaint.city ? ` (${complaint.city})` : ''),
        product_type: complaint.product_type,
        issue_category: complaint.issue_category,
        issue_description: complaint.issue_description,
        priority: complaint.priority,
        expected_visit_date: complaint.expected_visit_date || 'Immediate / Today',
        notes: complaint.issue_description
      }
    });

    res.json({ 
      success: true, 
      message: `Work order sent to technician ${technician.name} (${technician.phone}) via WhatsApp Cloud API` 
    });
  } catch (err) {
    console.error('Error resending technician work order:', err);
    res.status(500).json({ error: 'Failed to resend: ' + err.message });
  }
}

module.exports = {
  listComplaints,
  getComplaintById,
  getCustomerHistory,
  trackTicket,
  createComplaint,
  addAttachments,
  updateComplaint,
  recordPayment,
  settleCompanyPayment,
  assignTechnician,
  remindTechnician,
  resendTechnicianWorkOrder,
  addTimelineNote,
  resolveComplaint,
  closeComplaint,
  reopenComplaint,
  deleteComplaint,
  submitFeedback,
  syncBackupComplaints,
  listCategories,
  addCategory,
  deleteCategory
};
