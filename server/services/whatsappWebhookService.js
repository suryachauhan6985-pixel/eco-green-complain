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
  const accessToken = process.env.META_ACCESS_TOKEN;
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
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        // 1. Handle incoming message statuses (Delivered, Read, Sent, Failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            const wamId = st.id;
            const newStatus = st.status;
            try {
              db.prepare('UPDATE whatsapp_messages SET status = ? WHERE wam_id = ?').run(newStatus, wamId);
            } catch (e) {
              // Ignore if not present
            }
          }
        }

        // 2. Handle actual incoming customer messages
        if (value.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            await processSingleMessage(msg, value.contacts?.[0]);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook] Processing error:', err);
  }
}

async function processSingleMessage(msg, contact) {
  const from = (msg.from || '').replace(/[^0-9]/g, '');
  const senderName = contact?.profile?.name || 'Customer';
  const wamId = msg.id;
  const msgType = msg.type;

  // Find matching complaint by customer_phone (match last 10 digits)
  const last10 = from.length >= 10 ? from.slice(-10) : from;
  const complaint = db.prepare(`
    SELECT * FROM complaints 
    WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`%${last10}%`);

  const complaintId = complaint ? complaint.id : null;

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
    from,
    senderName,
    messageBody,
    mediaId,
    mediaType,
    mediaUrl,
    mediaCaption,
    wamId
  );

  const messageRecord = {
    id: res.lastInsertRowid,
    complaint_id: complaintId,
    ticket_id: complaint?.ticket_id || null,
    phone: from,
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

  console.log(`[WhatsApp Webhook] Processed incoming message from ${from} (${senderName}) for Ticket: ${complaint?.ticket_id || 'None'}`);
}

module.exports = {
  verifyWebhook,
  handleIncomingWebhook,
  downloadMedia
};
