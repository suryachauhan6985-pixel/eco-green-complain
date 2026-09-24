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
const locationController = require('./controllers/locationController');
const realtimeService = require('./services/realtimeService');
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

// Fallback for /uploads/:filename to read from Turso Cloud Database when disk was wiped on Render restart
app.get('/uploads/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const att = db.prepare(`
      SELECT * FROM complaint_attachments 
      WHERE file_url LIKE ? OR file_name = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${filename}%`, filename);

    if (att && att.file_data && att.file_data.startsWith('data:')) {
      const matches = att.file_data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${att.file_name}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    }

    // Graceful SVG placeholder so it NEVER renders a broken image in browser
    res.setHeader('Content-Type', 'image/svg+xml');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="none">
      <rect width="600" height="400" rx="16" fill="#F8FAFC"/>
      <rect x="20" y="20" width="560" height="360" rx="12" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6 6"/>
      <circle cx="300" cy="160" r="48" fill="#ECFDF5"/>
      <path d="M288 140H312M288 160H312M288 180H304" stroke="#059669" stroke-width="3" stroke-linecap="round"/>
      <path d="M276 124H312L328 140V196H276V124Z" stroke="#059669" stroke-width="3" stroke-linejoin="round"/>
      <text x="300" y="240" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#1E293B" text-anchor="middle">${att?.file_name || filename}</text>
      <text x="300" y="265" font-family="system-ui, sans-serif" font-size="12" fill="#64748B" text-anchor="middle">Eco Green Solar Attached Document Proof</text>
    </svg>`;
    return res.send(svg);
  } catch (e) {
    res.status(404).send('File not found');
  }
});

// Dedicated Attachment Streaming Endpoint (Direct from Turso Cloud Database)
app.get('/api/attachments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const att = db.prepare('SELECT * FROM complaint_attachments WHERE id = ?').get(id);
    if (!att) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (att.file_data && att.file_data.startsWith('data:')) {
      const matches = att.file_data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${att.file_name}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    }

    const filename = path.basename(att.file_url || '');
    const diskPath = path.join(uploadsPath, filename);
    if (fs.existsSync(diskPath)) {
      return res.sendFile(diskPath);
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="none">
      <rect width="600" height="400" rx="16" fill="#F8FAFC"/>
      <rect x="20" y="20" width="560" height="360" rx="12" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6 6"/>
      <circle cx="300" cy="160" r="48" fill="#ECFDF5"/>
      <path d="M288 140H312M288 160H312M288 180H304" stroke="#059669" stroke-width="3" stroke-linecap="round"/>
      <path d="M276 124H312L328 140V196H276V124Z" stroke="#059669" stroke-width="3" stroke-linejoin="round"/>
      <text x="300" y="240" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#1E293B" text-anchor="middle">${att.file_name || 'Attached Document'}</text>
      <text x="300" y="265" font-family="system-ui, sans-serif" font-size="12" fill="#64748B" text-anchor="middle">Eco Green Solar Attached Document Proof</text>
    </svg>`;
    return res.send(svg);
  } catch (err) {
    console.error('Attachment streaming error:', err);
    res.status(500).json({ error: 'Failed to retrieve attachment' });
  }
});

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
app.post('/api/auth/admin-reset-password', authenticateToken, requireRole('admin', 'staff'), authController.adminResetPassword);

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

// ================= LOCATION / PINCODE ROUTES =================
app.get('/api/location/pincode/:pincode', locationController.getPincodeDetails);
app.get('/api/location/search', locationController.searchByCityOrPostOffice);
app.get('/api/location/postoffice/:query', locationController.searchByCityOrPostOffice);

// ================= COMPLAINT ROUTES =================
// Real-time Event Stream (Server-Sent Events) for instant Staff & Admin live sync
app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  realtimeService.addClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAlive);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

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
app.post('/api/complaints/:id/attachments', authenticateToken, upload.array('attachments', 5), complaintController.addAttachments);
app.put('/api/complaints/:id', authenticateToken, requireRole('admin', 'staff'), complaintController.updateComplaint);
app.post('/api/complaints/:id/payment', authenticateToken, complaintController.recordPayment);
app.post('/api/complaints/:id/settle-company', authenticateToken, requireRole('admin', 'staff'), complaintController.settleCompanyPayment);
app.post('/api/complaints/:id/assign', authenticateToken, requireRole('admin', 'staff'), complaintController.assignTechnician);
app.post('/api/complaints/:id/remind-tech', authenticateToken, requireRole('admin', 'staff'), complaintController.remindTechnician);
app.post('/api/complaints/:id/resend-technician', authenticateToken, requireRole('admin', 'staff'), complaintController.resendTechnicianWorkOrder);
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

// 2. Master PC Relay is permanently decommissioned in favor of official Meta Cloud API (+91 78784 44414)
app.get('/api/whatsapp/relay/pending', (req, res) => {
  try {
    db.prepare("DELETE FROM whatsapp_outgoing_queue").run();
  } catch (e) {}
  res.json({
    success: true,
    pending: []
  });
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

function formatIsoUtc(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (s.includes('T') && s.endsWith('Z')) return s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return s.replace(' ', 'T') + 'Z';
  }
  return s;
}

const { normalizePhone, getLast10Digits, formatDisplayPhone } = require('./utils/phoneNormalizer');

// 5. Universal WhatsApp Web Inbox: Get all conversation threads (linked or unlinked)
app.get('/api/whatsapp/conversations', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    // Group by normalized 10-digit phone number to avoid thread splitting
    const rows = db.prepare(`
      WITH NormalizedMessages AS (
        SELECT 
          m.*,
          SUBSTR(REPLACE(REPLACE(m.phone, ' ', ''), '+', ''), -10) as last10_phone,
          ROW_NUMBER() OVER(
            PARTITION BY SUBSTR(REPLACE(REPLACE(m.phone, ' ', ''), '+', ''), -10) 
            ORDER BY m.created_at DESC
          ) as rn
        FROM whatsapp_messages m
        WHERE LENGTH(REPLACE(REPLACE(m.phone, ' ', ''), '+', '')) >= 5
      )
      SELECT 
        nm.phone,
        nm.last10_phone,
        nm.complaint_id,
        nm.sender_name,
        nm.sender_type as last_sender_type,
        nm.message_body as last_message,
        nm.media_type as last_media_type,
        nm.status as last_status,
        nm.created_at as last_activity,
        c.ticket_id,
        c.customer_name as complaint_customer_name,
        c.customer_phone as complaint_customer_phone,
        c.product_type,
        c.status as complaint_status
      FROM NormalizedMessages nm
      LEFT JOIN complaints c ON c.id = nm.complaint_id
      WHERE nm.rn = 1
      ORDER BY nm.created_at DESC
    `).all();

    // 3-Tier Contact & Ticket Resolution
    const conversations = rows.map(r => {
      const last10 = r.last10_phone || getLast10Digits(r.phone);
      const canonicalPhone = normalizePhone(r.phone);
      
      let customerName = null;
      let complaintId = null;
      let ticketId = null;
      let isTechnician = false;

      // 1. Check if this phone belongs to a Technician
      const tech = db.prepare("SELECT id, name, phone FROM technicians WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
      if (tech?.name) {
        customerName = `${tech.name} (Technician)`;
        isTechnician = true;
      }

      // 1b. Check if this phone belongs to internal staff / admin user
      if (!customerName) {
        const appUser = db.prepare("SELECT id, name, role FROM users WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
        if (appUser?.name) {
          customerName = `${appUser.name} (${appUser.role === 'admin' ? 'Admin' : 'Staff'})`;
        }
      }

      // 2. Complaint record match (Priority 1 for customers)
      if (!customerName) {
        const cleanCustPhone = (r.complaint_customer_phone || '').replace(/[^0-9]/g, '');
        if (cleanCustPhone && cleanCustPhone.slice(-10) === last10 && r.complaint_customer_name && r.complaint_customer_name !== 'Customer') {
          customerName = r.complaint_customer_name;
          complaintId = r.complaint_id;
          ticketId = r.ticket_id;
        } else {
          // Look up if any complaint matches this phone as the customer
          const matchedComp = db.prepare(`
            SELECT id, ticket_id, customer_name FROM complaints 
            WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
            ORDER BY id DESC LIMIT 1
          `).get(`%${last10}%`);
          if (matchedComp) {
            complaintId = matchedComp.id;
            ticketId = matchedComp.ticket_id;
            if (matchedComp.customer_name && matchedComp.customer_name !== 'Customer') {
              customerName = matchedComp.customer_name;
            }
          }
        }
      }

      // 3. Custom / Verified Name from whatsapp_number_registry (manual rename takes priority over excel)
      if (!customerName || customerName === 'Customer') {
        try {
          const reg = db.prepare("SELECT customer_name FROM whatsapp_number_registry WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
          if (reg?.customer_name && reg.customer_name !== 'Customer' && !/^[0-9+ ]+$/.test(reg.customer_name)) {
            customerName = reg.customer_name;
          }
        } catch (e) {}
      }

      // 4. Installed customers (Excel Database fallback)
      if (!customerName || customerName === 'Customer') {
        const inst = db.prepare("SELECT customer_name FROM installed_customers WHERE REPLACE(REPLACE(consumer_mobile, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
        if (inst?.customer_name) customerName = inst.customer_name;
      }

      // 5. Incoming customer message sender_name
      if (!customerName || customerName === 'Customer') {
        const custMsg = db.prepare(`
          SELECT sender_name FROM whatsapp_messages 
          WHERE phone LIKE ? AND sender_type = 'customer' AND sender_name IS NOT NULL AND sender_name != 'Customer' AND sender_name NOT LIKE '%+%'
          ORDER BY id DESC LIMIT 1
        `).get(`%${last10}%`);
        if (custMsg?.sender_name && !/^[0-9+ ]+$/.test(custMsg.sender_name)) {
          customerName = custMsg.sender_name;
        }
      }

      // 6. Fallback if r.sender_name is not generic staff
      if (!customerName && r.sender_name && r.sender_name !== 'Customer' && r.sender_name !== 'Eco Green Support' && !/^[0-9+ ]+$/.test(r.sender_name)) {
        customerName = r.sender_name;
      }

      // Priority 3: Formatted phone fallback
      const displayPhone = formatDisplayPhone(canonicalPhone);

      return {
        ...r,
        phone: canonicalPhone,
        complaint_id: complaintId,
        ticket_id: ticketId,
        is_technician: isTechnician,
        sender_name: customerName || displayPhone,
        last_activity: formatIsoUtc(r.last_activity),
        created_at: formatIsoUtc(r.created_at)
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
    const canonicalPhone = normalizePhone(rawPhone);
    const last10 = getLast10Digits(rawPhone);

    const rawMessages = db.prepare(`
      SELECT * FROM whatsapp_messages
      WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ?
      ORDER BY created_at ASC
    `).all(`%${last10}%`);

    const messages = (rawMessages || []).map(m => ({
      ...m,
      created_at: formatIsoUtc(m.created_at)
    }));

    // Check if phone belongs to a Technician
    const tech = db.prepare("SELECT id, name, phone, area_zone FROM technicians WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
    let contactName = null;
    let complaint = null;

    if (tech?.name) {
      contactName = `${tech.name} (Technician)`;
    } else {
      // Find linked complaint (Priority 1)
      complaint = db.prepare(`
        SELECT id, ticket_id, customer_name, customer_phone, product_type, status 
        FROM complaints 
        WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
        ORDER BY id DESC LIMIT 1
      `).get(`%${last10}%`);

      if (complaint?.customer_name && complaint.customer_name !== 'Customer') {
        contactName = complaint.customer_name;
      }
      if (!contactName) {
        const inst = db.prepare("SELECT customer_name FROM installed_customers WHERE REPLACE(REPLACE(consumer_mobile, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
        if (inst?.customer_name) contactName = inst.customer_name;
      }
      // Meta Profile Name (Priority 2)
      if (!contactName) {
        try {
          const reg = db.prepare("SELECT customer_name FROM whatsapp_number_registry WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
          if (reg?.customer_name && reg.customer_name !== 'Customer' && !/^[0-9+ ]+$/.test(reg.customer_name)) {
            contactName = reg.customer_name;
          }
        } catch (e) {}
      }
      if (!contactName && messages.length > 0) {
        const custMsg = messages.find(m => m.sender_type === 'customer' && m.sender_name && m.sender_name !== 'Customer' && !/^[0-9+ ]+$/.test(m.sender_name));
        if (custMsg) contactName = custMsg.sender_name;
      }
    }

    const displayPhone = formatDisplayPhone(canonicalPhone);

    res.json({
      success: true,
      messages: messages || [],
      contact: {
        phone: canonicalPhone,
        sender_name: contactName || displayPhone,
        is_technician: !!tech,
        ticket_id: complaint?.ticket_id || null,
        complaint_id: complaint?.id || null,
        complaint: complaint || null
      }
    });
  } catch (err) {
    console.error('Error fetching chat history:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6b. Admin Raw Webhook Audit Trail for a specific phone number
app.get('/api/whatsapp/raw-events/:phone', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const last10 = getLast10Digits(rawPhone);

    const events = db.prepare(`
      SELECT * FROM whatsapp_raw_events
      WHERE sender_phone LIKE ? OR recipient_phone LIKE ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(`%${last10}%`, `%${last10}%`);

    res.json({ success: true, events });
  } catch (err) {
    console.error('Error fetching raw events:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6b. Universal WhatsApp Web Inbox: Update contact name (persists in registry & message history)
app.post('/api/whatsapp/update-contact-name', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone || !name || !name.trim()) {
      return res.status(400).json({ error: 'Phone and contact name are required' });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
    const cleanName = name.trim();

    // 1. Save into whatsapp_number_registry
    db.prepare(`
      INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, customer_name, source, notes, updated_at)
      VALUES (?, 1, 'verified', ?, 'manual_rename', 'Renamed by staff', CURRENT_TIMESTAMP)
    `).run(last10, cleanName);

    // 2. Update customer messages from this phone
    db.prepare(`
      UPDATE whatsapp_messages 
      SET sender_name = ? 
      WHERE phone LIKE ? AND sender_type = 'customer'
    `).run(cleanName, `%${last10}%`);

    res.json({
      success: true,
      phone: last10,
      name: cleanName,
      message: 'Contact name updated successfully'
    });
  } catch (err) {
    console.error('Error updating WhatsApp contact name:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6c. Universal WhatsApp Web Inbox: Edit a message
app.put('/api/whatsapp/messages/:id', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { id } = req.params;
    const { message_body } = req.body;
    if (!message_body || !message_body.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    db.prepare(`
      UPDATE whatsapp_messages 
      SET message_body = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(message_body.trim(), id);

    res.json({
      success: true,
      id: Number(id),
      message_body: message_body.trim()
    });
  } catch (err) {
    console.error('Error editing WhatsApp message:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6d. Universal WhatsApp Web Inbox: Delete a message
app.delete('/api/whatsapp/messages/:id', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    db.prepare('DELETE FROM whatsapp_messages WHERE id = ?').run(id);

    res.json({
      success: true,
      id: Number(id),
      message: 'Message deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting WhatsApp message:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6e. Universal WhatsApp Web Inbox: Sync & Restore Messages from client backup
app.post('/api/whatsapp/sync-backup', authenticateToken, (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({ success: true, restored: 0 });
    }

    const insertStmt = db.prepare(`
      INSERT INTO whatsapp_messages (
        complaint_id, phone, sender_type, sender_name, message_body, media_url, media_type, media_caption, status, wam_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkDuplicate = db.prepare(`
      SELECT id FROM whatsapp_messages 
      WHERE (wam_id = ? AND ? IS NOT NULL)
         OR (phone = ? AND message_body = ? AND created_at = ?)
      LIMIT 1
    `);

    let restored = 0;
    const tx = db.transaction(() => {
      for (const m of messages) {
        if (!m || !m.phone || !m.message_body) continue;
        const cleanPhone = (m.phone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone || cleanPhone.length < 5) continue;

        if (checkDuplicate.get(m.wam_id || null, m.wam_id || null, m.phone, m.message_body, m.created_at || '')) {
          continue;
        }

        const isCompany = m.sender_type === 'company' || m.sender_type === 'staff';
        const senderName = m.sender_name && m.sender_name !== 'Customer'
          ? m.sender_name
          : (isCompany ? 'Eco Green Support' : 'Customer');

        insertStmt.run(
          m.complaint_id || null,
          m.phone,
          isCompany ? 'company' : 'customer',
          senderName,
          m.message_body,
          m.media_url || null,
          m.media_type || null,
          m.media_caption || null,
          m.status || 'delivered',
          m.wam_id || null,
          m.created_at || new Date().toISOString()
        );
        restored++;
      }
    });

    tx();
    console.log(`[PermanentSync] Restored ${restored} messages to server database`);
    res.json({ success: true, restored });
  } catch (err) {
    console.error('Error in sync-backup:', err);
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

// 8. Smart Retry failed WhatsApp message (re-dispatches using approved Meta template if template was used)
app.post('/api/whatsapp/retry-message/:id', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const msg = db.prepare('SELECT * FROM whatsapp_messages WHERE id = ?').get(id);
    if (!msg) {
      return res.status(404).json({ error: 'Message record not found' });
    }

    const { sendWhatsAppMessage } = require('./services/whatsappProvider');
    let sendRes;

    if (msg.template_name) {
      let complaint = msg.complaint_id ? db.prepare('SELECT * FROM complaints WHERE id = ?').get(msg.complaint_id) : null;
      const cleanPhone = (msg.phone || '').replace(/\D/g, '');
      const last10 = cleanPhone.slice(-10);

      if (!complaint && cleanPhone) {
        complaint = db.prepare(`SELECT * FROM complaints WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${last10}%`);
      }

      let tech = null;
      if (complaint?.assigned_technician_id) {
        tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(complaint.assigned_technician_id);
      } else {
        tech = db.prepare(`SELECT * FROM technicians WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1`).get(`%${last10}%`);
      }

      const variables = {
        customer_name: complaint?.customer_name || 'Valued Customer',
        complaint_id: complaint?.ticket_id || 'Ticket',
        ticket_id: complaint?.ticket_id || 'Ticket',
        customer_phone: complaint?.customer_phone || '-',
        customer_address: complaint?.customer_address || '-',
        product_type: complaint?.product_type || 'Solar Rooftop Systems',
        issue_category: complaint?.issue_category || 'Service Request',
        notes: complaint?.issue_description || 'Inspection required',
        priority: complaint?.priority || 'Normal',
        expected_visit_date: complaint?.expected_visit_date || 'Immediate / Today',
        technician_name: tech?.name || 'Technician',
        technician_phone: tech?.phone || msg.phone,
        feedback_url: `${(process.env.APP_URL && !process.env.APP_URL.includes('localhost')) ? process.env.APP_URL : 'https://complain.ecogreensolar.co.in'}/track/${complaint?.ticket_id || ''}`
      };

      sendRes = await sendWhatsAppMessage({
        to: msg.phone,
        message: msg.message_body,
        templateName: msg.template_name,
        variables
      });
    } else {
      sendRes = await sendWhatsAppMessage({
        to: msg.phone,
        message: msg.message_body
      });
    }

    // Update message status in DB
    db.prepare(`
      UPDATE whatsapp_messages 
      SET status = 'sent', failure_reason = NULL, wam_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sendRes?.messageId || null, id);

    res.json({ 
      success: true, 
      message: 'Message retried and delivered to Meta Cloud API', 
      wam_id: sendRes?.messageId 
    });
  } catch (err) {
    console.error('Error retrying message:', err);
    res.status(500).json({ error: 'Retry failed: ' + err.message });
  }
});


// 9. Verify phone number for WhatsApp compatibility
app.get('/api/whatsapp/verify-number/:phone', (req, res) => {
  try {
    const rawPhone = req.params.phone || '';
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    // Check for dummy repeating digits (e.g., 0000000000, 1111111111, 9999999999)
    if (/^(\d)\1{9}$/.test(last10)) {
      return res.json({
        valid: false,
        isVerified: false,
        isWhatsApp: false,
        phone: rawPhone,
        status: 'dummy_number',
        message: 'Invalid number: Repeated digits detected. Please enter a genuine mobile number.'
      });
    }

    // Check for sequential dummy sequences (e.g., 1234567890, 9876543210)
    if (last10 === '1234567890' || last10 === '9876543210' || last10 === '0123456789') {
      return res.json({
        valid: false,
        isVerified: false,
        isWhatsApp: false,
        phone: rawPhone,
        status: 'dummy_number',
        message: 'Invalid number: Sequential test number detected. Please enter a genuine mobile number.'
      });
    }

    // Check Indian 10-digit mobile number format (starts with 6, 7, 8, or 9)
    const isIndianMobile = /^[6-9]\d{9}$/.test(last10);
    if (!isIndianMobile) {
      return res.json({
        valid: false,
        isVerified: false,
        isWhatsApp: false,
        phone: rawPhone,
        status: 'invalid_format',
        message: 'Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9.'
      });
    }

    const formatted = `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;

    // 1. Check permanent WhatsApp registry (records verified vs invite-required numbers)
    let reg = null;
    try {
      reg = db.prepare('SELECT * FROM whatsapp_number_registry WHERE phone = ? OR phone LIKE ?').get(last10, `%${last10}%`);
    } catch (e) {}

    if (reg && reg.is_whatsapp_active === 0) {
      return res.json({
        valid: true,
        isVerified: false,
        isWhatsApp: false,
        phone: last10,
        formattedPhone: formatted,
        formatted: formatted,
        status: 'invite_required',
        message: 'Not on WhatsApp (Invite to WhatsApp required)',
        customerName: reg.customer_name || null,
        notes: reg.notes || 'Customer does not have an active WhatsApp account'
      });
    }

    // 2. Check if customer exists in installed_customers, complaints, or whatsapp_messages
    const existingCust = db.prepare(`
      SELECT id, customer_name, city_village, consumer_no, order_no, invoice_no, invoice_date, inverter_serial, panel_make, inverter_make, is_in_warranty 
      FROM installed_customers 
      WHERE consumer_mobile LIKE ? 
      LIMIT 1
    `).get(`%${last10}%`);

    const existingComp = db.prepare(`
      SELECT customer_name, ticket_id, city, product_type, invoice_no, invoice_date 
      FROM complaints 
      WHERE customer_phone LIKE ? 
      LIMIT 1
    `).get(`%${last10}%`);

    const existingChat = db.prepare(`
      SELECT sender_name 
      FROM whatsapp_messages 
      WHERE phone LIKE ? 
      LIMIT 1
    `).get(`%${last10}%`);

    const customerName = existingCust?.customer_name || existingComp?.customer_name || existingChat?.sender_name || (reg?.customer_name || null);
    const city = existingCust?.city_village || existingComp?.city || null;
    const isExisting = Boolean(existingCust || existingComp);
    const invoiceNo = existingCust?.invoice_no || existingComp?.invoice_no || null;
    const invoiceDate = existingCust?.invoice_date || existingComp?.invoice_date || null;

    // Determine accurate WhatsApp status:
    // - If in registry as active (1), or has chat history, or is verified installed customer: verified
    // - Otherwise: unconfirmed (valid mobile format, but WhatsApp active status not confirmed yet)
    const isExplicitlyVerified = Boolean((reg && reg.is_whatsapp_active === 1) || existingChat || isExisting);

    if (isExplicitlyVerified) {
      return res.json({
        valid: true,
        isVerified: true,
        isWhatsApp: true,
        phone: last10,
        formattedPhone: formatted,
        formatted: formatted,
        isExistingCustomer: isExisting,
        customerName: customerName,
        city: city,
        consumerNo: existingCust?.consumer_no || null,
        orderNo: existingCust?.order_no || null,
        invoiceNo: invoiceNo,
        invoiceDate: invoiceDate,
        inverterSerial: existingCust?.inverter_serial || null,
        panelMake: existingCust?.panel_make || null,
        inverterMake: existingCust?.inverter_make || null,
        isInWarranty: existingCust ? Boolean(existingCust.is_in_warranty) : null,
        ticketId: existingComp?.ticket_id || null,
        hasChatHistory: Boolean(existingChat),
        status: 'verified',
        message: isExisting
          ? `Verified Customer: ${customerName} (${city || 'Gujarat'})`
          : `WhatsApp Active & Verified (${formatted})`
      });
    }

    // Number has valid 10-digit mobile format, but WhatsApp presence is unconfirmed
    return res.json({
      valid: true,
      isVerified: false,
      isWhatsApp: null,
      phone: last10,
      formattedPhone: formatted,
      formatted: formatted,
      isExistingCustomer: false,
      customerName: null,
      city: null,
      consumerNo: null,
      orderNo: null,
      invoiceNo: null,
      invoiceDate: null,
      inverterSerial: null,
      panelMake: null,
      inverterMake: null,
      isInWarranty: null,
      ticketId: null,
      hasChatHistory: false,
      status: 'unconfirmed',
      message: `Mobile Validated (${formatted}) • WhatsApp presence not yet confirmed`
    });
  } catch (err) {
    console.error('Verify phone error:', err);
    res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
});

// 9b. Update / Set phone number WhatsApp status in registry
app.post('/api/whatsapp/set-number-status', (req, res) => {
  try {
    const { phone, isActive, status, customerName, notes } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    const activeVal = (isActive === false || status === 'invite_required') ? 0 : 1;
    const statusVal = activeVal === 0 ? 'invite_required' : 'verified';

    db.prepare(`
      INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, customer_name, source, notes, updated_at)
      VALUES (?, ?, ?, ?, 'manual_override', ?, CURRENT_TIMESTAMP)
    `).run(last10, activeVal, statusVal, customerName || null, notes || (activeVal === 0 ? 'Marked as Not on WhatsApp' : 'Confirmed on WhatsApp'));

    res.json({
      success: true,
      phone: last10,
      isWhatsApp: Boolean(activeVal),
      status: statusVal,
      message: activeVal === 0 ? 'Number marked as Not on WhatsApp (Invite Required)' : 'Number confirmed as WhatsApp Active'
    });
  } catch (err) {
    console.error('Set number status error:', err);
    res.status(500).json({ error: 'Failed to update status: ' + err.message });
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
app.post('/api/customers/sync', authenticateToken, (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
}, customerDirectoryController.syncFromExcel);

// Serve Vite frontend build in production (Unified Single-Port Render Deployment)
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      const host = req.get('host') || '';
      if (host.includes('vprotech.online') || host.includes('onrender.com')) {
        return res.redirect(301, `https://complain.ecogreensolar.co.in${req.originalUrl}`);
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
