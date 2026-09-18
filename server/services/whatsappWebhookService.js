const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const notificationService = require('./notificationService');

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'ecogreen_solar_webhook_verify_2026';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Meta Webhook Verification (GET request handshake)
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Verification successful!');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp Webhook] Verification failed. Token mismatch:', token);
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
}

/**
 * Download media from Meta Graph API using media ID
 */
async function downloadMedia(mediaId, mimeType, originalName = null) {
  const accessToken = process.env.META_ACCESS_TOKEN || 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
  if (!accessToken) {
    console.error('[WhatsApp Webhook] Cannot download media: META_ACCESS_TOKEN is missing');
    return null;
  }

  try {
    // 1. Get media URL
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData.url) {
      console.error('[WhatsApp Webhook] Failed to retrieve media URL:', metaData);
      return null;
    }

    // 2. Fetch binary stream
    const fileRes = await fetch(metaData.url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!fileRes.ok) {
      console.error('[WhatsApp Webhook] Failed to download media binary:', fileRes.statusText);
      return null;
    }

    const buffer = await fileRes.arrayBuffer();

    // Determine extension
    let ext = 'bin';
    if (mimeType) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('mp4')) ext = 'mp4';
      else if (mimeType.includes('ogg') || mimeType.includes('audio')) ext = 'ogg';
    }
    if (originalName && originalName.includes('.')) {
      ext = originalName.split('.').pop();
    }

    const safeName = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(filePath, Buffer.from(buffer));

    return {
      fileName: originalName || safeName,
      fileUrl: `/uploads/${safeName}`,
      fileType: mimeType || ext
    };
  } catch (err) {
    console.error('[WhatsApp Webhook] Error downloading media:', err.message);
    return null;
  }
}

const { normalizePhone, getLast10Digits } = require('../utils/phoneNormalizer');

/**
 * Handle incoming Meta Webhook events (POST request)
 */
async function handleIncomingWebhook(req, res) {
  // Acknowledge immediately to prevent Meta retries
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  try {
    for (const entry of body.entry || []) {
      const wabaId = entry.id;
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;
        const phoneNumberId = value.metadata?.phone_number_id;

        // 1. Handle incoming message statuses (Delivered, Read, Sent, Failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            const wamId = st.id;
            const newStatus = st.status;
            const recipientPhone = st.recipient_id ? normalizePhone(st.recipient_id) : null;
            const errCode = st.errors?.[0]?.code ? String(st.errors[0].code) : null;
            const errMsg = st.errors?.[0]?.message || st.errors?.[0]?.title || null;

            // Raw Event Audit Log
            try {
              db.prepare(`
                INSERT INTO whatsapp_raw_events (
                  event_id, wam_id, waba_id, phone_number_id, recipient_phone, direction, event_type, status, error_code, error_message, raw_payload
                ) VALUES (?, ?, ?, ?, ?, 'status', 'status', ?, ?, ?, ?)
              `).run(st.id, wamId, wabaId, phoneNumberId, recipientPhone, newStatus, errCode, errMsg, JSON.stringify(st));
            } catch (e) {
              console.warn('[WhatsAppWebhook] Raw status event log note:', e.message);
            }

            try {
              db.prepare(`
                UPDATE whatsapp_messages 
                SET status = ?, failure_reason = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE wam_id = ?
              `).run(newStatus, errMsg, wamId);
            } catch (e) {
              // Ignore if not present
            }

            if (newStatus === 'failed') {
              const isNotOnWa = (st.errors || []).some(err => err.code === 131026 || String(err.message || '').toLowerCase().includes('not a valid whatsapp user'));
              if (isNotOnWa && recipientPhone) {
                const last10 = getLast10Digits(recipientPhone);
                try {
                  db.prepare(`
                    INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, source, notes, updated_at)
                    VALUES (?, 0, 'invite_required', 'meta_delivery_failed_131026', 'Recipient is not a valid WhatsApp user', CURRENT_TIMESTAMP)
                  `).run(last10);
                  console.log(`[WhatsAppWebhook] Marked ${last10} as invite_required due to Meta error 131026`);
                } catch (e) {}
              }
            }
          }
        }

        // 2. Handle actual incoming customer messages
        if (value.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            const fromDigits = (msg.from || '').replace(/[^0-9]/g, '');
            const matchingContact = (value.contacts || []).find(c => {
              const cDigits = (c.wa_id || '').replace(/[^0-9]/g, '');
              return cDigits === fromDigits || fromDigits.endsWith(cDigits) || cDigits.endsWith(fromDigits.slice(-10));
            }) || value.contacts?.[0];

            // Raw Event Audit Log for Inbound Message
            try {
              db.prepare(`
                INSERT INTO whatsapp_raw_events (
                  event_id, wam_id, waba_id, phone_number_id, sender_phone, direction, event_type, status, raw_payload
                ) VALUES (?, ?, ?, ?, ?, 'inbound', ?, 'received', ?)
              `).run(msg.id, msg.id, wabaId, phoneNumberId, normalizePhone(msg.from), msg.type || 'message', JSON.stringify({ message: msg, contact: matchingContact }));
            } catch (e) {
              console.warn('[WhatsAppWebhook] Raw inbound message event log note:', e.message);
            }

            await processSingleMessage(msg, matchingContact);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook] Processing error:', err);
  }
}

async function processSingleMessage(msg, contact) {
  const wamId = msg.id;
  const msgType = msg.type || 'text';

  // Idempotency: Skip duplicate message processing
  if (wamId) {
    const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE wam_id = ? LIMIT 1').get(wamId);
    if (existing) {
      console.log(`[WhatsAppWebhook] Inbound message ${wamId} already processed. Skipping duplicate.`);
      return;
    }
  }

  const rawFrom = msg.from || '';
  const canonicalPhone = normalizePhone(rawFrom);
  const last10 = getLast10Digits(rawFrom);

  // Find matching complaint by customer_phone (match last 10 digits)
  const complaint = db.prepare(`
    SELECT * FROM complaints 
    WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`%${last10}%`);

  const complaintId = complaint ? complaint.id : null;

  // Store Meta profile name in registry if present
  if (contact?.profile?.name && !/^[0-9+ ]+$/.test(contact.profile.name)) {
    try {
      db.prepare(`
        INSERT INTO whatsapp_number_registry (phone, customer_name, is_whatsapp_active, status, source, updated_at)
        VALUES (?, ?, 1, 'verified', 'meta_webhook_profile', CURRENT_TIMESTAMP)
        ON CONFLICT(phone) DO UPDATE SET
          customer_name = excluded.customer_name,
          is_whatsapp_active = 1,
          status = 'verified',
          updated_at = CURRENT_TIMESTAMP
      `).run(last10, contact.profile.name);
    } catch (e) {}
  }

  // 3-Tier Contact Resolution:
  // Priority 1: Our database customer/contact name
  let senderName = null;
  if (complaint?.customer_name && complaint.customer_name !== 'Customer') {
    senderName = complaint.customer_name;
  }
  if (!senderName) {
    const inst = db.prepare("SELECT customer_name FROM installed_customers WHERE REPLACE(REPLACE(consumer_mobile, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
    if (inst?.customer_name) senderName = inst.customer_name;
  }
  // Priority 2: Meta Profile Name
  if (!senderName && contact?.profile?.name && !/^[0-9+ ]+$/.test(contact.profile.name)) {
    senderName = contact.profile.name;
  }
  if (!senderName) {
    try {
      const reg = db.prepare("SELECT customer_name FROM whatsapp_number_registry WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ? LIMIT 1").get(`%${last10}%`);
      if (reg?.customer_name && reg.customer_name !== 'Customer' && !/^[0-9+ ]+$/.test(reg.customer_name)) {
        senderName = reg.customer_name;
      }
    } catch (e) {}
  }
  // Priority 3: Formatted phone number
  if (!senderName) {
    senderName = formatDisplayPhone(canonicalPhone);
  }

  let messageBody = '';
  let mediaId = null;
  let mediaType = null;
  let mediaUrl = null;
  let mediaCaption = null;
  let downloadedAttachment = null;

  if (msgType === 'text') {
    messageBody = msg.text?.body || '';
  } else if (msgType === 'image') {
    mediaType = 'image';
    mediaId = msg.image?.id;
    mediaCaption = msg.image?.caption || '';
    messageBody = mediaCaption || '[Image Received]';
    downloadedAttachment = await downloadMedia(mediaId, msg.image?.mime_type, 'WhatsApp_Photo.jpg');
    if (downloadedAttachment) {
      mediaUrl = downloadedAttachment.fileUrl;
    }
  } else if (msgType === 'document') {
    mediaType = 'document';
    mediaId = msg.document?.id;
    mediaCaption = msg.document?.caption || '';
    const originalDocName = msg.document?.filename || 'Document.pdf';
    messageBody = mediaCaption || `[Document: ${originalDocName}]`;
    downloadedAttachment = await downloadMedia(mediaId, msg.document?.mime_type, originalDocName);
    if (downloadedAttachment) {
      mediaUrl = downloadedAttachment.fileUrl;
    }
  } else if (msgType === 'audio') {
    mediaType = 'audio';
    mediaId = msg.audio?.id;
    messageBody = '[Voice Note / Audio]';
    downloadedAttachment = await downloadMedia(mediaId, msg.audio?.mime_type, 'Audio.ogg');
    if (downloadedAttachment) {
      mediaUrl = downloadedAttachment.fileUrl;
    }
  } else if (msgType === 'video') {
    mediaType = 'video';
    mediaId = msg.video?.id;
    mediaCaption = msg.video?.caption || '';
    messageBody = mediaCaption || '[Video Received]';
    downloadedAttachment = await downloadMedia(mediaId, msg.video?.mime_type, 'Video.mp4');
    if (downloadedAttachment) {
      mediaUrl = downloadedAttachment.fileUrl;
    }
  } else {
    messageBody = `[Received ${msgType} message]`;
  }

  // Save to whatsapp_messages
  const insertStmt = db.prepare(`
    INSERT INTO whatsapp_messages (
      complaint_id, phone, sender_type, sender_name, 
      message_body, media_id, media_type, media_url, 
      media_caption, wam_id, status
    ) VALUES (?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, 'received')
  `);

  const res = insertStmt.run(
    complaintId,
    canonicalPhone,
    senderName,
    messageBody,
    mediaId,
    mediaType,
    mediaUrl,
    mediaCaption,
    wamId
  );

  // Save online profile name and mark number as active in whatsapp_number_registry
  try {
    const finalProfileName = contact?.profile?.name || (senderName !== formatDisplayPhone(canonicalPhone) ? senderName : null);
    if (finalProfileName) {
      db.prepare(`
        INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, customer_name, source, notes, updated_at)
        VALUES (?, 1, 'verified', ?, 'incoming_whatsapp_message', 'Confirmed active WhatsApp profile', CURRENT_TIMESTAMP)
      `).run(last10, finalProfileName);

      // Retroactively update earlier messages for this phone that have generic or missing names
      db.prepare(`
        UPDATE whatsapp_messages 
        SET sender_name = ? 
        WHERE phone LIKE ? AND sender_type = 'customer' AND (sender_name IS NULL OR sender_name = 'Customer' OR sender_name LIKE '%+%' OR sender_name GLOB '[0-9]*')
      `).run(finalProfileName, `%${last10}%`);
    } else {
      db.prepare(`
        INSERT OR REPLACE INTO whatsapp_number_registry (phone, is_whatsapp_active, status, source, notes, updated_at)
        VALUES (?, 1, 'verified', 'incoming_whatsapp_message', 'Confirmed active WhatsApp user via incoming message', CURRENT_TIMESTAMP)
      `).run(last10);
    }
  } catch (e) {
    console.warn('[WhatsAppWebhook] Registry update note:', e.message);
  }

  const messageRecord = {
    id: res.lastInsertRowid,
    complaint_id: complaintId,
    ticket_id: complaint?.ticket_id || null,
    phone: canonicalPhone,
    sender_type: 'customer',
    sender_name: senderName,
    message_body: messageBody,
    media_url: mediaUrl,
    media_type: mediaType,
    created_at: new Date().toISOString()
  };

  // If media was downloaded and complaint exists, save to complaint_attachments
  if (downloadedAttachment && complaintId) {
    try {
      db.prepare(`
        INSERT INTO complaint_attachments (complaint_id, file_name, file_url, file_type, uploaded_by)
        VALUES (?, ?, ?, ?, 'Customer via WhatsApp')
      `).run(
        complaintId,
        downloadedAttachment.fileName,
        downloadedAttachment.fileUrl,
        downloadedAttachment.fileType
      );
      console.log(`[WhatsApp Webhook] Saved incoming media into attachments for Complaint #${complaint.ticket_id}`);
    } catch (attErr) {
      console.error('[WhatsApp Webhook] Error attaching file to complaint:', attErr);
    }
  }

  // If complaint exists, record a timeline event
  if (complaintId) {
    try {
      const summaryText = mediaType 
        ? `Customer sent ${mediaType}${mediaCaption ? ': ' + mediaCaption : ''}` 
        : messageBody;

      db.prepare(`
        INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
        VALUES (?, 'Customer WhatsApp Reply', ?, ?, 'Customer', 0)
      `).run(
        complaintId,
        summaryText,
        senderName
      );
    } catch (timeErr) {
      console.error('[WhatsApp Webhook] Error recording timeline:', timeErr);
    }
  }

  // Emit SSE notification event for live UI updates
  try {
    notificationService.emit('whatsapp_message', messageRecord);
  } catch (sseErr) {
    console.warn('[WhatsApp Webhook] SSE emit error:', sseErr.message);
  }

  console.log(`[WhatsApp Webhook] Processed incoming message from ${canonicalPhone} (${senderName}) for Ticket: ${complaint?.ticket_id || 'None'}`);
}

module.exports = {
  verifyWebhook,
  handleIncomingWebhook,
  downloadMedia
};
