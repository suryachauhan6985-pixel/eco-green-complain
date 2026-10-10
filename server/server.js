require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize database schema and auto-seed if needed
const db = require('./config/database');
const { seedDatabase } = require('./data/seed');

// Middlewares
const jwt = require('jsonwebtoken');
const { authenticateToken, requireRole, JWT_SECRET } = require('./middleware/auth');
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Delete an attachment
app.delete(['/api/attachments/:id', '/api/complaints/:complaintId/attachments/:id'], authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const att = db.prepare('SELECT * FROM complaint_attachments WHERE id = ?').get(id);
    if (!att) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (att.complaint_id) {
      const parentComp = db.prepare('SELECT status FROM complaints WHERE id = ?').get(att.complaint_id);
      if (parentComp && ['Resolved', 'Closed'].includes(parentComp.status)) {
        return res.status(400).json({ error: `Attachments cannot be deleted from a ${parentComp.status} complaint. Documents are preserved for record keeping.` });
      }
    }

    db.prepare('DELETE FROM complaint_attachments WHERE id = ?').run(id);

    if (att.complaint_id) {
      try {
        db.prepare(
          'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role) VALUES (?, ?, ?, ?, ?)'
        ).run(att.complaint_id, 'Attachment Removed', `Attachment "${att.file_name || 'Document'}" removed by ${req.user?.name || 'Staff'}`, req.user?.name || 'Staff Specialist', req.user?.role || 'staff');
      } catch (_) {}
    }

    return res.json({ success: true, message: 'Attachment deleted successfully', id });
  } catch (err) {
    console.error('Delete attachment error:', err);
    return res.status(500).json({ error: err.message });
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

// App Version Endpoint for Update Modal (Always fresh, dynamic & anti-cached)
app.get(['/api/version', '/version.json'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const fs = require('fs');
    const path = require('path');
    const candidates = [
      path.join(__dirname, '../client/dist/version.json'),
      path.join(__dirname, '../client/public/version.json'),
      path.join(process.cwd(), 'client/dist/version.json'),
      path.join(process.cwd(), 'client/public/version.json')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const fileData = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (fileData && fileData.version) {
          return res.json(fileData);
        }
      }
    }
  } catch (err) {
    console.warn('Dynamic version read note:', err.message);
  }

  return res.json({
    version: '2.6.2',
    buildTime: Date.now(),
    mandatory: true,
    title: 'Eco Green Support Update',
    summary: 'New official release with continuous deploy sync and optimizations.',
    features: [
      '📑 Voucher & Tour Ledger: Official Green Energy branding, ticket segregation, and formal approval stamp.',
      '⚡ Continuous Deploy Sync: Automatic detection of newly deployed features across all active devices.',
      '📲 Mobile Notifications & Map Pins: Smooth swipe dismiss and smart conditional location display.'
    ]
  });
});

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
app.post('/api/auth/change-my-password', authenticateToken, authController.changeMyPassword);
app.put('/api/auth/profile', authenticateToken, authController.updateProfile);

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
app.get('/api/complaints/check-active', authenticateToken, complaintController.checkActiveComplaint);
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
app.post('/api/complaints/:id/reopen', authenticateToken, requireRole('admin', 'staff'), complaintController.reopenComplaint);
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

// ================= TOUR LEDGER & EXPENSE VOUCHER ROUTES =================
app.get('/api/tour-ledger', authenticateToken, (req, res) => {
  try {
    const { technician_id } = req.query;
    let targetTechId = req.user.role === 'technician' ? req.user.technicianId : technician_id;

    let advSql = `SELECT a.*, a.allocated_by as allocated_by_name, t.name as technician_name, t.phone as technician_phone FROM technician_tour_advances a LEFT JOIN technicians t ON a.technician_id = t.id `;
    let expSql = `SELECT e.*, t.name as technician_name, t.phone as technician_phone FROM technician_tour_expenses e LEFT JOIN technicians t ON e.technician_id = t.id `;
    let stlSql = `SELECT s.*, t.name as technician_name, t.phone as technician_phone FROM technician_tour_settlements s LEFT JOIN technicians t ON s.technician_id = t.id `;
    let params = [];

    if (targetTechId && String(targetTechId).trim() !== '' && targetTechId !== 'all') {
      advSql += `WHERE a.technician_id = ? `;
      expSql += `WHERE e.technician_id = ? `;
      stlSql += `WHERE s.technician_id = ? `;
      params.push(String(targetTechId).trim());
    }

    advSql += `ORDER BY a.allocated_at DESC`;
    expSql += `ORDER BY e.expense_date DESC, e.created_at DESC`;
    stlSql += `ORDER BY s.settled_at DESC`;

    const advances = params.length > 0 ? db.prepare(advSql).all(params[0]) : db.prepare(advSql).all();
    const expenses = params.length > 0 ? db.prepare(expSql).all(params[0]) : db.prepare(expSql).all();
    const settlements = params.length > 0 ? db.prepare(stlSql).all(params[0]) : db.prepare(stlSql).all();

    const totalAdvance = advances.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    const approvedExpenses = expenses.filter(e => (e.status || '').toLowerCase() === 'approved').reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const totalReturned = settlements.reduce((sum, s) => sum + parseFloat(s.returned_amount || 0), 0);
    const totalReimbursed = settlements.reduce((sum, s) => sum + parseFloat(s.reimbursed_amount || 0), 0);
    const currentBalance = (totalAdvance + totalReimbursed) - (approvedExpenses + totalReturned);

    res.json({
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tour-advances', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { technician_id, amount, tour_title, payment_mode, reference_no, notes, allocated_at } = req.body;
    if (!technician_id || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Technician and valid amount are required' });
    }
    const info = db.prepare(`
      INSERT INTO technician_tour_advances (technician_id, amount, allocated_by, allocated_at, payment_mode, reference_no, tour_title, notes)
      VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?)
    `).run(
      String(technician_id).trim(),
      parseFloat(amount),
      req.user ? req.user.name : 'Admin',
      allocated_at || null,
      payment_mode || 'Cash',
      reference_no || null,
      tour_title || 'Service Tour',
      notes || null
    );
    const advance = db.prepare('SELECT * FROM technician_tour_advances WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, advance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getNextGlobalVoucherNos(count = 1) {
  try {
    const rows = db.prepare(`
      SELECT voucher_no FROM technician_tour_expenses 
      WHERE voucher_no IS NOT NULL AND voucher_no != ''
      ORDER BY id DESC LIMIT 500
    `).all();
    let maxSeq = 340;
    let prefix = 'TT-';
    for (const r of rows) {
      const v = String(r.voucher_no || '');
      const match = v.match(/\d+/g);
      if (match) {
        const num = parseInt(match[match.length - 1], 10);
        if (!isNaN(num) && num > maxSeq && num < 10000000) maxSeq = num;
      }
      if (v.startsWith('TT-') || v.startsWith('VCH-') || v.startsWith('EXP-')) {
        const pMatch = v.match(/^([A-Za-z]+-)/);
        if (pMatch) prefix = pMatch[1];
      }
    }
    const result = [];
    for (let i = 1; i <= count; i++) {
      result.push(`${prefix}${maxSeq + i}`);
    }
    return result;
  } catch (_) {
    const result = [];
    for (let i = 1; i <= count; i++) {
      result.push(`TT-${340 + i}`);
    }
    return result;
  }
}

function getNextGlobalVoucherNo() {
  const nos = getNextGlobalVoucherNos(1);
  return nos[0] || 'TT-341';
}

/**
 * Split items into multiple vouchers such that every single voucher
 * is strictly less than 10,000 (< 10,000, i.e. <= maxCap).
 * If total >= 10,000, it guarantees at least 2 distinct vouchers.
 */
function partitionItemsUnderCap(items, maxCap = 9999) {
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

  // Step 1: Expand any single item that is >= 10000 (or if single item >= 10000) into parts
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

app.get('/api/tour-vouchers/next-sequence', authenticateToken, (req, res) => {
  res.json({ success: true, next_voucher_no: getNextGlobalVoucherNo() });
});

app.post('/api/tour-expenses', authenticateToken, (req, res) => {
  try {
    const { technician_id, tour_advance_id, expense_date, category, amount, description, receipt_url, receipt_data, receipt_name, ticket_id, voucher_no, items } = req.body;
    const targetTechId = req.user.role === 'technician' ? (req.user.technicianId || req.user.technician_id) : technician_id;
    if (!targetTechId) {
      return res.status(400).json({ error: 'Technician is required' });
    }

    const rawLineItems = Array.isArray(items) && items.length > 0
      ? items
      : [{
          category: category || 'Other Expense',
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
      return res.status(400).json({ error: 'Please provide at least one valid expense amount' });
    }

    const totalSubmissionAmount = validItems.reduce((acc, it) => acc + it.amount, 0);

    // Auto-split rule: Each single voucher must be strictly less than ₹10,000 (< 10,000).
    // If total submission >= 10,000, automatically partition into 2 or more vouchers.
    const buckets = partitionItemsUnderCap(validItems, 9999);
    let allAssignedVouchers = [];

    if (buckets.length === 1) {
      let chosenVoucherNo = null;
      if (ticket_id && String(ticket_id).trim()) {
        const trimmedTicket = String(ticket_id).trim();
        const existingUnapproved = db.prepare(`
          SELECT voucher_no, COALESCE(SUM(amount), 0) as current_total 
          FROM technician_tour_expenses 
          WHERE technician_id = ? 
            AND (ticket_id = ? OR ticket_id LIKE ?)
            AND LOWER(COALESCE(status, 'pending')) NOT IN ('approved', 'verified')
            AND voucher_no IS NOT NULL AND voucher_no != ''
          GROUP BY voucher_no
          ORDER BY MAX(id) DESC LIMIT 1
        `).get(String(targetTechId).trim(), trimmedTicket, `%${trimmedTicket}%`);

        if (existingUnapproved && existingUnapproved.voucher_no) {
          const currentTotal = parseFloat(existingUnapproved.current_total || 0);
          if (currentTotal + totalSubmissionAmount < 10000) {
            chosenVoucherNo = existingUnapproved.voucher_no;
          }
        }
      }

      if (!chosenVoucherNo && voucher_no && !voucher_no.startsWith('EXP-')) {
        chosenVoucherNo = voucher_no;
      }

      if (!chosenVoucherNo) {
        chosenVoucherNo = getNextGlobalVoucherNos(1)[0];
      }
      allAssignedVouchers = [chosenVoucherNo];
    } else {
      allAssignedVouchers = getNextGlobalVoucherNos(buckets.length);
    }

    const created = [];
    const stmt = db.prepare(`
      INSERT INTO technician_tour_expenses (
        technician_id, tour_advance_id, voucher_no, expense_date, category, amount, description,
        receipt_url, receipt_data, receipt_name, ticket_id, status, created_by
      ) VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)
    `);

    for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
      const bucketItems = buckets[bIdx];
      const assignedVoucherNo = allAssignedVouchers[bIdx];

      for (const it of bucketItems) {
        const itAmt = parseFloat(it.amount || 0);
        if (itAmt <= 0) continue;

        const info = stmt.run(
          String(targetTechId).trim(),
          tour_advance_id || null,
          assignedVoucherNo,
          it.expense_date || expense_date || null,
          it.category || category || 'Other Expense',
          itAmt,
          it.description || it.title || description || '',
          it.receipt_url !== undefined ? it.receipt_url : (receipt_url || null),
          it.receipt_data !== undefined ? it.receipt_data : (receipt_data || null),
          it.receipt_name !== undefined ? it.receipt_name : (receipt_name || null),
          it.ticket_id || ticket_id || null,
          req.user ? (req.user.name || 'Technician') : 'Technician'
        );
        created.push(db.prepare('SELECT * FROM technician_tour_expenses WHERE id = ?').get(info.lastInsertRowid));
      }
    }

    return res.json({
      success: true,
      count: created.length,
      voucher_no: allAssignedVouchers[0],
      voucher_nos: allAssignedVouchers,
      is_split: allAssignedVouchers.length > 1,
      expenses: created,
      items: created,
      message: allAssignedVouchers.length > 1
        ? `Voucher claim of ₹${totalSubmissionAmount} automatically split into ${allAssignedVouchers.length} vouchers (${allAssignedVouchers.join(', ')}) strictly under ₹10,000 each.`
        : `Voucher ${allAssignedVouchers[0]} saved successfully.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tour-vouchers/:voucherNo', authenticateToken, (req, res) => {
  try {
    const { voucherNo } = req.params;
    const { items, ticket_id, expense_date, receipt_url, receipt_name } = req.body;

    const existing = db.prepare('SELECT * FROM technician_tour_expenses WHERE voucher_no = ?').all(voucherNo);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    const isApproved = existing.some(r => String(r.status).toLowerCase() === 'approved' || String(r.status).toLowerCase() === 'verified');
    if (isApproved && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Approved voucher is locked and cannot be edited' });
    }

    const first = existing[0];
    const targetTechId = first.technician_id;
    const tourAdvanceId = first.tour_advance_id;
    const complaintId = first.complaint_id;

    // Remove existing rows for this voucher
    db.prepare('DELETE FROM technician_tour_expenses WHERE voucher_no = ?').run(voucherNo);

    const rawItems = Array.isArray(items) && items.length > 0 
      ? items 
      : [{
          category: req.body.category || 'Other Expense',
          amount: req.body.amount,
          description: req.body.description || req.body.title
        }];

    // Partition items so each resulting voucher is strictly < 10,000
    const buckets = partitionItemsUnderCap(rawItems, 9999);
    let extraVouchers = [];
    if (buckets.length > 1) {
      extraVouchers = getNextGlobalVoucherNos(buckets.length - 1);
    }
    const allAssignedVouchers = [voucherNo, ...extraVouchers];

    const stmt = db.prepare(`
      INSERT INTO technician_tour_expenses (
        technician_id, tour_advance_id, voucher_no, expense_date, category, amount, description,
        receipt_url, receipt_name, ticket_id, complaint_id, status, created_by
      ) VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)
    `);

    const created = [];
    for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
      const bucketItems = buckets[bIdx];
      const assignedVoucherNo = allAssignedVouchers[bIdx];

      for (const it of bucketItems) {
        const itAmt = parseFloat(it.amount);
        if (!itAmt || itAmt <= 0) continue;
        const info = stmt.run(
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
          it.complaint_id || complaintId || null,
          req.user ? (req.user.name || 'Technician') : 'Technician'
        );
        created.push(db.prepare('SELECT * FROM technician_tour_expenses WHERE id = ?').get(info.lastInsertRowid));
      }
    }

    res.json({
      success: true,
      voucher_no: voucherNo,
      voucher_nos: allAssignedVouchers,
      is_split: allAssignedVouchers.length > 1,
      expenses: created,
      items: created
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tour-expenses/:id/status', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const { id } = req.params;
    const { status, approved_by_name } = req.body;
    const approver = (status === 'approved' || status === 'Verified')
      ? (approved_by_name || req.user?.name || req.user?.username || 'Admin')
      : null;
    try {
      db.prepare('UPDATE technician_tour_expenses SET status = ?, approved_by_name = ? WHERE id = ?').run(status, approver, id);
    } catch (e) {
      try {
        db.prepare('ALTER TABLE technician_tour_expenses ADD COLUMN approved_by_name TEXT').run();
        db.prepare('UPDATE technician_tour_expenses SET status = ?, approved_by_name = ? WHERE id = ?').run(status, approver, id);
      } catch (_) {
        db.prepare('UPDATE technician_tour_expenses SET status = ? WHERE id = ?').run(status, id);
      }
    }
    const expense = db.prepare('SELECT * FROM technician_tour_expenses WHERE id = ?').get(id);
    res.json({ success: true, expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tour-expenses/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM technician_tour_expenses WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tour-settlements', authenticateToken, (req, res) => {
  try {
    const { technician_id, returned_amount, reimbursed_amount, notes, tour_advance_id } = req.body;
    const targetTechId = req.user.role === 'technician' ? req.user.technicianId : technician_id;
    if (!targetTechId) {
      return res.status(400).json({ error: 'Technician is required' });
    }
    const info = db.prepare(`
      INSERT INTO technician_tour_settlements (
        technician_id, advance_amount, expense_amount, returned_amount, reimbursed_amount,
        settled_by, settled_at, notes, tour_advance_id
      ) VALUES (?, 0, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(
      String(targetTechId).trim(),
      parseFloat(returned_amount || 0),
      parseFloat(reimbursed_amount || 0),
      req.user ? req.user.name : 'Accounts Desk',
      notes || 'Tour Balance Settled with Company',
      tour_advance_id || null
    );
    const settlement = db.prepare('SELECT * FROM technician_tour_settlements WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, settlement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= NOTIFICATION ROUTES =================
app.get('/api/notifications/templates', notificationController.getTemplates);
app.get('/api/notifications/templates/meta-status', notificationController.getMetaStatus);
app.post('/api/notifications/templates', authenticateToken, requireRole('admin'), notificationController.createTemplate);
app.put('/api/notifications/templates/:id', authenticateToken, requireRole('admin'), notificationController.updateTemplate);
app.delete('/api/notifications/templates/:id', authenticateToken, requireRole('admin'), notificationController.deleteTemplate);
app.post('/api/notifications/templates/:id/toggle-active', authenticateToken, requireRole('admin'), notificationController.toggleTemplateActive);
app.post('/api/notifications/templates/:id/sync-meta', authenticateToken, requireRole('admin'), notificationController.syncTemplateWithMeta);
app.get('/api/notifications/logs', authenticateToken, notificationController.getLogs);
app.post('/api/notifications/logs/:id/resend', authenticateToken, requireRole('admin', 'staff'), notificationController.resendLog);
app.get('/api/notifications/simulated', notificationController.getSimulatedMessages);
app.delete('/api/notifications/simulated', notificationController.clearSimulated);
app.get('/api/notifications/events', notificationController.subscribeSimulatedEvents);

// ================= IN-APP NOTIFICATION ROUTES =================
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_) {}
  }
  next();
}

app.get('/api/version', (req, res) => {
  res.json({
    version: '2.4.3',
    buildTime: 1790513000000,
    releaseDate: '2026-09-27',
    mandatory: true,
    title: 'Eco Green Solar CMS v2.4.3',
    summary: 'Direct Camera Video Recording, Mobile Tour Guide, Notifications & Field Portal Upgrades',
    features: [
      '📹 Direct Camera Video Recording: You can now directly record live video from camera alongside photos when attaching complaint proofs and documents.',
      '📱 Mobile View Tour: Interactive guided step-by-step tour restored for phone screens and mobile browsers.',
      '🔔 In-App Notifications: Fixed intermittent delivery, resolved ticket ID deduplication suppression, and added instant chime alerts.',
      '💼 Dedicated Field Ops & Collection Tabs: Dedicated segregation for technicians to track financial collections and complaint work orders independently.',
      '🗑️ Ticket Query Document Deletion: Added direct trash/delete action for uploaded complaint query files.',
      '💬 WhatsApp Web Messenger: Fixed delivery errors and added Camera Photo & Live Video recording directly in chat attachments.'
    ]
  });
});

app.get('/api/in-app-notifications', optionalAuth, notificationController.listInAppNotifications);
app.post('/api/in-app-notifications', optionalAuth, notificationController.createInAppNotification);
app.put('/api/in-app-notifications/read-all', optionalAuth, notificationController.markAllInAppNotificationsRead);
app.put('/api/in-app-notifications/:id/read', optionalAuth, notificationController.markInAppNotificationRead);
app.delete('/api/in-app-notifications', optionalAuth, notificationController.clearInAppNotifications);

// ================= OS WEB PUSH NOTIFICATION ROUTES =================
const webPushService = require('./services/webPushService');

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: webPushService.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', optionalAuth, (req, res) => {
  try {
    const { endpoint, keys, role, userId, phone } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Valid push subscription is required' });
    }
    webPushService.savePushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: userId || req.user?.id,
      role: role || req.user?.role || 'staff',
      phone: phone || req.user?.phone
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push/unsubscribe', optionalAuth, (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) webPushService.removePushSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push/test', optionalAuth, async (req, res) => {
  try {
    const { subscription, delaySeconds = 0 } = req.body || {};
    const delayMs = Math.min(Math.max(Number(delaySeconds) * 1000, 0), 10000);

    const testPayload = {
      title: '☀️ Eco Green Support — Test Alert',
      body: 'OS-level background push notification is active on this device!',
      url: '/complaints',
      tag: `test-push-${Date.now()}`
    };

    if (subscription && subscription.endpoint && subscription.keys) {
      if (delayMs > 0) {
        setTimeout(async () => {
          try {
            await webPushService.dispatchPushToRoles(['admin', 'staff', 'technician'], testPayload);
          } catch (_) {}
        }, delayMs);
        return res.json({ success: true, message: `Test push scheduled in ${delaySeconds}s. Lock screen now!` });
      }
      await webPushService.dispatchPushToRoles(['admin', 'staff', 'technician'], testPayload);
      return res.json({ success: true, message: 'Test push dispatched' });
    }

    const role = req.user?.role || 'staff';
    webPushService.dispatchPushToRoles(role, testPayload);
    res.json({ success: true, message: 'Test push dispatched to your role' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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

// WhatsApp Media Proxy (streams media securely from Meta Cloud API lookaside CDN to frontend)
app.get(['/api/whatsapp/media/:mediaId', '/whatsapp/media/:mediaId', '/api/api/whatsapp/media/:mediaId'], async (req, res) => {
  const { mediaId } = req.params;
  const token = process.env.META_ACCESS_TOKEN || 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('[WhatsApp Media] Meta error for ID', mediaId, errText);
      return res.status(metaRes.status).send('Failed to locate media on Meta: ' + errText);
    }

    const metaData = await metaRes.json();
    if (!metaData.url) {
      return res.status(404).send('Media URL not provided by Meta');
    }

    const fileRes = await fetch(metaData.url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      return res.status(fileRes.status).send('Failed to download media binary from Meta CDN');
    }

    const contentType = metaData.mime_type || fileRes.headers.get('content-type') || 'image/jpeg';
    const contentLength = metaData.file_size || fileRes.headers.get('content-length');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    const isDownload = req.query.download === '1' || req.query.dl === '1';
    const filename = req.query.filename || '';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    if (filename) {
      res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(filename)}"`);
    } else {
      res.setHeader('Content-Disposition', dispositionType);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[WhatsApp Media Proxy Error]:', err.message);
    return res.status(500).send('Error streaming media: ' + err.message);
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
    const userId = String(req.user?.id || req.user?.username || 'admin');
    db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversation_reads (
        user_id TEXT NOT NULL,
        phone_10 TEXT NOT NULL,
        last_read_message_id INTEGER DEFAULT 0,
        last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_manual_unread INTEGER DEFAULT 0,
        manual_unread_at DATETIME,
        PRIMARY KEY (user_id, phone_10)
      )
    `).run();

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

      // Unread state tracking
      const readRow = db.prepare(`
        SELECT last_read_message_id, is_manual_unread 
        FROM whatsapp_conversation_reads 
        WHERE user_id = ? AND phone_10 = ?
      `).get(userId, last10);

      const lastReadId = readRow?.last_read_message_id || 0;
      const isManualUnread = Boolean(readRow?.is_manual_unread);

      const unreadRow = db.prepare(`
        SELECT COUNT(id) as count 
        FROM whatsapp_messages 
        WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ?
          AND sender_type = 'customer'
          AND id > ?
      `).get(`%${last10}%`, lastReadId);

      const unreadCount = Number(unreadRow?.count || 0);

      return {
        ...r,
        id: r.id,
        phone: canonicalPhone,
        complaint_id: complaintId,
        ticket_id: ticketId,
        is_technician: isTechnician,
        sender_name: customerName || displayPhone,
        last_activity: formatIsoUtc(r.last_activity),
        created_at: formatIsoUtc(r.created_at),
        unread_count: unreadCount,
        is_manual_unread: isManualUnread
      };
    });

    res.json({ success: true, conversations });
  } catch (err) {
    console.error('Error fetching WhatsApp conversations:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark WhatsApp conversation as read
app.post('/api/whatsapp/mark-read', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const rawPhone = req.body?.phone || req.query?.phone;
    if (!rawPhone) return res.status(400).json({ error: 'Phone is required' });
    const last10 = getLast10Digits(rawPhone);
    const userId = String(req.user?.id || req.user?.username || 'admin');

    const maxRow = db.prepare(`
      SELECT MAX(id) as max_id FROM whatsapp_messages 
      WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ?
    `).get(`%${last10}%`);
    const maxId = Number(maxRow?.max_id || 0);

    db.prepare(`
      INSERT INTO whatsapp_conversation_reads (user_id, phone_10, last_read_message_id, last_read_at, is_manual_unread)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)
      ON CONFLICT(user_id, phone_10) DO UPDATE SET
        last_read_message_id = MAX(whatsapp_conversation_reads.last_read_message_id, excluded.last_read_message_id),
        last_read_at = CURRENT_TIMESTAMP,
        is_manual_unread = 0
    `).run(userId, last10, maxId);

    res.json({ success: true, phone: last10, unread_count: 0, is_manual_unread: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually mark WhatsApp conversation as unread
app.post('/api/whatsapp/mark-unread', authenticateToken, requireRole('admin', 'staff'), (req, res) => {
  try {
    const rawPhone = req.body?.phone || req.query?.phone;
    if (!rawPhone) return res.status(400).json({ error: 'Phone is required' });
    const last10 = getLast10Digits(rawPhone);
    const userId = String(req.user?.id || req.user?.username || 'admin');

    db.prepare(`
      INSERT INTO whatsapp_conversation_reads (user_id, phone_10, is_manual_unread, manual_unread_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, phone_10) DO UPDATE SET
        is_manual_unread = 1,
        manual_unread_at = CURRENT_TIMESTAMP
    `).run(userId, last10);

    res.json({ success: true, phone: last10, is_manual_unread: true });
  } catch (err) {
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
    const { phone, message, media_url, media_type, media_caption } = req.body;
    if (!phone || (!message && !req.file && !media_url)) {
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

    let mediaUrl = media_url || null;
    let mediaType = media_type || null;
    let mediaFileName = media_caption || null;

    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaFileName = req.file.originalname;
      mediaType = req.file.mimetype.startsWith('image/') ? 'image' : (req.file.mimetype.startsWith('video/') ? 'video' : 'document');
    }

    // Public URL for Meta Cloud API if APP_URL or request origin is available
    let absoluteMediaUrl = mediaUrl;
    if (mediaUrl && !mediaUrl.startsWith('http')) {
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
    let insertRes = null;
    if (sendRes.messageId) {
      insertRes = db.prepare('SELECT * FROM whatsapp_messages WHERE wam_id = ? LIMIT 1').get(sendRes.messageId);
    }
    if (!insertRes) {
      const insertStmt = db.prepare(`
        INSERT INTO whatsapp_messages (
          complaint_id, phone, sender_type, sender_name,
          message_body, media_url, media_type, media_caption, wam_id, status
        ) VALUES (?, ?, 'company', ?, ?, ?, ?, ?, ?, 'sent')
        ON CONFLICT(wam_id) DO UPDATE SET
          complaint_id = COALESCE(excluded.complaint_id, whatsapp_messages.complaint_id),
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP
      `);

      insertRes = insertStmt.run(
        complaint ? complaint.id : null,
        formattedPhone,
        req.user?.name || 'Eco Green Support',
        (message || '').trim(),
        mediaUrl,
        mediaType,
        mediaFileName,
        sendRes.messageId || null
      );
    }

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
