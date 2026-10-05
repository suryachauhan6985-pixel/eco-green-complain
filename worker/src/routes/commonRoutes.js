import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { META_WABA_ID, DEFAULT_META_ACCESS_TOKEN } from '../whatsapp.js';
import {
  VAPID_PUBLIC_KEY,
  savePushSubscription,
  removePushSubscription,
  dispatchPushToRoles,
  dispatchPushToTechnician,
  sendTestPush
} from '../services/webPushService.js';

async function fetchMetaTemplatesFromGraph(env) {
  const token = env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
  const wabaId = env?.META_WABA_ID || META_WABA_ID;
  if (!token || !wabaId) return { success: false, templates: [] };

  try {
    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=id,name,status,category,language&limit=100`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err?.error?.message || `Meta API HTTP ${resp.status}`, templates: [] };
    }
    const data = await resp.json();
    return { success: true, templates: Array.isArray(data?.data) ? data.data : [] };
  } catch (err) {
    return { success: false, error: err.message, templates: [] };
  }
}

const commonRoutes = new Hono();

// GET /api/version & /version.json
commonRoutes.get('/version', (c) => {
  return c.json({
    version: '2.6.2',
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
      headers: { 'User-Agent': 'EcoGreenSolarCMS/2.6.2' }
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

    let results = [...r.rows];

    // Also search past complaints to find customers who may have registered tickets with phone/order_no/dealer_name
    if (results.length < 25) {
      const complaintConditions = [];
      tokens.forEach((token, idx) => {
        const paramIdx = idx + 1;
        complaintConditions.push(`(
          customer_name ILIKE $${paramIdx} 
          OR customer_phone ILIKE $${paramIdx} 
          OR consumer_no ILIKE $${paramIdx} 
          OR city ILIKE $${paramIdx} 
          OR order_no ILIKE $${paramIdx}
          OR dealer_name ILIKE $${paramIdx}
        )`);
      });
      const compWhere = complaintConditions.join(' AND ');
      const compRes = await query(`
        SELECT DISTINCT ON (customer_phone, customer_name)
          id, customer_name, customer_phone as consumer_mobile, consumer_no, city as city_village, order_no,
          dealer_name, invoice_no, invoice_date, NULL as installation_date,
          NULL as warranty_expiry_date, NULL as panel_make, NULL as inverter_make,
          product_serial as inverter_serial, is_in_warranty, customer_address
        FROM complaints
        WHERE ${compWhere}
        ORDER BY customer_phone, customer_name, id DESC
        LIMIT ${25 - results.length}
      `, params, c.env, c.executionCtx).catch(() => ({ rows: [] }));

      if (compRes.rows && compRes.rows.length > 0) {
        // Only append if not already in results by mobile or name
        const existingMobiles = new Set(results.map(x => (x.consumer_mobile || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
        for (const row of compRes.rows) {
          const mob = (row.consumer_mobile || '').replace(/\D/g, '').slice(-10);
          if (!mob || !existingMobiles.has(mob)) {
            results.push(row);
            if (mob) existingMobiles.add(mob);
          }
        }
      }
    }

    return c.json({ customers: results, totalMatches: results.length });
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
            customer_name, consumer_mobile, consumer_no, order_no, city_village, dealer_name,
            invoice_no, invoice_date, installation_date, inverter_serial, is_in_warranty, warranty_expiry_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          name.slice(0, 250),
          mobile ? mobile.slice(0, 50) : null,
          row.consumer_no ? String(row.consumer_no).slice(0, 100) : null,
          row.order_no ? String(row.order_no).slice(0, 100) : null,
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
    const res = await query('SELECT id, name, icon, description, is_custom FROM products ORDER BY id ASC', [], c.env, c.executionCtx);
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

// POST /api/products
commonRoutes.post('/products', authenticateToken, async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, icon } = body;
    if (!name || !name.trim()) {
      return c.json({ error: 'Product name is required' }, 400);
    }
    const cleanName = name.trim();
    const cleanDesc = description ? description.trim() : '';
    const cleanIcon = icon ? icon.trim() : 'Sun';

    const existing = await query('SELECT id FROM products WHERE LOWER(name) = LOWER($1)', [cleanName], c.env, c.executionCtx);
    if (existing.rows.length > 0) {
      return c.json({ error: `Product "${cleanName}" already exists in catalog` }, 409);
    }

    const res = await query(
      'INSERT INTO products (name, description, icon, is_custom) VALUES ($1, $2, $3, 1) RETURNING *',
      [cleanName, cleanDesc, cleanIcon],
      c.env,
      c.executionCtx
    );

    return c.json({
      product: res.rows[0],
      message: 'Product added successfully'
    }, 201);
  } catch (err) {
    console.error('[Add Product Error]', err);
    return c.json({ error: 'Failed to add product: ' + err.message }, 500);
  }
});

// DELETE /api/products/:id
commonRoutes.delete('/products/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM products WHERE id = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('[Delete Product Error]', err);
    return c.json({ error: 'Failed to delete product: ' + err.message }, 500);
  }
});

// GET /api/categories
commonRoutes.get('/categories', async (c) => {
  try {
    const productType = c.req.query('product_type');
    let res;
    if (productType) {
      res = await query(
        'SELECT id, product_type, category_name, is_default FROM issue_categories WHERE product_type = $1 ORDER BY category_name ASC',
        [productType],
        c.env,
        c.executionCtx
      );
    } else {
      res = await query(
        'SELECT id, product_type, category_name, is_default FROM issue_categories ORDER BY id ASC',
        [],
        c.env,
        c.executionCtx
      );
    }
    return c.json({ categories: res.rows });
  } catch (err) {
    return c.json({ categories: [] });
  }
});

// POST /api/categories
commonRoutes.post('/categories', authenticateToken, async (c) => {
  try {
    const body = await c.req.json();
    const { product_type, category_name } = body;
    if (!product_type || !category_name || !category_name.trim()) {
      return c.json({ error: 'product_type and category_name required' }, 400);
    }
    const cleanCat = category_name.trim();

    const existing = await query(
      'SELECT id FROM issue_categories WHERE product_type = $1 AND LOWER(category_name) = LOWER($2)',
      [product_type, cleanCat],
      c.env,
      c.executionCtx
    );
    if (existing.rows.length > 0) {
      return c.json({ error: 'Category already exists for this product' }, 409);
    }

    const res = await query(
      'INSERT INTO issue_categories (product_type, category_name, is_default) VALUES ($1, $2, 0) RETURNING *',
      [product_type, cleanCat],
      c.env,
      c.executionCtx
    );

    return c.json({
      category: res.rows[0],
      message: 'Category added'
    }, 201);
  } catch (err) {
    console.error('[Add Category Error]', err);
    return c.json({ error: 'Failed to add category: ' + err.message }, 500);
  }
});

// DELETE /api/categories/:id
commonRoutes.delete('/categories/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM issue_categories WHERE id = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    console.error('[Delete Category Error]', err);
    return c.json({ error: 'Failed to delete category: ' + err.message }, 500);
  }
});

// ==================== NOTIFICATION TEMPLATES ROUTES ====================
// GET /api/notifications/templates
commonRoutes.get('/notifications/templates', authenticateToken, async (c) => {
  try {
    let res = await query(`
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

    const existingKeys = new Set((res.rows || []).map(r => r.template_key));
    const missingDefaults = [
      {
        template_key: 'charges_added',
        name: 'Service Charges Added / Updated',
        audience: 'customer',
        trigger_event: 'charges_added',
        meta_template_name: 'charges_added',
        whatsapp_body: '☀️ *Eco Green Solar - Service Charges Update*\n\nDear {{customer_name}},\n\nEstimated service charges have been updated for your complaint ticket *{{complaint_id}}*.\n\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}}\n💰 *Estimated Service Charges:* ₹{{estimated_charges}}\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nOur service team will attend to your request. For any questions, please contact our support.\n- Eco Green Solar Care',
        email_subject: '[Eco Green Solar] Service Charges Updated - Ticket #{{complaint_id}}',
        email_body: 'Dear {{customer_name}},\n\nEstimated service charges have been updated for your complaint ticket #{{complaint_id}}.\n\nProduct: {{product_type}}\nIssue: {{issue_category}}\nEstimated Charges: ₹{{estimated_charges}}\n\nTrack live status at: {{feedback_url}}'
      },
      {
        template_key: 'charges_removed',
        name: 'Service Charges Removed / Waived',
        audience: 'customer',
        trigger_event: 'charges_removed',
        meta_template_name: 'charges_removed',
        whatsapp_body: '☀️ *Eco Green Solar - Charges Waived / Removed*\n\nDear {{customer_name}},\n\nThe service charges for your complaint ticket *{{complaint_id}}* have been waived / removed (₹0).\n\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}}\n💰 *Revised Service Charges:* ₹0 (Free / Covered Under Warranty)\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nOur technician will proceed with the service visit without additional charges.\n- Eco Green Solar Care',
        email_subject: '[Eco Green Solar] Service Charges Waived - Ticket #{{complaint_id}}',
        email_body: 'Dear {{customer_name}},\n\nThe service charges for your complaint ticket #{{complaint_id}} have been waived / removed (₹0).\n\nProduct: {{product_type}}\nIssue: {{issue_category}}\nRevised Charges: ₹0 (Covered Under Warranty)\n\nTrack live status at: {{feedback_url}}'
      },
      {
        template_key: 'site_survey_registered',
        name: 'Site Survey Request Registered',
        audience: 'customer',
        trigger_event: 'site_survey_registered',
        meta_template_name: 'site_survey_registered',
        whatsapp_body: '☀️ *Eco Green Solar - Site Survey Request Registered*\n\nDear {{customer_name}},\n\nYour site feasibility survey request has been registered with Ticket ID: *{{ticket_id}}*.\n\n📋 *Scope:* {{product_type}} - {{issue_category}}\n\nOur engineering team will review the details and assign a field surveyor shortly to conduct your site inspection.\n\nThank you for choosing Eco Green Solar!',
        email_subject: '[Eco Green Solar] Site Survey Registered - Ticket #{{ticket_id}}',
        email_body: 'Dear {{customer_name}},\n\nYour site survey request #{{ticket_id}} has been registered.\nScope: {{product_type}} - {{issue_category}}\n\nA technical surveyor will be assigned soon.'
      },
      {
        template_key: 'site_survey_assigned',
        name: 'Site Survey Technician Assigned',
        audience: 'customer',
        trigger_event: 'site_survey_assigned',
        meta_template_name: 'site_survey_assigned',
        whatsapp_body: '☀️ *Eco Green Solar - Site Surveyor Assigned*\n\nDear {{customer_name}},\n\nA technical surveyor has been assigned for your Site Survey Ticket *{{ticket_id}}*.\n\n👷 *Surveyor Name:* {{technician_name}}\n📞 *Contact:* {{technician_phone}}\n📅 *Scheduled Date:* {{expected_visit_date}}\n\nThe surveyor will visit your location to inspect feasibility, rooftop structure, shadow analysis, and electrical provisions.\n\nThank you,\nEco Green Solar Team',
        email_subject: '[Eco Green Solar] Site Surveyor Assigned - Ticket #{{ticket_id}}',
        email_body: 'Dear {{customer_name}},\n\nSurveyor {{technician_name}} (Phone: {{technician_phone}}) has been assigned for your site survey #{{ticket_id}}.\nScheduled: {{expected_visit_date}}.'
      },
      {
        template_key: 'site_survey_work_order',
        name: 'Site Survey Work Order (Technician)',
        audience: 'technician',
        trigger_event: 'site_survey_work_order',
        meta_template_name: 'site_survey_work_order',
        whatsapp_body: '📋 *Eco Green Solar - New Site Survey Work Order*\n\nHello {{technician_name}},\n\nA new site survey request has been assigned to you:\n\n*Survey Ticket:* #{{ticket_id}}\n👤 *Client:* {{customer_name}} ({{customer_phone}})\n📍 *Site Address:* {{customer_address}}\n🔍 *System Scope:* {{product_type}} - {{issue_category}}\n📝 *Requirements / Notes:* {{notes}}\n📅 *Visit Date:* {{expected_visit_date}}\n\n*Instructions:*\n1. Conduct structural feasibility, shadow analysis & electrical intake audit.\n2. Capture rooftop / site photos and video walkthrough.\n3. Submit survey findings and documentation via Technician Portal.',
        email_subject: '[Eco Green Solar] New Site Survey Work Order - #{{ticket_id}}',
        email_body: 'Hello {{technician_name}},\n\nYou have been assigned a new site survey work order #{{ticket_id}}.\nClient: {{customer_name}} ({{customer_phone}})\nSite Address: {{customer_address}}\nScope: {{product_type}} - {{issue_category}}\nNotes: {{notes}}'
      },
      {
        template_key: 'site_survey_resolved',
        name: 'Site Survey Completed',
        audience: 'customer',
        trigger_event: 'site_survey_resolved',
        meta_template_name: 'site_survey_resolved',
        whatsapp_body: '☀️ *Eco Green Solar - Site Survey Completed*\n\nDear {{customer_name}},\n\nThe site survey for your project (Ticket *{{ticket_id}}*) has been successfully completed by {{technician_name}}.\n\n📑 *Survey Findings & Feasibility Summary:*\n{{resolution_notes}}\n\nOur engineering team will prepare your custom solar proposal and quotation based on these survey measurements.\n\nThank you for choosing Eco Green Solar!',
        email_subject: '[Eco Green Solar] Site Survey Completed - Ticket #{{ticket_id}}',
        email_body: 'Dear {{customer_name}},\n\nThe site survey for ticket #{{ticket_id}} has been completed by {{technician_name}}.\nFindings: {{resolution_notes}}\n\nOur engineering team will prepare your custom proposal shortly.'
      },
      {
        template_key: 'site_survey_reach_out',
        name: 'Site Surveyor Direct Client Reachout',
        audience: 'customer',
        trigger_event: 'site_survey_reach_out',
        meta_template_name: 'site_survey_reach_out',
        whatsapp_body: '☀️ *Eco Green Solar - Site Survey Coordination*\n\nHello {{customer_name}},\n\nThis is {{technician_name}} from Eco Green Solar engineering team. I am assigned for your site survey (Ticket *{{ticket_id}}* - {{product_type}}).\n\nI will be arriving to evaluate your site and rooftop layout. Please let me know if the location is accessible or if there are specific directions.\n\nThank you!',
        email_subject: '[Eco Green Solar] Site Survey Coordination - Ticket #{{ticket_id}}',
        email_body: 'Hello {{customer_name}},\n\nThis is {{technician_name}} from Eco Green Solar regarding your site survey ticket #{{ticket_id}}.'
      },
      {
        template_key: 'technician_team_work_order',
        name: 'Technician Team Work Order (Dual Technicians Assigned)',
        audience: 'technician',
        trigger_event: 'technician_team_work_order',
        meta_template_name: 'technician_dual_team_work_order',
        whatsapp_body: '🛠️ *Eco Green Solar - Team Work Order (2 Technicians)*\n\nHello {{technician_name}}, you and *{{partner_technician_name}}* have been assigned as a 2-member service team for Ticket *{{complaint_id}}*.\n\n👥 *Assigned Team:* {{technician_name}} & {{partner_technician_name}}\n📞 *Partner Contact:* {{partner_technician_phone}}\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}} - {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease coordinate with {{partner_technician_name}} and call the customer before visiting the site.',
        email_subject: '[Eco Green Solar] Team Work Order: Ticket #{{complaint_id}} - {{customer_name}}',
        email_body: 'Dear {{technician_name}},\n\nYou and {{partner_technician_name}} have been assigned as a joint service team for complaint ticket #{{complaint_id}}.\n\nAssigned Team: {{technician_name}} & {{partner_technician_name}} (Phone: {{partner_technician_phone}})\nCustomer: {{customer_name}}\nPhone: {{customer_phone}}\nAddress: {{customer_address}}\nProduct: {{product_type}}\nIssue: {{issue_category}} - {{notes}}\nPriority: {{priority}}\nScheduled Visit: {{expected_visit_date}}\n\nPlease coordinate with your partner specialist and log into the Technician Portal to update progress.'
      },
      {
        template_key: 'technician_team_work_order_reassigned',
        name: 'Team Work Order Reassigned (Dual Technicians Reallocated)',
        audience: 'technician',
        trigger_event: 'technician_team_work_order_reassigned',
        meta_template_name: 'technician_team_work_order_reassigned',
        whatsapp_body: '🛠️ *Eco Green Solar - Team Reassigned Work Order*\n\nHello {{technician_name}}, ticket *{{complaint_id}}* has been transferred & assigned to you and *{{partner_technician_name}}* as a 2-member service team.\n\n📞 *Partner Contact:* {{partner_technician_phone}}\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Category:* {{issue_category}}\n📝 *Issue Details:* {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nPlease check your Eco Green technician portal for details and coordinate with the customer.',
        email_subject: '[Eco Green Solar] Team Reassigned Work Order: Ticket #{{complaint_id}}',
        email_body: 'Dear {{technician_name}},\n\nTicket #{{complaint_id}} has been reassigned to you and {{partner_technician_name}} as a 2-member service team.\nCustomer: {{customer_name}}\nAddress: {{customer_address}}\nExpected Visit: {{expected_visit_date}}'
      },
      {
        template_key: 'technician_team_partner_updated',
        name: 'Team Partner Updated (Co-Specialist Changed)',
        audience: 'technician',
        trigger_event: 'technician_team_partner_updated',
        meta_template_name: 'technician_team_partner_updated',
        whatsapp_body: '🛠️ *Eco Green Solar - Team Partner Update*\n\nHello {{technician_name}}, your service team partner for ticket *{{complaint_id}}* has been updated to *{{partner_technician_name}}*.\n\n📞 *Partner Contact:* {{partner_technician_phone}}\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Category:* {{issue_category}}\n📝 *Issue Details:* {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nPlease check your Eco Green technician portal for details and coordinate with your partner.',
        email_subject: '[Eco Green Solar] Team Partner Updated: Ticket #{{complaint_id}}',
        email_body: 'Dear {{technician_name}},\n\nYour co-partner for ticket #{{complaint_id}} has been updated to {{partner_technician_name}}.\nContact: {{partner_technician_phone}}\nCustomer: {{customer_name}}'
      },
      {
        template_key: 'technician_team_removed_notice',
        name: 'Team Removed Member Notice (Transferred/Unassigned)',
        audience: 'technician',
        trigger_event: 'technician_team_removed_notice',
        meta_template_name: 'technician_team_removed_notice',
        whatsapp_body: '*Eco Green Solar - Team Assignment Notice*\n\nHello {{technician_name}}, please note that your 2-member service team assignment for ticket *{{complaint_id}}* (Customer: {{customer_name}}) has been updated/transferred.\n\nYou are no longer required to visit this site for this ticket. Please check your technician portal for updated schedules.\n- Eco Green Solar',
        email_subject: '[Eco Green Solar] Team Assignment Notice: Ticket #{{complaint_id}}',
        email_body: 'Hello {{technician_name}},\n\nPlease note that your team assignment for ticket #{{complaint_id}} has been transferred. You are no longer required to visit this site.'
      }
    ].filter(d => !existingKeys.has(d.template_key));

    if (missingDefaults.length > 0) {
      for (const d of missingDefaults) {
        await query(`
          INSERT INTO notification_templates (
            template_key, name, whatsapp_body, email_subject, email_body,
            audience, trigger_event, meta_template_name, meta_status, is_active, channel, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 1, 'whatsapp', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (template_key) DO NOTHING
        `, [
          d.template_key, d.name, d.whatsapp_body, d.email_subject, d.email_body,
          d.audience, d.trigger_event, d.meta_template_name
        ], c.env, c.executionCtx).catch(e => console.warn('[AutoSeed Template Err]', e.message));
      }

      res = await query(`
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
    }

    // Live query Meta Graph API to reflect real Meta approval statuses
    try {
      const metaRes = await fetchMetaTemplatesFromGraph(c.env);
      if (metaRes.success && Array.isArray(metaRes.templates) && metaRes.templates.length > 0) {
        const metaMap = new Map();
        for (const mt of metaRes.templates) {
          if (mt.name) metaMap.set(mt.name.toLowerCase(), mt.status);
        }
        for (const row of res.rows) {
          const key = (row.meta_template_name || row.template_key || '').toLowerCase();
          const liveStatus = metaMap.has(key) ? metaMap.get(key) : 'PENDING';
          if (row.meta_status !== liveStatus) {
            row.meta_status = liveStatus;
            await query(
              'UPDATE notification_templates SET meta_status = $1, last_synced_at = CURRENT_TIMESTAMP WHERE id = $2',
              [liveStatus, row.id],
              c.env,
              c.executionCtx
            ).catch(() => {});
          }
        }
      }
    } catch (_) {}

    return c.json({ success: true, templates: res.rows });
  } catch (err) {
    return c.json({ error: 'Failed to fetch templates: ' + err.message }, 500);
  }
});

// GET /api/notifications/templates/meta-status
commonRoutes.get('/notifications/templates/meta-status', authenticateToken, async (c) => {
  try {
    const metaRes = await fetchMetaTemplatesFromGraph(c.env);
    if (metaRes.success && Array.isArray(metaRes.templates) && metaRes.templates.length > 0) {
      const metaMap = new Map();
      for (const mt of metaRes.templates) {
        if (mt.name) metaMap.set(mt.name.toLowerCase(), mt.status);
      }
      const dbRows = await query('SELECT id, template_key, meta_template_name, meta_status FROM notification_templates', [], c.env, c.executionCtx);
      for (const row of dbRows.rows) {
        const key = (row.meta_template_name || row.template_key || '').toLowerCase();
        const liveStatus = metaMap.has(key) ? metaMap.get(key) : 'PENDING';
        if (row.meta_status !== liveStatus) {
          await query('UPDATE notification_templates SET meta_status = $1, last_synced_at = CURRENT_TIMESTAMP WHERE id = $2', [liveStatus, row.id], c.env, c.executionCtx).catch(() => {});
        }
      }
    }
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
    const { 
      whatsapp_body, 
      email_subject, 
      email_body, 
      is_active, 
      name,
      meta_template_name,
      meta_status,
      audience,
      trigger_event,
      channel
    } = body;

    const res = await query(`
      UPDATE notification_templates SET
        whatsapp_body = COALESCE($1, whatsapp_body),
        email_subject = COALESCE($2, email_subject),
        email_body = COALESCE($3, email_body),
        is_active = COALESCE($4, is_active),
        name = COALESCE($5, name),
        meta_template_name = COALESCE($6, meta_template_name),
        meta_status = COALESCE($7, meta_status),
        audience = COALESCE($8, audience),
        trigger_event = COALESCE($9, trigger_event),
        channel = COALESCE($10, channel),
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $11 OR template_key = $11
      RETURNING *
    `, [
      whatsapp_body !== undefined ? whatsapp_body : null,
      email_subject !== undefined ? email_subject : null,
      email_body !== undefined ? email_body : null,
      is_active !== undefined ? Number(is_active) : null,
      name !== undefined ? name : null,
      meta_template_name !== undefined ? (meta_template_name.trim() || null) : null,
      meta_status !== undefined ? meta_status : null,
      audience !== undefined ? audience : null,
      trigger_event !== undefined ? trigger_event : null,
      channel !== undefined ? channel : null,
      String(id)
    ], c.env, c.executionCtx);

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
    let finalStatus = body?.manualStatus || body?.manual_status || null;

    if (!finalStatus) {
      const existing = await query('SELECT * FROM notification_templates WHERE id::text = $1 OR template_key = $1 LIMIT 1', [String(id)], c.env, c.executionCtx);
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const targetMetaName = (row.meta_template_name || row.template_key || '').toLowerCase();
        const metaRes = await fetchMetaTemplatesFromGraph(c.env);
        if (metaRes.success && Array.isArray(metaRes.templates)) {
          const found = metaRes.templates.find(mt => {
            const mtName = (mt.name || '').toLowerCase();
            return mtName === targetMetaName || mtName.startsWith(targetMetaName) || targetMetaName.startsWith(mtName);
          });
          if (found) {
            finalStatus = found.status || 'PENDING';
          } else {
            finalStatus = 'PENDING';
          }
        }
      }
    }

    if (!finalStatus) finalStatus = 'PENDING';

    const res = await query(`
      UPDATE notification_templates SET
        meta_status = $1,
        last_synced_at = CURRENT_TIMESTAMP,
        sync_status = 'SYNCED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $2 OR template_key = $2
      RETURNING *
    `, [finalStatus, String(id)], c.env, c.executionCtx);

    if (!res.rows.length) {
      return c.json({ error: 'Template not found' }, 404);
    }
    return c.json({ 
      success: true, 
      message: `Template synced with Meta! Live status: ${finalStatus}`, 
      meta_status: finalStatus,
      template: res.rows[0] 
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/notifications/templates/sync-from-meta
commonRoutes.post('/notifications/templates/sync-from-meta', authenticateToken, async (c) => {
  try {
    const metaRes = await fetchMetaTemplatesFromGraph(c.env);
    if (!metaRes.success) {
      return c.json({ error: metaRes.error || 'Failed to connect to Meta API' }, 500);
    }

    const metaMap = new Map();
    for (const mt of metaRes.templates) {
      if (mt.name) metaMap.set(mt.name.toLowerCase(), mt);
    }

    const dbRows = await query('SELECT id, template_key, meta_template_name, meta_status FROM notification_templates', [], c.env, c.executionCtx);
    const existingMetaNames = new Set();
    const existingKeys = new Set();
    let syncedCount = 0;

    for (const row of dbRows.rows) {
      if (row.meta_template_name) existingMetaNames.add(row.meta_template_name.toLowerCase());
      if (row.template_key) existingKeys.add(row.template_key.toLowerCase());
      const key = (row.meta_template_name || row.template_key || '').toLowerCase();
      const liveStatus = metaMap.has(key) ? metaMap.get(key).status : 'PENDING';
      syncedCount++;
      await query(
        'UPDATE notification_templates SET meta_status = $1, last_synced_at = CURRENT_TIMESTAMP, sync_status = \'SYNCED\', updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [liveStatus, row.id],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    // Auto-discover and insert any templates present in Meta that are not in the database
    for (const mt of metaRes.templates) {
      const mtName = (mt.name || '').toLowerCase();
      if (!existingMetaNames.has(mtName) && !existingKeys.has(mtName)) {
        const isTech = mtName.startsWith('technician_') || mtName.includes('work_order') || mtName.includes('technician');
        const audience = isTech ? 'technician' : 'customer';
        const prettyName = mt.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const bodyComp = (mt.components || []).find(comp => comp.type === 'BODY')?.text || `[WhatsApp Template: ${mt.name}]`;
        await query(`
          INSERT INTO notification_templates (
            template_key, name, whatsapp_body, email_subject, email_body,
            audience, trigger_event, meta_template_name, meta_status, is_active, channel, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'whatsapp', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (template_key) DO NOTHING
        `, [
          mt.name,
          prettyName,
          bodyComp,
          `[Eco Green Solar] ${prettyName}`,
          `Template: ${prettyName}\n${bodyComp}`,
          audience,
          mt.name,
          mt.name,
          mt.status || 'APPROVED'
        ], c.env, c.executionCtx).catch(() => {});
        syncedCount++;
      }
    }

    const refreshed = await query(`
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

    return c.json({ 
      success: true, 
      syncedCount, 
      message: `Successfully synced ${syncedCount} templates directly with Meta Graph API!`,
      templates: refreshed.rows 
    });
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
    // Dispatch OS background Web Push
    c.executionCtx?.waitUntil?.(
      (async () => {
        const targetRole = b.targetRole || 'all';
        const targetTechId = b.targetTechnicianId;
        const pushPayload = {
          title: b.title || 'Eco Green Support Alert',
          body: b.message || 'New complaint or service update received.',
          ticketId: b.ticketId || '',
          url: b.ticketId ? `/complaints?ticket=${b.ticketId}` : '/complaints',
          tag: b.ticketId ? `ticket-${b.ticketId}` : `egs-notif-${Date.now()}`
        };
        if (targetTechId) {
          await dispatchPushToTechnician(targetTechId, null, pushPayload, c.env, c.executionCtx).catch(() => {});
        } else {
          await dispatchPushToRoles(targetRole, pushPayload, c.env, c.executionCtx).catch(() => {});
        }
      })()
    );

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

// ==========================================
// OS WEB PUSH NOTIFICATION ROUTES
// ==========================================

// GET /api/push/vapid-public-key
commonRoutes.get('/push/vapid-public-key', (c) => {
  return c.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
commonRoutes.post('/push/subscribe', optionalAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { endpoint, keys, role, userId, phone } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return c.json({ error: 'Valid push subscription (endpoint, p256dh, auth) is required' }, 400);
    }
    const user = c.get('user');
    const saved = await savePushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: userId || user?.id,
      role: role || user?.role || 'staff',
      phone: phone || user?.phone
    }, c.env, c.executionCtx);
    return c.json({ success: true, id: saved?.id });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/push/unsubscribe
commonRoutes.post('/push/unsubscribe', optionalAuth, async (c) => {
  try {
    const { endpoint } = await c.req.json().catch(() => ({}));
    if (endpoint) {
      await removePushSubscription(endpoint, c.env, c.executionCtx);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/push/test
commonRoutes.post('/push/test', optionalAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const delaySeconds = Math.min(Math.max(Number(body.delaySeconds || 0), 0), 10);
    const subscription = body.subscription;

    if (subscription && subscription.endpoint && subscription.keys) {
      const targetSub = {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      };

      if (delaySeconds > 0) {
        c.executionCtx?.waitUntil?.(
          new Promise((resolve) => {
            setTimeout(async () => {
              try {
                await sendTestPush(targetSub, c.env, c.executionCtx);
              } catch (_) {}
              resolve();
            }, delaySeconds * 1000);
          })
        );
        return c.json({
          success: true,
          message: `Test push scheduled in ${delaySeconds} seconds. Lock screen or switch app now!`
        });
      }

      const res = await sendTestPush(targetSub, c.env, c.executionCtx);
      return c.json(res);
    }

    const user = c.get('user');
    const role = user?.role || 'staff';
    c.executionCtx?.waitUntil?.(
      dispatchPushToRoles(role, {
        title: '☀️ Eco Green Support — Test Alert',
        body: 'Background OS push notification is active on this device!',
        url: '/complaints',
        tag: `test-push-${Date.now()}`
      }, c.env, c.executionCtx)
    );
    return c.json({ success: true, message: 'Test push dispatched to your role' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default commonRoutes;
