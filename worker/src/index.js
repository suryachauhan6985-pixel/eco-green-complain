import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes from './routes/authRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import attachmentRoutes from './routes/attachmentRoutes.js';
import technicianRoutes from './routes/technicianRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import commonRoutes from './routes/commonRoutes.js';

const app = new Hono();

// Global Security & CORS
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://complain.ecogreensolar.co.in',
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000'
    ];
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      return origin || '*';
    }
    return 'https://complain.ecogreensolar.co.in';
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Filename'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'ETag', 'Content-Disposition'],
  maxAge: 86400
}));

// HTTP Security Headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    worker: 'eco-green-solar-cms-api',
    runtime: 'Cloudflare Workers (Hono)',
    storage: 'Cloudflare R2 (eco-green-solar-cms-media)',
    database: 'Supabase PostgreSQL (Hyperdrive 8ada220e5c6b47a3a6b4bffcee9ba4bf)',
    timestamp: new Date().toISOString()
  });
});


// Meta Webhook Direct Endpoints (both /webhook and /api/whatsapp/webhook)
app.route('/webhook', whatsappRoutes);
app.route('/api/webhook', whatsappRoutes);

// Mount Modular Routes
app.route('/api/auth', authRoutes);
app.route('/api/complaints', complaintRoutes);
app.route('/api/whatsapp', whatsappRoutes);
app.route('/whatsapp', whatsappRoutes);
app.route('/api', attachmentRoutes);
app.route('/api', technicianRoutes);
app.route('/api', commonRoutes);

// Version alias at root
app.get('/version.json', (c) => {
  return c.json({
    version: '2.6.0',
    build: 'b_cloudflare_edge_2026',
    platform: 'Cloudflare Workers (Hono)'
  });
});

// 404 Handler
app.notFound((c) => {
  return c.json({ error: 'Endpoint not found on Cloudflare Worker API' }, 404);
});

// Global Error Handler
app.onError((err, c) => {
  console.error('[Worker Global Error]', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message
  }, 500);
});

export default app;
