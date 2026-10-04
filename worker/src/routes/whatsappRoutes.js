import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken } from '../auth.js';
import { sendWhatsApp, WEBHOOK_VERIFY_TOKEN, DEFAULT_META_ACCESS_TOKEN, META_PHONE_NUMBER_ID } from '../whatsapp.js';

const whatsappRoutes = new Hono();

export function handleWebhookGet(c) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const expectedToken = c.env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN || WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WHATSAPP WEBHOOK] Challenge verified successfully');
    return c.text(challenge, 200);
  }
  return c.text('Verification token mismatch', 403);
}

export async function handleWebhookPost(c) {
  try {
    const body = await c.req.json().catch(() => ({}));

    // Respond immediately to Meta with 200 OK as required by Meta policy
    const entries = body.entry || [];
    for (const entry of entries) {
      const wabaId = entry.id;
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field && change.field !== 'messages') continue;
        const val = change.value || {};
        const phoneNumberId = val.metadata?.phone_number_id;

        // 1. Status Updates (sent, delivered, read, failed)
        if (val.statuses && Array.isArray(val.statuses)) {
          for (const st of val.statuses) {
            const wamid = st.id;
            const status = st.status; // 'sent', 'delivered', 'read', 'failed'
            const recipientPhone = st.recipient_id ? st.recipient_id.replace(/\D/g, '') : null;
            const errCode = st.errors?.[0]?.code ? String(st.errors[0].code) : null;
            const errorReason = st.errors?.[0]?.message || st.errors?.[0]?.title || null;

            // Audit Trail in whatsapp_raw_events
            try {
              await query(
                `INSERT INTO whatsapp_raw_events (
                  event_id, wam_id, waba_id, phone_number_id, recipient_phone, direction, event_type, status, error_code, error_message, raw_payload, created_at
                ) VALUES ($1, $2, $3, $4, $5, 'status', 'status', $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
                [st.id, wamid, wabaId, phoneNumberId, recipientPhone, status, errCode, errorReason, JSON.stringify(st)],
                c.env,
                c.executionCtx
              );
            } catch (_) {}

            // Update status in whatsapp_messages
            try {
              await query(
                `UPDATE whatsapp_messages 
                 SET status = $1, 
                     failure_reason = COALESCE($2, failure_reason),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE wam_id = $3`,
                [status, errorReason, wamid],
                c.env,
                c.executionCtx
              );
            } catch (_) {}

            // Registry update on user not on whatsapp
            if (status === 'failed' && recipientPhone) {
              const last10 = recipientPhone.slice(-10);
              const isNotOnWa = (st.errors || []).some(err => err.code === 131026 || String(err.message || '').toLowerCase().includes('not a valid whatsapp user'));
              if (isNotOnWa) {
                try {
                  await query(
                    `INSERT INTO whatsapp_number_registry (phone, is_whatsapp_active, status, source, notes, updated_at, created_at)
                     VALUES ($1, 0, 'invite_required', 'meta_delivery_failed_131026', 'Recipient is not a valid WhatsApp user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     ON CONFLICT (phone) DO UPDATE SET
                       is_whatsapp_active = 0,
                       status = 'invite_required',
                       notes = 'Recipient is not a valid WhatsApp user',
                       updated_at = CURRENT_TIMESTAMP`,
                    [last10],
                    c.env,
                    c.executionCtx
                  );
                } catch (_) {}
              }
            }
          }
        }

        // 2. Inbound Messages
        if (val.messages && Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            const senderPhone = msg.from;
            const wamid = msg.id;

            // Idempotency: Skip duplicate webhook delivery
            if (wamid) {
              const existing = await query('SELECT id FROM whatsapp_messages WHERE wam_id = $1 LIMIT 1', [wamid], c.env, c.executionCtx).catch(() => ({ rows: [] }));
              if (existing.rows && existing.rows.length > 0) {
                console.log(`[WhatsAppWebhook] Inbound message ${wamid} already processed. Skipping duplicate.`);
                continue;
              }
            }

            const cleanPhone = (senderPhone || '').replace(/\D/g, '');
            const last10 = cleanPhone.slice(-10);
            const matchingContact = (val.contacts || []).find(cnt => {
              const cntDigits = (cnt.wa_id || '').replace(/\D/g, '');
              return cntDigits === cleanPhone || cleanPhone.endsWith(cntDigits) || cntDigits.endsWith(last10);
            }) || val.contacts?.[0];

            let textBody = '';
            let mediaUrl = null;
            let mediaType = msg.type || 'text';

            if (msg.type === 'text') {
              textBody = msg.text?.body || '';
            } else if (msg.type === 'image' || msg.type === 'document' || msg.type === 'video') {
              textBody = msg[msg.type]?.caption || `[${msg.type.toUpperCase()} file]`;
              mediaUrl = msg[msg.type]?.id ? `/api/whatsapp/media/${msg[msg.type].id}` : null;
            }

            // Raw Event Audit Log
            try {
              await query(
                `INSERT INTO whatsapp_raw_events (
                  event_id, wam_id, waba_id, phone_number_id, sender_phone, direction, event_type, status, raw_payload, created_at
                ) VALUES ($1, $2, $3, $4, $5, 'inbound', $6, 'received', $7, CURRENT_TIMESTAMP)`,
                [wamid, wamid, wabaId, phoneNumberId, cleanPhone, mediaType, JSON.stringify({ message: msg, contact: matchingContact })],
                c.env,
                c.executionCtx
              );
            } catch (_) {}

            // 3-Tier Contact & Complaint Matching
            let complaintId = null;
            let senderName = null;

            // Priority 1: Match complaint by customer phone
            const compRes = await query(
              `SELECT id, ticket_id, customer_name FROM complaints 
               WHERE RIGHT(REPLACE(REPLACE(customer_phone, ' ', ''), '+', ''), 10) = $1 
               ORDER BY id DESC LIMIT 1`,
              [last10],
              c.env,
              c.executionCtx
            ).catch(() => ({ rows: [] }));

            if (compRes.rows && compRes.rows.length > 0) {
              complaintId = compRes.rows[0].id;
              if (compRes.rows[0].customer_name && compRes.rows[0].customer_name !== 'Customer') {
                senderName = compRes.rows[0].customer_name;
              }
            }

            // Priority 2: Installed Customer Catalog (Excel directory)
            if (!senderName) {
              const instRes = await query(
                `SELECT customer_name FROM installed_customers 
                 WHERE RIGHT(REPLACE(REPLACE(consumer_mobile, ' ', ''), '+', ''), 10) = $1 
                 LIMIT 1`,
                [last10],
                c.env,
                c.executionCtx
              ).catch(() => ({ rows: [] }));
              if (instRes.rows?.[0]?.customer_name) {
                senderName = instRes.rows[0].customer_name;
              }
            }

            // Priority 3: Meta Profile Name
            if (!senderName && matchingContact?.profile?.name && !/^[0-9+ ]+$/.test(matchingContact.profile.name)) {
              senderName = matchingContact.profile.name;
            }

            // Priority 4: WhatsApp Number Registry
            if (!senderName) {
              const regRes = await query(
                `SELECT customer_name FROM whatsapp_number_registry 
                 WHERE RIGHT(REPLACE(REPLACE(phone, ' ', ''), '+', ''), 10) = $1 
                 LIMIT 1`,
                [last10],
                c.env,
                c.executionCtx
              ).catch(() => ({ rows: [] }));
              if (regRes.rows?.[0]?.customer_name && regRes.rows[0].customer_name !== 'Customer') {
                senderName = regRes.rows[0].customer_name;
              }
            }

            if (!senderName) {
              senderName = 'Customer';
            }

            // Update Number Registry
            if (matchingContact?.profile?.name && !/^[0-9+ ]+$/.test(matchingContact.profile.name)) {
              try {
                await query(
                  `INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, source, created_at, updated_at)
                   VALUES ($1, $2, 1, 'verified', 'meta_webhook_profile', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                   ON CONFLICT (phone) DO UPDATE SET
                     customer_name = EXCLUDED.customer_name,
                     is_whatsapp_active = 1,
                     status = 'verified',
                     updated_at = CURRENT_TIMESTAMP`,
                  [last10, matchingContact.profile.name],
                  c.env,
                  c.executionCtx
                );
              } catch (_) {}
            }

            // Insert into whatsapp_messages
            await query(
              `INSERT INTO whatsapp_messages (
                complaint_id, phone, sender_type, sender_name, message_body, media_url, media_type, wam_id, status, created_at, updated_at
              ) VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7, 'delivered', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [complaintId, senderPhone, senderName, textBody, mediaUrl, mediaType, wamid],
              c.env,
              c.executionCtx
            ).catch(() => {});
          }
        }
      }
    }

    return c.json({ status: 'EVENT_RECEIVED' });
  } catch (err) {
    return c.json({ status: 'ERROR', error: err.message }, 500);
  }
}

whatsappRoutes.get('/', handleWebhookGet);
whatsappRoutes.get('/webhook', handleWebhookGet);
whatsappRoutes.post('/', handleWebhookPost);
whatsappRoutes.post('/webhook', handleWebhookPost);

async function resolveContactIdentities(activeLast10, env, executionCtx) {
  if (!activeLast10 || activeLast10.length === 0) {
    return { techMap: new Map(), userMap: new Map(), custMap: new Map(), regMap: new Map() };
  }

  const [techRes, userRes, custRes, regRes] = await Promise.all([
    query('SELECT id, name, phone FROM technicians', [], env, executionCtx).catch(() => ({ rows: [] })),
    query('SELECT id, name, phone, role FROM users WHERE phone IS NOT NULL', [], env, executionCtx).catch(() => ({ rows: [] })),
    query(
      `SELECT customer_name, consumer_mobile 
       FROM installed_customers 
       WHERE consumer_mobile IS NOT NULL 
         AND RIGHT(REGEXP_REPLACE(consumer_mobile, '[^0-9]', '', 'g'), 10) = ANY($1::text[])`,
      [activeLast10],
      env,
      executionCtx
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT phone, customer_name 
       FROM whatsapp_number_registry 
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = ANY($1::text[])`,
      [activeLast10],
      env,
      executionCtx
    ).catch(() => ({ rows: [] }))
  ]);

  const techMap = new Map();
  (techRes.rows || []).forEach(t => {
    const clean = (t.phone || '').replace(/\D/g, '').slice(-10);
    if (clean) techMap.set(clean, t);
  });

  const userMap = new Map();
  (userRes.rows || []).forEach(u => {
    const clean = (u.phone || '').replace(/\D/g, '').slice(-10);
    if (clean) userMap.set(clean, u);
  });

  const custMap = new Map();
  (custRes.rows || []).forEach(c => {
    const clean = (c.consumer_mobile || '').replace(/\D/g, '').slice(-10);
    if (clean && !custMap.has(clean)) custMap.set(clean, c.customer_name);
  });

  const regMap = new Map();
  (regRes.rows || []).forEach(reg => {
    const clean = (reg.phone || '').replace(/\D/g, '').slice(-10);
    if (clean && reg.customer_name) regMap.set(clean, reg.customer_name);
  });

  return { techMap, userMap, custMap, regMap };
}

// GET /api/whatsapp/conversations - List Inbox Chats with unified phone grouping
whatsappRoutes.get('/conversations', authenticateToken, async (c) => {
  try {
    const res = await query(
      `WITH NormalizedMessages AS (
        SELECT 
          m.*,
          RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10) as last10_phone,
          ROW_NUMBER() OVER(
            PARTITION BY RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10) 
            ORDER BY m.created_at DESC, m.id DESC
          ) as rn
        FROM whatsapp_messages m
        WHERE LENGTH(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g')) >= 5
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
      ORDER BY nm.created_at DESC`,
      [],
      c.env,
      c.executionCtx
    );

    const activeLast10 = Array.from(new Set((res.rows || []).map(r => r.last10_phone).filter(Boolean)));
    const { techMap, userMap, custMap, regMap } = await resolveContactIdentities(activeLast10, c.env, c.executionCtx);

    const conversations = (res.rows || []).map(r => {
      const last10 = r.last10_phone || (r.phone || '').replace(/\D/g, '').slice(-10);
      let senderName = null;
      let isTechnician = false;

      // 1. Check Technician table first
      if (techMap.has(last10)) {
        senderName = techMap.get(last10).name;
        isTechnician = true;
      } else if (userMap.has(last10)) {
        const usr = userMap.get(last10);
        senderName = usr.name;
        if (usr.role === 'technician') isTechnician = true;
      } else if (r.complaint_customer_phone) {
        // ONLY if phone actually matches the complaint's customer phone!
        const compPhoneClean = (r.complaint_customer_phone || '').replace(/\D/g, '').slice(-10);
        if (compPhoneClean === last10 && r.complaint_customer_name && r.complaint_customer_name !== 'Customer') {
          senderName = r.complaint_customer_name;
        }
      }

      // 2. Fallbacks: Installed customers, Registry, message sender_name
      if (!senderName && custMap.has(last10)) {
        senderName = custMap.get(last10);
      }
      if (!senderName && regMap.has(last10)) {
        senderName = regMap.get(last10);
      }
      if (!senderName && r.sender_name && r.sender_name !== 'Customer' && r.sender_name !== 'Eco Green Support' && !/^[0-9+ ]+$/.test(r.sender_name)) {
        senderName = r.sender_name;
      }

      const canonicalPhone = (r.phone || '').startsWith('91') && (r.phone || '').length === 12
        ? r.phone
        : (r.phone || '').length === 10 ? `91${r.phone}` : r.phone;

      return {
        phone: canonicalPhone,
        sender_name: senderName || 'Customer',
        is_technician: isTechnician,
        ticket_id: r.ticket_id || null,
        complaint_id: r.complaint_id || null,
        last_message: r.last_message || '',
        last_activity: r.last_activity,
        last_status: r.last_status,
        last_sender_type: r.last_sender_type,
        unread_count: 0
      };
    });

    return c.json({ success: true, conversations });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/whatsapp/chats/:phone - Messages for Phone
whatsappRoutes.get('/chats/:phone', authenticateToken, async (c) => {
  try {
    const phone = c.req.param('phone');
    const cleanDigits = (phone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);

    const [msgRes, identities] = await Promise.all([
      query(
        `SELECT * FROM whatsapp_messages 
         WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
         ORDER BY created_at ASC LIMIT 200`,
        [last10],
        c.env,
        c.executionCtx
      ),
      resolveContactIdentities([last10], c.env, c.executionCtx)
    ]);

    let senderName = null;
    let isTechnician = false;
    let ticketId = null;
    let complaintId = null;

    if (identities.techMap.has(last10)) {
      senderName = identities.techMap.get(last10).name;
      isTechnician = true;
    } else if (identities.userMap.has(last10)) {
      const usr = identities.userMap.get(last10);
      senderName = usr.name;
      if (usr.role === 'technician') isTechnician = true;
    } else if (identities.custMap.has(last10)) {
      senderName = identities.custMap.get(last10);
    } else if (identities.regMap.has(last10)) {
      senderName = identities.regMap.get(last10);
    }

    const messages = msgRes.rows || [];
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.complaint_id) complaintId = lastMsg.complaint_id;
      if (!senderName && lastMsg.sender_name && lastMsg.sender_name !== 'Customer' && lastMsg.sender_name !== 'Eco Green Support') {
        senderName = lastMsg.sender_name;
      }
    }

    const canonicalPhone = cleanDigits.startsWith('91') && cleanDigits.length === 12
      ? cleanDigits
      : cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

    const contact = {
      phone: canonicalPhone,
      sender_name: senderName || 'Customer',
      is_technician: isTechnician,
      ticket_id: ticketId,
      complaint_id: complaintId
    };

    return c.json({ success: true, messages, contact });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/whatsapp/media/:mediaId - Secure Meta WhatsApp Media Stream Proxy
whatsappRoutes.get('/media/:mediaId', async (c) => {
  const mediaId = c.req.param('mediaId');
  if (!mediaId) {
    return c.text('Media ID is required', 400);
  }
  const token = c.env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text().catch(() => '');
      console.error('[WhatsApp Media] Meta error for ID', mediaId, errText);
      return c.text('Failed to locate media on Meta: ' + errText, metaRes.status);
    }

    const metaData = await metaRes.json();
    if (!metaData.url) {
      return c.text('Media URL not provided by Meta', 404);
    }

    const fileRes = await fetch(metaData.url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      return c.text('Failed to download media binary from Meta CDN', fileRes.status);
    }

    const contentType = metaData.mime_type || fileRes.headers.get('content-type') || 'image/jpeg';
    const contentLength = metaData.file_size || fileRes.headers.get('content-length');

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', String(contentLength));
    headers.set('Cache-Control', 'public, max-age=604800, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return new Response(fileRes.body, {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('[WhatsApp Media Proxy Error]:', err.message);
    return c.text('Error streaming media: ' + err.message, 500);
  }
});

// POST /api/whatsapp/direct-reply - Staff Sends Direct WhatsApp Message
whatsappRoutes.post('/direct-reply', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { phone, message, complaint_id, media_url, media_type, media_caption, template_name, variables } = body;
    const user = c.get('user');

    if (!phone || (!message && !media_url && !template_name)) {
      return c.json({ error: 'Phone and message/media/template are required' }, 400);
    }

    const sendRes = await sendWhatsApp({
      to: phone,
      message,
      templateName: template_name || body.templateName,
      variables: { ...(variables || {}), db_complaint_id: complaint_id },
      mediaUrl: media_url || null,
      mediaType: media_type || null,
      mediaFileName: media_caption || null,
      senderName: user?.name || 'Eco Green Staff',
      env: c.env
    });

    return c.json({ success: sendRes.success, wamid: sendRes.wamid, error: sendRes.error });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/send-template - Send approved Meta Template directly
whatsappRoutes.post('/send-template', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { phone, template_name, variables = {}, complaint_id } = body;
    const user = c.get('user');

    if (!phone || !template_name) {
      return c.json({ error: 'Phone and template_name are required' }, 400);
    }

    const sendRes = await sendWhatsApp({
      to: phone,
      templateName: template_name,
      variables: { ...variables, db_complaint_id: complaint_id },
      senderName: user?.name || 'Eco Green Staff',
      env: c.env
    });

    return c.json({ success: sendRes.success, wamid: sendRes.wamid, error: sendRes.error });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/whatsapp/raw-events/:phone - Audit Trail for Phone
whatsappRoutes.get('/raw-events/:phone', authenticateToken, async (c) => {
  try {
    const phone = c.req.param('phone');
    const cleanDigits = (phone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);

    const res = await query(
      `SELECT * FROM whatsapp_raw_events 
       WHERE RIGHT(REGEXP_REPLACE(COALESCE(sender_phone, ''), '[^0-9]', '', 'g'), 10) = $1 
          OR RIGHT(REGEXP_REPLACE(COALESCE(recipient_phone, ''), '[^0-9]', '', 'g'), 10) = $1
       ORDER BY created_at DESC LIMIT 50`,
      [last10],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true, events: res.rows || [] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/whatsapp/verify-number/:phone - Check Number Verification Status
whatsappRoutes.get('/verify-number/:phone', authenticateToken, async (c) => {
  try {
    const phone = c.req.param('phone');
    const cleanDigits = (phone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);

    const res = await query(
      `SELECT * FROM whatsapp_number_registry WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
      [last10],
      c.env,
      c.executionCtx
    );

    if (res.rows && res.rows.length > 0) {
      return c.json({ success: true, verified: res.rows[0].status === 'verified', registry: res.rows[0] });
    }
    return c.json({ success: true, verified: false, registry: null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/set-number-status - Update Number Status in Registry
whatsappRoutes.post('/set-number-status', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { phone, status, notes, customer_name } = body;
    if (!phone) return c.json({ error: 'Phone is required' }, 400);

    const last10 = phone.replace(/\D/g, '').slice(-10);
    const res = await query(
      `INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, notes, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (phone) DO UPDATE SET
         customer_name = COALESCE(EXCLUDED.customer_name, whatsapp_number_registry.customer_name),
         is_whatsapp_active = EXCLUDED.is_whatsapp_active,
         status = EXCLUDED.status,
         notes = COALESCE(EXCLUDED.notes, whatsapp_number_registry.notes),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [last10, customer_name || null, status === 'verified' ? 1 : 0, status || 'unverified', notes || null],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true, registry: res.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/update-contact-name - Rename Contact in Registry
whatsappRoutes.post('/update-contact-name', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { phone, name } = body;
    if (!phone || !name) return c.json({ error: 'Phone and name required' }, 400);

    const last10 = phone.replace(/\D/g, '').slice(-10);
    const res = await query(
      `INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, source, updated_at, created_at)
       VALUES ($1, $2, 1, 'verified', 'manual_edit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (phone) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [last10, name.trim()],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true, registry: res.rows[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/retry-message/:id - Smart Retry failed WhatsApp message
whatsappRoutes.post('/retry-message/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const msgRes = await query('SELECT * FROM whatsapp_messages WHERE id::text = $1 LIMIT 1', [String(id)], c.env, c.executionCtx);
    if (!msgRes.rows.length) {
      return c.json({ error: 'Message record not found' }, 404);
    }
    const msg = msgRes.rows[0];

    let complaint = null;
    if (msg.complaint_id) {
      const cmpRes = await query('SELECT * FROM complaints WHERE id::text = $1 LIMIT 1', [String(msg.complaint_id)], c.env, c.executionCtx);
      complaint = cmpRes.rows[0] || null;
    }
    const cleanPhone = (msg.phone || '').replace(/\D/g, '');
    const last10 = cleanPhone.slice(-10);

    if (!complaint && last10) {
      const cmpRes = await query(`SELECT * FROM complaints WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE $1 ORDER BY id DESC LIMIT 1`, [`%${last10}%`], c.env, c.executionCtx);
      complaint = cmpRes.rows[0] || null;
    }

    let tech = null;
    if (complaint?.assigned_technician_id) {
      const techRes = await query('SELECT * FROM technicians WHERE id::text = $1 LIMIT 1', [String(complaint.assigned_technician_id)], c.env, c.executionCtx);
      tech = techRes.rows[0] || null;
    } else if (last10) {
      const techRes = await query(`SELECT * FROM technicians WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE $1 LIMIT 1`, [`%${last10}%`], c.env, c.executionCtx);
      tech = techRes.rows[0] || null;
    }

    const appUrl = (c.env?.APP_URL && !c.env.APP_URL.includes('localhost')) ? c.env.APP_URL : 'https://complain.ecogreensolar.co.in';
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
      estimated_charges: Number(complaint?.estimated_charges || 0),
      notify_charges: complaint?.notify_charges ?? 1,
      feedback_url: `${appUrl}/track/${complaint?.ticket_id || ''}`,
      db_complaint_id: complaint?.id || msg.complaint_id || null
    };

    const sendRes = await sendWhatsApp({
      to: msg.phone,
      message: msg.message_body,
      templateName: msg.template_name,
      variables,
      senderName: msg.sender_name || 'Eco Green Solar',
      existingMessageId: msg.id,
      env: c.env
    });

    if (sendRes.success) {
      return c.json({ success: true, status: 'sent', wamid: sendRes.wamid });
    } else {
      return c.json({ success: false, status: 'failed', error: sendRes.error });
    }
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/whatsapp/messages/:id - Delete Message
whatsappRoutes.delete('/messages/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    await query('DELETE FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1', [String(id)], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default whatsappRoutes;
