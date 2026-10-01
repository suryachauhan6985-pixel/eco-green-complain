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
            ORDER BY m.created_at DESC
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

    const conversations = (res.rows || []).map(r => ({
      phone: r.phone,
      sender_name: r.complaint_customer_name || r.sender_name || 'Customer',
      ticket_id: r.ticket_id || null,
      complaint_id: r.complaint_id || null,
      last_message: r.last_message || '',
      last_activity: r.last_activity,
      last_status: r.last_status,
      last_sender_type: r.last_sender_type,
      unread_count: 0
    }));

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

    const res = await query(
      `SELECT * FROM whatsapp_messages 
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
       ORDER BY created_at ASC LIMIT 200`,
      [last10],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true, messages: res.rows || [] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
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
