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
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value || {};

        // Inbound Messages
        if (val.messages && val.messages.length > 0) {
          for (const msg of val.messages) {
            const senderPhone = msg.from;
            const senderName = val.contacts?.[0]?.profile?.name || 'Customer';
            const wamid = msg.id;
            let textBody = '';
            let mediaUrl = null;
            let mediaType = msg.type || 'text';

            if (msg.type === 'text') {
              textBody = msg.text?.body || '';
            } else if (msg.type === 'image' || msg.type === 'document' || msg.type === 'video') {
              textBody = msg[msg.type]?.caption || `[${msg.type.toUpperCase()} file]`;
              mediaUrl = msg[msg.type]?.id ? `/api/whatsapp/media/${msg[msg.type].id}` : null;
            }

            // Look up associated complaint by phone
            const cleanPhone = senderPhone.replace(/\D/g, '').slice(-10);
            const compRes = await query(
              'SELECT id FROM complaints WHERE customer_phone LIKE \'%\' || $1 ORDER BY id DESC LIMIT 1',
              [cleanPhone],
              c.env,
              c.executionCtx
            ).catch(() => ({ rows: [] }));
            const complaintId = compRes.rows[0]?.id || null;

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

        // Status Updates (sent, delivered, read, failed)
        if (val.statuses && val.statuses.length > 0) {
          for (const st of val.statuses) {
            const wamid = st.id;
            const status = st.status; // 'sent', 'delivered', 'read', 'failed'
            const errorReason = st.errors?.[0]?.message || null;

            await query(
              `UPDATE whatsapp_messages 
               SET status = $1, 
                   failure_reason = COALESCE($2, failure_reason),
                   updated_at = CURRENT_TIMESTAMP
               WHERE wam_id = $3`,
              [status, errorReason, wamid],
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

// GET /api/whatsapp/conversations - List Inbox Chats
whatsappRoutes.get('/conversations', authenticateToken, async (c) => {
  try {
    const res = await query(
      `SELECT DISTINCT ON (m.phone)
        m.phone,
        m.sender_name,
        m.message_body,
        m.status,
        m.created_at,
        c.ticket_id,
        c.customer_name
       FROM whatsapp_messages m
       LEFT JOIN complaints c ON m.complaint_id = c.id
       ORDER BY m.phone, m.created_at DESC`,
      [],
      c.env,
      c.executionCtx
    );
    return c.json({ conversations: res.rows });
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
       WHERE phone LIKE '%' || $1
       ORDER BY created_at ASC LIMIT 100`,
      [last10],
      c.env,
      c.executionCtx
    );
    return c.json({ messages: res.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/direct-reply - Staff Sends Direct WhatsApp Message
whatsappRoutes.post('/direct-reply', authenticateToken, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { phone, message, complaint_id } = body;
    const user = c.get('user');

    if (!phone || !message) {
      return c.json({ error: 'Phone and message are required' }, 400);
    }

    const sendRes = await sendWhatsApp({
      to: phone,
      message,
      variables: { db_complaint_id: complaint_id },
      senderName: user?.name || 'Eco Green Staff',
      env: c.env
    });

    return c.json({ success: sendRes.success, wamid: sendRes.wamid, error: sendRes.error });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default whatsappRoutes;
