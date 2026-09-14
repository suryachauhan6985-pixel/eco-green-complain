const db = require('../config/database');
const notificationService = require('../services/notificationService');

// Helper to generate unique sequential Ticket ID (e.g., EGS-2026-000123)
function generateTicketId() {
  const currentYear = new Date().getFullYear();
  const prefix = `EGS-${currentYear}-`;

  const lastTicket = db.prepare(`
    SELECT ticket_id FROM complaints 
    WHERE ticket_id LIKE ? 
    ORDER BY id DESC 
    LIMIT 1
  `).get(`${prefix}%`);

  let nextNumber = 101; // start from 000101
  if (lastTicket && lastTicket.ticket_id) {
    const parts = lastTicket.ticket_id.split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

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
      query += ` AND c.assigned_technician_id = ? `;
      params.push(req.user.technicianId || -1);
    } else if (technician_id) {
      query += ` AND c.assigned_technician_id = ? `;
      params.push(technician_id);
    }

    if (search) {
      query += ` AND (c.ticket_id LIKE ? OR c.customer_name LIKE ? OR c.customer_phone LIKE ? OR c.product_serial LIKE ? OR c.city LIKE ? OR c.consumer_no LIKE ? OR c.order_no LIKE ?) `;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term);
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

    // Role check: Technician can only access their assigned ticket
    if (req.user && req.user.role === 'technician' && complaint.assigned_technician_id !== req.user.technicianId) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    const attachments = db.prepare('SELECT * FROM complaint_attachments WHERE complaint_id = ? ORDER BY id DESC').all(complaint.id);
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
        city, consumer_no, order_no, location_url, is_in_warranty,
        estimated_charges, notify_charges, payment_collected, payment_status,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status, registered_by_user_id, created_at, status_updated_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
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
        INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const f of req.files) {
        attachStmt.run(complaintId, f.originalname, `/uploads/${f.filename}`, f.mimetype, actorName);
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

    const newTicket = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
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

    const { payment_collected, payment_mode = 'Cash / UPI', notes = '' } = req.body;
    const amount = parseFloat(payment_collected) || 0;
    const estimated = parseFloat(complaint.estimated_charges) || 0;

    let paymentStatus = 'Collected';
    if (amount === 0) {
      paymentStatus = 'Unpaid';
    } else if (estimated > 0 && amount < estimated) {
      paymentStatus = 'Partially Paid';
    }

    db.prepare(`
      UPDATE complaints SET
        payment_collected = ?,
        payment_status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, paymentStatus, id);

    const actorName = req.user ? req.user.name : 'Field Technician';
    const actorRole = req.user ? req.user.role : 'technician';

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

    res.json({ message: 'Payment recorded successfully', complaint: updated });
  } catch (err) {
    console.error('Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment: ' + err.message });
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

    // 1. Notify Customer via WhatsApp & Email
    notificationService.dispatchAsync({
      complaintId: id,
      templateKey: 'technician_assigned',
      data: {
        customer_name: complaint.customer_name,
        ticket_id: complaint.ticket_id,
        technician_name: technician.name,
        expected_visit_date: expected_visit_date || 'Within 24-48 Hours'
      }
    });

    // 2. Notify Technician via WhatsApp (Direct dispatch)
    if (technician.phone) {
      const techMsg = `🛠️ *New Job Assignment*\n\nHello ${technician.name}, you have been assigned ticket *${complaint.ticket_id}*.\n\n👤 *Customer:* ${complaint.customer_name}\n📞 *Phone:* ${complaint.customer_phone}\n📍 *Address:* ${complaint.customer_address}${complaint.city ? ` (${complaint.city})` : ''}\n🔧 *Product:* ${complaint.product_type}\n⚠️ *Issue:* ${complaint.issue_category} - ${complaint.issue_description}\n🚨 *Priority:* ${complaint.priority}\n📅 *Expected Visit:* ${expected_visit_date || 'Immediate'}${complaint.location_url ? `\n🗺️ *Location:* ${complaint.location_url}` : ''}\n\nPlease check your Eco Green technician portal for details.`;

      notificationService.dispatchAsync({
        complaintId: id,
        templateKey: 'technician_assigned',
        channels: ['whatsapp'],
        forceWhatsAppTo: technician.phone,
        data: {
          whatsapp_body: techMsg
        }
      });
    }

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    res.json({ message: 'Technician assigned successfully', complaint: updated });
  } catch (err) {
    console.error('Assign technician error:', err);
    res.status(500).json({ error: 'Failed to assign technician' });
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

    if (notify_customer) {
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

    res.json({ message: 'Timeline note recorded successfully' });
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
      photoUrl = `/uploads/${req.file.filename}`;
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

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
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

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    res.json({ message: 'Complaint closed successfully', complaint: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close complaint' });
  }
}

async function reopenComplaint(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const performer = req.user ? req.user.name : complaint.customer_name + ' (Customer Portal)';
    const role = req.user ? req.user.role : 'customer';

    db.prepare(`
      UPDATE complaints 
      SET status = 'Reopened',
          closed_at = null,
          status_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Reopened', ?, ?, ?, 1)
    `).run(id, reason ? `Ticket reopened: ${reason}` : 'Customer requested ticket reopening due to persistent issue.', performer, role);

    // Notify customer
    notificationService.dispatchAsync({
      complaintId: id,
      templateKey: 'complaint_reopened',
      data: {
        customer_name: complaint.customer_name,
        ticket_id: complaint.ticket_id
      }
    });

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    res.json({ message: 'Complaint reopened successfully', complaint: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reopen complaint' });
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

module.exports = {
  listComplaints,
  getComplaintById,
  getCustomerHistory,
  trackTicket,
  createComplaint,
  updateComplaint,
  recordPayment,
  assignTechnician,
  addTimelineNote,
  resolveComplaint,
  closeComplaint,
  reopenComplaint,
  submitFeedback,
  syncBackupComplaints
};
