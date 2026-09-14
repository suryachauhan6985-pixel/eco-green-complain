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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Eco Green Solar CMS API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
app.delete('/api/auth/users/:id', authenticateToken, requireRole('admin'), authController.deleteUser);

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
app.post('/api/complaints/:id/assign', authenticateToken, requireRole('admin', 'staff'), complaintController.assignTechnician);
app.post('/api/complaints/:id/note', authenticateToken, complaintController.addTimelineNote);
app.post('/api/complaints/:id/resolve', authenticateToken, upload.single('closing_photo'), complaintController.resolveComplaint);
app.post('/api/complaints/:id/close', authenticateToken, requireRole('admin', 'staff'), complaintController.closeComplaint);
app.post('/api/complaints/:id/reopen', authenticateToken, complaintController.reopenComplaint);

// ================= TECHNICIAN ROUTES =================
app.get('/api/technicians', authenticateToken, technicianController.listTechnicians);
app.get('/api/technicians/:id', authenticateToken, technicianController.getTechnician);
app.put('/api/technicians/:id/availability', authenticateToken, requireRole('admin', 'staff'), technicianController.updateAvailability);
app.delete('/api/technicians/:id', authenticateToken, requireRole('admin'), technicianController.deleteTechnician);

// ================= NOTIFICATION ROUTES =================
app.get('/api/notifications/templates', notificationController.getTemplates);
app.put('/api/notifications/templates/:id', authenticateToken, requireRole('admin'), notificationController.updateTemplate);
app.get('/api/notifications/logs', authenticateToken, notificationController.getLogs);
app.post('/api/notifications/logs/:id/resend', authenticateToken, requireRole('admin', 'staff'), notificationController.resendLog);
app.get('/api/notifications/simulated', notificationController.getSimulatedMessages);
app.delete('/api/notifications/simulated', notificationController.clearSimulated);
app.get('/api/notifications/events', notificationController.subscribeSimulatedEvents);

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
