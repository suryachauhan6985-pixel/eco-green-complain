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

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded photos/documents
const uploadsPath = path.join(__dirname, 'uploads');
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

// ================= TECHNICIAN ROUTES =================
app.get('/api/technicians', authenticateToken, technicianController.listTechnicians);
app.get('/api/technicians/:id', authenticateToken, technicianController.getTechnician);
app.put('/api/technicians/:id', authenticateToken, requireRole('admin', 'staff'), technicianController.updateTechnician);
app.put('/api/technicians/:id/availability', authenticateToken, requireRole('admin', 'staff', 'technician'), technicianController.updateAvailability);
app.delete('/api/technicians/:id', authenticateToken, requireRole('admin'), technicianController.deleteTechnician);

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
