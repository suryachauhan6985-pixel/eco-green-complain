import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';

const commonRoutes = new Hono();

// GET /api/version & /version.json
commonRoutes.get('/version', (c) => {
  return c.json({
    version: '2.6.0',
    build: 'b_cloudflare_edge_2026',
    platform: 'Cloudflare Workers (Hono)',
    storage: 'Cloudflare R2 (eco-green-solar-cms-media)',
    database: 'Supabase PostgreSQL (Hyperdrive 8ada220e5c6b47a3a6b4bffcee9ba4bf)'
  });
});

// In-memory LRU cache for pincodes in Worker isolate
const pincodeMemoryCache = new Map();

// GET /api/location/pincode/:pincode
commonRoutes.get('/location/pincode/:pincode', async (c) => {
  const pincode = (c.req.param('pincode') || '').replace(/\D/g, '');
  if (pincode.length !== 6) {
    return c.json({ error: 'Valid 6-digit postal pincode required' }, 400);
  }

  // 1. Check in-memory isolate cache
  if (pincodeMemoryCache.has(pincode)) {
    c.header('X-Cache', 'HIT-MEMORY');
    c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return c.json(pincodeMemoryCache.get(pincode));
  }

  // 2. Check Cloudflare Edge Cache API
  const cacheKey = new Request(c.req.url, c.req.raw);
  let cache;
  try {
    cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const data = await cachedResponse.json();
      pincodeMemoryCache.set(pincode, data);
      c.header('X-Cache', 'HIT-CLOUDFLARE-EDGE');
      c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      return c.json(data);
    }
  } catch (_) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EcoGreenSolarCMS/2.6.0' }
    });
    clearTimeout(timeoutId);

    const data = await resp.json();

    if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
      const offices = data[0].PostOffice;
      const primary = offices[0];
      const result = {
        success: true,
        pincode,
        city: primary.Name || primary.Division || '',
        district: primary.District || '',
        state: primary.State || '',
        postOffices: offices.map(o => ({
          name: o.Name,
          district: o.District,
          state: o.State,
          deliveryStatus: o.DeliveryStatus
        }))
      };

      // Store in memory cache (cap to 500 entries)
      if (pincodeMemoryCache.size > 500) {
        const oldestKey = pincodeMemoryCache.keys().next().value;
        pincodeMemoryCache.delete(oldestKey);
      }
      pincodeMemoryCache.set(pincode, result);

      const jsonResp = c.json(result);
      jsonResp.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      jsonResp.headers.set('X-Cache', 'MISS');

      // Put into Cloudflare Edge Cache asynchronously
      if (cache) {
        c.executionCtx?.waitUntil(cache.put(cacheKey, jsonResp.clone()));
      }

      return jsonResp;
    }

    return c.json({ success: false, error: 'Pincode not found in national registry' }, 404);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/customers/search
commonRoutes.get('/customers/search', optionalAuth, async (c) => {
  try {
    const q = (c.req.query('q') || c.req.query('query') || c.req.query('search') || '').trim();
    if (!q || q.length < 2) {
      const sample = await query(`
        SELECT 
          id, customer_name, consumer_mobile, consumer_no, city_village, order_no,
          dealer_name, invoice_no, invoice_date, installation_date,
          warranty_expiry_date, panel_make, inverter_make, inverter_serial, is_in_warranty
        FROM installed_customers 
        ORDER BY id DESC 
        LIMIT 10
      `, [], c.env, c.executionCtx);
      return c.json({ customers: sample.rows, totalMatches: sample.rows.length });
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const conditions = [];
    const params = [];

    tokens.forEach((token, idx) => {
      const paramIdx = idx + 1;
      params.push(`%${token}%`);
      conditions.push(`(
        customer_name ILIKE $${paramIdx} 
        OR consumer_mobile ILIKE $${paramIdx} 
        OR consumer_no ILIKE $${paramIdx} 
        OR city_village ILIKE $${paramIdx} 
        OR inverter_serial ILIKE $${paramIdx}
        OR invoice_no ILIKE $${paramIdx}
        OR dealer_name ILIKE $${paramIdx}
        OR order_no ILIKE $${paramIdx}
      )`);
    });

    const whereClause = conditions.join(' AND ');
    const r = await query(`
      SELECT 
        id, customer_name, consumer_mobile, consumer_no, city_village, order_no,
        dealer_name, invoice_no, invoice_date, installation_date,
        warranty_expiry_date, panel_make, inverter_make, inverter_serial, is_in_warranty
      FROM installed_customers 
      WHERE ${whereClause}
      ORDER BY id DESC 
      LIMIT 25
    `, params, c.env, c.executionCtx);

    return c.json({ customers: r.rows, totalMatches: r.rows.length });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/customers/stats
commonRoutes.get('/customers/stats', optionalAuth, async (c) => {
  try {
    const r = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_in_warranty = 1) as in_warranty,
        COUNT(*) FILTER (WHERE is_in_warranty = 0 OR is_in_warranty IS NULL) as out_warranty
      FROM installed_customers
    `, [], c.env, c.executionCtx);
    const row = r.rows[0];
    const actualTotal = parseInt(row.total || 0, 10);
    const inWarranty = parseInt(row.in_warranty || 0, 10);
    const outWarranty = parseInt(row.out_warranty || 0, 10);

    if (actualTotal > 0) {
      return c.json({
        totalCustomers: actualTotal,
        inWarrantyCount: inWarranty,
        outWarrantyCount: outWarranty
      });
    }

    const statRes = await query('SELECT total_customers, in_warranty_count, out_warranty_count FROM customer_directory_stats ORDER BY id DESC LIMIT 1', [], c.env, c.executionCtx);
    if (statRes.rows.length > 0) {
      return c.json({
        totalCustomers: Number(statRes.rows[0].total_customers || 0),
        inWarrantyCount: Number(statRes.rows[0].in_warranty_count || 0),
        outWarrantyCount: Number(statRes.rows[0].out_warranty_count || 0)
      });
    }

    return c.json({ totalCustomers: 0, inWarrantyCount: 0, outWarrantyCount: 0 });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/customers/sync
commonRoutes.post('/customers/sync', authenticateToken, requireRole('admin', 'staff'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { 
      totalCustomers, 
      inWarrantyCount, 
      outWarrantyCount, 
      customers = body.rows,
      isFirstBatch,
      batchIndex = 0
    } = body;

    let inserted = 0;

    if ((isFirstBatch === true || (batchIndex === 0 && !body.append)) && Array.isArray(customers) && customers.length > 0) {
      await query('DELETE FROM installed_customers', [], c.env, c.executionCtx).catch(() => {});
    }

    if (Array.isArray(customers) && customers.length > 0) {
      for (const row of customers) {
        if (!row.customer_name && !row.name) continue;
        const name = (row.customer_name || row.name || '').trim();
        const mobile = (row.consumer_mobile || row.phone || '').trim();
        await query(`
          INSERT INTO installed_customers (
            customer_name, consumer_mobile, consumer_no, city_village, dealer_name,
            invoice_no, invoice_date, installation_date, inverter_serial, is_in_warranty, warranty_expiry_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          name.slice(0, 250),
          mobile ? mobile.slice(0, 50) : null,
          row.consumer_no ? String(row.consumer_no).slice(0, 100) : null,
          row.city_village ? String(row.city_village).slice(0, 250) : null,
          row.dealer_name ? String(row.dealer_name).slice(0, 250) : null,
          row.invoice_no ? String(row.invoice_no).slice(0, 100) : null,
          row.invoice_date || null,
          row.installation_date || null,
          row.inverter_serial ? String(row.inverter_serial).slice(0, 100) : null,
          (row.is_in_warranty === 1 || row.is_in_warranty === true) ? 1 : 0,
          row.warranty_expiry_date || null
        ], c.env, c.executionCtx).catch(() => {});
        inserted++;
      }
    }

    return c.json({ success: true, count: inserted });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/reports/metrics
commonRoutes.get('/reports/metrics', authenticateToken, async (c) => {
  try {
    const [compStats, techStats, chargesStats] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN status = 'Unassigned' THEN 1 END) as unassigned_count,
          COUNT(CASE WHEN status = 'Assigned' THEN 1 END) as assigned_count,
          COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_count,
          COUNT(CASE WHEN status = 'On Hold' THEN 1 END) as on_hold_count,
          COUNT(CASE WHEN status = 'Resolved' THEN 1 END) as resolved_count,
          COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_count,
          COUNT(CASE WHEN status = 'Reopened' THEN 1 END) as reopened_count
        FROM complaints
      `, [], c.env, c.executionCtx),
      query('SELECT COUNT(*) as total_technicians, COUNT(CASE WHEN is_available = 1 THEN 1 END) as active_technicians FROM technicians', [], c.env, c.executionCtx),
      query(`
        SELECT 
          COALESCE(SUM(estimated_charges), 0) as total_estimated,
          COALESCE(SUM(payment_collected), 0) as total_collected
        FROM complaints
      `, [], c.env, c.executionCtx)
    ]);

    return c.json({
      complaints: compStats.rows[0],
      technicians: techStats.rows[0],
      finances: chargesStats.rows[0]
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/products
commonRoutes.get('/products', async (c) => {
  try {
    const res = await query('SELECT id, name, icon, description FROM products ORDER BY id ASC', [], c.env, c.executionCtx);
    if (res.rows.length > 0) {
      return c.json({ products: res.rows });
    }
  } catch (_) {}
  return c.json({
    products: [
      { id: 1, name: 'Solar Rooftop Systems', category: 'Solar' },
      { id: 2, name: 'Solar Water Heaters', category: 'Thermal' },
      { id: 3, name: 'Solar Pumps', category: 'Agriculture' },
      { id: 4, name: 'Heat Pumps', category: 'HVAC' }
    ]
  });
});

// GET /api/categories
commonRoutes.get('/categories', async (c) => {
  try {
    const res = await query('SELECT id, product_type, category_name FROM issue_categories ORDER BY id ASC', [], c.env, c.executionCtx);
    return c.json({ categories: res.rows });
  } catch (err) {
    return c.json({ categories: [] });
  }
});

// ==================== NOTIFICATION TEMPLATES ROUTES ====================
// GET /api/notifications/templates
commonRoutes.get('/notifications/templates', authenticateToken, async (c) => {
  try {
    const res = await query(`
      SELECT * FROM notification_templates 
      ORDER BY 
        CASE audience 
          WHEN 'customer' THEN 1 
          WHEN 'technician' THEN 2 
          WHEN 'staff' THEN 3 
          ELSE 4 
        END ASC, 
        id ASC
    `, [], c.env, c.executionCtx);
    return c.json({ success: true, templates: res.rows });
  } catch (err) {
    return c.json({ error: 'Failed to fetch templates: ' + err.message }, 500);
  }
});

// GET /api/notifications/templates/meta-status
commonRoutes.get('/notifications/templates/meta-status', authenticateToken, async (c) => {
  try {
    const res = await query('SELECT id, template_key, meta_status, last_synced_at FROM notification_templates ORDER BY id ASC', [], c.env, c.executionCtx);
    return c.json({ success: true, templates: res.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/notifications/templates/:id
commonRoutes.put('/notifications/templates/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { whatsapp_body, email_subject, email_body, is_active, name } = body;

    const res = await query(`
      UPDATE notification_templates SET
        whatsapp_body = COALESCE($1, whatsapp_body),
        email_subject = COALESCE($2, email_subject),
        email_body = COALESCE($3, email_body),
        is_active = COALESCE($4, is_active),
        name = COALESCE($5, name),
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $6 OR template_key = $6
      RETURNING *
    `, [whatsapp_body, email_subject, email_body, is_active, name, String(id)], c.env, c.executionCtx);

    if (!res.rows.length) {
      return c.json({ error: 'Template not found' }, 404);
    }
    return c.json({ success: true, message: 'Template updated successfully', template: res.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/notifications/templates/:id/toggle-active
commonRoutes.post('/notifications/templates/:id/toggle-active', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const res = await query(`
      UPDATE notification_templates SET
        is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $1 OR template_key = $1
      RETURNING is_active
    `, [String(id)], c.env, c.executionCtx);

    if (!res.rows.length) {
      return c.json({ error: 'Template not found' }, 404);
    }
    return c.json({ success: true, is_active: res.rows[0].is_active, message: 'Status updated' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/notifications/templates
commonRoutes.post('/notifications/templates', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      name,
      template_key,
      audience = 'customer',
      trigger_event = 'manual',
      whatsapp_body,
      email_subject = '',
      email_body = '',
      is_active = 1
    } = body;

    if (!name || !whatsapp_body) {
      return c.json({ error: 'Template name and WhatsApp body are required' }, 400);
    }

    const cleanKey = (template_key || name.toLowerCase().replace(/[^a-z0-9_]/g, '_')).replace(/_+/g, '_').slice(0, 50);

    const res = await query(`
      INSERT INTO notification_templates (
        template_key, name, whatsapp_body, email_subject, email_body,
        audience, trigger_event, is_active, channel, meta_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'whatsapp', 'DIRECT_CHAT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [cleanKey, name.trim(), whatsapp_body, email_subject || name.trim(), email_body || whatsapp_body, audience, trigger_event, is_active], c.env, c.executionCtx);

    return c.json({ success: true, message: 'Template created', template: res.rows[0] }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/notifications/templates/:id
commonRoutes.delete('/notifications/templates/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM notification_templates WHERE id::text = $1 OR template_key = $1', [String(id)], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/notifications/templates/:id/sync-meta
commonRoutes.post('/notifications/templates/:id/sync-meta', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const manualStatus = body?.manualStatus || 'APPROVED';

    const res = await query(`
      UPDATE notification_templates SET
        meta_status = $1,
        last_synced_at = CURRENT_TIMESTAMP,
        sync_status = 'SYNCED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $2 OR template_key = $2
      RETURNING *
    `, [manualStatus, String(id)], c.env, c.executionCtx);

    if (!res.rows.length) {
      return c.json({ error: 'Template not found' }, 404);
    }
    return c.json({ success: true, message: 'Template synced with Meta', template: res.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/in-app-notifications
commonRoutes.get('/in-app-notifications', optionalAuth, async (c) => {
  try {
    const r = await query('SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 200', [], c.env, c.executionCtx);
    const mapped = (r.rows || []).map(row => ({
      id: row.id,
      type: row.type,
      ticketId: row.ticket_id,
      complaintId: row.complaint_id,
      title: row.title,
      message: row.message,
      customerName: row.customer_name,
      targetRole: row.target_role || 'all',
      targetTechnicianId: row.target_technician_id,
      targetTechnicianName: row.target_technician_name,
      performedByName: row.performed_by_name,
      performedByRole: row.performed_by_role,
      readBy: Array.isArray(row.read_by) ? row.read_by : (typeof row.read_by === 'string' ? JSON.parse(row.read_by || '[]') : []),
      acknowledgedBy: Array.isArray(row.acknowledged_by) ? row.acknowledged_by : (typeof row.acknowledged_by === 'string' ? JSON.parse(row.acknowledged_by || '[]') : []),
      createdAt: row.created_at
    }));
    return c.json({ notifications: mapped });
  } catch (err) {
    return c.json({ notifications: [] });
  }
});

// POST /api/in-app-notifications
commonRoutes.post('/in-app-notifications', optionalAuth, async (c) => {
  try {
    const b = await c.req.json().catch(() => ({}));
    const id = b.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = c.get('user');
    await query(`
      INSERT INTO in_app_notifications (
        id, type, ticket_id, complaint_id, title, message, customer_name,
        target_role, target_technician_id, target_technician_name,
        performed_by_name, performed_by_role, read_by, acknowledged_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
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
      b.performedByName || user?.name || 'Staff',
      b.performedByRole || user?.role || 'staff',
      JSON.stringify(b.readBy || []),
      JSON.stringify(b.acknowledgedBy || [])
    ], c.env, c.executionCtx);
    return c.json({ success: true, id }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/in-app-notifications/:id/read
commonRoutes.put('/in-app-notifications/:id/read', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const userKeys = [
      user?.id ? String(user.id) : null,
      user?.username || null,
      user?.email || null,
      user?.name || null,
      user?.role || null,
      'read'
    ].filter(Boolean);

    await query(`
      UPDATE in_app_notifications
      SET read_by = CASE
        WHEN jsonb_typeof(read_by) = 'array' THEN read_by || $1::jsonb
        ELSE $1::jsonb
      END
      WHERE id = $2 OR ticket_id = $2
    `, [JSON.stringify(userKeys), id], c.env, c.executionCtx);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/in-app-notifications/read-all
commonRoutes.put('/in-app-notifications/read-all', optionalAuth, async (c) => {
  try {
    const user = c.get('user');
    const userKeys = [
      user?.id ? String(user.id) : null,
      user?.username || null,
      user?.email || null,
      user?.name || null,
      user?.role || null,
      'read'
    ].filter(Boolean);

    await query(`
      UPDATE in_app_notifications
      SET read_by = CASE
        WHEN jsonb_typeof(read_by) = 'array' THEN read_by || $1::jsonb
        ELSE $1::jsonb
      END
    `, [JSON.stringify(userKeys)], c.env, c.executionCtx);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/in-app-notifications
commonRoutes.delete('/in-app-notifications', optionalAuth, async (c) => {
  try {
    await query('DELETE FROM in_app_notifications', [], c.env, c.executionCtx);
    return c.json({ success: true, message: 'All in-app notifications cleared' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default commonRoutes;
