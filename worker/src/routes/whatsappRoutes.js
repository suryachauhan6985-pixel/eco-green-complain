import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken } from '../auth.js';
import { sendWhatsApp, WEBHOOK_VERIFY_TOKEN, DEFAULT_META_ACCESS_TOKEN, META_PHONE_NUMBER_ID } from '../whatsapp.js';
import { deleteR2Object, deleteR2Prefix } from '../r2.js';

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
            let mediaId = null;
            let mediaCaption = null;

            if (msg.type === 'text') {
              textBody = msg.text?.body || '';
            } else if (msg.type === 'image') {
              mediaCaption = msg.image?.caption || null;
              textBody = msg.image?.caption || '';
              mediaId = msg.image?.id || null;
              mediaUrl = mediaId ? `/api/whatsapp/media/${mediaId}?phone=${cleanPhone}` : null;
            } else if (msg.type === 'video') {
              mediaCaption = msg.video?.caption || null;
              textBody = msg.video?.caption || '';
              mediaId = msg.video?.id || null;
              mediaUrl = mediaId ? `/api/whatsapp/media/${mediaId}?phone=${cleanPhone}` : null;
            } else if (msg.type === 'document') {
              const docName = msg.document?.filename || 'Document.pdf';
              mediaCaption = docName;
              textBody = msg.document?.caption || '';
              mediaId = msg.document?.id || null;
              mediaUrl = mediaId ? `/api/whatsapp/media/${mediaId}?phone=${cleanPhone}&filename=${encodeURIComponent(docName)}` : null;
            } else if (msg.type === 'audio' || msg.type === 'voice') {
              mediaType = 'audio';
              textBody = '';
              mediaCaption = msg.type === 'voice' ? 'Voice Note' : 'Audio';
              mediaId = msg.audio?.id || msg.voice?.id || null;
              mediaUrl = mediaId ? `/api/whatsapp/media/${mediaId}?phone=${cleanPhone}` : null;
            } else if (msg.type === 'sticker') {
              mediaType = 'sticker';
              textBody = '';
              mediaId = msg.sticker?.id || null;
              mediaUrl = mediaId ? `/api/whatsapp/media/${mediaId}?phone=${cleanPhone}` : null;
            } else if (msg.type === 'location') {
              mediaType = 'location';
              const loc = msg.location || {};
              const locDesc = loc.name ? `${loc.name}${loc.address ? ` - ${loc.address}` : ''}` : (loc.address || 'Shared Location Pin');
              const mapsUrl = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
              textBody = mapsUrl;
              mediaCaption = locDesc;
            } else if (msg.type === 'interactive') {
              mediaType = 'interactive';
              const inter = msg.interactive || {};
              const title = inter.button_reply?.title || inter.list_reply?.title || inter.button_reply?.id || '';
              textBody = title || 'Interactive Response';
              mediaCaption = inter.button_reply?.id || inter.list_reply?.id || null;
            } else if (msg.type === 'button') {
              mediaType = 'interactive';
              textBody = msg.button?.text || '';
            } else if (msg.type === 'contacts') {
              mediaType = 'contacts';
              const firstContact = msg.contacts?.[0] || {};
              const cName = firstContact.name?.formatted_name || 'Contact';
              const cPhone = firstContact.phones?.[0]?.phone || '';
              textBody = cPhone;
              mediaCaption = cName;
            } else if (msg.type === 'unsupported') {
              mediaType = 'unsupported';
              textBody = '📷 [WhatsApp Media / View-Once Item Received]';
              mediaCaption = 'WhatsApp Media / View-Once Item';
            } else if (msg.type === 'reaction') {
              const targetWamid = msg.reaction?.message_id;
              const emoji = msg.reaction?.emoji || '';
              if (targetWamid) {
                try {
                  const targetRes = await query(
                    'SELECT id, reactions FROM whatsapp_messages WHERE wam_id = $1 LIMIT 1',
                    [targetWamid],
                    c.env,
                    c.executionCtx
                  );
                  if (targetRes.rows && targetRes.rows.length > 0) {
                    const row = targetRes.rows[0];
                    let rList = [];
                    try {
                      rList = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : (Array.isArray(row.reactions) ? row.reactions : []);
                    } catch (_) { rList = []; }
                    const custIdx = rList.findIndex(r => r.user_id === 'customer' || r.phone === cleanPhone);
                    if (custIdx >= 0) {
                      if (!emoji) rList.splice(custIdx, 1);
                      else rList[custIdx] = { emoji, user_id: 'customer', user_name: 'Customer', phone: cleanPhone, created_at: new Date().toISOString() };
                    } else if (emoji) {
                      rList.push({ emoji, user_id: 'customer', user_name: 'Customer', phone: cleanPhone, created_at: new Date().toISOString() });
                    }
                    await query(
                      'UPDATE whatsapp_messages SET reactions = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                      [JSON.stringify(rList), row.id],
                      c.env,
                      c.executionCtx
                    );
                  }
                } catch (_) {}
              }
              continue; // Skip creating a new bubble for reaction events
            } else {
              mediaType = msg.type || 'unknown';
              textBody = msg.text?.body || (msg.type ? `[${msg.type} message received]` : '[Message received]');
            }

            // Extract Quoted Message Context from Webhook
            let quotedText = null;
            let quotedMsgId = msg.context?.id || null;
            if (quotedMsgId) {
              try {
                const parentRes = await query(
                  'SELECT message_body, media_caption FROM whatsapp_messages WHERE wam_id = $1 LIMIT 1',
                  [quotedMsgId],
                  c.env,
                  c.executionCtx
                );
                if (parentRes.rows && parentRes.rows.length > 0) {
                  quotedText = parentRes.rows[0].message_body || parentRes.rows[0].media_caption || '[Quoted message]';
                }
              } catch (_) {}
            }

            if (!textBody && !mediaId && !mediaUrl) {
              textBody = msg.text?.body || (msg.type ? `[${msg.type} message received]` : '[Message received]');
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

            try {
              await query(
                `INSERT INTO whatsapp_messages (
                  complaint_id, phone, sender_type, sender_name, message_body, media_id, media_url, media_type, media_caption, quoted_text, quoted_msg_id, wam_id, status, created_at, updated_at
                ) VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'delivered', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [complaintId, senderPhone, senderName, textBody, mediaId, mediaUrl, mediaType, mediaCaption, quotedText, quotedMsgId, wamid],
                c.env,
                c.executionCtx
              );
            } catch (insertErr) {
              await query(
                `INSERT INTO whatsapp_messages (
                  complaint_id, phone, sender_type, sender_name, message_body, media_id, media_url, media_type, media_caption, wam_id, status, created_at, updated_at
                ) VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7, $8, $9, 'delivered', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [complaintId, senderPhone, senderName, textBody, mediaId, mediaUrl, mediaType, mediaCaption, wamid],
                c.env,
                c.executionCtx
              ).catch(() => {});
            }

            // Eagerly download & cache inbound WhatsApp media in Cloudflare R2
            if (mediaId && c.env?.MEDIA_BUCKET) {
              const cachePromise = eagerCacheWhatsAppMedia(mediaId, cleanPhone, c.env, msg);
              if (c.executionCtx?.waitUntil) {
                c.executionCtx.waitUntil(cachePromise);
              }
            }
          }
        }
      }
    }

    return c.json({ status: 'EVENT_RECEIVED' });
  } catch (err) {
    return c.json({ status: 'ERROR', error: err.message }, 500);
  }
}

async function eagerCacheWhatsAppMedia(mediaId, cleanPhone, env, rawMsg) {
  if (!mediaId || !env?.MEDIA_BUCKET) return;
  const token = env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
  const primaryR2Key = cleanPhone ? `whatsapp_media/${cleanPhone}/${mediaId}` : `whatsapp_media/${mediaId}`;

  try {
    const existing = await env.MEDIA_BUCKET.head(primaryR2Key).catch(() => null);
    if (existing) return;

    let downloadUrl = null;
    let contentType = null;

    const directUrl = rawMsg?.video?.url || rawMsg?.image?.url || rawMsg?.audio?.url || rawMsg?.document?.url || rawMsg?.voice?.url;
    if (directUrl) {
      downloadUrl = directUrl;
      contentType = rawMsg?.video?.mime_type || rawMsg?.image?.mime_type || rawMsg?.audio?.mime_type || rawMsg?.document?.mime_type;
    }

    if (!downloadUrl) {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        downloadUrl = metaData.url;
        contentType = contentType || metaData.mime_type;
      }
    }

    if (!downloadUrl) return;

    const fileRes = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!fileRes.ok) return;

    contentType = contentType || fileRes.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await fileRes.arrayBuffer();

    await env.MEDIA_BUCKET.put(primaryR2Key, arrayBuffer, {
      httpMetadata: { contentType }
    });
  } catch (err) {
    console.warn('[WhatsApp Media Eager Cache Warning]', err.message);
  }
}

whatsappRoutes.get('/', handleWebhookGet);
whatsappRoutes.get('/webhook', handleWebhookGet);
whatsappRoutes.post('/', handleWebhookPost);
whatsappRoutes.post('/webhook', handleWebhookPost);

let cachedTechMap = null;
let cachedUserMap = null;
let cachedDirExpiry = 0;

async function resolveContactIdentities(activeLast10, env, executionCtx) {
  if (!activeLast10 || activeLast10.length === 0) {
    return { techMap: new Map(), userMap: new Map(), custMap: new Map(), regMap: new Map() };
  }

  const now = Date.now();
  let techMap = cachedTechMap;
  let userMap = cachedUserMap;

  // Cache technician & user directories in Worker isolate memory for 90 seconds
  if (!techMap || !userMap || now > cachedDirExpiry) {
    const [techRes, userRes] = await Promise.all([
      query('SELECT id, name, phone FROM technicians', [], env, executionCtx).catch(() => ({ rows: [] })),
      query('SELECT id, name, phone, role FROM users WHERE phone IS NOT NULL', [], env, executionCtx).catch(() => ({ rows: [] }))
    ]);

    techMap = new Map();
    (techRes.rows || []).forEach(t => {
      const clean = (t.phone || '').replace(/\D/g, '').slice(-10);
      if (clean) techMap.set(clean, t);
    });

    userMap = new Map();
    (userRes.rows || []).forEach(u => {
      const clean = (u.phone || '').replace(/\D/g, '').slice(-10);
      if (clean) userMap.set(clean, u);
    });

    cachedTechMap = techMap;
    cachedUserMap = userMap;
    cachedDirExpiry = now + 90000;
  }

  const [custRes, regRes] = await Promise.all([
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

let readsTableEnsured = true; // Table and index already verified in production Supabase PostgreSQL
export async function ensureReadsTable(env, ctx) {
  if (readsTableEnsured) return;
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS whatsapp_conversation_reads (
        user_id TEXT NOT NULL,
        phone_10 VARCHAR(10) NOT NULL,
        last_read_message_id BIGINT DEFAULT 0,
        last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_manual_unread BOOLEAN DEFAULT FALSE,
        manual_unread_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (user_id, phone_10)
      );
      CREATE INDEX IF NOT EXISTS idx_wa_conv_reads_phone ON whatsapp_conversation_reads(phone_10);`,
      [],
      env,
      ctx
    );
    readsTableEnsured = true;
  } catch (_) {}
}

// GET /api/whatsapp/conversations - List Inbox Chats with unified phone grouping & real unread tracking
whatsappRoutes.get('/conversations', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const userId = String(user?.id || user?.username || 'admin');

    await ensureReadsTable(c.env, c.executionCtx);

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
      ),
      UnreadCounts AS (
        SELECT 
          RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10) as last10_phone,
          COUNT(m.id) as unread_count
        FROM whatsapp_messages m
        LEFT JOIN whatsapp_conversation_reads r 
          ON r.phone_10 = RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10)
          AND r.user_id = $1
        WHERE m.sender_type = 'customer'
          AND m.id > COALESCE(r.last_read_message_id, 0)
        GROUP BY RIGHT(REGEXP_REPLACE(m.phone, '[^0-9]', '', 'g'), 10)
      )
      SELECT 
        nm.id as last_message_id,
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
        c.status as complaint_status,
        COALESCE(uc.unread_count, 0)::int as unread_count,
        COALESCE(r.is_manual_unread, false) as is_manual_unread
      FROM NormalizedMessages nm
      LEFT JOIN complaints c ON c.id = nm.complaint_id
      LEFT JOIN UnreadCounts uc ON uc.last10_phone = nm.last10_phone
      LEFT JOIN whatsapp_conversation_reads r 
        ON r.phone_10 = nm.last10_phone AND r.user_id = $1
      WHERE nm.rn = 1
      ORDER BY nm.created_at DESC`,
      [userId],
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
        id: r.last_message_id,
        phone: canonicalPhone,
        sender_name: senderName || 'Customer',
        is_technician: isTechnician,
        ticket_id: r.ticket_id || null,
        complaint_id: r.complaint_id || null,
        last_message: r.last_message || '',
        last_activity: r.last_activity,
        last_status: r.last_status,
        last_sender_type: r.last_sender_type,
        unread_count: Number(r.unread_count || 0),
        is_manual_unread: Boolean(r.is_manual_unread)
      };
    });

    return c.json({ success: true, conversations });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/mark-read - Mark incoming messages in conversation as read for current user
whatsappRoutes.post('/mark-read', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawPhone = body.phone || c.req.query('phone');
    if (!rawPhone) return c.json({ error: 'Phone is required' }, 400);
    const cleanDigits = String(rawPhone).replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);
    if (!last10) return c.json({ error: 'Valid phone required' }, 400);

    const user = c.get('user');
    const userId = String(user?.id || user?.username || 'admin');

    await ensureReadsTable(c.env, c.executionCtx);

    // Get max message id for this phone
    const maxRes = await query(
      `SELECT COALESCE(MAX(id), 0) as max_id 
       FROM whatsapp_messages 
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1`,
      [last10],
      c.env,
      c.executionCtx
    ).catch(() => ({ rows: [{ max_id: 0 }] }));

    const maxId = Number(maxRes.rows?.[0]?.max_id || 0);

    await query(
      `INSERT INTO whatsapp_conversation_reads (user_id, phone_10, last_read_message_id, last_read_at, is_manual_unread)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, FALSE)
       ON CONFLICT (user_id, phone_10) DO UPDATE SET
         last_read_message_id = GREATEST(whatsapp_conversation_reads.last_read_message_id, EXCLUDED.last_read_message_id),
         last_read_at = CURRENT_TIMESTAMP,
         is_manual_unread = FALSE`,
      [userId, last10, maxId],
      c.env,
      c.executionCtx
    );

    return c.json({ 
      success: true, 
      phone: last10, 
      last_read_message_id: maxId, 
      unread_count: 0, 
      is_manual_unread: false 
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/mark-unread - Manually mark conversation as unread for current user
whatsappRoutes.post('/mark-unread', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawPhone = body.phone || c.req.query('phone');
    if (!rawPhone) return c.json({ error: 'Phone is required' }, 400);
    const cleanDigits = String(rawPhone).replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);
    if (!last10) return c.json({ error: 'Valid phone required' }, 400);

    const user = c.get('user');
    const userId = String(user?.id || user?.username || 'admin');

    await ensureReadsTable(c.env, c.executionCtx);

    await query(
      `INSERT INTO whatsapp_conversation_reads (user_id, phone_10, is_manual_unread, manual_unread_at)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, phone_10) DO UPDATE SET
         is_manual_unread = TRUE,
         manual_unread_at = CURRENT_TIMESTAMP`,
      [userId, last10],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, phone: last10, is_manual_unread: true });
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
    const sinceId = Number(c.req.query('since_id') || 0);

    // Fast-path incremental check: if client has already loaded chat and is just checking for new messages
    if (sinceId > 0) {
      const newMsgRes = await query(
        `SELECT * FROM whatsapp_messages 
         WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
           AND id > $2
         ORDER BY created_at ASC LIMIT 100`,
        [last10, sinceId],
        c.env,
        c.executionCtx
      );
      const newMessages = newMsgRes.rows || [];
      // If no new messages, return immediately with 0 identity queries
      if (newMessages.length === 0) {
        return c.json({ success: true, messages: [], contact: null });
      }
      return c.json({ success: true, messages: newMessages, contact: null });
    }

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

    // Look up active or latest complaint for this customer to ensure ticket_id and complaint_id are always resolved
    try {
      const compLookup = await query(
        `SELECT id, ticket_id, status FROM complaints 
         WHERE customer_phone LIKE '%' || $1
         ORDER BY CASE WHEN status NOT IN ('Resolved', 'Closed', 'Cancelled') THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
        [last10],
        c.env,
        c.executionCtx
      );
      if (compLookup.rows && compLookup.rows[0]) {
        complaintId = compLookup.rows[0].id;
        ticketId = compLookup.rows[0].ticket_id;
      }
    } catch (_) {}

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

// Helper for parsing HTTP Range header (e.g. bytes=1048576- or bytes=0-1000)
function parseByteRange(rangeHdr, totalSize) {
  if (!rangeHdr || typeof rangeHdr !== 'string' || !rangeHdr.startsWith('bytes=')) return null;
  const parts = rangeHdr.replace('bytes=', '').split('-');
  let start = parts[0] ? parseInt(parts[0], 10) : NaN;
  let end = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(start)) {
    start = Math.max(0, totalSize - end);
    end = totalSize - 1;
  } else if (isNaN(end)) {
    end = totalSize - 1;
  }
  if (start < 0) start = 0;
  if (end >= totalSize) end = totalSize - 1;
  if (start > end || isNaN(start)) return null;
  return { start, end, length: end - start + 1 };
}

// GET /api/whatsapp/media/:mediaId - Secure Meta WhatsApp Media Stream Proxy with Range & Scrubbing Support
whatsappRoutes.get('/media/:mediaId', async (c) => {
  const mediaId = c.req.param('mediaId');
  if (!mediaId) {
    return c.text('Media ID is required', 400);
  }
  const filename = c.req.query('filename') || '';
  let queryPhone = (c.req.query('phone') || '').replace(/\D/g, '');
  const token = c.env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
  const rangeHeader = c.req.header('range');

  // Resolve phone if not provided in query param
  if (!queryPhone) {
    try {
      const pRes = await query(
        'SELECT phone FROM whatsapp_messages WHERE media_id = $1 OR media_url LIKE $2 LIMIT 1',
        [mediaId, `%${mediaId}%`],
        c.env,
        c.executionCtx
      );
      if (pRes.rows && pRes.rows[0]?.phone) {
        queryPhone = (pRes.rows[0].phone || '').replace(/\D/g, '');
      }
    } catch (_) {}
  }

  // 1. Check if media belongs to a closed complaint past its retention duration (10-15 days)
  try {
    const purgeCheck = await query(
      `SELECT wm.id as msg_id, wm.complaint_id, wm.media_purged, wm.purge_reason, wm.phone,
              c.id as comp_id, c.ticket_id, c.status as comp_status, c.closed_at, c.updated_at,
              c.media_purged as comp_media_purged, c.retention_days
       FROM whatsapp_messages wm
       LEFT JOIN complaints c ON (
         wm.complaint_id = c.id 
         OR (c.customer_phone IS NOT NULL AND RIGHT(REPLACE(REPLACE(c.customer_phone, ' ', ''), '+', ''), 10) = RIGHT(REPLACE(REPLACE(wm.phone, ' ', ''), '+', ''), 10))
       )
       WHERE (wm.media_id = $1 OR wm.media_url LIKE $2)
       ORDER BY c.id DESC LIMIT 1`,
      [mediaId, `%${mediaId}%`],
      c.env,
      c.executionCtx
    );

    if (purgeCheck.rows && purgeCheck.rows.length > 0) {
      const row = purgeCheck.rows[0];
      const isClosed = ['Closed', 'closed', 'Resolved', 'resolved'].includes(row.comp_status);
      const targetId = row.comp_id || row.msg_id;
      const retentionDays = row.retention_days || (10 + ((targetId * 13 + 7) % 6));
      const closedTimestamp = row.closed_at || row.updated_at;
      const elapsedDays = (isClosed && closedTimestamp) ? (Date.now() - new Date(closedTimestamp).getTime()) / (1000 * 60 * 60 * 24) : 0;

      if (row.media_purged === 1 || row.comp_media_purged === 1 || (isClosed && elapsedDays >= retentionDays)) {
        // Trigger background cleanup if not yet deleted
        if (row.media_purged !== 1 && c.env?.MEDIA_BUCKET) {
          const cleanupPromise = purgeSingleClosedComplaintMedia(row.comp_id, row.ticket_id, row.phone, c.env, c.executionCtx);
          if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(cleanupPromise);
        }

        const ticketLabel = row.ticket_id ? ` (Ticket: ${row.ticket_id})` : '';
        const isDownload = c.req.query('download') === '1' || c.req.query('dl') === '1';
        const acceptHeader = c.req.header('Accept') || '';
        const wantsHtml = acceptHeader.includes('text/html') || isDownload;

        if (wantsHtml) {
          return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Media Deleted - Complaint Closed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #111b21; border: 1px solid #222e35; border-radius: 16px; padding: 32px 24px; max-width: 460px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    .icon { width: 56px; height: 56px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #f59e0b; font-size: 26px; }
    h2 { margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #fff; }
    p { margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #8696a0; }
    .meta-badge { background: #202c33; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #aebac1; margin-bottom: 20px; text-align: left; }
    .tip { font-size: 13px; color: #00a884; margin-bottom: 24px; }
    .btn { display: inline-block; background: #00a884; color: #111b21; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 10px; transition: opacity 0.2s; cursor: pointer; border: none; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📦</div>
    <h2>Media Removed — Complaint Closed</h2>
    <p>This complaint${ticketLabel} has already been resolved and closed. In accordance with system data retention policies, all associated audio, video, and media attachments were permanently deleted 10 to 15 days after ticket closure.</p>
    <div class="meta-badge">
      <div><strong>Status:</strong> Permanently Deleted from Storage</div>
      <div style="margin-top: 4px;"><strong>Retention Policy:</strong> 10–15 Days Post-Closure Purge (${retentionDays} Days)</div>
      ${row.ticket_id ? `<div style="margin-top: 4px;"><strong>Complaint Ticket:</strong> ${row.ticket_id}</div>` : ''}
    </div>
    <div class="tip">Complaint ticket records remain safely archived in the system.</div>
    <button onclick="window.close()" class="btn">Close</button>
  </div>
</body>
</html>`, 410);
        }

        return c.json({
          success: false,
          purged: true,
          expired: true,
          reason: 'complaint_closed_retention_expired',
          ticket_id: row.ticket_id || null,
          retention_days: retentionDays,
          error: 'This complaint has been closed and the media file was permanently deleted by the system per the 10–15 day data retention policy.',
          mediaId
        }, 410);
      }
    }
  } catch (checkErr) {
    console.warn('[WhatsApp Media Purge Check Warn]', checkErr.message);
  }

  const last10 = queryPhone.slice(-10);
  const possibleR2Keys = [];
  if (queryPhone) {
    possibleR2Keys.push(`whatsapp_media/${queryPhone}/${mediaId}`);
    if (last10 && `91${last10}` !== queryPhone) {
      possibleR2Keys.push(`whatsapp_media/91${last10}/${mediaId}`);
    }
  }
  possibleR2Keys.push(`whatsapp_media/${mediaId}`); // legacy fallback

  // 2. Check Cloudflare R2 cache first with HTTP Range support for scrubbing
  if (c.env?.MEDIA_BUCKET) {
    for (const key of possibleR2Keys) {
      try {
        let cached = null;
        if (rangeHeader) {
          cached = await c.env.MEDIA_BUCKET.get(key, { range: c.req.raw.headers });
        } else {
          cached = await c.env.MEDIA_BUCKET.get(key);
        }

        if (cached) {
          const headers = new Headers();
          const contentType = cached.httpMetadata?.contentType || 'video/mp4';
          headers.set('Content-Type', contentType);
          headers.set('Accept-Ranges', 'bytes');
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
          const isDownload = c.req.query('download') === '1' || c.req.query('dl') === '1';
          const dispositionType = isDownload ? 'attachment' : 'inline';
          if (filename) {
            headers.set('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(filename)}"`);
          } else {
            headers.set('Content-Disposition', dispositionType);
          }

          if (cached.range) {
            const start = cached.range.offset;
            const end = cached.range.offset + cached.range.length - 1;
            const total = cached.size;
            headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
            headers.set('Content-Length', String(cached.range.length));
            return new Response(cached.body, { status: 206, headers });
          } else {
            if (cached.size) headers.set('Content-Length', String(cached.size));
            return new Response(cached.body, { status: 200, headers });
          }
        }
      } catch (r2Err) {
        console.warn('[WhatsApp Media R2 Cache Read Warn]', r2Err.message);
      }
    }
  }

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text().catch(() => '');
      console.error('[WhatsApp Media] Meta error for ID', mediaId, errText);

      const isDownload = c.req.query('download') === '1' || c.req.query('dl') === '1';
      const acceptHeader = c.req.header('Accept') || '';
      const wantsHtml = acceptHeader.includes('text/html') || isDownload;

      if (wantsHtml) {
        return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Media Expired - Eco Green Solar</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #111b21; border: 1px solid #222e35; border-radius: 16px; padding: 32px 24px; max-width: 440px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    .icon { width: 56px; height: 56px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #ef4444; font-size: 26px; }
    h2 { margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #fff; }
    p { margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #8696a0; }
    .meta-badge { background: #202c33; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #aebac1; margin-bottom: 20px; text-align: left; }
    .tip { font-size: 13px; color: #00a884; margin-bottom: 24px; }
    .btn { display: inline-block; background: #00a884; color: #111b21; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 10px; transition: opacity 0.2s; cursor: pointer; border: none; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h2>WhatsApp Media Expired</h2>
    <p>This media file has expired on Meta WhatsApp servers because it was received more than 14 days ago and was not cached.</p>
    <div class="meta-badge">
      <div><strong>Media ID:</strong> ${mediaId}</div>
      <div style="margin-top: 4px;"><strong>Status:</strong> Ephemeral media expired on Meta Cloud API (Error 100/33).</div>
    </div>
    <div class="tip">Please request the customer to resend this video or photo on WhatsApp.</div>
    <button onclick="window.close()" class="btn">Close Tab</button>
  </div>
</body>
</html>`, 410);
      }

      return c.json({
        success: false,
        expired: true,
        error: 'This media item has expired on Meta WhatsApp servers. Please request the customer to resend it.',
        mediaId
      }, 410);
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

    const contentType = metaData.mime_type || fileRes.headers.get('content-type') || 'video/mp4';
    const arrayBuffer = await fileRes.arrayBuffer();

    // Cache in Cloudflare R2 inside whatsapp_media/{contact_phone}/{mediaId}
    if (c.env?.MEDIA_BUCKET) {
      const primaryR2Key = queryPhone ? `whatsapp_media/${queryPhone}/${mediaId}` : `whatsapp_media/${mediaId}`;
      const r2Put = c.env.MEDIA_BUCKET.put(primaryR2Key, arrayBuffer, {
        httpMetadata: { contentType }
      }).catch(err => console.error('[WhatsApp Media R2 Cache Save Error]', err));
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(r2Put);
      }
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const isDownload = c.req.query('download') === '1' || c.req.query('dl') === '1';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    if (filename) {
      headers.set('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(filename)}"`);
    } else {
      headers.set('Content-Disposition', dispositionType);
    }

    const totalLength = arrayBuffer.byteLength;
    const parsedRange = parseByteRange(rangeHeader, totalLength);

    if (parsedRange) {
      const chunk = arrayBuffer.slice(parsedRange.start, parsedRange.end + 1);
      headers.set('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${totalLength}`);
      headers.set('Content-Length', String(chunk.byteLength));
      return new Response(chunk, {
        status: 206,
        headers
      });
    }

    headers.set('Content-Length', String(totalLength));
    return new Response(arrayBuffer, {
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
    const { phone, message, complaint_id, media_url, media_type, media_caption, template_name, variables, quoted_text, quoted_msg_id } = body;
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
      quotedText: quoted_text || null,
      quotedMsgId: quoted_msg_id || null,
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

    if (!last10 || last10.length < 10) {
      return c.json({ success: false, error: 'Invalid phone number format' }, 400);
    }

    const regRes = await query(
      `SELECT * FROM whatsapp_number_registry WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
      [last10],
      c.env,
      c.executionCtx
    ).catch(() => ({ rows: [] }));

    const reg = regRes.rows?.[0] || null;
    let customerName = reg?.customer_name || null;
    let isVerified = reg?.status === 'verified';
    let isExistingCustomer = false;

    // Check installed_customers directory
    if (!customerName) {
      const instRes = await query(
        `SELECT customer_name, consumer_no, city_village FROM installed_customers 
         WHERE RIGHT(REGEXP_REPLACE(consumer_mobile, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
        [last10],
        c.env,
        c.executionCtx
      ).catch(() => ({ rows: [] }));
      if (instRes.rows?.[0]?.customer_name) {
        customerName = instRes.rows[0].customer_name;
        isExistingCustomer = true;
      }
    } else {
      isExistingCustomer = true;
    }

    // Check complaints
    if (!customerName) {
      const compRes = await query(
        `SELECT customer_name FROM complaints 
         WHERE RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 10) = $1 ORDER BY id DESC LIMIT 1`,
        [last10],
        c.env,
        c.executionCtx
      ).catch(() => ({ rows: [] }));
      if (compRes.rows?.[0]?.customer_name && compRes.rows[0].customer_name !== 'Customer') {
        customerName = compRes.rows[0].customer_name;
        isExistingCustomer = true;
      }
    }

    if (isExistingCustomer && !isVerified) {
      isVerified = true;
    }

    return c.json({
      success: true,
      verified: isVerified,
      isVerified,
      isWhatsApp: isVerified,
      status: isVerified ? 'verified' : (reg?.status || 'unconfirmed'),
      isExistingCustomer,
      customerName,
      formatted: `+91 ${last10}`,
      formattedPhone: `+91 ${last10}`,
      registry: reg
    });
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

    let templateName = msg.template_name;
    const bodyText = msg.message_body || '';

    // Smart template detection on retry: if template_name was not saved, detect status update pattern
    if (!templateName && bodyText) {
      if (/Update on Complaint/i.test(bodyText) || (/Eco Green Solar Alert/i.test(bodyText) && /Status:/i.test(bodyText))) {
        templateName = 'status__followup_note_update';
        
        const tktMatch = bodyText.match(/Update on Complaint \*?([A-Za-z0-9_-]+)\*?/i);
        if (tktMatch && tktMatch[1]) {
          variables.complaint_id = tktMatch[1].trim();
          variables.ticket_id = tktMatch[1].trim();
          variables.feedback_url = `${appUrl}/track/${tktMatch[1].trim()}`;
        }
        
        const prodMatch = bodyText.match(/\(([^)]+)\):/);
        if (prodMatch && prodMatch[1]) {
          variables.product_type = prodMatch[1].trim();
        }

        const statusMatch = bodyText.match(/Status:\s*\*?([^\n*]+)\*?/i);
        if (statusMatch && statusMatch[1]) {
          variables.status = statusMatch[1].trim();
        }

        const notesMatch = bodyText.match(/Notes:\s*(.+?)(?=\n\n|\n- Eco|$)/is);
        if (notesMatch && notesMatch[1]) {
          variables.notes = notesMatch[1].trim();
        }
      }
    }

    const sendRes = await sendWhatsApp({
      to: msg.phone,
      message: msg.message_body,
      templateName,
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

// POST /api/whatsapp/attach-to-complaint - Attach WhatsApp Media to Existing Complaint / Draft
whatsappRoutes.post('/attach-to-complaint', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const uploaderName = user?.name || user?.username || 'Staff Support Desk';
    const body = await c.req.json().catch(() => ({}));
    const messageId = body.message_id || body.id;
    let complaintId = body.complaint_id;
    const attachmentType = body.attachment_type || 'registration';
    const customNotes = (body.custom_notes || '').trim();

    if (!messageId) {
      return c.json({ error: 'message_id is required' }, 400);
    }

    const msgRes = await query(
      'SELECT * FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1 LIMIT 1',
      [String(messageId)],
      c.env,
      c.executionCtx
    );
    if (!msgRes.rows.length) {
      return c.json({ error: 'WhatsApp message not found' }, 404);
    }
    const msg = msgRes.rows[0];

    // Determine media URL
    let fileUrl = msg.media_url;
    if (!fileUrl && msg.media_id) {
      fileUrl = `/api/whatsapp/media/${msg.media_id}?phone=${encodeURIComponent(msg.phone || '')}`;
    }
    if (!fileUrl) {
      return c.json({ error: 'This message does not contain media to attach' }, 400);
    }

    // Auto-resolve complaint ID from customer phone if not provided
    if (!complaintId && msg.phone) {
      const last10 = String(msg.phone).replace(/\D/g, '').slice(-10);
      const activeComp = await query(
        `SELECT id, ticket_id FROM complaints 
         WHERE customer_phone LIKE '%' || $1 AND status NOT IN ('Cancelled')
         ORDER BY CASE WHEN status NOT IN ('Resolved', 'Closed') THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
        [last10],
        c.env,
        c.executionCtx
      );
      if (activeComp.rows.length > 0) {
        complaintId = activeComp.rows[0].id;
      }
    }

    if (!complaintId) {
      return c.json({ error: 'Target complaint_id or ticket_id is required' }, 400);
    }

    const compRes = await query(
      'SELECT id, ticket_id, customer_name, status FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
      [String(complaintId)],
      c.env,
      c.executionCtx
    );
    if (!compRes.rows.length) {
      return c.json({ error: 'Target complaint not found' }, 404);
    }
    const targetComp = compRes.rows[0];

    // Determine file type & extension
    const isImage = msg.media_type === 'image' || (fileUrl && /\.(jpe?g|png|webp|gif)/i.test(fileUrl));
    const isVideo = msg.media_type === 'video' || (fileUrl && /\.(mp4|webm|mov)/i.test(fileUrl));
    const isDoc = msg.media_type === 'document' || (fileUrl && /\.(pdf|docx?|xlsx?|txt)/i.test(fileUrl));
    const isAudio = msg.media_type === 'audio' || (fileUrl && /\.(ogg|mp3|m4a|wav)/i.test(fileUrl));

    let ext = isImage ? 'jpg' : isVideo ? 'mp4' : isDoc ? 'pdf' : isAudio ? 'ogg' : 'bin';
    let fileType = isImage ? 'image/jpeg' : isVideo ? 'video/mp4' : isDoc ? 'application/pdf' : isAudio ? 'audio/ogg' : 'application/octet-stream';

    let fileName = (msg.media_caption || '').trim();
    if (!fileName || fileName.includes('\n')) {
      const mediaLabel = isImage ? 'Photo' : isVideo ? 'Video' : isDoc ? 'Document' : isAudio ? 'Voice' : 'Media';
      fileName = `WhatsApp_${mediaLabel}_${targetComp.ticket_id || targetComp.id}_${Date.now()}.${ext}`;
    } else if (!fileName.includes('.')) {
      fileName = `${fileName}.${ext}`;
    }

    // Insert into complaint_attachments
    const attRes = await query(
      `INSERT INTO complaint_attachments (
        complaint_id, file_name, file_url, file_type, file_data, uploaded_by, attachment_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, file_name, file_url, file_type, uploaded_by, attachment_type, created_at`,
      [
        targetComp.id,
        fileName,
        fileUrl,
        fileType,
        fileUrl,
        `Customer via WhatsApp (Attached by ${uploaderName})`,
        attachmentType
      ],
      c.env,
      c.executionCtx
    );

    // Update whatsapp_messages with linked complaint_id
    await query('UPDATE whatsapp_messages SET complaint_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [targetComp.id, msg.id], c.env, c.executionCtx);

    // Record in complaint timeline
    const mediaLabel = isImage ? 'photo' : isVideo ? 'video' : isDoc ? 'document' : 'media file';
    const tlNotes = customNotes
      ? `Attached customer WhatsApp ${mediaLabel} "${fileName}": ${customNotes}`
      : `Attached customer WhatsApp ${mediaLabel} "${fileName}" from chat (+91 ${(msg.phone || '').replace(/^91/, '')})`;

    await query(
      `INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
       VALUES ($1, 'Document Attached', $2, $3, $4, 0)`,
      [
        targetComp.id,
        tlNotes,
        uploaderName,
        user?.role || 'staff'
      ],
      c.env,
      c.executionCtx
    ).catch(() => {});

    return c.json({
      success: true,
      message: `Media attached to ticket #${targetComp.ticket_id || targetComp.id} successfully`,
      attachment: attRes.rows[0],
      ticket_id: targetComp.ticket_id,
      complaint_id: targetComp.id
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/whatsapp/customer-media/:phone - Fetch recent media messages for customer phone
whatsappRoutes.get('/customer-media/:phone', authenticateToken, async (c) => {
  try {
    const rawPhone = c.req.param('phone');
    const cleanDigits = (rawPhone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);
    if (!last10) return c.json({ success: true, media: [] });

    const res = await query(
      `SELECT id, complaint_id, phone, sender_type, sender_name, message_body, 
              media_id, media_type, media_url, media_caption, created_at
       FROM whatsapp_messages
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
         AND (media_url IS NOT NULL OR media_id IS NOT NULL OR media_type IN ('image', 'video', 'document', 'audio'))
       ORDER BY created_at DESC LIMIT 50`,
      [last10],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, media: res.rows || [] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/whatsapp/messages/:id - Delete Message & Associated R2 Media
whatsappRoutes.delete('/messages/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');

    // 1. Fetch message details to delete any media in R2
    const msgRes = await query(
      'SELECT id, phone, media_id, media_url FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1',
      [String(id)],
      c.env,
      c.executionCtx
    ).catch(() => ({ rows: [] }));

    const msg = msgRes.rows?.[0];
    if (msg && c.env?.MEDIA_BUCKET) {
      const cleanPhone = (msg.phone || '').replace(/\D/g, '');
      const last10 = cleanPhone.slice(-10);

      // Delete media file from R2
      if (msg.media_id) {
        if (cleanPhone) await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/${cleanPhone}/${msg.media_id}`).catch(() => {});
        if (last10) await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/91${last10}/${msg.media_id}`).catch(() => {});
        await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/${msg.media_id}`).catch(() => {});
      }
      if (msg.media_url) {
        const match = msg.media_url.match(/\/api\/whatsapp\/media\/([^\s?#]+)/);
        if (match && match[1]) {
          if (cleanPhone) await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/${cleanPhone}/${match[1]}`).catch(() => {});
          await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/${match[1]}`).catch(() => {});
        }
        const r2Match = msg.media_url.match(/\/api\/attachments\/r2\/([^\s?#]+)/);
        if (r2Match && r2Match[1]) {
          await deleteR2Object(c.env.MEDIA_BUCKET, decodeURIComponent(r2Match[1])).catch(() => {});
        }
      }
    }

    // 2. Delete message from database
    await query('DELETE FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1', [String(id)], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Message and media deleted successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/messages/:id/star - Star / Unstar Message
whatsappRoutes.post('/messages/:id/star', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const current = await query(
      'SELECT id, is_starred FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1 LIMIT 1',
      [String(id)],
      c.env,
      c.executionCtx
    );
    if (!current.rows || !current.rows.length) {
      return c.json({ error: 'Message not found' }, 404);
    }
    const newStarred = body.is_starred !== undefined ? Boolean(body.is_starred) : !current.rows[0].is_starred;
    await query(
      'UPDATE whatsapp_messages SET is_starred = $1, updated_at = CURRENT_TIMESTAMP WHERE id::text = $2 OR wam_id = $2',
      [newStarred, String(id)],
      c.env,
      c.executionCtx
    );
    return c.json({ success: true, is_starred: newStarred });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/messages/:id/react - Emoji Reaction Toggle & Meta Dispatch
whatsappRoutes.post('/messages/:id/react', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const user = c.get('user');
    const emoji = body.emoji || '';

    const msgRes = await query(
      'SELECT id, phone, wam_id, reactions FROM whatsapp_messages WHERE id::text = $1 OR wam_id = $1 LIMIT 1',
      [String(id)],
      c.env,
      c.executionCtx
    );
    if (!msgRes.rows || !msgRes.rows.length) {
      return c.json({ error: 'Message not found' }, 404);
    }
    const msg = msgRes.rows[0];

    let list = [];
    try {
      list = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : (Array.isArray(msg.reactions) ? msg.reactions : []);
    } catch (_) { list = []; }

    const userId = user?.id || 'staff';
    const userName = user?.name || 'Staff';
    const existingIdx = list.findIndex(r => r.user_id === userId);

    if (existingIdx >= 0) {
      if (list[existingIdx].emoji === emoji || !emoji) {
        list.splice(existingIdx, 1);
      } else {
        list[existingIdx] = { emoji, user_id: userId, user_name: userName, created_at: new Date().toISOString() };
      }
    } else if (emoji) {
      list.push({ emoji, user_id: userId, user_name: userName, created_at: new Date().toISOString() });
    }

    await query(
      'UPDATE whatsapp_messages SET reactions = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(list), msg.id],
      c.env,
      c.executionCtx
    );

    // If message has wam_id, dispatch reaction to Meta Cloud API in background
    if (msg.wam_id) {
      try {
        const phoneId = c.env?.META_PHONE_NUMBER_ID || META_PHONE_NUMBER_ID;
        const token = c.env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
        if (token && phoneId) {
          const cleanDigits = (msg.phone || '').replace(/\D/g, '');
          const formattedPhone = cleanDigits.startsWith('91') ? cleanDigits : `91${cleanDigits.slice(-10)}`;
          fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedPhone,
              type: 'reaction',
              reaction: {
                message_id: msg.wam_id,
                emoji: emoji || ''
              }
            })
          }).catch(() => {});
        }
      } catch (_) {}
    }

    return c.json({ success: true, reactions: list });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/whatsapp/conversations/:phone - Remove Contact & Entire Chat History + R2 Media
whatsappRoutes.delete('/conversations/:phone', authenticateToken, async (c) => {
  try {
    const rawPhone = c.req.param('phone');
    const cleanDigits = (rawPhone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);
    if (!last10) {
      return c.json({ error: 'Valid phone number is required' }, 400);
    }

    // 1. Fetch messages with media to delete individual legacy files if needed
    const msgs = await query(
      `SELECT media_id, media_url FROM whatsapp_messages 
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1`,
      [last10],
      c.env,
      c.executionCtx
    ).catch(() => ({ rows: [] }));

    if (c.env?.MEDIA_BUCKET) {
      // Recursively delete all media in R2 under this contact's subfolder
      await deleteR2Prefix(c.env.MEDIA_BUCKET, `whatsapp_media/${cleanDigits}/`);
      if (cleanDigits !== `91${last10}`) {
        await deleteR2Prefix(c.env.MEDIA_BUCKET, `whatsapp_media/91${last10}/`);
      }
      await deleteR2Prefix(c.env.MEDIA_BUCKET, `whatsapp_media/${last10}/`);

      // Delete any legacy un-nested media files for this contact
      for (const m of (msgs.rows || [])) {
        if (m.media_id) {
          await deleteR2Object(c.env.MEDIA_BUCKET, `whatsapp_media/${m.media_id}`).catch(() => {});
        }
      }
    }

    // 2. Delete all messages for this contact from database
    await query(
      `DELETE FROM whatsapp_messages 
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1`,
      [last10],
      c.env,
      c.executionCtx
    );

    // 3. Delete raw event logs for this contact
    await query(
      `DELETE FROM whatsapp_raw_events 
       WHERE RIGHT(REGEXP_REPLACE(sender_phone, '[^0-9]', '', 'g'), 10) = $1 
          OR RIGHT(REGEXP_REPLACE(recipient_phone, '[^0-9]', '', 'g'), 10) = $1`,
      [last10],
      c.env,
      c.executionCtx
    ).catch(() => {});

    // 4. Delete unread tracking state for this contact
    await query(
      `DELETE FROM whatsapp_conversation_reads WHERE phone_10 = $1`,
      [last10],
      c.env,
      c.executionCtx
    ).catch(() => {});

    return c.json({ success: true, message: 'Contact, conversation, and all R2 media removed completely' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * 30-Day Disappearing Messages Purge Engine
 * Removes WhatsApp messages, documents, and R2 media older than 30 days
 */
export async function runBatchExpiredWhatsAppPurge(env, ctx) {
  try {
    console.log('[Cron WhatsApp Purge] Starting 30-day disappearing messages purge...');
    // 1. Fetch expired messages with media
    const expiredRes = await query(
      `SELECT id, phone, media_id, media_url FROM whatsapp_messages 
       WHERE created_at < NOW() - INTERVAL '30 days'`,
      [],
      env,
      ctx
    ).catch(() => ({ rows: [] }));

    const expiredMsgs = expiredRes.rows || [];
    if (expiredMsgs.length > 0 && env?.MEDIA_BUCKET) {
      for (const m of expiredMsgs) {
        const cleanPhone = (m.phone || '').replace(/\D/g, '');
        const last10 = cleanPhone.slice(-10);
        if (m.media_id) {
          if (cleanPhone) await deleteR2Object(env.MEDIA_BUCKET, `whatsapp_media/${cleanPhone}/${m.media_id}`).catch(() => {});
          if (last10) await deleteR2Object(env.MEDIA_BUCKET, `whatsapp_media/91${last10}/${m.media_id}`).catch(() => {});
          await deleteR2Object(env.MEDIA_BUCKET, `whatsapp_media/${m.media_id}`).catch(() => {});
        }
      }
    }

    // 2. Delete expired rows from database
    const delRes = await query(
      `DELETE FROM whatsapp_messages WHERE created_at < NOW() - INTERVAL '30 days'`,
      [],
      env,
      ctx
    ).catch(() => ({ rowCount: 0 }));

    await query(
      `DELETE FROM whatsapp_raw_events WHERE created_at < NOW() - INTERVAL '30 days'`,
      [],
      env,
      ctx
    ).catch(() => {});

    console.log(`[Cron WhatsApp Purge] Purged ${delRes?.rowCount || expiredMsgs.length} messages older than 30 days.`);
    return { success: true, purgedCount: delRes?.rowCount || expiredMsgs.length };
  } catch (err) {
    console.error('[WhatsApp 30-Day Purge Error]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Purge single closed complaint media from R2 and mark whatsapp_messages as purged
 */
export async function purgeSingleClosedComplaintMedia(complaintId, ticketId, phone, env, ctx) {
  if (!env?.MEDIA_BUCKET) return;
  const bucket = env.MEDIA_BUCKET;

  try {
    // 1. Delete R2 keys for complaint attachments
    if (ticketId) await deleteR2Prefix(bucket, `complaints/${ticketId}/`).catch(() => {});
    if (complaintId) await deleteR2Prefix(bucket, `complaints/${complaintId}/`).catch(() => {});

    // 2. Fetch and delete WhatsApp media for this complaint/phone
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const last10 = cleanPhone.slice(-10);

    let msgsRes = { rows: [] };
    if (complaintId) {
      msgsRes = await query(
        `SELECT id, media_id, phone FROM whatsapp_messages WHERE complaint_id = $1 AND media_id IS NOT NULL`,
        [complaintId],
        env,
        ctx
      ).catch(() => ({ rows: [] }));
    }
    if ((!msgsRes.rows || msgsRes.rows.length === 0) && last10) {
      msgsRes = await query(
        `SELECT id, media_id, phone FROM whatsapp_messages 
         WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 AND media_id IS NOT NULL`,
        [last10],
        env,
        ctx
      ).catch(() => ({ rows: [] }));
    }

    const msgRows = msgsRes?.rows || [];
    const msgIdsToMark = [];

    for (const msg of msgRows) {
      msgIdsToMark.push(msg.id);
      const mPhone = (msg.phone || cleanPhone || '').replace(/\D/g, '');
      const mLast10 = mPhone.slice(-10);
      if (mPhone) await deleteR2Object(bucket, `whatsapp_media/${mPhone}/${msg.media_id}`).catch(() => {});
      if (mLast10) await deleteR2Object(bucket, `whatsapp_media/91${mLast10}/${msg.media_id}`).catch(() => {});
      await deleteR2Object(bucket, `whatsapp_media/${msg.media_id}`).catch(() => {});
    }

    if (msgIdsToMark.length > 0) {
      await query(
        `UPDATE whatsapp_messages 
         SET media_purged = 1, purge_reason = 'complaint_closed_retention_expired' 
         WHERE id = ANY($1)`,
        [msgIdsToMark],
        env,
        ctx
      ).catch(() => {});
    }

    if (complaintId) {
      await query(
        `UPDATE complaint_attachments 
         SET is_purged = 1, purge_reason = 'complaint_closed_retention_expired', file_url = NULL, file_data = NULL 
         WHERE complaint_id = $1`,
        [complaintId],
        env,
        ctx
      ).catch(() => {});

      await query(
        `UPDATE complaints 
         SET media_purged = 1, documents_purged = 1, media_purged_at = CURRENT_TIMESTAMP, closing_photo_url = NULL 
         WHERE id = $1`,
        [complaintId],
        env,
        ctx
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`[Purge Single Closed Complaint Media Error] Comp ${complaintId}:`, err);
  }
}

export default whatsappRoutes;

