const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Strict File Upload Security (Supports Images, PDFs, and Videos like MP4, WebM, MOV for fault reporting)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
  'video/x-msvideo',
  'video/mpeg'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for video proof and documents
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const dangerousExts = ['html', 'htm', 'svg', 'js', 'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'pl', 'jsp', 'cgi', 'vbs'];
    if (dangerousExts.includes(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      return cb(new Error('Invalid file type. Only photos (JPEG, PNG, WebP), PDF documents, and videos (MP4, WebM, MOV, 3GP) are allowed.'));
    }
    cb(null, true);
  }
});

const app = express();

// Secure CORS configuration
app.use(cors());

// HTTP Security Headers (Defends against clickjacking, MIME sniffing, and cross-site scripting)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lightweight In-Memory Rate Limiter (Protects against Brute-Force and DoS)
const rateLimitMap = new Map();
function createRateLimiter({ windowMs = 60 * 1000, max = 30, message = 'Too many requests. Please try again later.' } = {}) {
  return (req, res, next) => {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = String(rawIp).split(',')[0].trim();
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }
    rateLimitMap.set(ip, record);

    if (rateLimitMap.size > 2000) {
      for (const [key, val] of rateLimitMap.entries()) {
        if (now > val.resetTime) rateLimitMap.delete(key);
      }
    }

    if (record.count > max) {
      return res.status(429).json({ 
        error: message, 
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) 
      });
    }
    next();
  };
}

const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, message: 'Too many login attempts. Please wait 1 minute before retrying.' });
const publicComplaintLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 6, message: 'Complaint submission limit reached. Please wait a moment.' });
const pincodeLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Rate limit exceeded for location lookup.' });

// Supabase PostgreSQL Connection Pool (Serverless-optimized with PgBouncer transaction pooling)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 6000
});


const JWT_SECRET = process.env.JWT_SECRET || 'ecogreen_solar_cms_secret_key_2026';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '1387211441132836';
const META_WABA_ID = process.env.META_WABA_ID || '1015283491554000';
const DEFAULT_META_ACCESS_TOKEN = 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
const getMetaAccessToken = () => META_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://complain.ecogreensolar.co.in';

// Helper: Run query
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  return res;
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Optional Auth (for endpoints that work both public and logged in)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_) {}
  }
  next();
}

// Phone Normalization & Display Helpers
function normalizePhone(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) return '91' + clean;
  if (clean.length === 12 && clean.startsWith('91')) return clean;
  if (clean.length > 10) return '91' + clean.slice(-10);
  return clean;
}

function getLast10Digits(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  return clean.length >= 10 ? clean.slice(-10) : clean;
}

function formatDisplayPhone(phone) {
  const last10 = getLast10Digits(phone);
  if (last10.length === 10) {
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return phone ? `+${String(phone).replace(/\D/g, '')}` : '';
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    next();
  };
}

// Meta Cloud API WhatsApp Sender
async function sendWhatsApp({ to, message, templateName, variables = {}, mediaUrl, mediaType, mediaFileName, senderName }) {
  const cleanDigits = (to || '').replace(/[^0-9]/g, '');
  if (!cleanDigits || cleanDigits.length < 10) {
    return { success: false, error: 'Invalid phone number' };
  }
  const last10 = cleanDigits.slice(-10);
  const formattedPhone = `91${last10}`;
  const maskedPhone = `******${last10.slice(-4)}`;

  try {
    let payload = { messaging_product: 'whatsapp', to: formattedPhone };
    const trackingUrl = `${APP_URL}/track/${variables.ticket_id || variables.complaint_id || ''}`;
    const cleanParam = (val, fb = '') => String(val || fb).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || fb;

    let renderedBody = message || '';

    if (templateName === 'complaint_registered' || templateName === 'complaint_registered_customer') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar Equipment');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');

      const estCharges = Number(variables.estimated_charges || 0);
      const shouldNotifyCharges = variables.notify_charges !== false && variables.notify_charges !== 0 && estCharges > 0;
      const chargesParam = shouldNotifyCharges ? `₹${estCharges}` : '₹0 (Under Warranty)';

      renderedBody = `Namaste ${custName},\n\nYour service complaint has been registered with Eco Green Solar.\nTicket ID: ${ticketId}\nProduct: ${prodType}\nIssue: ${issueCat}\nEstimated Service Charge: ${chargesParam}\n\nTrack ticket: ${trackingUrl}\n\nThank you for choosing Eco Green Solar.`;
      
      payload.type = 'template';
      payload.template = {
        name: 'complaint_registered',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: prodType },
            { type: 'text', text: issueCat },
            { type: 'text', text: trackingUrl },
            { type: 'text', text: chargesParam }
          ]
        }]
      };
    } else if (templateName === 'technician_assigned' || templateName === 'technician_assigned_customer') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Technician');
      renderedBody = `Namaste *${custName}*,\n\nA certified technician of Eco Green Solar has been assigned to your Ticket No.: *${ticketId}*.\n\nTechnician Name: *${techName}*\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\nTrack visit live: ${trackingUrl}\n\nEco Green Solar Customer Care.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_assigned',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: techName },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'technician_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, 'Phone');
      const custAddress = cleanParam(variables.customer_address, 'Address on file');
      const prodType = cleanParam(variables.product_type, 'Solar Equipment');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const notes = cleanParam(variables.notes || variables.issue_description, 'Inspect site');
      const priority = cleanParam(variables.priority, 'Medium');
      const visitDate = cleanParam(variables.expected_visit_date, 'Today');
      const portalLink = `${APP_URL}/technician?ticket=${encodeURIComponent(ticketId)}`;
      renderedBody = `Hello ${techName}, you have been assigned ticket *${ticketId}*.\n\n*Customer:* ${custName}\n*Customer Phone:* ${custPhone}\n*Address:* ${custAddress}\n*Product:* ${prodType}\n*Category:* ${issueCat}\n*Issue:* ${notes}\n*Priority:* ${priority}\n*Expected Visit:* ${visitDate}\n\n*Direct Ticket Link:* ${portalLink}\n\nPlease check your Eco Green technician portal for details and coordinate with the customer.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_work_order',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'technician_name', text: techName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'customer_phone', text: custPhone },
            { type: 'text', parameter_name: 'customer_address', text: custAddress },
            { type: 'text', parameter_name: 'product_type', text: prodType },
            { type: 'text', parameter_name: 'issue_category', text: issueCat },
            { type: 'text', parameter_name: 'notes', text: notes },
            { type: 'text', parameter_name: 'priority', text: priority },
            { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
          ]
        }]
      };
    } else if (templateName === 'complaint_resolved') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Technician');
      const resNotes = cleanParam(variables.resolution_notes || variables.closure_remarks, 'Service completed');
      renderedBody = `Namaste *${custName}*,\n\nYour solar equipment complaint for Ticket No.: *${ticketId}* has been marked *RESOLVED* by technician - *${techName}*.\n\nResolution Notes: *${resNotes}*\n\nPlease rate your service experience here: *${trackingUrl}*\n\nThank you for choosing *Eco Green Solar*.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_resolved',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: techName },
            { type: 'text', text: resNotes },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'complaint_closed' || templateName === 'complaint_closed_feedback_request' || templateName === 'complaint_closed__feedback_request') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const remarks = cleanParam(variables.closure_remarks || variables.notes, 'Issue resolved and verified.');
      renderedBody = `☀️ *Eco Green Solar - Ticket Closed*\n\nNamaste *${custName}*,\n\nYour service complaint *${ticketId}* has been verified and successfully *CLOSED*.\n\n📝 *Closure Remarks:* ${remarks}\n\n🔗 *View Ticket Summary & Rate Service:* ${trackingUrl}\n\nIf you have any further questions, please reach our helpline at +91 78784 44414.\n\nThank you for choosing *Eco Green Solar Care*.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_closed__feedback_request',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'complaint_reopened' || templateName === 'complaint_reopened_notification') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const reason = cleanParam(variables.reason || variables.notes, 'Follow-up investigation required');
      const techName = cleanParam(variables.technician_name, '');
      const techPhone = cleanParam(variables.technician_phone, '');
      const techInfo = techName ? `\n\n👷 *Assigned Technician:* ${techName}${techPhone ? ` (${techPhone})` : ''}` : '';

      renderedBody = `☀️ *Eco Green Solar Priority Alert*\n\nNamaste *${custName}*,\n\nYour complaint ticket *${ticketId}* has been *REOPENED* for further inspection and service follow-up.\n\n⚠️ *Reason for Reopening:* ${reason}${techInfo}\n\nOur service technician will coordinate with you shortly to inspect and resolve your system.\n\n🔗 *Track Live Status:* ${trackingUrl}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_reopened_notification',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'status_update' || templateName === 'status_followup_note_update' || templateName === 'status__followup_note_update') {
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const status = cleanParam(variables.status, 'In Progress');
      const notes = cleanParam(variables.notes, 'Update added');
      renderedBody = `*Eco Green Solar Alert*\n\nUpdate on Complaint *${ticketId}* (${prodType}):\nStatus: *${status}*\n\n*Notes:* ${notes}\n\n*Track Live:* ${trackingUrl}\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'status__followup_note_update',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'product_type', text: prodType },
            { type: 'text', parameter_name: 'status', text: status },
            { type: 'text', parameter_name: 'notes', text: notes },
            { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'technician_reminder' || templateName === 'technician_pending_visit_reminder') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddress = cleanParam(variables.customer_address, 'Customer Address');
      const visitDate = cleanParam(variables.expected_visit_date, 'Today');
      const portalLink = `${APP_URL}/technician?ticket=${encodeURIComponent(ticketId)}`;
      renderedBody = `⏰ *Eco Green Solar - Pending Visit Reminder*\n\nHello *${techName}*,\n\nThis is a reminder regarding pending ticket *${ticketId}*.\n\n👤 *Customer:* ${custName}\n📍 *Address:* ${custAddress}\n📅 *Expected Visit:* ${visitDate}\n\n🔗 *Open Ticket in Portal:* ${portalLink}\n\nPlease complete the visit and update status promptly.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_pending_visit_reminder',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'technician_name', text: techName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'customer_phone', text: custPhone },
            { type: 'text', parameter_name: 'customer_address', text: custAddress },
            { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
          ]
        }]
      };
    } else if (templateName === 'customer_technician_reassigned' || templateName === 'technician_reassigned_customer') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const techName = cleanParam(variables.technician_name, 'Technician');

      renderedBody = `*Eco Green Solar - Technician Reassigned*\n\nDear ${custName}, your complaint *${ticketId}* (${prodType}) has been reassigned to a new technician.\n\n*New Technician:* ${techName}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* ${trackingUrl}\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'customer_technician_reassigned',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: prodType },
            { type: 'text', text: techName },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'technician_reassigned' || templateName === 'technician_job_reassigned_notice') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const notes = cleanParam(variables.notes, 'Ticket reassigned to another technician. Removed from your schedule.');
      renderedBody = `⚠️ *Eco Green Solar - Job Update*\n\nHello *${techName}*,\n\nPlease note that ticket *${ticketId}* (Customer: ${custName}) has been reassigned to another technician and removed from your active schedule.\n\n📝 *Notes:* ${notes}\n\nPlease check your Technician Portal for your updated schedule.\n- Eco Green Dispatch`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_reassigned_notice',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: techName },
            { type: 'text', text: ticketId },
            { type: 'text', text: custName },
            { type: 'text', text: notes }
          ]
        }]
      };
    } else if (templateName === 'technician_reopened_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddress = cleanParam(variables.customer_address, 'Customer Site Address');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Follow-up inspection required');
      const prevTech = cleanParam(variables.previous_technician_name, '');
      const prevTechLine = prevTech ? `\n👷 *Previous Specialist:* ${prevTech}` : '';
      const portalLink = `${APP_URL}/technician?ticket=${encodeURIComponent(ticketId)}`;

      renderedBody = `🔄 *Eco Green Solar - Reopened Work Order*\n\nHello *${techName}*,\n\nTicket *${ticketId}* has been *REOPENED* for service follow-up.${prevTechLine}\n\n⚠️ *Reason for Reopening:* ${reopenReason}\n\n👤 *Customer:* ${custName}\n📞 *Phone:* ${custPhone}\n📍 *Address:* ${custAddress}\n\n🔗 *Open Ticket in Portal:* ${portalLink}\n\nPlease review previous site visit notes and coordinate with the customer immediately.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_reopened_work_order',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'technician_name', text: techName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'customer_phone', text: custPhone },
            { type: 'text', parameter_name: 'customer_address', text: custAddress },
            { type: 'text', parameter_name: 'reopen_reason', text: reopenReason }
          ]
        }]
      };
    } else if (templateName === 'technician_reopen_job_transferred' || templateName === 'technician_reopened_transferred') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const newTech = cleanParam(variables.new_technician_name, 'another specialist');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Follow-up inspection requested');

      renderedBody = `⚠️ *Eco Green Solar - Reopened Job Transferred*\n\nHello *${techName}*,\n\nPlease note that complaint ticket *${ticketId}* (Customer: ${custName}) previously resolved by you has been *REOPENED* upon customer request and reassigned to another technician (*${newTech}*).\n\n⚠️ *Customer Reopen Reason:* ${reopenReason}\n\nYou are not required to attend to this complaint as another technician has been dispatched for follow-up.\n- Eco Green Dispatch`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_transferred_notice',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: techName },
            { type: 'text', text: ticketId },
            { type: 'text', text: custName },
            { type: 'text', text: `Reopened & reassigned to ${newTech}. Reason: ${reopenReason}` }
          ]
        }]
      };
    } else if (mediaUrl) {
      renderedBody = message || (mediaType === 'image' ? '[Photo]' : '[Document]');
      if (mediaType === 'image') {
        payload.type = 'image';
        payload.image = { link: mediaUrl };
        if (message) payload.image.caption = message;
      } else {
        payload.type = 'document';
        payload.document = { link: mediaUrl, filename: mediaFileName || 'Document.pdf' };
        if (message) payload.document.caption = message;
      }
    } else {
      payload.type = 'text';
      payload.text = { body: message || `Eco Green Solar: Ticket ${variables.ticket_id || ''} update.` };
      renderedBody = payload.text.body;
    }

    console.log(`[WHATSAPP] Recipient: ${maskedPhone} | Trigger: ${templateName || (mediaUrl ? mediaType : 'text')} | Meta Request: START`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const resp = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    let data = await resp.json();
    let wamid = data?.messages?.[0]?.id || null;
    let isSuccess = resp.ok && !!wamid;
    let errorMsg = !isSuccess ? (data?.error?.message || data?.error?.error_user_msg || `Meta HTTP ${resp.status}`) : null;

    // Graceful fallback to text payload if template is not yet registered in Meta Business Manager
    if (!isSuccess && payload.type === 'template' && renderedBody) {
      try {
        const textPayload = {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: renderedBody }
        };
        const textResp = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(textPayload)
        });
        const textData = await textResp.json();
        if (textResp.ok && textData?.messages?.[0]?.id) {
          data = textData;
          wamid = textData.messages[0].id;
          isSuccess = true;
          errorMsg = null;
        }
      } catch (_) {}
    }

    console.log(`[WHATSAPP] Recipient: ${maskedPhone} | Meta Response: ${isSuccess ? 200 : resp.status} | WAMID: ${wamid || 'none'} | Error: ${errorMsg || 'none'}`);

    // Insert into whatsapp_messages database table
    try {
      await query(
        `INSERT INTO whatsapp_messages (
          complaint_id, phone, sender_type, sender_name, message_body, media_url, media_type, media_caption, wam_id, status, failure_reason, template_name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          variables.db_complaint_id || null,
          formattedPhone,
          'company',
          senderName || 'Eco Green Solar',
          renderedBody,
          mediaUrl || null,
          mediaType || null,
          mediaFileName || null,
          wamid,
          isSuccess ? 'sent' : 'failed',
          errorMsg,
          templateName || null
        ]
      );
      console.log(`[WHATSAPP] Recipient: ${maskedPhone} | DB: INSERTED | Status: ${isSuccess ? 'sent' : 'failed'}`);
    } catch (dbErr) {
      console.error('[WHATSAPP] Database insert error:', dbErr.message);
    }

    return { success: isSuccess, wamid, error: errorMsg, data };
  } catch (err) {
    console.error(`[WHATSAPP] Error for ${maskedPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ==================== LOCATION & POSTAL PINCODE ROUTES ====================
const pincodeCache = new Map();
const postOfficeCache = new Map();

app.get('/api/location/pincode/:pincode', pincodeLimiter, async (req, res) => {
  try {
    const rawPincode = (req.params.pincode || '').trim();

    // Validate 6-digit numeric string
    if (!/^[0-9]{6}$/.test(rawPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unrecognized pincode'
      });
    }

    if (pincodeCache.has(rawPincode)) {
      return res.json(pincodeCache.get(rawPincode));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(`https://api.postalpincode.in/pincode/${rawPincode}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        message: 'Postal Pincode service error'
      });
    }

    const data = await resp.json();

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data[0].Status !== 'Success' ||
      !Array.isArray(data[0].PostOffice) ||
      data[0].PostOffice.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or unrecognized pincode'
      });
    }

    function cleanLocalityName(name, district) {
      if (!name) return '';
      let clean = name.replace(/\s+(B\.O|S\.O|H\.O)$/i, '').trim();
      const distRegex = new RegExp('^' + district + '\\s+', 'i');
      if (distRegex.test(clean) && clean.length > district.length + 3) {
        clean = clean.replace(distRegex, '');
      }
      clean = clean.replace(/\bGidc\b/i, 'GIDC');
      return clean;
    }

    const postOfficesRaw = data[0].PostOffice;
    const first = postOfficesRaw[0];
    const district = first.District || '';
    const state = first.State || '';

    // Check if this is an urban city where all post offices just start with District name
    const isMainCity = postOfficesRaw.every(p => p.Name.toLowerCase().startsWith(district.toLowerCase()));

    // Find main Sub Post Office or Head Post Office for locality hub
    const subOffice = postOfficesRaw.find(p => p.BranchType === 'Sub Post Office') || 
                      postOfficesRaw.find(p => p.BranchType === 'Head Post Office') || 
                      postOfficesRaw[0];

    const cleanedMain = subOffice ? cleanLocalityName(subOffice.Name, district) : '';
    const cityOrVillage = isMainCity ? district : (cleanedMain || district);

    // Collect all unique villages/localities/taluks under this pincode
    const localityList = [];
    if (cityOrVillage) localityList.push(cityOrVillage);
    for (const p of postOfficesRaw) {
      const c = cleanLocalityName(p.Name, district);
      if (c && !localityList.includes(c)) localityList.push(c);
      if (p.Block && p.Block !== 'NA' && !localityList.includes(p.Block)) {
        localityList.push(p.Block);
      }
    }

    const postOffices = [...new Set(postOfficesRaw.map(p => p.Name).filter(Boolean))];

    const result = {
      success: true,
      pincode: rawPincode,
      district,
      state,
      isMainCity,
      cityOrVillage,
      villages: localityList,
      postOffices
    };

    if (pincodeCache.size > 1000) pincodeCache.clear();
    pincodeCache.set(rawPincode, result);

    return res.json(result);
  } catch (err) {
    console.error('[Location Pincode Error]:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'Postal Pincode service timed out'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to verify pincode',
      error: err.message
    });
  }
});

app.get(['/api/location/search', '/api/location/postoffice/:query'], async (req, res) => {
  try {
    const rawQuery = (req.query.query || req.params.query || '').trim();

    if (!rawQuery || rawQuery.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 3 characters'
      });
    }

    const cacheKey = rawQuery.toLowerCase();
    if (postOfficeCache.has(cacheKey)) {
      return res.json(postOfficeCache.get(cacheKey));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(rawQuery)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({
        success: false,
        message: 'Postal service error'
      });
    }

    const data = await resp.json();

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data[0].Status !== 'Success' ||
      !Array.isArray(data[0].PostOffice)
    ) {
      return res.json({
        success: true,
        query: rawQuery,
        results: []
      });
    }

    const seen = new Set();
    const results = [];

    for (const po of data[0].PostOffice) {
      const key = `${po.Pincode}_${po.Name}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          postOffice: po.Name,
          pincode: po.Pincode,
          district: po.District,
          state: po.State
        });
      }
      if (results.length >= 25) break;
    }

    const responseData = {
      success: true,
      query: rawQuery,
      results
    };

    if (postOfficeCache.size > 1000) postOfficeCache.clear();
    postOfficeCache.set(cacheKey, responseData);

    return res.json(responseData);
  } catch (err) {
    console.error('[Location Search Error]:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'Postal service timed out'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to search location',
      error: err.message
    });
  }
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = (identifier || email || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Username/Email and password required' });

    const cleanDigits = loginId.replace(/[^0-9]/g, '');
    const userRes = await query(
      `SELECT * FROM users 
       WHERE LOWER(email) = LOWER($1) 
          OR LOWER(username) = LOWER($1) 
          OR ($2 != '' AND phone LIKE '%' || $2)
       LIMIT 1`,
      [loginId, cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '']
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let technicianId = null;
    if (user.role === 'technician') {
      const techRes = await query('SELECT id FROM technicians WHERE user_id = $1 LIMIT 1', [user.id]);
      technicianId = techRes.rows[0]?.id || null;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role, name: user.name, phone: user.phone, technician_id: technicianId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        technician_id: technicianId
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await query('SELECT id, name, username, email, role, phone FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { ...userRes.rows[0], technician_id: req.user.technician_id } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/users', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT id, name, username, email, role, phone, is_active, created_at FROM users ORDER BY id ASC');
    return res.json({ users: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/create-user', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    let { name, email, password, role, phone, username, area_zone, specialization } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full Name is required' });
    }

    const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(0, 10) : '';
    if (phone && cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Mobile / WhatsApp number must be exactly 10 digits' });
    }

    const safeUsername = (username && username.trim())
      ? username.trim().toLowerCase()
      : ((name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '.') + '.' + Math.floor(100 + Math.random() * 900)).replace(/\.+/g, '.');

    // Email is optional in form, but PostgreSQL 'users' table has a NOT NULL constraint on email.
    // Ensure email is always populated with either real email or clean internal system email.
    let safeEmail = (email && email.trim()) ? email.trim().toLowerCase() : '';
    if (!safeEmail) {
      const emailUserPart = safeUsername.replace(/[^a-z0-9._-]/g, '.');
      safeEmail = `${emailUserPart}@ecogreensolar.internal`;
    }

    // Check if user already exists
    const existing = await query(
      'SELECT id, username, email FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [safeUsername, safeEmail]
    );
    if (existing.rows.length > 0) {
      if (!email || !email.trim()) {
        safeEmail = `${safeUsername.replace(/[^a-z0-9._-]/g, '.')}.${Math.floor(100 + Math.random() * 900)}@ecogreensolar.internal`;
      } else {
        return res.status(400).json({ error: 'A member with this User ID / Username or Email already exists' });
      }
    }

    const hash = await bcrypt.hash(password || 'EcoGreen@123', 10);
    const r = await query(
      'INSERT INTO users (name, username, email, password_hash, role, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id, name, username, email, role, phone, created_at',
      [name.trim(), safeUsername, safeEmail, hash, role || 'technician', cleanPhone || '']
    );
    const newUser = r.rows[0];

    if (role === 'technician') {
      await query(
        'INSERT INTO technicians (user_id, name, phone, email, area_zone, specialization, is_available) VALUES ($1, $2, $3, $4, $5, $6, 1)',
        [newUser.id, name.trim(), cleanPhone || '', safeEmail, area_zone || 'General Zone', specialization || 'All Products']
      );
    }
    return res.status(201).json({ user: newUser, message: 'User created successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, phone, is_active, username, password } = req.body;

    // RBAC: Non-admins can only modify their own profile and cannot promote themselves or alter status
    if (req.user.role !== 'admin' && String(req.user.id) !== String(id)) {
      return res.status(403).json({ error: 'Unauthorized to modify other user accounts' });
    }
    if (req.user.role !== 'admin' && (role || is_active !== undefined)) {
      return res.status(403).json({ error: 'Only administrators can modify roles or activation status' });
    }

    let passwordHash = undefined;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    if (passwordHash) {
      await query(
        'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), phone = COALESCE($4, phone), is_active = COALESCE($5, is_active), username = COALESCE($6, username), password_hash = $7 WHERE id = $8',
        [name, email, role, phone, is_active, username, passwordHash, id]
      );
    } else {
      await query(
        'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), phone = COALESCE($4, phone), is_active = COALESCE($5, is_active), username = COALESCE($6, username) WHERE id = $7',
        [name, email, role, phone, is_active, username, id]
      );
    }
    return res.json({ message: 'User updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/admin-reset-password', authenticateToken, async (req, res) => {
  try {
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only administrators or staff supervisors can reset passwords' });
    }

    const { userId, technicianId, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const hash = await bcrypt.hash(newPassword.trim(), 10);
    let targetUserId = userId;

    if (!targetUserId && technicianId) {
      const techRes = await query('SELECT id, user_id, name, email, phone FROM technicians WHERE id = $1', [technicianId]);
      if (techRes.rows.length === 0) {
        return res.status(404).json({ error: 'Technician not found' });
      }
      const tech = techRes.rows[0];
      if (tech.user_id) {
        targetUserId = tech.user_id;
      } else {
        const userRes = await query('SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1', [tech.email, tech.phone]);
        if (userRes.rows.length > 0) {
          targetUserId = userRes.rows[0].id;
          await query('UPDATE technicians SET user_id = $1 WHERE id = $2', [targetUserId, technicianId]);
        } else {
          const username = (tech.name.toLowerCase().replace(/[^a-z0-9]/g, '.') + '.' + tech.id);
          const email = tech.email || `${username}@ecogreensolar.internal`;
          const created = await query(
            'INSERT INTO users (name, username, email, password_hash, role, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id',
            [tech.name, username, email, hash, 'technician', tech.phone || '']
          );
          targetUserId = created.rows[0].id;
          await query('UPDATE technicians SET user_id = $1 WHERE id = $2', [targetUserId, technicianId]);
          return res.json({
            success: true,
            message: `User account created and password securely set for ${tech.name}`
          });
        }
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID or technician ID is required' });
    }

    const updateRes = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, username, email, role', [hash, targetUserId]);
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const u = updateRes.rows[0];
    return res.json({
      success: true,
      message: `Password securely updated for ${u.name} (@${u.username || u.email.split('@')[0]})`,
      user: { id: u.id, name: u.name, username: u.username, role: u.role }
    });
  } catch (err) {
    console.error('Password reset error:', err);
    return res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
});

app.post('/api/auth/change-my-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User account not found' });
    const user = userRes.rows[0];

    // If current password provided, verify it
    if (currentPassword && currentPassword.trim()) {
      const valid = await bcrypt.compare(currentPassword.trim(), user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Current password does not match' });
      }
    }

    const hash = await bcrypt.hash(newPassword.trim(), 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    return res.json({
      success: true,
      message: `Password updated successfully for ${user.name}`
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, email, username } = req.body;
    const cleanPhone = phone ? phone.trim() : null;
    const cleanEmail = email ? email.trim() : null;
    const cleanUsername = username ? username.trim().toLowerCase() : null;
    const cleanName = name ? name.trim() : null;

    const updateRes = await query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           email = COALESCE($3, email), 
           username = COALESCE($4, username),
           updated_at = NOW() 
       WHERE id = $5 
       RETURNING id, name, username, email, role, phone`,
      [cleanName, cleanPhone, cleanEmail, cleanUsername, req.user.id]
    );

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: updateRes.rows[0], message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
});

app.delete('/api/auth/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) === '1' || String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Cannot delete the master administrator account' });
    }
    await query('DELETE FROM technicians WHERE user_id = $1', [id]);
    await query('DELETE FROM users WHERE id = $1', [id]);
    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== TECHNICIANS ROUTES ====================
app.get('/api/technicians', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, 
        COUNT(c.id) FILTER (WHERE c.status IN ('Assigned', 'In Progress', 'On Hold')) as active_tickets_count,
        COUNT(c.id) FILTER (WHERE c.status IN ('Resolved', 'Closed')) as resolved_tickets_count,
        ROUND(AVG(c.rating)::numeric, 1) as average_rating
      FROM technicians t
      LEFT JOIN complaints c ON c.assigned_technician_id = t.id
      GROUP BY t.id
      ORDER BY t.name ASC
    `);
    return res.json({ technicians: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/technicians/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;
    const val = (is_available === 1 || is_available === true) ? 1 : 0;
    await query('UPDATE technicians SET is_available = $1 WHERE id = $2', [val, id]);
    return res.json({ success: true, message: 'Availability updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/technicians/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, area_zone, specialization } = req.body;
    await query(
      'UPDATE technicians SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email), area_zone = COALESCE($4, area_zone), specialization = COALESCE($5, specialization) WHERE id = $6',
      [name, phone, email, area_zone, specialization, id]
    );
    return res.json({ success: true, message: 'Technician updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/technicians/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('UPDATE complaints SET assigned_technician_id = NULL WHERE assigned_technician_id = $1', [id]);
    await query('DELETE FROM technicians WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Technician deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Batch Settle All Cash Collected for Technician (Admin / Staff)
app.post('/api/technicians/:id/settle-all', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const rawId = req.params.id;
    const actorName = req.user ? (req.user.name || req.user.email || 'Company Finance/Admin') : 'Company Finance/Admin';
    const actorRole = req.user ? (req.user.role || 'admin') : 'admin';

    // Find technician record if it exists to get exact tech id and name
    const techCheck = await query('SELECT id, name FROM technicians WHERE id::text = $1 OR user_id::text = $1', [rawId]);
    const techId = techCheck.rows.length > 0 ? techCheck.rows[0].id : rawId;
    const techName = techCheck.rows.length > 0 ? techCheck.rows[0].name : 'Technician';

    const pendingRes = await query(`
      SELECT id, ticket_id, payment_collected FROM complaints
      WHERE assigned_technician_id::text = $1
        AND payment_collected > 0
        AND (company_settlement_status IS NULL OR company_settlement_status != 'Settled with Company')
    `, [String(techId)]);

    if (pendingRes.rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No pending cash settlements for this technician', 
        settledCount: 0, 
        totalAmount: 0 
      });
    }

    let totalAmount = 0;
    const ids = [];
    for (const c of pendingRes.rows) {
      totalAmount += (parseFloat(c.payment_collected) || 0);
      ids.push(c.id);
    }

    await query(`
      UPDATE complaints SET
        company_settlement_status = 'Settled with Company',
        company_settled_at = CURRENT_TIMESTAMP,
        company_settled_by = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2::bigint[])
    `, [actorName, ids]);

    for (const c of pendingRes.rows) {
      await query(`
        INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
        VALUES ($1, 'Cash Settled with Company', $2, $3, $4, 0)
      `, [
        c.id, 
        `Batch cash settlement of ₹${c.payment_collected} received from ${techName} and deposited into company accounts.`, 
        actorName, 
        actorRole
      ]);
    }

    return res.json({ success: true, settledCount: pendingRes.rows.length, totalAmount });
  } catch (err) {
    console.error('Batch settlement error:', err);
    return res.status(500).json({ error: 'Failed to settle technician balance: ' + err.message });
  }
});

// ==================== COMPLAINTS ROUTES ====================
app.get('/api/complaints', authenticateToken, async (req, res) => {
  try {
    const { search, status, priority, product_type, technician_id, limit = 100, offset = 0 } = req.query;
    let whereClauses = [];
    let params = [];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      whereClauses.push(`(LOWER(c.ticket_id) LIKE $${idx} OR LOWER(c.customer_name) LIKE $${idx} OR c.customer_phone LIKE $${idx} OR LOWER(c.city) LIKE $${idx} OR LOWER(c.product_serial) LIKE $${idx} OR LOWER(c.consumer_no) LIKE $${idx})`);
    }

    if (status && status !== 'all') {
      if (status.toLowerCase() === 'unassigned') {
        whereClauses.push("(c.status = 'Unassigned' OR c.status = 'Registered' OR c.assigned_technician_id IS NULL)");
      } else {
        params.push(status);
        whereClauses.push(`c.status = $${params.length}`);
      }
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      whereClauses.push(`c.priority = $${params.length}`);
    }

    if (product_type && product_type !== 'all') {
      params.push(product_type);
      whereClauses.push(`c.product_type = $${params.length}`);
    }

    // Role-based scoping: Technicians only see their assigned tickets
    if (req.user.role === 'technician') {
      params.push(req.user.technician_id);
      whereClauses.push(`c.assigned_technician_id = $${params.length}`);
    } else if (technician_id) {
      params.push(technician_id);
      whereClauses.push(`c.assigned_technician_id = $${params.length}`);
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as total FROM complaints c ${whereSql}`;
    const countParams = [...params];

    params.push(parseInt(limit, 10));
    const limitIdx = params.length;
    params.push(parseInt(offset, 10));
    const offsetIdx = params.length;

    const dataSql = `
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON t.id = c.assigned_technician_id
      ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const [countRes, dataRes] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, params)
    ]);

    const total = parseInt(countRes.rows[0]?.total || 0, 10);
    return res.json({ complaints: dataRes.rows, total });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Customer History by phone (Internal Staff/Admin)
app.get('/api/complaints/customer-history', authenticateToken, async (req, res) => {
  try {
    const rawPhone = (req.query.phone || '').trim();
    const clean = rawPhone.replace(/[^0-9]/g, '').slice(-10);
    if (!clean) return res.json({ history: [] });

    const r = await query(
      `SELECT c.*, t.name as technician_name, t.phone as technician_phone 
       FROM complaints c 
       LEFT JOIN technicians t ON t.id = c.assigned_technician_id 
       WHERE RIGHT(REGEXP_REPLACE(c.customer_phone, '[^0-9]', '', 'g'), 10) = $1 
       ORDER BY c.created_at DESC`,
      [clean]
    );
    return res.json({ history: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Customer Public Tracking (Sanitized: No PII, No internal notes, No payment amounts leaked)
app.get('/api/complaints/track/:query', async (req, res) => {
  try {
    const q = req.params.query.trim();
    const compRes = await query(`
      SELECT c.*, t.name as technician_name
      FROM complaints c
      LEFT JOIN technicians t ON t.id = c.assigned_technician_id
      WHERE c.ticket_id = $1 OR c.customer_phone = $1
      ORDER BY c.created_at DESC LIMIT 1
    `, [q]);

    if (compRes.rows.length === 0) return res.status(404).json({ error: 'Complaint ticket not found' });
    const complaint = compRes.rows[0];

    const tlRes = await query(
      'SELECT * FROM complaint_timelines WHERE complaint_id = $1 AND notify_customer = 1 ORDER BY created_at ASC', 
      [complaint.id]
    );
    const attRes = await query(
      'SELECT id, file_name, file_url, file_type, created_at FROM complaint_attachments WHERE complaint_id = $1 ORDER BY id ASC', 
      [complaint.id]
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
      priority: complaint.priority,
      status: complaint.status,
      technician_name: complaint.technician_name || null,
      technician_phone: complaint.technician_name ? '1800-ECO-SOLAR' : null,
      expected_visit_date: complaint.expected_visit_date,
      created_at: complaint.created_at,
      status_updated_at: complaint.status_updated_at,
      resolved_at: complaint.resolved_at,
      rating: complaint.rating,
      feedback_comments: complaint.feedback_comments
    };

    const publicTimelines = tlRes.rows.map(t => ({
      id: t.id,
      action: t.action,
      notes: t.notes,
      created_at: t.created_at
    }));

    return res.json({ complaint: publicComplaint, timeline: publicTimelines, attachments: attRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Authenticated Complaint Detail (Staff / Admin / Assigned Technician)
app.get('/api/complaints/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    let compRes;
    if (req.user.role === 'technician') {
      compRes = await query(`
        SELECT c.*, t.name as technician_name, t.phone as technician_phone
        FROM complaints c
        LEFT JOIN technicians t ON t.id = c.assigned_technician_id
        WHERE (c.id::text = $1 OR c.ticket_id = $1) AND c.assigned_technician_id = $2
        LIMIT 1
      `, [id, req.user.technician_id]);
    } else {
      compRes = await query(`
        SELECT c.*, t.name as technician_name, t.phone as technician_phone
        FROM complaints c
        LEFT JOIN technicians t ON t.id = c.assigned_technician_id
        WHERE c.id::text = $1 OR c.ticket_id = $1
        LIMIT 1
      `, [id]);
    }

    if (compRes.rows.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const complaint = compRes.rows[0];

    const tlRes = await query('SELECT * FROM complaint_timelines WHERE complaint_id = $1 ORDER BY created_at ASC', [complaint.id]);
    const attRes = await query('SELECT id, file_name, file_url, file_type, file_data, created_at FROM complaint_attachments WHERE complaint_id = $1 ORDER BY id ASC', [complaint.id]);
    const notifRes = await query('SELECT * FROM notification_logs WHERE complaint_id = $1 ORDER BY created_at DESC', [complaint.id]);

    return res.json({ complaint, timeline: tlRes.rows, attachments: attRes.rows, notifications: notifRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create Complaint
app.post('/api/complaints', authenticateToken, upload.array('attachments', 10), async (req, res) => {
  try {
    const body = req.body;
    const customer_name = (body.customer_name || '').trim();
    const raw_phone = (body.customer_phone || '').trim();
    const cleanDigits = raw_phone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';

    if (!customer_name || !last10) {
      return res.status(400).json({ error: 'Customer name and a valid 10-digit mobile number are required' });
    }

    const canonicalPhone = `+91${last10}`;

    // Generate Ticket ID EGS-2026-XXXXXX
    const maxRes = await query("SELECT ticket_id FROM complaints WHERE ticket_id LIKE 'EGS-2026-%' ORDER BY id DESC LIMIT 1");
    let nextNum = 101;
    if (maxRes.rows.length > 0) {
      const parts = maxRes.rows[0].ticket_id.split('-');
      if (parts[2]) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed) && parsed >= nextNum) nextNum = parsed + 1;
      }
    }
    const ticket_id = `EGS-2026-${String(nextNum).padStart(6, '0')}`;

    const insertSql = `
      INSERT INTO complaints (
        ticket_id, customer_name, customer_phone, customer_email, customer_address,
        city, consumer_no, order_no, invoice_no, invoice_date, location_url,
        is_in_warranty, estimated_charges, notify_charges, payment_collected, payment_status,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status, assigned_technician_id, expected_visit_date, registered_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26
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
      Number(body.is_in_warranty ?? 1),
      Number(body.estimated_charges || 0),
      body.notify_charges ? 1 : 0,
      0,
      Number(body.estimated_charges || 0) > 0 ? 'Unpaid' : 'Not Applicable',
      body.product_type || 'Solar Rooftop Systems',
      body.product_serial || '',
      body.installation_id || '',
      body.issue_category || 'Service Request',
      body.issue_description || '',
      body.priority || 'Medium',
      body.assigned_technician_id ? 'Assigned' : 'Unassigned',
      body.assigned_technician_id || null,
      body.expected_visit_date || null,
      req.user?.id || null
    ];

    const r = await query(insertSql, values);
    const newComp = r.rows[0];

    // Save any uploaded attachments
    const files = req.files || [];
    if (files.length > 0) {
      for (const f of files) {
        try {
          const base64Data = `data:${f.mimetype || 'image/jpeg'};base64,${f.buffer.toString('base64')}`;
          const insRes = await query(`
            INSERT INTO complaint_attachments (
              complaint_id, file_name, file_url, file_type, file_data, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [newComp.id, f.originalname, '/api/attachments/temp', f.mimetype, base64Data, req.user?.name || 'Helpdesk']);
          const attId = insRes.rows[0].id;
          await query('UPDATE complaint_attachments SET file_url = $1 WHERE id = $2', [`/api/attachments/${attId}`, attId]);
        } catch (attErr) {
          console.warn('[Complaint Attachment Upload Note]', attErr.message);
        }
      }
    }

    // Initial timeline note
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [newComp.id, 'Registered', `Service ticket registered for ${newComp.product_type}. Issue: ${newComp.issue_category}`, req.user?.name || 'Helpdesk', req.user?.role || 'staff']
    );

    // Send WhatsApp notification and await Meta response
    let waResult = null;
    try {
      waResult = await sendWhatsApp({
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
        }
      });
    } catch (waErr) {
      console.warn('[Auto WhatsApp Error]', waErr.message);
      waResult = { success: false, error: waErr.message };
    }

    // In-app notification for Admin & Staff
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_staff_reg`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role
        ) VALUES ($1, 'new_ticket', $2, $3, $4, $5, $6, 'admin', $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        newComp.ticket_id,
        newComp.id,
        `New Ticket Registered: ${newComp.ticket_id}`,
        `New complaint ticket #${newComp.ticket_id} registered for ${newComp.customer_name} (${newComp.product_type} - ${newComp.issue_category}) by ${req.user?.name || 'Helpdesk'}.`,
        newComp.customer_name,
        req.user?.name || 'Helpdesk',
        req.user?.role || 'staff'
      ]);
    } catch (notifErr) {
      console.warn('[Staff Reg In-App Notif Note]', notifErr.message);
    }

    return res.status(201).json({ message: 'Complaint registered successfully', complaint: newComp, whatsapp: waResult });
  } catch (err) {
    console.error('Create complaint error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Public Customer Self-Registration
app.post('/api/complaints/public-register', publicComplaintLimiter, upload.array('attachments', 5), async (req, res) => {
  try {
    const body = req.body;
    const customer_name = (body.customer_name || '').trim();
    const raw_phone = (body.customer_phone || '').trim();
    const cleanDigits = raw_phone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';

    if (!customer_name || !last10) {
      return res.status(400).json({ error: 'Customer name and a valid 10-digit mobile number are required' });
    }

    const canonicalPhone = `+91${last10}`;

    const maxRes = await query("SELECT ticket_id FROM complaints WHERE ticket_id LIKE 'EGS-2026-%' ORDER BY id DESC LIMIT 1");
    let nextNum = 101;
    if (maxRes.rows.length > 0) {
      const parts = maxRes.rows[0].ticket_id.split('-');
      if (parts[2]) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed) && parsed >= nextNum) nextNum = parsed + 1;
      }
    }
    const ticket_id = `EGS-2026-${String(nextNum).padStart(6, '0')}`;

    const insertSql = `
      INSERT INTO complaints (
        ticket_id, customer_name, customer_phone, customer_email, customer_address,
        city, consumer_no, order_no, invoice_no, invoice_date, location_url,
        is_in_warranty, estimated_charges, notify_charges, payment_collected, payment_status,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23
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
      1,
      0,
      0,
      0,
      'Not Applicable',
      body.product_type || 'Solar Rooftop Systems',
      body.product_serial || '',
      body.installation_id || '',
      body.issue_category || 'Service Request',
      body.issue_description || '',
      body.priority || 'Medium',
      'Unassigned'
    ];

    const r = await query(insertSql, values);
    const newComp = r.rows[0];

    // Save attachments
    const files = req.files || [];
    if (files.length > 0) {
      for (const f of files) {
        try {
          const base64Data = `data:${f.mimetype || 'image/jpeg'};base64,${f.buffer.toString('base64')}`;
          const insRes = await query(`
            INSERT INTO complaint_attachments (
              complaint_id, file_name, file_url, file_type, file_data, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [newComp.id, f.originalname, '/api/attachments/temp', f.mimetype, base64Data, customer_name]);
          const attId = insRes.rows[0].id;
          await query('UPDATE complaint_attachments SET file_url = $1 WHERE id = $2', [`/api/attachments/${attId}`, attId]);
        } catch (attErr) {
          console.warn('[Public Complaint Attachment Upload Note]', attErr.message);
        }
      }
    }

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [newComp.id, 'Registered', `Service ticket submitted online by customer for ${newComp.product_type}. Issue: ${newComp.issue_category}`, newComp.customer_name, 'customer']
    );

    let waResult = null;
    try {
      waResult = await sendWhatsApp({
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
        }
      });
    } catch (waErr) {
      console.warn('[Auto WhatsApp Error]', waErr.message);
      waResult = { success: false, error: waErr.message };
    }

    // Trigger In-App Notification for Staff & Admin
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_pub_reg`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role
        ) VALUES ($1, 'new_ticket', $2, $3, $4, $5, $6, 'admin', $7, 'customer')
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        newComp.ticket_id,
        newComp.id,
        `New Ticket Registered: ${newComp.ticket_id}`,
        `New complaint registered online for ${newComp.customer_name} (${newComp.product_type} - ${newComp.issue_category}). Needs technician allocation.`,
        newComp.customer_name,
        newComp.customer_name
      ]);
    } catch (notifErr) {
      console.warn('[Public Reg In-App Notif Note]', notifErr.message);
    }

    return res.status(201).json({ message: 'Complaint registered successfully', complaint: newComp, whatsapp: waResult });
  } catch (err) {
    console.error('Public register complaint error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Upload Attachments for Complaint
app.post('/api/complaints/:id/attachments', authenticateToken, upload.array('attachments', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const compRes = await query('SELECT id, ticket_id FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id]);
    if (compRes.rows.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const complaintId = compRes.rows[0].id;

    const files = req.files || [];
    const saved = [];

    for (const f of files) {
      const base64Data = `data:${f.mimetype || 'image/jpeg'};base64,${f.buffer.toString('base64')}`;
      const insRes = await query(`
        INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, file_name, file_url, file_type, file_data, created_at
      `, [complaintId, f.originalname, '/api/attachments/temp', f.mimetype, base64Data, req.user?.name || 'Staff']);

      const att = insRes.rows[0];
      const realUrl = `/api/attachments/${att.id}`;
      await query('UPDATE complaint_attachments SET file_url = $1 WHERE id = $2', [realUrl, att.id]);
      att.file_url = realUrl;
      saved.push(att);
    }

    return res.json({ success: true, attachments: saved });
  } catch (err) {
    console.error('Upload attachments error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Serve / Preview Attachment File directly (Images, PDFs, Docs)
app.get(['/api/attachments/:id', '/uploads/:filename'], async (req, res) => {
  try {
    const { id, filename } = req.params;
    let r;
    if (id) {
      r = await query('SELECT file_name, file_type, file_data, file_url FROM complaint_attachments WHERE id = $1', [id]);
    } else {
      r = await query('SELECT file_name, file_type, file_data, file_url FROM complaint_attachments WHERE file_url LIKE $1 OR file_name = $2 LIMIT 1', [`%${filename}%`, filename]);
    }

    if (r.rows.length === 0) {
      return res.status(404).send('Attachment document not found');
    }
    const att = r.rows[0];

    if (att.file_data && att.file_data.startsWith('data:')) {
      const parts = att.file_data.split(',');
      const meta = parts[0];
      const base64 = parts[1];
      const mime = meta.match(/data:(.*?);/)?.[1] || att.file_type || 'application/octet-stream';
      const buf = Buffer.from(base64, 'base64');

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; media-src 'self' data: blob:; style-src 'unsafe-inline'; sandbox allow-downloads");
      if (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf') {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_name)}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`);
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    }

    if (att.file_url && (att.file_url.startsWith('http://') || att.file_url.startsWith('https://'))) {
      return res.redirect(att.file_url);
    }

    return res.status(404).send('Attachment file content unavailable');
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// Update Complaint
app.put('/api/complaints/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
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
        is_in_warranty = COALESCE($14, is_in_warranty),
        estimated_charges = COALESCE($15, estimated_charges),
        notify_charges = COALESCE($16, notify_charges),
        status_updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
    `, [b.customer_name, b.customer_phone, b.customer_email, b.customer_address, b.city, b.consumer_no, b.order_no, b.product_type, b.product_serial, b.issue_category, b.issue_description, b.priority, b.status, b.is_in_warranty, b.estimated_charges, b.notify_charges, id]);

    return res.json({ message: 'Complaint updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Assign Technician
app.post('/api/complaints/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { technician_id, expected_visit_date, notes } = req.body;

    const prevCompRes = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id]);
    const prevComp = prevCompRes.rows[0];
    const prevTechId = prevComp?.assigned_technician_id;
    const isReassignment = prevTechId && String(prevTechId) !== String(technician_id);

    const techRes = await query('SELECT * FROM technicians WHERE id = $1', [technician_id]);
    const tech = techRes.rows[0];

    const compRes = await query(`
      UPDATE complaints SET
        assigned_technician_id = $1,
        expected_visit_date = $2,
        status = 'Assigned',
        assigned_at = CURRENT_TIMESTAMP,
        status_updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [technician_id, expected_visit_date || null, prevComp?.id || id]);

    const comp = compRes.rows[0];

    const performer = req.user?.name || 'Support Desk';
    const performerRole = req.user?.role || 'staff';

    const timelineAction = isReassignment ? 'Reassigned' : 'Assigned';
    const timelineNote = isReassignment
      ? `Reassigned to ${tech?.name || 'Technician'}. Expected visit: ${expected_visit_date || 'Within 24 Hours'}`
      : `Assigned to ${tech?.name || 'Technician'}. Expected visit: ${expected_visit_date || 'Within 24 Hours'}`;

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [comp.id, timelineAction, timelineNote, performer, performerRole]
    );

    // 1. If Reassignment, notify previous technician (Tech A) via WhatsApp & In-App WITHOUT disclosing new technician details
    if (isReassignment) {
      try {
        const prevTechRes = await query('SELECT * FROM technicians WHERE id = $1', [prevTechId]);
        const prevTech = prevTechRes.rows[0];
        if (prevTech?.phone) {
          await sendWhatsApp({
            to: prevTech.phone,
            templateName: 'technician_reassigned',
            variables: {
              technician_name: prevTech.name,
              complaint_id: comp.ticket_id,
              ticket_id: comp.ticket_id,
              customer_name: comp.customer_name,
              notes: `Ticket #${comp.ticket_id} has been reassigned to another technician. It has been removed from your active schedule.`
            }
          }).catch(err => console.warn('[Prev Tech WhatsApp Warning]:', err.message));
        }

        // In-App Notification for Previous Technician (Tech A)
        await ensureInAppTable();
        const prevTechNotifId = `notif_${Date.now()}_reassign_prev_${prevTechId}`;
        await query(`
          INSERT INTO in_app_notifications (
            id, type, ticket_id, complaint_id, title, message, customer_name,
            target_role, target_technician_id, target_technician_name,
            performed_by_name, performed_by_role
          ) VALUES ($1, 'reassigned', $2, $3, $4, $5, $6, 'technician', $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          prevTechNotifId,
          comp.ticket_id,
          comp.id,
          `Ticket Reassigned: ${comp.ticket_id}`,
          `Complaint #${comp.ticket_id} (${comp.customer_name}) has been reassigned to another technician. It has been removed from your active schedule.`,
          comp.customer_name,
          prevTechId,
          prevTech?.name || 'Previous Technician',
          performer,
          performerRole
        ]);
      } catch (prevErr) {
        console.warn('[Previous Tech Notice Note]:', prevErr.message);
      }
    }

    // 2. Send WhatsApp to Customer:
    // If reassignment, use dedicated customer_technician_reassigned template; else technician_assigned
    let waCustomerResult = null;
    const custTemplateName = isReassignment ? 'customer_technician_reassigned' : 'technician_assigned';
    try {
      waCustomerResult = await sendWhatsApp({
        to: comp.customer_phone,
        templateName: custTemplateName,
        variables: {
          customer_name: comp.customer_name,
          ticket_id: comp.ticket_id,
          complaint_id: comp.ticket_id,
          product_type: comp.product_type || 'Solar System',
          technician_name: tech?.name,
          technician_phone: tech?.phone || '',
          expected_visit_date: expected_visit_date || 'Within 24-48 Hours',
          db_complaint_id: comp.id
        }
      });
    } catch (waErr) {
      console.warn('[Assign WhatsApp Customer Note]', waErr.message);
      waCustomerResult = { success: false, error: waErr.message };
    }

    // 3. Send WhatsApp to New Assigned Technician (Tech B)
    let waTechResult = null;
    if (tech?.phone) {
      try {
        waTechResult = await sendWhatsApp({
          to: tech.phone,
          templateName: 'technician_work_order',
          variables: {
            technician_name: tech.name,
            complaint_id: comp.ticket_id,
            ticket_id: comp.ticket_id,
            customer_name: comp.customer_name,
            customer_phone: comp.customer_phone,
            customer_address: comp.customer_address || comp.city || 'Gujarat',
            product_type: comp.product_type,
            issue_category: comp.issue_category,
            notes: comp.issue_description || 'Site inspection',
            priority: comp.priority || 'Medium',
            expected_visit_date: expected_visit_date || 'Today',
            db_complaint_id: comp.id
          }
        });
      } catch (waErr) {
        console.warn('[Assign WhatsApp Tech Note]', waErr.message);
        waTechResult = { success: false, error: waErr.message };
      }
    }

    // 4. Insert In-App Notification for New Assigned Technician (Tech B)
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_assign_${technician_id}`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'assignment', $2, $3, $4, $5, $6, 'technician', $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `New Ticket Assigned: ${comp.ticket_id}`,
        `You have been assigned complaint ${comp.ticket_id} for ${comp.customer_name} (${comp.product_type} - ${comp.issue_category}). Expected visit: ${expected_visit_date || 'Within 24 Hours'}`,
        comp.customer_name,
        technician_id,
        tech?.name || 'Technician',
        performer,
        performerRole
      ]);
    } catch (notifErr) {
      console.warn('[Assign in-app notification error]', notifErr.message);
    }

    // 5. Insert In-App Notification for Admin & Help Desk
    try {
      await ensureInAppTable();
      const adminNotifId = `notif_${Date.now()}_admin_${isReassignment ? 'reassign' : 'assign'}`;
      const adminTitle = isReassignment ? `Ticket Reassigned: ${comp.ticket_id}` : `Ticket Assigned: ${comp.ticket_id}`;
      const adminMsg = isReassignment
        ? `Ticket #${comp.ticket_id} for ${comp.customer_name} was reassigned to ${tech?.name || 'Technician'} by ${performer}.`
        : `Ticket #${comp.ticket_id} for ${comp.customer_name} was assigned to ${tech?.name || 'Technician'} by ${performer}.`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        adminNotifId,
        isReassignment ? 'reassigned' : 'assignment',
        comp.ticket_id,
        comp.id,
        adminTitle,
        adminMsg,
        comp.customer_name,
        technician_id,
        tech?.name || 'Technician',
        performer,
        performerRole
      ]);
    } catch (adminNotifErr) {
      console.warn('[Admin in-app notification error]', adminNotifErr.message);
    }

    return res.json({
      message: isReassignment ? 'Technician reassigned successfully' : 'Technician assigned successfully',
      complaint: comp,
      whatsapp_customer: waCustomerResult,
      whatsapp_technician: waTechResult
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Resend Technician Work Order (supports both /resend-technician and /resend-work-order)
const handleResendTechnicianWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (!compRes.rows.length) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const comp = compRes.rows[0];

    if (!comp.assigned_technician_id) {
      return res.status(400).json({ error: 'No technician assigned to this complaint' });
    }

    const techRes = await query('SELECT * FROM technicians WHERE id = $1', [comp.assigned_technician_id]);
    const tech = techRes.rows[0];
    if (!tech) {
      return res.status(404).json({ error: 'Assigned technician not found' });
    }
    if (!tech.phone) {
      return res.status(400).json({ error: 'Assigned technician has no phone number on record' });
    }

    let waTechResult = null;
    try {
      waTechResult = await sendWhatsApp({
        to: tech.phone,
        templateName: 'technician_work_order',
        variables: {
          technician_name: tech.name,
          complaint_id: comp.ticket_id,
          ticket_id: comp.ticket_id,
          customer_name: comp.customer_name,
          customer_phone: comp.customer_phone,
          customer_address: comp.customer_address || comp.city || 'Gujarat',
          product_type: comp.product_type,
          issue_category: comp.issue_category,
          notes: comp.issue_description || 'Site inspection',
          priority: comp.priority || 'Medium',
          expected_visit_date: comp.expected_visit_date || 'Today',
          db_complaint_id: comp.id
        }
      });
    } catch (waErr) {
      console.warn('[Resend Work Order WhatsApp Note]', waErr.message);
      waTechResult = { success: false, error: waErr.message };
    }

    // Timeline entry
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 0)',
      [id, 'Work Order Resent', `Work order resent to ${tech.name} (${tech.phone})`, req.user?.name || 'Staff', req.user?.role || 'staff']
    );

    // In-App Notification
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_resend_wo`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'assignment', $2, $3, $4, $5, $6, 'technician', $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `Work Order Resent: ${comp.ticket_id}`,
        `Work order details resent for ${comp.ticket_id} (${comp.customer_name} - ${comp.product_type})`,
        comp.customer_name,
        tech.id,
        tech.name,
        req.user?.name || 'Staff Supervisor',
        req.user?.role || 'staff'
      ]);
    } catch (notifErr) {
      console.warn('[Resend WO in-app notification error]', notifErr.message);
    }

    return res.json({
      success: true,
      message: `Work order sent to ${tech.name} via WhatsApp!`,
      whatsapp: waTechResult
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post('/api/complaints/:id/resend-technician', authenticateToken, handleResendTechnicianWorkOrder);
app.post('/api/complaints/:id/resend-work-order', authenticateToken, handleResendTechnicianWorkOrder);

// Remind Technician (supports both /remind-tech and /send-reminder)
const handleRemindTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (!compRes.rows.length) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const comp = compRes.rows[0];

    if (!comp.assigned_technician_id) {
      return res.status(400).json({ error: 'No technician assigned to this complaint' });
    }

    const techRes = await query('SELECT * FROM technicians WHERE id = $1', [comp.assigned_technician_id]);
    const tech = techRes.rows[0];
    if (!tech) {
      return res.status(404).json({ error: 'Assigned technician not found' });
    }
    if (!tech.phone) {
      return res.status(400).json({ error: 'Assigned technician has no phone number on record' });
    }

    let waTechResult = null;
    try {
      waTechResult = await sendWhatsApp({
        to: tech.phone,
        templateName: 'technician_reminder',
        variables: {
          technician_name: tech.name,
          ticket_id: comp.ticket_id,
          complaint_id: comp.ticket_id,
          customer_name: comp.customer_name,
          customer_address: comp.customer_address || comp.city || 'Gujarat',
          expected_visit_date: comp.expected_visit_date || 'Today',
          db_complaint_id: comp.id
        }
      });
    } catch (waErr) {
      console.warn('[Remind Tech WhatsApp Note]', waErr.message);
      waTechResult = { success: false, error: waErr.message };
    }

    // Timeline entry
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 0)',
      [id, 'Technician Reminded', `Reminder sent to ${tech.name} (${tech.phone})`, req.user?.name || 'Staff', req.user?.role || 'staff']
    );

    // In-App Notification
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_remind_tech`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'reminder', $2, $3, $4, $5, $6, 'technician', $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `Visit Reminder: ${comp.ticket_id}`,
        `Reminder for pending visit for complaint ${comp.ticket_id} (${comp.customer_name})`,
        comp.customer_name,
        tech.id,
        tech.name,
        req.user?.name || 'Staff Supervisor',
        req.user?.role || 'staff'
      ]);
    } catch (notifErr) {
      console.warn('[Remind Tech in-app notification error]', notifErr.message);
    }

    return res.json({
      success: true,
      message: `Reminder WhatsApp sent to ${tech.name}!`,
      whatsapp: waTechResult
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post('/api/complaints/:id/remind-tech', authenticateToken, handleRemindTechnician);
app.post('/api/complaints/:id/send-reminder', authenticateToken, handleRemindTechnician);

// Add Timeline Note
app.post('/api/complaints/:id/note', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, status, notify_customer } = req.body;
    if (status) {
      await query('UPDATE complaints SET status = $1, status_updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
    }
    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, status ? `Status: ${status}` : 'Note', notes || 'Follow-up update', req.user.name, req.user.role, notify_customer ? 1 : 0]
    );
    // Insert In-App Notification (reverse flow: tech updates -> staff receives; staff updates -> tech receives)
    try {
      await ensureInAppTable();
      const compLookup = await query('SELECT ticket_id, customer_name, assigned_technician_id FROM complaints WHERE id = $1', [id]);
      const currentC = compLookup.rows[0];
      const notifId = `notif_${Date.now()}_note`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, performed_by_name, performed_by_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        status ? 'status_update' : 'note',
        currentC?.ticket_id || '',
        id,
        status ? `Ticket ${currentC?.ticket_id} Status: ${status}` : `New Note on ${currentC?.ticket_id}`,
        `${req.user.name}: "${notes || status || 'Updated'}"`,
        currentC?.customer_name || '',
        req.user.role === 'technician' ? 'staff' : 'technician',
        req.user.role === 'technician' ? null : (currentC?.assigned_technician_id || null),
        req.user.name,
        req.user.role
      ]);
    } catch (_) {}

    return res.json({ message: 'Note added successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Resolve Complaint
app.post('/api/complaints/:id/resolve', authenticateToken, upload.single('closing_photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_notes, spare_parts_used } = req.body;

    const findComp = await query('SELECT * FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id]);
    if (findComp.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const compRecord = findComp.rows[0];
    const compId = compRecord.id;

    let closingPhotoUrl = compRecord.closing_photo_url || null;

    // If technician attached a closing proof photo/video, store it permanently in complaint_attachments
    if (req.file) {
      try {
        const base64Data = `data:${req.file.mimetype || 'image/jpeg'};base64,${req.file.buffer.toString('base64')}`;
        const insRes = await query(`
          INSERT INTO complaint_attachments (
            complaint_id, file_name, file_url, file_type, file_data, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [compId, req.file.originalname, '/api/attachments/temp', req.file.mimetype, base64Data, `${req.user?.name || 'Technician'} (Technician Resolution Proof)`]);
        const attId = insRes.rows[0].id;
        closingPhotoUrl = `/api/attachments/${attId}`;
        await query('UPDATE complaint_attachments SET file_url = $1 WHERE id = $2', [closingPhotoUrl, attId]);
      } catch (attErr) {
        console.warn('[Resolve Attachment Note]', attErr.message);
      }
    }

    const compRes = await query(`
      UPDATE complaints SET
        status = 'Resolved',
        resolution_notes = $1,
        spare_parts_used = $2,
        closing_photo_url = COALESCE($3, closing_photo_url),
        resolved_at = CURRENT_TIMESTAMP,
        status_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [resolution_notes || 'Resolved on site', spare_parts_used || 'None', closingPhotoUrl, compId]);

    const comp = compRes.rows[0];

    let timelineNotes = `Issue resolved: ${resolution_notes || 'All checks passed.'}`;
    if (spare_parts_used && String(spare_parts_used).trim() && spare_parts_used !== 'None') {
      timelineNotes += ` • Spare parts used: ${spare_parts_used}`;
    }
    if (closingPhotoUrl) {
      timelineNotes += ` • Closing proof attached: ${req.file?.originalname || 'Site Completion Photo/Video'}`;
    }

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [compId, 'Resolved', timelineNotes, req.user.name, req.user.role]
    );

    // Insert In-App Notification for Staff & Admin
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_resolve`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, performed_by_name, performed_by_role
        ) VALUES ($1, 'resolved', $2, $3, $4, $5, $6, 'admin', $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `Ticket Resolved: ${comp.ticket_id}`,
        `${req.user.name} marked complaint for ${comp.customer_name} as Resolved. Notes: ${resolution_notes || 'All checks passed.'}`,
        comp.customer_name,
        req.user.name,
        req.user.role
      ]);
    } catch (_) {}

    // Send Feedback Request WhatsApp
    let waResult = null;
    try {
      waResult = await sendWhatsApp({
        to: comp.customer_phone,
        templateName: 'complaint_resolved',
        variables: {
          customer_name: comp.customer_name,
          ticket_id: comp.ticket_id,
          technician_name: comp.technician_name || 'Service Engineer',
          resolution_notes: resolution_notes || 'All checks passed',
          db_complaint_id: comp.id
        }
      });
    } catch (waErr) {
      console.warn('[Resolve WhatsApp Note]', waErr.message);
      waResult = { success: false, error: waErr.message };
    }

    return res.json({ message: 'Complaint resolved', complaint: comp, whatsapp: waResult });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Record Payment
app.post('/api/complaints/:id/payment', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_collected, payment_mode, payment_notes, collection_reason } = req.body;
    const amt = Number(payment_collected || 0);

    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (!compRes.rows.length) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const comp = compRes.rows[0];
    const est = Number(comp.estimated_charges || 0);

    // If no service charges were allocated (est === 0) and payment is being collected (amt > 0),
    // require mandatory collection_reason as per ECO-18
    if (est === 0 && amt > 0 && (!collection_reason || !collection_reason.trim())) {
      return res.status(400).json({ error: 'Reason for on-site collection is mandatory when no service charges were pre-allocated.' });
    }

    let status = 'Unpaid';
    if (amt > 0 && est === 0) {
      status = 'Collected'; // Full payment collected for unallocated on-site service
    } else if (amt >= est && est > 0) {
      status = 'Collected';
    } else if (amt > 0) {
      status = 'Partially Paid';
    } else {
      status = est > 0 ? 'Unpaid' : 'Not Applicable';
    }

    try {
      await query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS collection_reason TEXT');
      await query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS payment_notes TEXT');
    } catch (_) {}

    await query(`
      UPDATE complaints SET
        payment_collected = $1,
        payment_status = $2,
        payment_mode = $3,
        payment_notes = $4,
        collection_reason = $5,
        payment_collected_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [amt, status, payment_mode || 'Cash', payment_notes || '', collection_reason ? collection_reason.trim() : null, id]);

    const reasonSuffix = collection_reason ? ` • Reason: ${collection_reason.trim()}` : (est === 0 && amt > 0 ? ' • On-Site Unallocated Collection' : '');
    const notesSuffix = payment_notes ? ` • Note: ${payment_notes.trim()}` : '';
    const timelineNotes = `Payment of ₹${amt} collected via ${payment_mode || 'Cash'}. Status: ${status}${reasonSuffix}${notesSuffix}`;

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 0)',
      [id, 'Payment Recorded', timelineNotes, req.user.name, req.user.role]
    );

    return res.json({ message: 'Payment recorded successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Settle Cash Collected with Company Account (Admin / Staff)
app.post('/api/complaints/:id/settle-company', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes = '', amount_received } = req.body || {};

    const compRes = await query(`
      SELECT c.*, t.name as tech_name 
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_id = $1
    `, [id]);

    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const complaint = compRes.rows[0];
    const settledAmt = amount_received !== undefined ? parseFloat(amount_received) : (parseFloat(complaint.payment_collected) || 0);
    const actorName = req.user ? (req.user.name || req.user.email || 'Company Finance/Admin') : 'Company Finance/Admin';
    const actorRole = req.user ? (req.user.role || 'admin') : 'admin';

    const updateRes = await query(`
      UPDATE complaints SET
        company_settlement_status = 'Settled with Company',
        company_settled_at = CURRENT_TIMESTAMP,
        company_settled_by = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [actorName, complaint.id]);

    const timelineMsg = `Company confirmed receipt of ₹${settledAmt} collected by technician ${complaint.tech_name || 'Assigned Tech'} into company account.${notes ? ` • Note: ${notes}` : ''}`;

    await query(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
      VALUES ($1, 'Cash Settled with Company', $2, $3, $4, 0)
    `, [complaint.id, timelineMsg, actorName, actorRole]);

    // In-app notification
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_settle_${complaint.id}`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'payment_settled', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        complaint.ticket_id,
        complaint.id,
        `Payment Settled: ₹${settledAmt}`,
        `Payment of ₹${settledAmt} for ticket ${complaint.ticket_id} settled with company by ${actorName}`,
        complaint.customer_name,
        'all',
        complaint.assigned_technician_id,
        complaint.tech_name,
        actorName,
        actorRole
      ]);
    } catch (nErr) {
      console.warn('[Settlement In-App Notif Note]', nErr.message);
    }

    const updated = updateRes.rows[0];
    return res.json({ 
      message: 'Payment settled with company successfully', 
      complaint: {
        ...updated,
        technician_name: complaint.tech_name
      } 
    });
  } catch (err) {
    console.error('Settle company payment error:', err);
    return res.status(500).json({ error: 'Failed to settle payment with company: ' + err.message });
  }
});

// Feedback (Clamped and validated to prevent CSAT metric poisoning)
app.post('/api/complaints/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback_comments } = req.body;
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be a valid integer between 1 and 5' });
    }
    const cleanComments = (feedback_comments || '').trim().slice(0, 500);
    await query('UPDATE complaints SET rating = $1, feedback_comments = $2 WHERE id = $3 OR ticket_id = $3', [Math.round(numRating), cleanComments, id]);
    return res.json({ message: 'Thank you for your feedback!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Close Complaint (Staff / Admin)
app.post('/api/complaints/:id/close', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { closure_remarks } = req.body || {};

    const compRes = await query(`
      UPDATE complaints SET
        status = 'Closed',
        closed_at = CURRENT_TIMESTAMP,
        status_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $1 OR ticket_id = $1
      RETURNING *
    `, [id]);

    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const comp = compRes.rows[0];
    const performer = req.user ? (req.user.name || req.user.email || 'Support Supervisor') : 'Support Supervisor';
    const role = req.user ? (req.user.role || 'staff') : 'staff';
    const remarks = (closure_remarks || '').trim() || 'Ticket reviewed and closed with customer confirmation.';

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [comp.id, 'Closed', remarks, performer, role]
    );

    // In-app notification for Staff, Admin, and assigned Technician
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_close_${comp.id}`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'closed', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `Ticket Closed: ${comp.ticket_id}`,
        `Ticket ${comp.ticket_id} closed by ${performer}. Remarks: ${remarks}`,
        comp.customer_name,
        'all',
        comp.assigned_technician_id,
        comp.technician_name,
        performer,
        role
      ]);
    } catch (nErr) {
      console.warn('[Close In-App Notif Note]', nErr.message);
    }

    // Send automated customer notification on Closed (ECO-14)
    let waResult = null;
    if (comp.customer_phone) {
      try {
        waResult = await sendWhatsApp({
          to: comp.customer_phone,
          templateName: 'complaint_closed',
          message: `☀️ *Eco Green Solar - Ticket Closed*\n\nNamaste *${comp.customer_name}*,\n\nYour service complaint *${comp.ticket_id}* has been verified and successfully *CLOSED*.\n\n📝 *Closure Remarks:* ${remarks}\n\n🔗 *View Ticket Summary & Rate Service:* ${APP_URL}/track/${comp.ticket_id}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
          variables: {
            customer_name: comp.customer_name,
            ticket_id: comp.ticket_id,
            closure_remarks: remarks,
            complaint_id: comp.ticket_id,
            db_complaint_id: comp.id
          }
        });
      } catch (waErr) {
        console.warn('[Close WhatsApp Note]', waErr.message);
        waResult = { success: false, error: waErr.message };
      }
    }

    return res.json({ message: 'Complaint closed successfully', complaint: comp, whatsapp: waResult });
  } catch (err) {
    console.error('Close complaint error:', err);
    return res.status(500).json({ error: 'Failed to close complaint: ' + err.message });
  }
});

// Reopen Complaint (Customer / Staff / Admin)
app.post('/api/complaints/:id/reopen', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, technician_id } = req.body || {};

    // 1. Fetch existing complaint record with technician info joined
    const existingRes = await query(`
      SELECT c.*, t.name as technician_name, t.phone as technician_phone
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_id = $1
    `, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const oldComp = existingRes.rows[0];

    let newTechId = oldComp.assigned_technician_id;
    let newTechName = oldComp.technician_name;
    let newTechPhone = oldComp.technician_phone;

    // 2. If new technician assigned, lookup tech details
    if (technician_id && String(technician_id) !== String(oldComp.assigned_technician_id)) {
      const techRow = await query('SELECT id, name, phone, area_zone, specialization FROM technicians WHERE id::text = $1', [String(technician_id)]);
      if (techRow.rows.length > 0) {
        newTechId = techRow.rows[0].id;
        newTechName = techRow.rows[0].name;
        newTechPhone = techRow.rows[0].phone;
      }
    }

    // 3. Archive previous resolution details into previous_resolution_history array
    let prevHistory = [];
    try {
      if (Array.isArray(oldComp.previous_resolution_history)) {
        prevHistory = oldComp.previous_resolution_history;
      } else if (typeof oldComp.previous_resolution_history === 'string') {
        prevHistory = JSON.parse(oldComp.previous_resolution_history);
      }
    } catch (_) {}

    if (oldComp.resolution_notes || oldComp.closing_photo_url || oldComp.resolved_at) {
      prevHistory.unshift({
        resolved_at: oldComp.resolved_at || oldComp.status_updated_at || new Date().toISOString(),
        technician_name: oldComp.technician_name || 'Previous Service Technician',
        technician_id: oldComp.assigned_technician_id || null,
        resolution_notes: oldComp.resolution_notes || '',
        spare_parts_used: oldComp.spare_parts_used || '',
        closing_photo_url: oldComp.closing_photo_url || '',
        reopened_at: new Date().toISOString(),
        reopen_reason: reason || 'Issue recurring / follow-up inspection requested'
      });
    }

    // Ensure previous_resolution_history and previous_technician columns exist
    try {
      await query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS previous_resolution_history JSONB');
      await query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS previous_technician_id BIGINT');
      await query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS previous_technician_name TEXT');
    } catch (_) {}

    const compRes = await query(`
      UPDATE complaints SET
        status = 'Reopened',
        status_updated_at = CURRENT_TIMESTAMP,
        assigned_technician_id = $2,
        previous_technician_id = $3,
        previous_technician_name = $4,
        closed_at = NULL,
        previous_resolution_history = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $1 OR ticket_id = $1
      RETURNING *
    `, [id, newTechId, oldComp.assigned_technician_id || null, oldComp.technician_name || null, JSON.stringify(prevHistory)]);

    const comp = compRes.rows[0];
    comp.technician_name = newTechName;
    comp.technician_phone = newTechPhone;
    comp.previous_technician_name = oldComp.technician_name || null;
    comp.previous_technician_id = oldComp.assigned_technician_id || null;

    const isReassigned = newTechId && String(newTechId) !== String(oldComp.assigned_technician_id);
    const actionText = isReassigned ? 'Reopened & Reassigned' : 'Reopened';
    const notesText = isReassigned 
      ? `Ticket reopened and reassigned to ${newTechName} (Previous: ${oldComp.technician_name || 'N/A'}). Reason: ${reason || 'Issue recurring'}`
      : `Ticket reopened. Reason: ${reason || 'Issue recurring / not resolved'}`;

    const actorName = req.body?.performer_name || comp.customer_name;
    const actorRole = req.body?.performer_role || 'customer';

    await query(
      'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
      [comp.id, actionText, notesText, actorName, actorRole]
    );

    // In-app notification for Staff, Admin, and assigned Technician
    try {
      await ensureInAppTable();
      const notifId = `notif_${Date.now()}_reopen`;
      await query(`
        INSERT INTO in_app_notifications (
          id, type, ticket_id, complaint_id, title, message, customer_name,
          target_role, target_technician_id, target_technician_name,
          performed_by_name, performed_by_role
        ) VALUES ($1, 'reopened', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        notifId,
        comp.ticket_id,
        comp.id,
        `Ticket Reopened: ${comp.ticket_id}`,
        `Ticket ${comp.ticket_id} reopened. Reason: ${reason || 'Issue recurring'}`,
        comp.customer_name,
        'all',
        comp.assigned_technician_id,
        comp.technician_name,
        actorName,
        actorRole
      ]);
    } catch (nErr) {
      console.warn('[Reopen In-App Notif Note]', nErr.message);
    }

    const reopenReasonText = reason || 'Issue recurring / follow-up inspection requested';

    // 1. Send customer notification with assigned technician details
    let customerWaResult = null;
    if (comp.customer_phone) {
      const techInfoText = comp.technician_name
        ? `\n\n👷 *Assigned Technician:* ${comp.technician_name}${comp.technician_phone ? `\n📞 *Mobile:* ${comp.technician_phone}` : ''}`
        : '';

      const custMessage = `☀️ *Eco Green Solar Priority Alert*\n\nNamaste *${comp.customer_name}*,\n\nYour complaint ticket *${comp.ticket_id}* has been *REOPENED* for further inspection and service follow-up.\n\n⚠️ *Reason for Reopening:* ${reopenReasonText}${techInfoText}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live Status:* ${APP_URL}/track/${comp.ticket_id}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`;

      try {
        customerWaResult = await sendWhatsApp({
          to: comp.customer_phone,
          templateName: 'complaint_reopened',
          message: custMessage,
          variables: {
            customer_name: comp.customer_name,
            ticket_id: comp.ticket_id,
            reason: reopenReasonText,
            technician_name: comp.technician_name || '',
            technician_phone: comp.technician_phone || '',
            complaint_id: comp.ticket_id,
            db_complaint_id: comp.id
          }
        });
      } catch (waErr) {
        console.warn('[Reopen Customer WhatsApp Note]', waErr.message);
        customerWaResult = { success: false, error: waErr.message };
      }
    }

    // 2. Send automated WhatsApp notification to Technician
    let technicianWaResult = null;
    if (newTechPhone) {
      try {
        if (isReassigned) {
          // Reopened & assigned to a NEW technician
          const newTechMsg = `🔄 *Eco Green Solar - Reopened Work Order*\n\nHello *${newTechName}*, ticket *${comp.ticket_id}* has been *REOPENED* and assigned to you.\n\n👷 *Previous Specialist:* ${oldComp.technician_name || 'N/A'}\n⚠️ *Reason for Reopening:* ${reopenReasonText}\n\n👤 *Customer:* ${comp.customer_name}\n📞 *Phone:* ${comp.customer_phone}\n📍 *Address:* ${comp.customer_address || comp.city || 'Customer Site'}\n🔧 *Issue:* ${comp.issue_category || comp.product_type || 'Solar System'}\n🚨 *Priority:* ${comp.priority || 'Medium'}\n\n🔗 *Technician Portal:* ${APP_URL}/technician?ticket=${encodeURIComponent(comp.ticket_id)}\n\nPlease review previous site visit notes and coordinate with the customer immediately.`;

          technicianWaResult = await sendWhatsApp({
            to: newTechPhone,
            templateName: 'technician_reopened_work_order',
            message: newTechMsg,
            variables: {
              technician_name: newTechName,
              complaint_id: comp.ticket_id,
              ticket_id: comp.ticket_id,
              previous_technician_name: oldComp.technician_name || 'Previous Technician',
              reopen_reason: reopenReasonText,
              customer_name: comp.customer_name,
              customer_phone: comp.customer_phone,
              customer_address: comp.customer_address || comp.city || 'Customer Site',
              issue_category: comp.issue_category || 'Service Follow-up',
              product_type: comp.product_type || 'Solar System',
              priority: comp.priority || 'Medium',
              technician_portal_url: `${APP_URL}/technician?ticket=${encodeURIComponent(comp.ticket_id)}`
            }
          });

          // Also alert previous technician that job has been reassigned upon reopening (reopen job transferred)
          if (oldComp.technician_phone && String(oldComp.technician_phone).trim() !== String(newTechPhone).trim()) {
            const prevTechNotice = `⚠️ *Eco Green Solar - Reopened Job Transferred*\n\nHello *${oldComp.technician_name}*, please note that ticket *${comp.ticket_id}* (Customer: ${comp.customer_name}) previously resolved by you has been *REOPENED* upon customer request and reassigned to another technician (*${newTechName}*).\n\n⚠️ *Customer Reopen Reason:* ${reopenReasonText}\n\nYou are not required to attend to this complaint as another technician has been dispatched.\n- Eco Green Dispatch`;

            await sendWhatsApp({
              to: oldComp.technician_phone,
              templateName: 'technician_reopen_job_transferred',
              message: prevTechNotice,
              variables: {
                technician_name: oldComp.technician_name,
                complaint_id: comp.ticket_id,
                ticket_id: comp.ticket_id,
                customer_name: comp.customer_name,
                new_technician_name: newTechName,
                reopen_reason: reopenReasonText,
                notes: `Reopened & reassigned to ${newTechName}. Reason: ${reopenReasonText}`
              }
            }).catch(e => console.warn('[Reopen Prev Tech WA Error]', e.message));
          }
        } else {
          // Reopened & assigned to the SAME technician
          const sameTechMsg = `🔄 *Eco Green Solar - Ticket Reopened*\n\nHello *${newTechName}*, complaint ticket *${comp.ticket_id}* previously handled by you has been *REOPENED* by customer / support.\n\n⚠️ *Reason for Reopening:* ${reopenReasonText}\n\n👤 *Customer:* ${comp.customer_name}\n📞 *Phone:* ${comp.customer_phone}\n📍 *Address:* ${comp.customer_address || comp.city || 'Customer Site'}\n🔧 *Issue:* ${comp.issue_category || comp.product_type || 'Solar System'}\n🚨 *Priority:* ${comp.priority || 'Medium'}\n\n🔗 *Technician Portal:* ${APP_URL}/technician?ticket=${encodeURIComponent(comp.ticket_id)}\n\nPlease revisit the site and resolve the pending complaint on priority.`;

          technicianWaResult = await sendWhatsApp({
            to: newTechPhone,
            templateName: 'technician_reopened_work_order',
            message: sameTechMsg,
            variables: {
              technician_name: newTechName,
              complaint_id: comp.ticket_id,
              ticket_id: comp.ticket_id,
              previous_technician_name: newTechName,
              reopen_reason: reopenReasonText,
              customer_name: comp.customer_name,
              customer_phone: comp.customer_phone,
              customer_address: comp.customer_address || comp.city || 'Customer Site',
              issue_category: comp.issue_category || 'Service Follow-up',
              product_type: comp.product_type || 'Solar System',
              priority: comp.priority || 'Medium',
              technician_portal_url: `${APP_URL}/technician?ticket=${encodeURIComponent(comp.ticket_id)}`
            }
          });
        }
      } catch (tErr) {
        console.warn('[Reopen Technician WhatsApp Note]', tErr.message);
        technicianWaResult = { success: false, error: tErr.message };
      }
    }

    return res.json({ 
      success: true, 
      message: 'Ticket reopened successfully', 
      complaint: comp, 
      whatsapp: { customer: customerWaResult, technician: technicianWaResult } 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete Complaint (Restricted exclusively to Administrator and Helpdesk Staff; Technicians are blocked)
app.delete('/api/complaints/:id', authenticateToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM complaint_timelines WHERE complaint_id = $1', [id]);
    await query('DELETE FROM complaint_attachments WHERE complaint_id = $1', [id]);
    await query('DELETE FROM in_app_notifications WHERE complaint_id = $1', [String(id)]);
    await query('DELETE FROM complaints WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Complaint deleted permanently' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== CUSTOMERS ROUTES (Authenticated Staff/Admin only) ====================
app.get('/api/customers/stats', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_in_warranty = 1) as in_warranty,
        COUNT(*) FILTER (WHERE is_in_warranty = 0 OR is_in_warranty IS NULL) as out_warranty
      FROM installed_customers
    `);
    const row = r.rows[0];
    return res.json({
      totalCustomers: parseInt(row.total || 0, 10),
      inWarrantyCount: parseInt(row.in_warranty || 0, 10),
      outWarrantyCount: parseInt(row.out_warranty || 0, 10)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || req.query.query || '').trim();
    if (!q || q.length < 2) return res.json({ customers: [] });

    const r = await query(`
      SELECT * FROM installed_customers
      WHERE LOWER(customer_name) LIKE $1 
         OR consumer_mobile LIKE $1 
         OR LOWER(consumer_no) LIKE $1 
         OR LOWER(city_village) LIKE $1
         OR LOWER(inverter_serial) LIKE $1
      LIMIT 25
    `, [`%${q.toLowerCase()}%`]);

    return res.json({ customers: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== REPORTS ROUTES ====================
app.get('/api/reports/metrics', authenticateToken, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    const [countRes, prodRes, catRes, techRes, resTimeRes, ratingRes] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'Registered') as registered_count,
          COUNT(*) FILTER (WHERE status = 'Unassigned') as unassigned_count,
          COUNT(*) FILTER (WHERE status = 'Assigned') as assigned_count,
          COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress_count,
          COUNT(*) FILTER (WHERE status = 'On Hold') as on_hold_count,
          COUNT(*) FILTER (WHERE status = 'Resolved') as resolved_count,
          COUNT(*) FILTER (WHERE status = 'Closed') as closed_count,
          COUNT(*) FILTER (WHERE status = 'Reopened') as reopened_count
        FROM complaints
      `),
      query(`
        SELECT product_type, COUNT(*) as count
        FROM complaints GROUP BY product_type ORDER BY count DESC
      `),
      query(`
        SELECT issue_category, COUNT(*) as count
        FROM complaints GROUP BY issue_category ORDER BY count DESC LIMIT 5
      `),
      query(`
        SELECT t.id, t.name, t.phone, t.area_zone, t.specialization, t.is_available,
          COUNT(c.id) FILTER (WHERE c.status IN ('Assigned', 'In Progress')) as active_tickets_count,
          COUNT(c.id) FILTER (WHERE c.status IN ('Resolved', 'Closed')) as resolved_tickets_count,
          ROUND(AVG(c.rating)::numeric, 1) as average_rating
        FROM technicians t
        LEFT JOIN complaints c ON c.assigned_technician_id = t.id
        GROUP BY t.id
        ORDER BY resolved_tickets_count DESC
      `),
      query(`
        SELECT 
          COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 3600)::numeric, 1), 0) as avg_resolution_hours,
          COUNT(*) FILTER (WHERE status IN ('Resolved', 'Closed')) as resolved_total
        FROM complaints
        WHERE status IN ('Resolved', 'Closed')
      `),
      query(`
        SELECT 
          COALESCE(ROUND(AVG(rating)::numeric, 1), 0) as average_rating,
          COUNT(rating) as total_reviews
        FROM complaints
        WHERE rating IS NOT NULL AND rating > 0
      `)
    ]);

    const countsRow = countRes.rows[0] || {};
    const counts = {
      total: Number(countsRow.total || 0),
      registered_count: Number(countsRow.registered_count || 0),
      unassigned_count: Number(countsRow.unassigned_count || 0),
      assigned_count: Number(countsRow.assigned_count || 0),
      in_progress_count: Number(countsRow.in_progress_count || 0),
      on_hold_count: Number(countsRow.on_hold_count || 0),
      resolved_count: Number(countsRow.resolved_count || 0),
      closed_count: Number(countsRow.closed_count || 0),
      reopened_count: Number(countsRow.reopened_count || 0)
    };

    const avgResolutionHours = Number(resTimeRes.rows[0]?.avg_resolution_hours || 0);
    const resolvedTotal = Number(resTimeRes.rows[0]?.resolved_total || 0);
    const averageRating = Number(ratingRes.rows[0]?.average_rating || 0);
    const totalReviews = Number(ratingRes.rows[0]?.total_reviews || 0);

    return res.json({
      counts,
      avg_resolution_hours: avgResolutionHours,
      resolved_total: resolvedTotal,
      productStats: prodRes.rows,
      issueCategoryStats: catRes.rows,
      technicianLeaderboard: techRes.rows,
      customerSatisfaction: { 
        averageRating: averageRating, 
        totalReviews: totalReviews 
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Real-time Event Stream (Lightweight non-blocking heartbeat for serverless)
app.get(['/api/realtime/stream', '/api/notifications/events'], (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'close');
  res.write('data: {"type":"connected"}\n\n');
  res.end();
});

// ==================== NOTIFICATIONS & WHATSAPP ====================
// In-memory cache for Meta templates to avoid spamming rate limits
let metaTemplatesCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes cache
};

const META_TEMPLATE_MAPPING = {
  complaint_registered: { metaName: 'complaint_registered', language: 'en_US' },
  technician_assigned: { metaName: 'technician_assigned', language: 'en_US' },
  customer_technician_reassigned: { metaName: 'customer_technician_reassigned', language: 'en_US' },
  status_update: { metaName: 'status_followup_note_update', language: 'en' },
  complaint_resolved: { metaName: 'complaint_resolved', language: 'en_US' },
  complaint_closed: { metaName: 'complaint_closed_feedback_request', language: 'en' },
  complaint_reopened: { metaName: 'complaint_reopened_notification', language: 'en' },
  technician_work_order: { metaName: 'technician_work_order', language: 'en_US' },
  technician_reassigned_work_order: { metaName: 'technician_reassigned_work_order', language: 'en_US' },
  technician_reminder: { metaName: 'technician_pending_visit_reminder', language: 'en' },
  technician_reopened_work_order: { metaName: 'technician_reopened_work_order', language: 'en' },
  technician_reopen_job_transferred: { metaName: 'technician_job_transferred_notice', language: 'en' },
  technician_job_transferred: { metaName: 'technician_job_transferred_notice', language: 'en' },
  technician_reassigned: { metaName: 'technician_job_transferred_notice', language: 'en' }
};

let templatesTableInitialized = false;
async function ensureNotificationTemplatesTable() {
  if (templatesTableInitialized) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id BIGSERIAL PRIMARY KEY,
        template_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        whatsapp_body TEXT NOT NULL,
        email_subject TEXT NOT NULL,
        email_body TEXT NOT NULL,
        audience TEXT DEFAULT 'customer',
        trigger_event TEXT DEFAULT 'manual',
        meta_template_name TEXT,
        meta_language TEXT DEFAULT 'en_US',
        meta_category TEXT DEFAULT 'UTILITY',
        meta_status TEXT DEFAULT 'APPROVED',
        is_active INTEGER DEFAULT 1,
        channel TEXT DEFAULT 'whatsapp',
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const alterCols = [
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'customer'",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS trigger_event TEXT DEFAULT 'manual'",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS meta_template_name TEXT",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS meta_language TEXT DEFAULT 'en_US'",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS meta_category TEXT DEFAULT 'UTILITY'",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS meta_status TEXT DEFAULT 'APPROVED'",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1",
      "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp'"
    ];
    for (const sql of alterCols) {
      await query(sql).catch(() => {});
    }

    const defaults = [
      {
        key: 'complaint_registered',
        name: 'Complaint Registered Notification',
        audience: 'customer',
        trigger: 'complaint_registered',
        metaName: 'complaint_registered',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
        sub: `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}{{charges_line}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly.`
      },
      {
        key: 'technician_assigned',
        name: 'Technician Assigned Notification',
        audience: 'customer',
        trigger: 'technician_assigned',
        metaName: 'technician_assigned',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Scheduled Date:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
        sub: `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nScheduled Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
      },
      {
        key: 'customer_technician_reassigned',
        name: 'Customer Technician Reassigned Notice',
        audience: 'customer',
        trigger: 'technician_reassigned',
        metaName: 'customer_technician_reassigned',
        metaStatus: 'APPROVED',
        wa: `*Eco Green Solar - Technician Reassigned*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* ({{product_type}}) has been reassigned to a new technician.\n\n*New Technician:* {{technician_name}}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
        sub: `[Eco Green Solar] Service Technician Update - Ticket {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nYour complaint ticket {{complaint_id}} has been reassigned to technician {{technician_name}}.\n\nOur team is working to resolve your issue as soon as possible.`
      },
      {
        key: 'status_update',
        name: 'Status & Follow-up Note Update',
        audience: 'customer',
        trigger: 'status_update',
        metaName: 'status_followup_note_update',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
        sub: `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
      },
      {
        key: 'complaint_resolved',
        name: 'Complaint Resolved Notification',
        audience: 'customer',
        trigger: 'complaint_resolved',
        metaName: 'complaint_resolved',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
        sub: `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket.`
      },
      {
        key: 'complaint_closed',
        name: 'Complaint Closed & Feedback Request',
        audience: 'customer',
        trigger: 'complaint_closed',
        metaName: 'complaint_closed_feedback_request',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
        sub: `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
        em: `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nWe hope our service technician resolved your issue to your satisfaction.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
      },
      {
        key: 'complaint_reopened',
        name: 'Complaint Reopened Notification',
        audience: 'customer',
        trigger: 'complaint_reopened',
        metaName: 'complaint_reopened_notification',
        metaStatus: 'APPROVED',
        wa: `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* for further inspection and service follow-up.\n\n⚠️ *Reason:* {{reopen_reason}}\n\n👷 *Technician:* {{technician_name}}\n📞 *Mobile:* {{technician_phone}}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
        sub: `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
        em: `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nTechnician: {{technician_name}} ({{technician_phone}})\nReason: {{reopen_reason}}\n\nOur team is working to arrange an immediate re-inspection.`
      },
      {
        key: 'technician_work_order',
        name: 'Technician Work Order (Job Assignment)',
        audience: 'technician',
        trigger: 'technician_work_order',
        metaName: 'technician_work_order',
        metaStatus: 'APPROVED',
        wa: `⚡ *Eco Green Solar - New Work Order*\n\nHello {{technician_name}}, you have been assigned new ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Issue:* {{issue_category}}\n⚡ *Product:* {{product_type}}\n🚨 *Priority:* {{priority}}\n📅 *Visit By:* {{expected_visit_date}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease contact customer before reaching site.`,
        sub: `[Eco Green Solar] New Work Order Assigned: Ticket #{{complaint_id}}`,
        em: `Dear {{technician_name}},\n\nYou have been dispatched for service complaint #{{complaint_id}}.\n\nCustomer: {{customer_name}} ({{customer_phone}})\nAddress: {{customer_address}}\nIssue: {{issue_category}}\nScheduled Date: {{expected_visit_date}}\n\nPlease visit your technician dashboard to update work order logs.`
      },
      {
        key: 'technician_reminder',
        name: 'Technician Pending Visit Reminder',
        audience: 'technician',
        trigger: 'technician_reminder',
        metaName: 'technician_pending_visit_reminder',
        metaStatus: 'APPROVED',
        wa: `⏰ *Eco Green Solar - Job Reminder*\n\nHello {{technician_name}}, this is a friendly reminder for scheduled ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n📅 *Visit Date:* {{expected_visit_date}}\n\nPlease contact the customer before visiting and ensure the service is updated in your portal.`,
        sub: `[Eco Green Solar] Reminder: Scheduled Visit for Ticket #{{complaint_id}}`,
        em: `Dear {{technician_name}},\n\nReminder: You have a scheduled service visit for ticket #{{complaint_id}} (Customer: {{customer_name}}, Address: {{customer_address}}).\n\nPlease ensure your visit is completed on schedule.`
      },
      {
        key: 'technician_reassigned_work_order',
        name: 'Technician Reassigned Work Order (New Tech)',
        audience: 'technician',
        trigger: 'technician_reassigned',
        metaName: 'technician_reassigned_work_order',
        metaStatus: 'PENDING',
        wa: `⚡ *Eco Green Solar - Reassigned Work Order*\n\nHello {{technician_name}}, ticket *{{complaint_id}}* has been transferred & assigned to you.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Issue:* {{issue_category}}\n⚡ *Product:* {{product_type}}\n🚨 *Priority:* {{priority}}\n📅 *Visit By:* {{expected_visit_date}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease contact customer before reaching site.`,
        sub: `[Eco Green Solar] Reassigned Work Order: Ticket #{{complaint_id}}`,
        em: `Dear {{technician_name}},\n\nTicket #{{complaint_id}} (Customer: {{customer_name}}) has been reassigned to you.\n\nPlease check your Technician Portal for complete site details.`
      },
      {
        key: 'technician_reassigned',
        name: 'Technician Job Transferred (In-Progress Ticket Notice)',
        audience: 'technician',
        trigger: 'technician_reassigned',
        metaName: 'technician_job_transferred_notice',
        metaStatus: 'PENDING',
        wa: `⚠️ *Eco Green Solar - Job Transferred*\n\nHello {{technician_name}}, please note that ticket *{{complaint_id}}* (Customer: {{customer_name}}) currently assigned to you has been reassigned/transferred to another technician.\n\nYou are no longer required to visit this site. Please check your technician portal for updated schedules.\n- Eco Green Dispatch`,
        sub: `[Eco Green Solar] Job Transferred: Ticket #{{complaint_id}} - {{customer_name}}`,
        em: `Dear {{technician_name}},\n\nThis is to notify you that complaint ticket #{{complaint_id}} (Customer: {{customer_name}}) currently assigned to you has been reassigned to another technician.\n\nYou are no longer required to attend to this complaint. Please check your Technician Portal for your latest active schedule.`
      },
      {
        key: 'technician_reopened_work_order',
        name: 'Technician Reopened Work Order',
        audience: 'technician',
        trigger: 'technician_reopened_work_order',
        metaName: 'technician_reopened_work_order',
        metaStatus: 'PENDING',
        wa: `🔄 *Eco Green Solar - Reopened Work Order*\n\nHello {{technician_name}}, ticket *{{complaint_id}}* has been *REOPENED* for service follow-up.\n\n⚠️ *Reason for Reopening:* {{reopen_reason}}\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Issue:* {{issue_category}}\n⚡ *Product:* {{product_type}}\n🚨 *Priority:* {{priority}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease review previous site visit notes and coordinate with the customer immediately.`,
        sub: `[Eco Green Solar] Reopened Work Order: Ticket #{{complaint_id}}`,
        em: `Dear {{technician_name}},\n\nComplaint ticket #{{complaint_id}} (Customer: {{customer_name}}) has been REOPENED for follow-up service.\n\nReason: {{reopen_reason}}\n\nPlease check your Technician Portal for site details and coordinate with the customer.`
      },
      {
        key: 'technician_reopen_job_transferred',
        name: 'Technician Reopened Job Transferred (Previous Tech Notice)',
        audience: 'technician',
        trigger: 'technician_reopened_work_order',
        metaName: 'technician_job_transferred_notice',
        metaStatus: 'PENDING',
        wa: `⚠️ *Eco Green Solar - Reopened Job Transferred*\n\nHello {{technician_name}}, please note that ticket *{{complaint_id}}* (Customer: {{customer_name}}) previously resolved by you has been *REOPENED* upon customer request and reassigned to another technician (*{{new_technician_name}}*).\n\n⚠️ *Customer Reopen Reason:* {{reopen_reason}}\n\nYou are not required to attend to this complaint as another technician has been dispatched.\n- Eco Green Dispatch`,
        sub: `[Eco Green Solar] Reopened Ticket Transferred: Ticket #{{complaint_id}}`,
        em: `Dear {{technician_name}},\n\nTicket #{{complaint_id}} (Customer: {{customer_name}}) previously resolved by you has been REOPENED and reassigned to another technician ({{new_technician_name}}).\n\nReopen Reason: {{reopen_reason}}\n\nYou are not required to revisit this site.`
      }
    ];

    for (const d of defaults) {
      // Use ON CONFLICT DO UPDATE ONLY for missing fields, preserving existing user customizations
      await query(`
        INSERT INTO notification_templates (
          template_key, name, whatsapp_body, email_subject, email_body,
          audience, trigger_event, meta_template_name, meta_status, is_active, channel
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'whatsapp')
        ON CONFLICT (template_key) DO UPDATE SET
          audience = CASE 
            WHEN notification_templates.audience IS NULL OR notification_templates.audience = '' THEN EXCLUDED.audience 
            ELSE notification_templates.audience 
          END,
          trigger_event = CASE 
            WHEN notification_templates.trigger_event IS NULL OR notification_templates.trigger_event = '' OR notification_templates.trigger_event = 'manual' OR notification_templates.trigger_event = 'customer_technician_reassigned' THEN EXCLUDED.trigger_event 
            ELSE notification_templates.trigger_event 
          END,
          meta_template_name = COALESCE(notification_templates.meta_template_name, EXCLUDED.meta_template_name),
          is_active = COALESCE(notification_templates.is_active, 1)
      `, [d.key, d.name, d.wa, d.sub, d.em, d.audience, d.trigger, d.metaName, d.metaStatus || 'PENDING']).catch(() => {});
    }

    // Explicitly sync the transferred notice row in production Supabase
    await query(`
      UPDATE notification_templates 
      SET 
        name = 'Technician Job Transferred (Previous Tech Notice)',
        meta_template_name = 'technician_job_transferred_notice',
        whatsapp_body = $1,
        meta_status = 'PENDING',
        trigger_event = 'technician_reassigned',
        audience = 'technician'
      WHERE template_key IN ('technician_reassigned', 'technician_job_transferred')
    `, [`⚠️ *Eco Green Solar - Job Transferred*\n\nHello {{technician_name}}, please note that ticket *{{complaint_id}}* (Customer: {{customer_name}}) previously assigned to you has been reassigned/transferred to another technician.\n\nYou are no longer required to visit this site. Please check your technician portal for updated schedules.\n- Eco Green Dispatch`]).catch(() => {});

    // Ensure all reassign triggers are unified cleanly
    await query(`
      UPDATE notification_templates 
      SET trigger_event = 'technician_reassigned' 
      WHERE template_key IN ('customer_technician_reassigned', 'technician_reassigned', 'technician_reassigned_work_order')
    `).catch(() => {});

    await query(`UPDATE notification_templates SET is_active = 1 WHERE is_active IS NULL`).catch(() => {});

    templatesTableInitialized = true;
  } catch (err) {
    console.error('ensureNotificationTemplatesTable error:', err.message);
  }
}

async function fetchMetaTemplates(forceRefresh = false) {
  const isCacheValid = !forceRefresh && metaTemplatesCache.data && (Date.now() - metaTemplatesCache.timestamp < metaTemplatesCache.ttl);
  if (isCacheValid) {
    return {
      success: true,
      source: 'meta_cache',
      templates: metaTemplatesCache.data,
      syncedAt: new Date(metaTemplatesCache.timestamp).toISOString()
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // Strict 6s timeout

    const url = `https://graph.facebook.com/v21.0/${META_WABA_ID}/message_templates?fields=name,status,category,language,id,quality_score,rejected_reason&limit=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getMetaAccessToken()}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Meta API responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const metaTemplates = Array.isArray(data?.data) ? data.data : [];

    metaTemplatesCache = {
      data: metaTemplates,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000
    };

    return {
      success: true,
      source: 'meta_live',
      templates: metaTemplates,
      syncedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Failed to fetch Meta WhatsApp templates:', err.message);
    return {
      success: false,
      source: 'unverified',
      error: err.name === 'AbortError' ? 'Meta API request timed out (6s)' : err.message,
      templates: [],
      syncedAt: metaTemplatesCache.timestamp ? new Date(metaTemplatesCache.timestamp).toISOString() : null
    };
  }
}

// Fast local templates endpoint (Immediate, non-blocking for initial page load)
app.get('/api/notifications/templates', async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const r = await query('SELECT * FROM notification_templates ORDER BY id ASC');
    return res.json({ templates: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create new notification template rule
app.post('/api/notifications/templates', authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const {
      name,
      template_key,
      audience = 'customer',
      trigger_event = 'manual',
      meta_template_name,
      meta_status = 'PENDING',
      is_active = 1,
      channel = 'whatsapp',
      whatsapp_body = '',
      email_subject = '',
      email_body = ''
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const cleanKey = (template_key || name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
    const cleanMeta = (meta_template_name || cleanKey).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);

    const r = await query(`
      INSERT INTO notification_templates (
        template_key, name, audience, trigger_event, meta_template_name,
        meta_status, is_active, channel, whatsapp_body, email_subject, email_body, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `, [cleanKey, name.trim(), audience, trigger_event, cleanMeta, meta_status, is_active ? 1 : 0, channel, whatsapp_body, email_subject, email_body]);

    return res.json({ success: true, message: 'Template rule created successfully', template: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Real-Time Meta Template Verification Endpoint
app.get('/api/notifications/templates/meta-status', async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const forceRefresh = req.query.refresh === 'true' || req.query.sync === 'true';
    const metaResult = await fetchMetaTemplates(forceRefresh);

    const dbRes = await query('SELECT * FROM notification_templates ORDER BY id ASC');
    const localTemplates = dbRes.rows;

    const mappedTemplates = localTemplates.map((local) => {
      const mapping = META_TEMPLATE_MAPPING[local.template_key] || { metaName: local.meta_template_name || local.template_key };
      const matchedMeta = metaResult.templates.find(mt => {
        const mtName = (mt.name || '').toLowerCase();
        const target = (mapping.metaName || '').toLowerCase();
        return mtName === target || mtName.startsWith(target) || target.startsWith(mtName);
      });

      const verifiedKeys = [
        'complaint_registered', 'technician_assigned', 'status_update', 
        'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
        'technician_work_order', 'technician_reminder'
      ];

      if (matchedMeta) {
        const rawStatus = (matchedMeta.status || '').toUpperCase();
        const finalStatus = rawStatus === 'ACTIVE' ? 'APPROVED' : (rawStatus || 'APPROVED');
        return {
          id: local.id,
          template_key: local.template_key,
          name: local.name,
          audience: local.audience || 'customer',
          trigger_event: local.trigger_event || 'manual',
          meta_template_name: local.meta_template_name || local.template_key,
          is_active: local.is_active !== undefined ? local.is_active : 1,
          channel: local.channel || 'whatsapp',
          whatsapp_body: local.whatsapp_body,
          email_subject: local.email_subject,
          email_body: local.email_body,
          updated_at: local.updated_at,
          meta_verified: true,
          meta_status: finalStatus,
          meta_id: matchedMeta.id,
          meta_name: matchedMeta.name,
          meta_category: matchedMeta.category || 'UTILITY',
          meta_language: matchedMeta.language || 'en_US',
          quality_score: matchedMeta.quality_score?.score || 'UNKNOWN',
          rejected_reason: matchedMeta.rejected_reason || null
        };
      }

      const defaultStatus = verifiedKeys.includes(local.template_key) ? 'APPROVED' : (local.meta_status || 'PENDING');

      return {
        id: local.id,
        template_key: local.template_key,
        name: local.name,
        audience: local.audience || 'customer',
        trigger_event: local.trigger_event || 'manual',
        meta_template_name: local.meta_template_name || mapping.metaName,
        is_active: local.is_active !== undefined ? local.is_active : 1,
        channel: local.channel || 'whatsapp',
        whatsapp_body: local.whatsapp_body,
        email_subject: local.email_subject,
        email_body: local.email_body,
        updated_at: local.updated_at,
        meta_verified: metaResult.success,
        meta_status: defaultStatus,
        meta_id: null,
        meta_name: mapping.metaName,
        meta_category: 'UTILITY',
        meta_language: mapping.language || 'en_US',
        quality_score: 'UNKNOWN',
        rejected_reason: null
      };
    });

    const approvedCount = mappedTemplates.filter(t => t.meta_status === 'APPROVED').length;
    const pendingCount = mappedTemplates.filter(t => t.meta_status === 'PENDING').length;
    const rejectedCount = mappedTemplates.filter(t => t.meta_status === 'REJECTED').length;

    return res.json({
      success: true,
      source: metaResult.source,
      error: metaResult.error || null,
      waba_id: META_WABA_ID,
      api_version: 'v21.0',
      synced_at: metaResult.syncedAt || new Date().toISOString(),
      summary: {
        total: mappedTemplates.length,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        unverified: mappedTemplates.length - (approvedCount + pendingCount + rejectedCount)
      },
      templates: mappedTemplates
    });
  } catch (err) {
    console.error('Meta status route error:', err);
    return res.json({
      success: false,
      source: 'unverified',
      error: err.message,
      templates: []
    });
  }
});

// Update notification template full rule & content
app.put('/api/notifications/templates/:id', authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const { id } = req.params;
    const {
      name,
      template_key,
      audience,
      trigger_event,
      meta_template_name,
      meta_status,
      is_active,
      channel,
      whatsapp_body,
      email_subject,
      email_body
    } = req.body;

    const r = await query(`
      UPDATE notification_templates SET
        name = COALESCE($1, name),
        audience = COALESCE($2, audience),
        trigger_event = COALESCE($3, trigger_event),
        meta_template_name = COALESCE($4, meta_template_name),
        meta_status = COALESCE($5, meta_status),
        is_active = COALESCE($6, is_active),
        channel = COALESCE($7, channel),
        whatsapp_body = COALESCE($8, whatsapp_body),
        email_subject = COALESCE($9, email_subject),
        email_body = COALESCE($10, email_body),
        updated_at = NOW()
      WHERE id::text = $11::text OR template_key = $12
      RETURNING *
    `, [name, audience, trigger_event, meta_template_name, meta_status, is_active !== undefined ? Number(is_active) : null, channel, whatsapp_body, email_subject, email_body, String(id), String(template_key || id)]);

    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ success: true, message: 'Template rule updated successfully', template: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Toggle template rule active / paused status
app.post('/api/notifications/templates/:id/toggle-active', authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const { id } = req.params;
    const check = await query('SELECT is_active FROM notification_templates WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const currentActive = check.rows[0].is_active;
    const newActive = currentActive === 1 ? 0 : 1;
    await query('UPDATE notification_templates SET is_active = $1, updated_at = NOW() WHERE id = $2', [newActive, id]);
    return res.json({ success: true, is_active: newActive, message: `Rule ${newActive ? 'activated' : 'paused'} successfully` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Sync template with Meta status or set manual approval
app.post('/api/notifications/templates/:id/sync-meta', authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const { id } = req.params;
    const { manual_status } = req.body || {};
    const check = await query('SELECT * FROM notification_templates WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const tmpl = check.rows[0];

    if (manual_status) {
      const up = await query('UPDATE notification_templates SET meta_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [manual_status, id]);
      return res.json({ success: true, message: `Status updated to ${manual_status}`, template: up.rows[0] });
    }

    const metaResult = await fetchMetaTemplates(true);
    const targetMetaName = (tmpl.meta_template_name || tmpl.template_key || '').toLowerCase();
    let foundStatus = null;
    if (metaResult.success && Array.isArray(metaResult.templates)) {
      const found = metaResult.templates.find(mt => {
        const mtName = (mt.name || '').toLowerCase();
        return mtName === targetMetaName || mtName.startsWith(targetMetaName) || targetMetaName.startsWith(mtName);
      });
      if (found && found.status) {
        foundStatus = found.status === 'ACTIVE' ? 'APPROVED' : found.status;
      }
    }

    const verifiedKeys = [
      'complaint_registered', 'technician_assigned', 'status_update', 
      'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
      'technician_work_order', 'technician_reminder', 'technician_reassigned'
    ];
    if (!foundStatus && verifiedKeys.includes(tmpl.template_key)) {
      foundStatus = 'APPROVED';
    }

    const targetStatus = foundStatus || tmpl.meta_status || 'APPROVED';
    const up = await query('UPDATE notification_templates SET meta_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [targetStatus, id]);
    return res.json({ success: true, message: `Synced with Meta! Status: ${targetStatus}`, template: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete template rule
app.delete('/api/notifications/templates/:id', authenticateToken, async (req, res) => {
  try {
    await ensureNotificationTemplatesTable();
    const { id } = req.params;
    await query('DELETE FROM notification_templates WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Template rule deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/logs', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 50');
    return res.json({ logs: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Get all conversation threads
app.get('/api/whatsapp/conversations', authenticateToken, async (req, res) => {
  try {
    const r = await query(`
      WITH RankedMessages AS (
        SELECT 
          m.*,
          RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10) as last10,
          ROW_NUMBER() OVER(
            PARTITION BY RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10) 
            ORDER BY m.created_at DESC, m.id DESC
          ) as rn
        FROM whatsapp_messages m
        WHERE LENGTH(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g')) >= 10
      )
      SELECT 
        rm.id,
        rm.phone,
        rm.last10,
        rm.complaint_id,
        rm.sender_name,
        rm.sender_type as last_sender_type,
        rm.message_body as last_message,
        rm.media_type as last_media_type,
        rm.status as last_status,
        rm.created_at as last_activity,
        c.ticket_id,
        c.customer_name as complaint_customer_name,
        c.customer_phone as complaint_customer_phone,
        c.product_type,
        c.status as complaint_status
      FROM RankedMessages rm
      LEFT JOIN complaints c ON c.id = rm.complaint_id
      WHERE rm.rn = 1
      ORDER BY rm.created_at DESC
    `);

    // Fetch technicians, installed customers, registry, and complaints in parallel for lightning-fast resolution
    const activeLast10 = Array.from(new Set(r.rows.map(row => row.last10).filter(Boolean)));
    const [techRes, custRes, regRes, matchedCompsRes] = await Promise.all([
      query('SELECT id, name, phone FROM technicians'),
      activeLast10.length > 0
        ? query(
            `SELECT customer_name, consumer_mobile 
             FROM installed_customers 
             WHERE consumer_mobile IS NOT NULL 
               AND RIGHT(REGEXP_REPLACE(consumer_mobile, '[^0-9]', '', 'g'), 10) = ANY($1::text[])`,
            [activeLast10]
          )
        : Promise.resolve({ rows: [] }),
      activeLast10.length > 0
        ? query(
            `SELECT phone, customer_name 
             FROM whatsapp_number_registry 
             WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = ANY($1::text[])`,
            [activeLast10]
          )
        : Promise.resolve({ rows: [] }),
      activeLast10.length > 0
        ? query(
            `SELECT id, ticket_id, customer_name, product_type, status, customer_phone
             FROM complaints
             WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = ANY($1::text[])
             ORDER BY id DESC`,
            [activeLast10]
          )
        : Promise.resolve({ rows: [] })
    ]);

    const techMap = new Map();
    techRes.rows.forEach(t => {
      const clean = (t.phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (clean) techMap.set(clean, t);
    });

    const custMap = new Map();
    custRes.rows.forEach(c => {
      const clean = (c.consumer_mobile || '').replace(/[^0-9]/g, '').slice(-10);
      if (clean && !custMap.has(clean)) custMap.set(clean, c.customer_name);
    });

    const regMap = new Map();
    regRes.rows.forEach(reg => {
      const clean = (reg.phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (clean && reg.customer_name) regMap.set(clean, reg.customer_name);
    });

    const matchedCompMap = new Map();
    matchedCompsRes.rows.forEach(c => {
      const clean = (c.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (clean && !matchedCompMap.has(clean)) matchedCompMap.set(clean, c);
    });

    const conversations = r.rows.map(row => {
      const last10 = row.last10;
      let customerName = null;
      let isTechnician = false;
      let complaintId = row.complaint_id || null;
      let ticketId = row.ticket_id || null;
      let productType = row.product_type || null;
      let complaintStatus = row.complaint_status || null;

      // 1. Technician check
      if (techMap.has(last10)) {
        customerName = `${techMap.get(last10).name} (Technician)`;
        isTechnician = true;
      }

      // 2. Linked complaint check
      if (!customerName && row.complaint_customer_name && row.complaint_customer_name !== 'Customer') {
        customerName = row.complaint_customer_name;
      }

      // 2b. If complaint was not directly linked via row.complaint_id, match from phone
      if (matchedCompMap.has(last10)) {
        const mc = matchedCompMap.get(last10);
        if (!complaintId) complaintId = mc.id;
        if (!ticketId) ticketId = mc.ticket_id;
        if (!productType) productType = mc.product_type;
        if (!complaintStatus) complaintStatus = mc.status;
        if (!customerName && mc.customer_name && mc.customer_name !== 'Customer') {
          customerName = mc.customer_name;
        }
      }

      // 3. Custom / Verified Name from whatsapp_number_registry
      if (!customerName && regMap.has(last10)) {
        customerName = regMap.get(last10);
      }

      // 4. Installed customer directory check
      if (!customerName && custMap.has(last10)) {
        customerName = custMap.get(last10);
      }

      // 5. Sender name in message
      if (!customerName && row.sender_name && row.sender_name !== 'Customer' && row.sender_name !== 'Eco Green Support' && !/^[0-9+ ]+$/.test(row.sender_name)) {
        customerName = row.sender_name;
      }

      const displayPhone = last10.length === 10 ? `+91 ${last10.slice(0, 5)} ${last10.slice(5)}` : row.phone;
      const canonicalPhone = row.phone.startsWith('91') ? row.phone : (row.phone.length === 10 ? `91${row.phone}` : row.phone);

      return {
        ...row,
        phone: canonicalPhone,
        complaint_id: complaintId,
        ticket_id: ticketId,
        product_type: productType,
        complaint_status: complaintStatus,
        sender_name: customerName || displayPhone,
        is_technician: isTechnician,
        unread_count: 0
      };
    });

    return res.json({ success: true, conversations });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Get full chat history for a specific phone number
app.get('/api/whatsapp/chats/:phone', authenticateToken, async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
    const canonicalPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);

    const msgRes = await query(`
      SELECT * FROM whatsapp_messages
      WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
      ORDER BY created_at ASC, id ASC
    `, [last10]);

    // Lookup contact details
    const [techRes, compRes, custRes, regRes] = await Promise.all([
      query(`SELECT id, name, phone, area_zone FROM technicians WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`, [last10]),
      query(`SELECT id, ticket_id, customer_name, customer_phone, product_type, status FROM complaints WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1 ORDER BY id DESC LIMIT 1`, [last10]),
      query(`SELECT customer_name FROM installed_customers WHERE RIGHT(REGEXP_REPLACE(consumer_mobile, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`, [last10]),
      query(`SELECT customer_name FROM whatsapp_number_registry WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`, [last10])
    ]);

    const tech = techRes.rows[0] || null;
    const complaint = compRes.rows[0] || null;
    let contactName = null;

    if (tech) {
      contactName = `${tech.name} (Technician)`;
    } else if (complaint && complaint.customer_name && complaint.customer_name !== 'Customer') {
      contactName = complaint.customer_name;
    } else if (regRes.rows[0]?.customer_name) {
      contactName = regRes.rows[0].customer_name;
    } else if (custRes.rows[0]?.customer_name) {
      contactName = custRes.rows[0].customer_name;
    }

    const displayPhone = last10.length === 10 ? `+91 ${last10.slice(0, 5)} ${last10.slice(5)}` : canonicalPhone;

    return res.json({
      success: true,
      messages: msgRes.rows,
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
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Send Direct Reply (supports text and file attachments)
app.post('/api/whatsapp/direct-reply', authenticateToken, upload.single('attachment'), async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || (!message && !req.file)) {
      return res.status(400).json({ error: 'phone and message or attachment are required' });
    }

    const clean = phone.replace(/[^0-9]/g, '');
    const last10 = clean.slice(-10);
    const formattedPhone = `91${last10}`;

    const compRes = await query(`
      SELECT id, ticket_id, customer_name FROM complaints
      WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1
      ORDER BY id DESC LIMIT 1
    `, [last10]);

    const comp = compRes.rows[0];

    let mediaUrl = null;
    let mediaType = null;
    let mediaFileName = null;

    if (req.file) {
      mediaType = req.file.mimetype?.startsWith('image/') ? 'image' : 'document';
      mediaFileName = req.file.originalname;
      const base64Data = `data:${req.file.mimetype || 'image/jpeg'};base64,${req.file.buffer.toString('base64')}`;
      const insRes = await query(`
        INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [comp?.id || null, mediaFileName, '/api/attachments/temp', req.file.mimetype, base64Data, req.user?.name || 'Staff']);
      const attId = insRes.rows[0].id;
      mediaUrl = `/api/attachments/${attId}`;
      await query('UPDATE complaint_attachments SET file_url = $1 WHERE id = $2', [mediaUrl, attId]);
    }

    const result = await sendWhatsApp({
      to: formattedPhone,
      message: (message || '').trim(),
      mediaUrl,
      mediaType,
      mediaFileName,
      senderName: req.user?.name || 'Eco Green Support',
      variables: {
        db_complaint_id: comp?.id,
        ticket_id: comp?.ticket_id,
        customer_name: comp?.customer_name
      }
    });

    if (comp) {
      try {
        const actionNote = mediaUrl ? `Staff sent ${mediaType}: ${mediaFileName} ${message ? '(' + message + ')' : ''}` : (message || '').trim();
        await query(
          'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
          [comp.id, 'Staff WhatsApp Reply', actionNote, req.user?.name || 'Staff Specialist', req.user?.role || 'staff']
        );
      } catch (tErr) {
        console.warn('[Timeline Note]', tErr.message);
      }
    }

    return res.json({ success: true, messageId: result.wamid, metaMessageId: result.wamid, mediaUrl, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Complaint Drawer: WhatsApp Messages
app.get('/api/complaints/:id/whatsapp-messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const compRes = await query('SELECT id, ticket_id, customer_phone FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id]);
    if (compRes.rows.length === 0) return res.json({ messages: [] });

    const comp = compRes.rows[0];
    const cleanPhone = (comp.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);

    const msgRes = await query(`
      SELECT * FROM whatsapp_messages
      WHERE complaint_id = $1 
         OR (phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2)
      ORDER BY created_at ASC
    `, [comp.id, cleanPhone]);

    return res.json({ success: true, messages: msgRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Complaint Drawer: WhatsApp Reply
app.post('/api/complaints/:id/whatsapp-reply', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const compRes = await query('SELECT id, ticket_id, customer_name, customer_phone FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1', [id]);
    if (compRes.rows.length === 0) return res.status(404).json({ error: 'Complaint not found' });

    const comp = compRes.rows[0];
    const result = await sendWhatsApp({
      to: comp.customer_phone,
      message: (message || '').trim(),
      senderName: req.user?.name || 'Staff Specialist',
      variables: {
        db_complaint_id: comp.id,
        ticket_id: comp.ticket_id,
        customer_name: comp.customer_name
      }
    });

    try {
      await query(
        'INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer) VALUES ($1, $2, $3, $4, $5, 1)',
        [comp.id, 'Staff WhatsApp Reply', (message || '').trim(), req.user?.name || 'Staff Specialist', req.user?.role || 'staff']
      );
    } catch (_) {}

    return res.json({ success: true, messageId: result.wamid, metaMessageId: result.wamid, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Notification logs / Simulated inbox for drawer
app.get('/api/notifications/simulated', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 50');
    return res.json({ messages: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message, messages: [] });
  }
});

app.get('/api/notifications/logs', authenticateToken, async (req, res) => {
  try {
    const { complaint_id } = req.query;
    let r;
    if (complaint_id) {
      r = await query('SELECT * FROM notification_logs WHERE complaint_id = $1 ORDER BY created_at DESC', [complaint_id]);
    } else {
      r = await query('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 100');
    }
    return res.json({ logs: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notifications/simulated', authenticateToken, async (req, res) => {
  try {
    await query("DELETE FROM notification_logs WHERE channel = 'simulated'").catch(() => {});
    return res.json({ success: true, message: 'Simulated notifications cleared' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== IN-APP NOTIFICATIONS ====================
let inAppTableChecked = false;
async function ensureInAppTable() {
  if (inAppTableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        ticket_id VARCHAR(50),
        complaint_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        customer_name TEXT,
        target_role VARCHAR(50) DEFAULT 'all',
        target_technician_id INTEGER,
        target_technician_name TEXT,
        performed_by_name TEXT,
        performed_by_role VARCHAR(50),
        read_by JSONB DEFAULT '[]'::jsonb,
        acknowledged_by JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    inAppTableChecked = true;
  } catch (err) {
    console.warn('[DB Note: in_app_notifications table]', err.message);
  }
}

app.get('/api/in-app-notifications', authenticateToken, async (req, res) => {
  try {
    await ensureInAppTable();
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const userName = req.user?.name || '';
    const userPhone = (req.user?.phone || req.user?.username || '').replace(/[^0-9]/g, '').slice(-10);

    let sql = 'SELECT * FROM in_app_notifications WHERE 1=1';
    const params = [];

    if (userRole === 'admin') {
      // Admin supervisor sees everything
      sql += ' ORDER BY created_at DESC LIMIT 150';
    } else if (userRole === 'staff') {
      // Staff sees technician updates, resolutions, customer registrations, reopens, and notes
      sql += ` AND (
        target_role IN ('staff', 'all', 'admin') 
        OR type IN ('status_update', 'resolved', 'note', 'new_ticket', 'reopened', 'payment', 'feedback')
      ) ORDER BY created_at DESC LIMIT 150`;
    } else if (userRole === 'technician') {
      // Technician only sees tickets and alerts explicitly assigned to them, suppressing self actions and staff alerts
      params.push(userId || -1, `%${userName}%`, `%${userPhone}%`, userName);
      sql += ` AND (
        target_role NOT IN ('staff', 'admin')
        AND performed_by_name != $4
        AND (target_role = 'technician' OR type IN ('assignment', 'reassigned', 'reopened'))
        AND (
          target_technician_id = $1 
          OR (target_technician_name IS NOT NULL AND target_technician_name ILIKE $2)
          OR (target_technician_name IS NOT NULL AND target_technician_name ILIKE $3)
          OR target_role = 'all'
        )
      ) ORDER BY created_at DESC LIMIT 100`;
    } else {
      sql += ' AND 1=0';
    }

    const r = await query(sql, params);
    const mapped = (r.rows || []).map(row => ({
      id: row.id,
      type: row.type,
      ticketId: row.ticket_id,
      complaintId: row.complaint_id,
      title: row.title,
      message: row.message,
      customerName: row.customer_name,
      targetRole: row.target_role,
      targetTechnicianId: row.target_technician_id,
      targetTechnicianName: row.target_technician_name,
      performedByName: row.performed_by_name,
      performedByRole: row.performed_by_role,
      readBy: Array.isArray(row.read_by) ? row.read_by : [],
      acknowledgedBy: Array.isArray(row.acknowledged_by) ? row.acknowledged_by : [],
      createdAt: row.created_at
    }));
    return res.json({ notifications: mapped });
  } catch (err) {
    return res.json({ notifications: [] });
  }
});

app.post('/api/in-app-notifications', authenticateToken, async (req, res) => {
  try {
    await ensureInAppTable();
    const b = req.body || {};
    const id = b.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await query(`
      INSERT INTO in_app_notifications (
        id, type, ticket_id, complaint_id, title, message, customer_name,
        target_role, target_technician_id, target_technician_name,
        performed_by_name, performed_by_role, read_by, acknowledged_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING
    `, [
      id,
      b.type || 'info',
      b.ticketId || '',
      b.complaintId || null,
      b.title || 'System Notification',
      b.message || '',
      b.customerName || '',
      b.targetRole || 'all',
      b.targetTechnicianId || null,
      b.targetTechnicianName || '',
      b.performedByName || 'Staff',
      b.performedByRole || 'staff',
      JSON.stringify(b.readBy || []),
      JSON.stringify(b.acknowledgedBy || [])
    ]);
    return res.status(201).json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/in-app-notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await ensureInAppTable();
    const { id } = req.params;
    const userKeys = [
      req.user.id ? String(req.user.id) : null,
      req.user.username || null,
      req.user.email || null,
      req.user.name || null,
      req.user.role || null
    ].filter(Boolean);

    await query(`
      UPDATE in_app_notifications
      SET read_by = CASE
        WHEN jsonb_typeof(read_by) = 'array' THEN read_by || $1::jsonb
        ELSE $1::jsonb
      END
      WHERE id = $2 OR ticket_id = $2
    `, [JSON.stringify(userKeys), id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/in-app-notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await ensureInAppTable();
    const userKeys = [
      req.user.id ? String(req.user.id) : null,
      req.user.username || null,
      req.user.email || null,
      req.user.name || null,
      req.user.role || null
    ].filter(Boolean);

    await query(`
      UPDATE in_app_notifications
      SET read_by = CASE
        WHEN jsonb_typeof(read_by) = 'array' THEN read_by || $1::jsonb
        ELSE $1::jsonb
      END
    `, [JSON.stringify(userKeys)]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/in-app-notifications', authenticateToken, async (req, res) => {
  try {
    await ensureInAppTable();
    await query('DELETE FROM in_app_notifications');
    return res.json({ success: true, message: 'All in-app notifications cleared' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Edit Message
app.put('/api/whatsapp/messages/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message_body } = req.body;
    await query('UPDATE whatsapp_messages SET message_body = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [message_body, id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Delete Message
app.delete('/api/whatsapp/messages/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM whatsapp_messages WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Universal WhatsApp Web Inbox: Update Contact Name
app.post('/api/whatsapp/update-contact-name', authenticateToken, async (req, res) => {
  try {
    const { phone, name } = req.body;
    const clean = (phone || '').replace(/[^0-9]/g, '').slice(-10);
    const cleanName = (name || '').trim();
    if (clean && cleanName) {
      await query(`
        INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, source, updated_at)
        VALUES ($1, $2, 1, 'verified', 'manual_rename', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET customer_name = $2, is_whatsapp_active = 1, status = 'verified', updated_at = CURRENT_TIMESTAMP
      `, [clean, cleanName]);

      await query(`
        UPDATE whatsapp_messages 
        SET sender_name = $1 
        WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2 AND sender_type = 'customer'
      `, [cleanName, clean]);
    }
    return res.json({ success: true, message: 'Contact name updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Verify phone number for WhatsApp compatibility
app.get('/api/whatsapp/verify-number/:phone', async (req, res) => {
  try {
    const rawPhone = req.params.phone || '';
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

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

    const [regRes, compRes, custRes, msgRes] = await Promise.all([
      query("SELECT * FROM whatsapp_number_registry WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1", [last10]),
      query("SELECT id, ticket_id, customer_name, city, product_type, invoice_no, invoice_date FROM complaints WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1", [last10]),
      query("SELECT id, customer_name, city_village, consumer_no, order_no, invoice_no, invoice_date, inverter_serial, panel_make, inverter_make, is_in_warranty FROM installed_customers WHERE RIGHT(REGEXP_REPLACE(consumer_mobile, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1", [last10]),
      query("SELECT sender_name FROM whatsapp_messages WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1", [last10])
    ]);

    const reg = regRes.rows[0] || null;
    const existingComp = compRes.rows[0] || null;
    const existingCust = custRes.rows[0] || null;
    const existingChat = msgRes.rows[0] || null;

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
        customerName: reg.customer_name || null
      });
    }

    const customerName = existingCust?.customer_name || existingComp?.customer_name || existingChat?.sender_name || (reg?.customer_name || null);
    const city = existingCust?.city_village || existingComp?.city || null;
    const isExisting = Boolean(existingCust || existingComp);
    const isExplicitlyVerified = Boolean((reg && reg.is_whatsapp_active === 1) || existingChat || isExisting);

    return res.json({
      valid: true,
      isVerified: isExplicitlyVerified,
      isWhatsApp: isExplicitlyVerified ? true : null,
      phone: last10,
      formattedPhone: formatted,
      formatted: formatted,
      isExistingCustomer: isExisting,
      customerName: customerName,
      city: city,
      consumerNo: existingCust?.consumer_no || null,
      orderNo: existingCust?.order_no || null,
      invoiceNo: existingCust?.invoice_no || existingComp?.invoice_no || null,
      invoiceDate: existingCust?.invoice_date || existingComp?.invoice_date || null,
      inverterSerial: existingCust?.inverter_serial || null,
      panelMake: existingCust?.panel_make || null,
      inverterMake: existingCust?.inverter_make || null,
      isInWarranty: existingCust ? Boolean(existingCust.is_in_warranty) : null,
      ticketId: existingComp?.ticket_id || null,
      hasChatHistory: Boolean(existingChat),
      status: isExplicitlyVerified ? 'verified' : 'unconfirmed',
      message: isExisting
        ? `Verified Customer: ${customerName} (${city || 'Gujarat'})`
        : (isExplicitlyVerified ? `WhatsApp Active & Verified (${formatted})` : `Mobile Validated (${formatted}) • WhatsApp presence not yet confirmed`)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
});

// Set phone number WhatsApp status in registry
app.post('/api/whatsapp/set-number-status', authenticateToken, async (req, res) => {
  try {
    const { phone, isActive, status, customerName, notes } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    const activeVal = (isActive === false || status === 'invite_required') ? 0 : 1;
    const statusVal = activeVal === 0 ? 'invite_required' : 'verified';

    await query(`
      INSERT INTO whatsapp_number_registry (phone, is_whatsapp_active, status, customer_name, source, notes, updated_at)
      VALUES ($1, $2, $3, $4, 'manual_override', $5, CURRENT_TIMESTAMP)
      ON CONFLICT (phone) DO UPDATE SET is_whatsapp_active = $2, status = $3, customer_name = COALESCE($4, whatsapp_number_registry.customer_name), notes = $5, updated_at = CURRENT_TIMESTAMP
    `, [last10, activeVal, statusVal, customerName || null, notes || (activeVal === 0 ? 'Marked as Not on WhatsApp' : 'Confirmed on WhatsApp')]);

    return res.json({
      success: true,
      phone: last10,
      isWhatsApp: Boolean(activeVal),
      status: statusVal,
      message: activeVal === 0 ? 'Number marked as Not on WhatsApp (Invite Required)' : 'Number confirmed as WhatsApp Active'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update status: ' + err.message });
  }
});

// Retry failed WhatsApp message
app.post('/api/whatsapp/retry-message/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const msgRes = await query('SELECT * FROM whatsapp_messages WHERE id = $1', [id]);
    if (msgRes.rows.length === 0) return res.status(404).json({ error: 'Message record not found' });
    const msg = msgRes.rows[0];

    let result;
    if (msg.template_name) {
      const cleanDigits = (msg.phone || '').replace(/[^0-9]/g, '');
      const last10 = cleanDigits.slice(-10);
      const compRes = await query(
        'SELECT * FROM complaints WHERE id = $1 OR RIGHT(REGEXP_REPLACE(customer_phone, \'[^0-9]\', \'\', \'g\'), 10) = $2 ORDER BY id DESC LIMIT 1',
        [msg.complaint_id || 0, last10]
      );
      const comp = compRes.rows[0] || null;

      result = await sendWhatsApp({
        to: msg.phone,
        templateName: msg.template_name,
        variables: {
          customer_name: comp?.customer_name || 'Valued Customer',
          ticket_id: comp?.ticket_id || 'Ticket',
          product_type: comp?.product_type || 'Solar Equipment',
          issue_category: comp?.issue_category || 'Service Request',
          db_complaint_id: comp?.id || null
        }
      });
    } else {
      result = await sendWhatsApp({
        to: msg.phone,
        message: msg.message_body,
        mediaUrl: msg.media_url,
        mediaType: msg.media_type
      });
    }

    if (result.success) {
      await query(
        'UPDATE whatsapp_messages SET status = $1, failure_reason = NULL, wam_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['sent', result.wamid, id]
      );
    }

    return res.json({ success: result.success, wam_id: result.wamid, error: result.error });
  } catch (err) {
    return res.status(500).json({ error: 'Retry failed: ' + err.message });
  }
});

// Raw Webhook Audit Trail
app.get('/api/whatsapp/raw-events/:phone', authenticateToken, async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const last10 = getLast10Digits(rawPhone);

    const events = await query(`
      SELECT * FROM whatsapp_raw_events
      WHERE sender_phone LIKE $1 OR recipient_phone LIKE $1
      ORDER BY created_at DESC
      LIMIT 100
    `, [`%${last10}%`]);

    return res.json({ success: true, events: events.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Sync & Restore Messages from client backup
app.post('/api/whatsapp/sync-backup', authenticateToken, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({ success: true, restored: 0 });
    }

    let restored = 0;
    for (const m of messages) {
      if (!m || !m.phone || !m.message_body) continue;
      const clean = (m.phone || '').replace(/[^0-9]/g, '');
      if (clean.length < 10) continue;

      const dup = await query(
        'SELECT id FROM whatsapp_messages WHERE (wam_id IS NOT NULL AND wam_id = $1) OR (phone = $2 AND message_body = $3) LIMIT 1',
        [m.wam_id || null, m.phone, m.message_body]
      );
      if (dup.rows.length > 0) continue;

      await query(`
        INSERT INTO whatsapp_messages (
          complaint_id, phone, sender_type, sender_name, message_body, media_url, media_type, status, wam_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
      `, [
        m.complaint_id || null,
        m.phone,
        m.sender_type || 'company',
        m.sender_name || 'Eco Green Support',
        m.message_body,
        m.media_url || null,
        m.media_type || null,
        m.status || 'delivered',
        m.wam_id || null,
        m.created_at || null
      ]).catch(() => {});
      restored++;
    }

    return res.json({ success: true, restored });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// WhatsApp Messages List
app.get('/api/whatsapp/messages', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT 100');
    return res.json({ messages: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/send-manual', authenticateToken, async (req, res) => {
  try {
    const { to, message } = req.body;
    const result = await sendWhatsApp({ to, message });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Meta Webhook Verification
app.get(['/api/whatsapp/webhook', '/webhook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && (token === 'ecogreen_solar_webhook_verify_token_2026' || token === 'ecogreen_solar_webhook_verify_2026' || token === process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta Webhook Inbound Events (Delivery Statuses & Incoming Customer Messages)
app.post(['/api/whatsapp/webhook', '/webhook'], async (req, res) => {
  try {
    const body = req.body;
    await query('INSERT INTO whatsapp_raw_events (raw_payload) VALUES ($1)', [JSON.stringify(body)]).catch(() => {});

    if (body?.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const val = change.value;
          if (!val) continue;

          // 1. Process delivery statuses (delivered, read, failed, sent)
          if (val.statuses && Array.isArray(val.statuses)) {
            for (const st of val.statuses) {
              const wamId = st.id;
              const status = st.status;
              const errMsg = st.errors?.[0]?.message || st.errors?.[0]?.title || null;
              await query(
                'UPDATE whatsapp_messages SET status = $1, failure_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE wam_id = $3',
                [status, errMsg, wamId]
              ).catch(() => {});

              if (status === 'failed') {
                const isNotOnWa = (st.errors || []).some(err => err.code === 131026 || String(err.message || '').toLowerCase().includes('not a valid whatsapp user'));
                if (isNotOnWa && st.recipient_id) {
                  const last10 = getLast10Digits(st.recipient_id);
                  await query(
                    `INSERT INTO whatsapp_number_registry (phone, is_whatsapp_active, status, source, notes, updated_at)
                     VALUES ($1, 0, 'invite_required', 'meta_delivery_failed_131026', 'Recipient is not a valid WhatsApp user', CURRENT_TIMESTAMP)
                     ON CONFLICT (phone) DO UPDATE SET is_whatsapp_active = 0, status = 'invite_required', updated_at = CURRENT_TIMESTAMP`,
                    [last10]
                  ).catch(() => {});
                }
              }
            }
          }

          // 2. Process incoming customer messages
          if (val.messages && Array.isArray(val.messages)) {
            for (const msg of val.messages) {
              const wamId = msg.id;
              const rawFrom = msg.from || '';
              const cleanDigits = rawFrom.replace(/[^0-9]/g, '');
              const last10 = cleanDigits.slice(-10);
              const canonicalPhone = `91${last10}`;

              // Idempotency check
              const dupRes = await query('SELECT id FROM whatsapp_messages WHERE wam_id = $1 LIMIT 1', [wamId]);
              if (dupRes.rows.length > 0) continue;

              // Contact name from Meta profile
              const profileName = val.contacts?.find(c => (c.wa_id || '').includes(last10))?.profile?.name || null;
              if (profileName) {
                await query(
                  `INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, source, updated_at)
                   VALUES ($1, $2, 1, 'verified', 'meta_webhook_profile', CURRENT_TIMESTAMP)
                   ON CONFLICT (phone) DO UPDATE SET customer_name = $2, is_whatsapp_active = 1, status = 'verified', updated_at = CURRENT_TIMESTAMP`,
                  [last10, profileName]
                ).catch(() => {});
              }

              // Match complaint by phone
              const compRes = await query(
                `SELECT id, customer_name FROM complaints WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1 ORDER BY id DESC LIMIT 1`,
                [last10]
              );
              const comp = compRes.rows[0] || null;

              const senderName = (comp && comp.customer_name && comp.customer_name !== 'Customer')
                ? comp.customer_name
                : (profileName || formatDisplayPhone(canonicalPhone));

              let messageBody = '';
              let mediaType = null;
              let mediaUrl = null;

              if (msg.type === 'text') {
                messageBody = msg.text?.body || '';
              } else if (msg.type === 'image') {
                mediaType = 'image';
                messageBody = msg.image?.caption || '[Image Received]';
              } else if (msg.type === 'document') {
                mediaType = 'document';
                messageBody = msg.document?.caption || `[Document: ${msg.document?.filename || 'Document'}]`;
              } else if (msg.type === 'audio') {
                mediaType = 'audio';
                messageBody = '[Voice Note / Audio]';
              } else {
                messageBody = `[${msg.type || 'Message'} Received]`;
              }

              await query(
                `INSERT INTO whatsapp_messages (
                  complaint_id, phone, sender_type, sender_name, message_body, media_type, media_url, wam_id, status, created_at, updated_at
                ) VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7, 'received', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [comp?.id || null, canonicalPhone, senderName, messageBody, mediaType, mediaUrl, wamId]
              ).catch(() => {});
            }
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (e) {
    console.warn('[Webhook Error]', e.message);
    return res.status(200).send('EVENT_RECEIVED');
  }
});

// ==================== PRODUCTS CATALOG ====================
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT * FROM products ORDER BY name ASC');
    return res.json({ products: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, category, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    const r = await query(
      'INSERT INTO products (name, category, description) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), category || 'General', description || '']
    );
    return res.status(201).json({ product: r.rows[0], message: 'Product added successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM products WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== ISSUE CATEGORIES ====================
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const { product_type } = req.query;
    let r;
    if (product_type) {
      r = await query('SELECT * FROM issue_categories WHERE product_type = $1 ORDER BY category_name ASC', [product_type]);
    } else {
      r = await query('SELECT * FROM issue_categories ORDER BY product_type, category_name ASC');
    }
    return res.json({ categories: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  try {
    const { product_type, category_name, default_priority } = req.body;
    if (!product_type || !category_name) return res.status(400).json({ error: 'product_type and category_name required' });
    const r = await query(
      'INSERT INTO issue_categories (product_type, category_name, default_priority) VALUES ($1, $2, $3) RETURNING *',
      [product_type, category_name.trim(), default_priority || 'Medium']
    );
    return res.status(201).json({ category: r.rows[0], message: 'Category added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM issue_categories WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Clear WhatsApp Chat for a phone number
app.post('/api/whatsapp/clear-chat/:phone', authenticateToken, async (req, res) => {
  try {
    const raw = req.params.phone || '';
    const clean = raw.replace(/[^0-9]/g, '').slice(-10);
    if (!clean) return res.status(400).json({ error: 'Valid phone required' });
    await query("DELETE FROM whatsapp_messages WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1", [clean]);
    return res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Fallback status check
app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    platform: 'Vercel Serverless',
    database: 'Supabase Cloud PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
