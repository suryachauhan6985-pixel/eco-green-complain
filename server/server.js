require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize database schema and auto-seed if needed
const db = require('./config/database');
const { seedDatabase } = require('./data/seed');

// Middlewares
const { authenticateToken, requireRole } = require('./middleware/auth');
const upload = require('./middleware/upload');

// Controllers
const authController = require('./controllers/authController');
const complaintController = require('./controllers/complaintController');
const technicianController = require('./controllers/technicianController');
const notificationController = require('./controllers/notificationController');
const reportController = require('./controllers/reportController');
const customerDirectoryController = require('./controllers/customerDirectoryController');
const { verifyWebhook, handleIncomingWebhook } = require('./services/whatsappWebhookService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded photos/documents
const defaultUploadsPath = fs.existsSync('/data') ? path.join('/data', 'uploads') : path.join(__dirname, 'uploads');
const uploadsPath = process.env.UPLOAD_DIR || defaultUploadsPath;
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// API Welcome route
app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Eco Green Solar Complaint Management System API',
    message: 'Backend API is running smoothly. Open the frontend UI at http://localhost:5173',
    frontendUrl: 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      complaints: '/api/complaints',
      technicians: '/api/technicians',
      reports: '/api/reports/metrics',
      demoReset: 'POST /api/demo/reset'
    }
  });
});

// Health check handler for UptimeRobot & automated monitors (keeps Render free tier awake 24/7)
function healthHandler(req, res) {
  let dbStatus = 'connected';
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeHuman = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;

  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    service: 'Eco Green Solar CMS API',
    uptime: uptimeHuman,
    uptime_seconds: uptimeSeconds,
    database: dbStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}

// Support GET and HEAD for /health, /api/health, and /ping
app.get(['/health', '/api/health', '/ping'], healthHandler);
app.head(['/health', '/api/health', '/ping'], (req, res) => res.status(200).end());

// Demo Data Reset Endpoint
app.post('/api/demo/reset', async (req, res) => {
  try {
    await seedDatabase(true);
    res.json({ message: 'Demo database reset with 12+ realistic complaints successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset demo data: ' + err.message });
  }
});

// ================= AUTH ROUTES =================
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateToken, authController.getMe);
app.get('/api/auth/users', authenticateToken, requireRole('admin'), authController.listUsers);
app.post('/api/auth/create-user', authenticateToken, requireRole('admin'), authController.createUser);
app.put('/api/auth/users/:id', authenticateToken, requireRole('admin'), authController.updateUser);
app.delete('/api/auth/users/:id', authenticateToken, requireRole('admin'), authController.deleteUser);

// ================= PRODUCT CATALOG ROUTES =================
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY is_custom ASC, id ASC').all();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
});

app.post('/api/products', authenticateToken, (req, res) => {
  try {
    const { name, icon = 'Box', description = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    const cleanName = name.trim();
    const existing = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existing) {
      return res.status(400).json({ error: 'Product already exists' });
    }
    const stmt = db.prepare('INSERT INTO products (name, icon, description, is_custom) VALUES (?, ?, ?, 1)');
    const info = stmt.run(cleanName, icon, description);
    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ product: newProduct });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product: ' + err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    if (prod.is_custom === 0) {
      return res.status(400).json({ error: 'Default core products cannot be deleted' });
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product: ' + err.message });
  }
});

// ================= ISSUE CATEGORY ROUTES =================
app.get('/api/categories', complaintController.listCategories);
app.post('/api/categories', authenticateToken, requireRole('admin', 'staff'), complaintController.addCategory);
app.delete('/api/categories/:id', authenticateToken, requireRole('admin', 'staff'), complaintController.deleteCategory);

// ================= COMPLAINT ROUTES =================
// Public track endpoint (anyone with Ticket ID or Phone)
app.get('/api/complaints/track/:query', complaintController.trackTicket);
// Public / authenticated customer feedback
app.post('/api/complaints/:id/feedback', complaintController.submitFeedback);
// Public self-service complaint registration (or front-office)
app.post('/api/complaints/public-register', upload.array('attachments', 5), complaintController.createComplaint);
// Multi-source backup synchronization for container restarts
app.post('/api/complaints/sync-backup', complaintController.syncBackupComplaints);

// Protected complaint endpoints
app.get('/api/complaints', authenticateToken, complaintController.listComplaints);
app.get('/api/complaints/customer-history', authenticateToken, complaintController.getCustomerHistory);
app.get('/api/complaints/:id', authenticateToken, complaintController.getComplaintById);
app.post('/api/complaints', authenticateToken, upload.array('attachments', 5), complaintController.createComplaint);
app.put('/api/complaints/:id', authenticateToken, requireRole('admin', 'staff'), complaintController.updateComplaint);
app.post('/api/complaints/:id/payment', authenticateToken, complaintController.recordPayment);
app.post('/api/complaints/:id/settle-company', authenticateToken, requireRole('admin', 'staff'), complaintController.settleCompanyPayment);
app.post('/api/complaints/:id/assign', authenticateToken, requireRole('admin', 'staff'), complaintController.assignTechnician);
app.post('/api/complaints/:id/note', authenticateToken, complaintController.addTimelineNote);
app.post('/api/complaints/:id/resolve', authenticateToken, upload.single('closing_photo'), complaintController.resolveComplaint);
app.post('/api/complaints/:id/close', authenticateToken, requireRole('admin', 'staff'), complaintController.closeComplaint);
app.post('/api/complaints/:id/reopen', authenticateToken, complaintController.reopenComplaint);
app.delete('/api/complaints/:id', authenticateToken, requireRole('admin', 'staff'), complaintController.deleteComplaint);

// ================= TECHNICIAN ROUTES =================
app.get('/api/technicians', authenticateToken, technicianController.listTechnicians);
app.get('/api/technicians/:id', authenticateToken, technicianController.getTechnician);
app.put('/api/technicians/:id', authenticateToken, requireRole('admin', 'staff'), technicianController.updateTechnician);
app.put('/api/technicians/:id/availability', authenticateToken, requireRole('admin', 'staff', 'technician'), technicianController.updateAvailability);
app.delete('/api/technicians/:id', authenticateToken, requireRole('admin'), technicianController.deleteTechnician);
app.post('/api/technicians/:id/settle-all', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const techId = req.params.id;
    const actorName = req.user ? req.user.name : 'Company Admin';
    const actorRole = req.user ? req.user.role : 'admin';

    const pending = db.prepare(`
      SELECT id, ticket_id, payment_collected FROM complaints
      WHERE assigned_technician_id = ?
        AND payment_collected > 0
        AND (company_settlement_status IS NULL OR company_settlement_status != 'Settled with Company')
    `).all(techId);

    if (pending.length === 0) {
      return res.json({ success: true, message: 'No pending cash settlements for this technician', settledCount: 0, totalAmount: 0 });
    }

    let totalAmount = 0;
    const updateStmt = db.prepare(`
      UPDATE complaints SET
        company_settlement_status = 'Settled with Company',
        company_settled_at = CURRENT_TIMESTAMP,
        company_settled_by = ?
      WHERE id = ?
    `);

    const timelineStmt = db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, 'Company Cash Settled', ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    const tx = db.transaction(() => {
      for (const c of pending) {
        totalAmount += (c.payment_collected || 0);
        updateStmt.run(actorName, c.id);
        timelineStmt.run(c.id, `Batch cash settlement of ₹${c.payment_collected} received and deposited into company accounts.`, actorName, actorRole);
      }
    });

    tx();
    res.json({ success: true, settledCount: pending.length, totalAmount });
  } catch (err) {
    console.error('Batch settlement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= NOTIFICATION ROUTES =================
app.get('/api/notifications/templates', notificationController.getTemplates);
app.put('/api/notifications/templates/:id', authenticateToken, requireRole('admin'), notificationController.updateTemplate);
app.get('/api/notifications/logs', authenticateToken, notificationController.getLogs);
app.post('/api/notifications/logs/:id/resend', authenticateToken, requireRole('admin', 'staff'), notificationController.resendLog);
app.get('/api/notifications/simulated', notificationController.getSimulatedMessages);
app.delete('/api/notifications/simulated', notificationController.clearSimulated);
app.get('/api/notifications/events', notificationController.subscribeSimulatedEvents);

// ================= WHATSAPP MASTER RELAY (OFFICE PC ZERO-BAN QUEUE) =================
// Table for outgoing WhatsApp messages & Master PC heartbeat
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_outgoing_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    ticket_id TEXT,
    recipient_name TEXT,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS whatsapp_relay_heartbeat (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    relay_name TEXT DEFAULT 'Office Master PC',
    ip TEXT
  );
  INSERT OR IGNORE INTO whatsapp_relay_heartbeat (id, relay_name) VALUES (1, 'Office Master PC');
`);

// 1. Add message to WhatsApp queue (From any PC/Staff)
app.post('/api/whatsapp/queue', (req, res) => {
  try {
    const { phone, message, ticket_id, recipient_name } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message are required' });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
    const stmt = db.prepare(`
      INSERT INTO whatsapp_outgoing_queue (phone, message, ticket_id, recipient_name, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const info = stmt.run(formattedPhone, message, ticket_id || null, recipient_name || null);
    res.json({ success: true, queueId: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Master PC Relay Extension polls for pending messages
app.get('/api/whatsapp/relay/pending', (req, res) => {
  try {
    // Update heartbeat of Master PC
    db.prepare(`
      UPDATE whatsapp_relay_heartbeat 
      SET last_heartbeat = CURRENT_TIMESTAMP, ip = ? 
      WHERE id = 1
    `).run(req.ip || 'local');

    // Fetch up to 3 pending messages (FIFO order)
    const pending = db.prepare(`
      SELECT * FROM whatsapp_outgoing_queue 
      WHERE status = 'pending' 
      ORDER BY id ASC LIMIT 3
    `).all();

    res.json({
      success: true,
      pending: pending || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Master PC Relay updates status after sending
app.post('/api/whatsapp/relay/status', (req, res) => {
  try {
    const { id, status, error } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'id and status are required' });
    }
    const stmt = db.prepare(`
      UPDATE whatsapp_outgoing_queue 
      SET status = ?, 
          sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
          error_message = ?
      WHERE id = ?
    `);
    stmt.run(status, status, error || null, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CMS checks Master PC Relay Status (Active / Inactive)
app.get('/api/whatsapp/relay/status', (req, res) => {
  try {
    const hb = db.prepare('SELECT * FROM whatsapp_relay_heartbeat WHERE id = 1').get();
    const stats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sentCount,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failedCount,
        MAX(sent_at) as lastSentAt
      FROM whatsapp_outgoing_queue
    `).get();

    let isRelayActive = false;
    if (hb && hb.last_heartbeat) {
      const lastHbTime = new Date(hb.last_heartbeat + 'Z').getTime();
      const now = Date.now();
      isRelayActive = (now - lastHbTime) < 35000;
    }

    res.json({
      isRelayActive,
      lastHeartbeat: hb?.last_heartbeat || null,
      relayName: hb?.relay_name || 'Office Master PC',
      pendingCount: stats?.pendingCount || 0,
      sentCount: stats?.sentCount || 0,
      failedCount: stats?.failedCount || 0,
      lastSentAt: stats?.lastSentAt || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= OFFICIAL WHATSAPP CLOUD API WEBHOOKS & BIDIRECTIONAL CHAT =================
// 1. Meta Webhook verification handshake
app.get('/api/whatsapp/webhook', verifyWebhook);

// 2. Meta Webhook incoming messages, media and delivery status
app.post('/api/whatsapp/webhook', handleIncomingWebhook);

// 3. Get all WhatsApp conversation messages for a complaint
app.get('/api/complaints/:id/whatsapp-messages', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT id, ticket_id, customer_phone FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const cleanPhone = (complaint.customer_phone || '').replace(/[^0-9]/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    const messages = db.prepare(`
      SELECT * FROM whatsapp_messages
      WHERE complaint_id = ? OR phone LIKE ?
      ORDER BY created_at ASC
    `).all(id, `%${last10}%`);

    res.json({ success: true, messages: messages || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Staff direct reply to customer via WhatsApp from complaint drawer
app.post('/api/complaints/:id/whatsapp-reply', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const cleanPhone = (complaint.customer_phone || '').replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);

    const { sendWhatsAppMessage } = require('./services/whatsappProvider');
    const sendRes = await sendWhatsAppMessage({
      to: formattedPhone,
      message: message.trim(),
      ticket_id: complaint.ticket_id,
      recipient_name: complaint.customer_name
    });

    // Record outbound staff reply into whatsapp_messages
    const insertStmt = db.prepare(`
      INSERT INTO whatsapp_messages (
        complaint_id, phone, sender_type, sender_name,
        message_body, wam_id, status
      ) VALUES (?, ?, 'company', ?, ?, ?, 'sent')
    `);
    const insertRes = insertStmt.run(
      complaint.id,
      formattedPhone,
      req.user?.name || 'Staff Specialist',
      message.trim(),
      sendRes.messageId || null
    );

    // Also record timeline entry
    db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES (?, 'Staff WhatsApp Reply', ?, ?, ?, 1)
    `).run(
      complaint.id,
      message.trim(),
      req.user?.name || 'Staff Specialist',
      req.user?.role || 'staff'
    );

    res.json({
      success: true,
      messageId: insertRes.lastInsertRowid,
      metaMessageId: sendRes.messageId
    });
  } catch (err) {
    console.error('Error sending WhatsApp reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Universal WhatsApp Web Inbox: Get all conversation threads (linked or unlinked)
app.get('/api/whatsapp/conversations', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    try {
      db.prepare("DELETE FROM whatsapp_messages WHERE phone LIKE '%6352454247%' OR sender_name LIKE '%akshar%' OR sender_name LIKE '%અક્ષર%' OR message_body LIKE '%અક્ષર%'").run();
    } catch (e) {}

    // Group by cleaned phone number
    const rows = db.prepare(`
      WITH RankedMessages AS (
        SELECT 
          m.*,
          ROW_NUMBER() OVER(PARTITION BY m.phone ORDER BY m.created_at DESC) as rn
        FROM whatsapp_messages m
      )
      SELECT 
        rm.phone,
        rm.complaint_id,
        rm.sender_name,
        rm.sender_type as last_sender_type,
        rm.message_body as last_message,
        rm.media_type as last_media_type,
        rm.created_at as last_activity,
        c.ticket_id,
        c.customer_name as complaint_customer_name,
        c.product_type,
        c.status as complaint_status
      FROM RankedMessages rm
      LEFT JOIN complaints c ON c.id = rm.complaint_id
      WHERE rm.rn = 1
      ORDER BY rm.created_at DESC
    `).all();

    // In case a contact name is registered in complaints or installed_customers, supplement it
    const conversations = rows.map(r => {
      const cleanPhone = (r.phone || '').replace(/[^0-9]/g, '');
      const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
      
      let customerName = r.complaint_customer_name || r.sender_name;
      let complaintId = r.complaint_id;
      let ticketId = r.ticket_id;

      if (!complaintId) {
        // Check if there's any complaint matching this phone
        const matchedComp = db.prepare(`
          SELECT id, ticket_id, customer_name FROM complaints 
          WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
          ORDER BY id DESC LIMIT 1
        `).get(`%${last10}%`);
        if (matchedComp) {
          complaintId = matchedComp.id;
          ticketId = matchedComp.ticket_id;
          customerName = matchedComp.customer_name;
        }
      }

      if (!customerName || customerName === 'Customer') {
        const inst = db.prepare('SELECT customer_name FROM installed_customers WHERE consumer_mobile LIKE ? LIMIT 1').get(`%${last10}%`);
        if (inst) customerName = inst.customer_name;
      }

      return {
        ...r,
        complaint_id: complaintId,
        ticket_id: ticketId,
        sender_name: customerName || `+${r.phone}`
      };
    });

    res.json({ success: true, conversations });
  } catch (err) {
    console.error('Error fetching WhatsApp conversations:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Universal WhatsApp Web Inbox: Get full chat history for a specific phone number
app.get('/api/whatsapp/chats/:phone', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    const messages = db.prepare(`
      SELECT * FROM whatsapp_messages
      WHERE phone LIKE ?
      ORDER BY created_at ASC
    `).all(`%${last10}%`);

    // Find linked complaint if any
    const complaint = db.prepare(`
      SELECT id, ticket_id, customer_name, customer_phone, product_type, status 
      FROM complaints 
      WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`);

    let contactName = complaint?.customer_name;
    if (!contactName) {
      const inst = db.prepare('SELECT customer_name FROM installed_customers WHERE consumer_mobile LIKE ? LIMIT 1').get(`%${last10}%`);
      if (inst) contactName = inst.customer_name;
    }
    if (!contactName && messages.length > 0) {
      const custMsg = messages.find(m => m.sender_type === 'customer' && m.sender_name);
      if (custMsg) contactName = custMsg.sender_name;
    }

    res.json({
      success: true,
      messages: messages || [],
      contact: {
        phone: cleanPhone,
        sender_name: contactName || `+${cleanPhone}`,
        complaint: complaint || null
      }
    });
  } catch (err) {
    console.error('Error fetching chat history:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Universal WhatsApp Web Inbox: Direct reply to any phone number (with optional attachment)
app.post('/api/whatsapp/direct-reply', authenticateToken, requireRole('admin', 'staff'), upload.single('attachment'), async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || (!message && !req.file)) {
      return res.status(400).json({ error: 'phone and message or attachment are required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    // Check if complaint exists for this phone
    const complaint = db.prepare(`
      SELECT * FROM complaints 
      WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`);

    let mediaUrl = null;
    let mediaType = null;
    let mediaFileName = null;

    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaFileName = req.file.originalname;
      mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'document';
    }

    // Public URL for Meta Cloud API if APP_URL or request origin is available
    let absoluteMediaUrl = mediaUrl;
    if (mediaUrl) {
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      absoluteMediaUrl = `${baseUrl}${mediaUrl}`;
    }

    const { sendWhatsAppMessage } = require('./services/whatsappProvider');
    const sendRes = await sendWhatsAppMessage({
      to: formattedPhone,
      message: (message || '').trim(),
      ticket_id: complaint?.ticket_id || null,
      recipient_name: complaint?.customer_name || 'Valued Customer',
      mediaUrl: absoluteMediaUrl,
      mediaType: mediaType,
      mediaFileName: mediaFileName
    });

    // Record outbound message in whatsapp_messages
    const insertStmt = db.prepare(`
      INSERT INTO whatsapp_messages (
        complaint_id, phone, sender_type, sender_name,
        message_body, media_url, media_type, media_caption, wam_id, status
      ) VALUES (?, ?, 'company', ?, ?, ?, ?, ?, ?, 'sent')
    `);

    const insertRes = insertStmt.run(
      complaint ? complaint.id : null,
      formattedPhone,
      req.user?.name || 'Eco Green Support',
      (message || '').trim(),
      mediaUrl,
      mediaType,
      mediaFileName,
      sendRes.messageId || null
    );

    // If complaint exists, also log in complaint_timelines
    if (complaint) {
      try {
        const actionNote = mediaUrl ? `Staff sent ${mediaType}: ${mediaFileName} ${message ? '(' + message + ')' : ''}` : message.trim();
        db.prepare(`
          INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
          VALUES (?, 'Staff WhatsApp Reply', ?, ?, ?, 1)
        `).run(
          complaint.id,
          actionNote,
          req.user?.name || 'Staff Specialist',
          req.user?.role || 'staff'
        );
      } catch (tErr) {
        console.warn('Timeline log notice:', tErr.message);
      }
    }

    res.json({
      success: true,
      messageId: insertRes.lastInsertRowid,
      metaMessageId: sendRes.messageId,
      mediaUrl: mediaUrl
    });
  } catch (err) {
    console.error('Error sending direct WhatsApp reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Universal WhatsApp Web Inbox: Sync & restore backup messages (prevents data loss across redeploys)
app.post('/api/whatsapp/sync-backup', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({ success: true, synced: 0 });
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO whatsapp_messages (
        complaint_id, phone, sender_type, sender_name,
        message_body, media_url, media_type, media_caption, wam_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const syncTx = db.transaction(() => {
      for (const m of messages) {
        if (!m.phone || !m.message_body) continue;
        const cleanPhone = (m.phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone.includes('6352454247') ||
            (m.sender_name && /akshar|અક્ષર/i.test(m.sender_name)) ||
            (m.message_body && /akshar|અક્ષર/i.test(m.message_body))) {
          continue;
        }
        const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
        
        insertStmt.run(
          m.complaint_id || null,
          formattedPhone,
          m.sender_type || 'customer',
          m.sender_name || 'Customer',
          m.message_body,
          m.media_url || null,
          m.media_type || null,
          m.media_caption || null,
          m.wam_id || `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          m.status || 'delivered',
          m.created_at || new Date().toISOString()
        );
        count++;
      }
    });

    syncTx();
    console.log(`[WhatsAppBackupSync] Restored/Synced ${count} messages to database.`);
    res.json({ success: true, synced: count });
  } catch (err) {
    console.error('WhatsApp sync backup error:', err);
    res.status(500).json({ error: 'Failed to sync whatsapp backup: ' + err.message });
  }
});

// 9. Verify phone number for WhatsApp compatibility
app.get('/api/whatsapp/verify-number/:phone', (req, res) => {
  try {
    const rawPhone = req.params.phone || '';
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    // Check Indian 10-digit mobile number format (starts with 6, 7, 8, or 9)
    const isIndianMobile = /^[6-9]\d{9}$/.test(last10);
    if (!isIndianMobile) {
      return res.json({
        valid: false,
        phone: rawPhone,
        status: 'invalid_format',
        message: 'Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9.'
      });
    }

    // Check if customer exists in installed_customers, complaints, or whatsapp_messages
    const existingCust = db.prepare('SELECT customer_name, city_village FROM installed_customers WHERE consumer_mobile LIKE ? LIMIT 1').get(`%${last10}%`);
    const existingComp = db.prepare('SELECT customer_name, ticket_id FROM complaints WHERE customer_phone LIKE ? LIMIT 1').get(`%${last10}%`);
    const existingChat = db.prepare('SELECT sender_name FROM whatsapp_messages WHERE phone LIKE ? LIMIT 1').get(`%${last10}%`);

    const customerName = existingCust?.customer_name || existingComp?.customer_name || existingChat?.sender_name || null;

    res.json({
      valid: true,
      phone: last10,
      formattedPhone: `91${last10}`,
      customerName: customerName,
      city: existingCust?.city_village || null,
      ticketId: existingComp?.ticket_id || null,
      hasChatHistory: Boolean(existingChat),
      status: 'verified',
      message: 'WhatsApp compatible mobile number verified ✓'
    });
  } catch (err) {
    console.error('Verify phone error:', err);
    res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
});

// 10. Clear chat history for a specific phone number
app.post('/api/whatsapp/clear-chat/:phone', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const rawPhone = req.params.phone || '';
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    const info = db.prepare('DELETE FROM whatsapp_messages WHERE phone LIKE ?').run(`%${last10}%`);
    res.json({
      success: true,
      message: `Chat history cleared (${info.changes} messages removed)`,
      deletedCount: info.changes
    });
  } catch (err) {
    console.error('Clear chat error:', err);
    res.status(500).json({ error: 'Failed to clear chat: ' + err.message });
  }
});


// ================= REPORT & ANALYTICS ROUTES =================
app.get('/api/reports/metrics', authenticateToken, requireRole('admin', 'staff'), reportController.getDashboardMetrics);
app.get('/api/reports/export-csv', authenticateToken, requireRole('admin', 'staff'), reportController.exportComplaintsCsv);

// ================= CUSTOMER DIRECTORY (EXCEL SYNC & SEARCH) =================
app.get('/api/customers/search', customerDirectoryController.searchCustomers);
app.get('/api/customers/stats', customerDirectoryController.getCustomerStats);
app.post('/api/customers/sync', authenticateToken, upload.single('excel_file'), customerDirectoryController.syncFromExcel);

// Serve Vite frontend build in production (Unified Single-Port Render Deployment)
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

// Auto-seed database if empty
seedDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`☀️  Eco Green Solar CMS Backend running on port ${PORT}`);
    console.log(`📍  API URL: http://localhost:${PORT}/api`);
    console.log(`⚡  Live Notification SSE: http://localhost:${PORT}/api/notifications/events`);
    console.log(`========================================================\n`);
  });
}).catch(err => {
  console.error('Fatal initialization error:', err);
});

module.exports = app;
