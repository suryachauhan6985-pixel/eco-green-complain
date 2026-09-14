/**
 * WhatsApp Provider Service
 * Supports Meta Cloud API, Twilio WhatsApp API, and Built-in Simulator
 */

const db = require('../config/database');

async function sendWhatsAppMessage({ to, message, templateName, variables = {}, ticket_id, recipient_name }) {
  const provider = process.env.WHATSAPP_PROVIDER || 'SIMULATED';
  const cleanTo = (to || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanTo.startsWith('91') ? cleanTo : (cleanTo.length === 10 ? `91${cleanTo}` : cleanTo);

  // 1. Primary Priority: Enqueue into WhatsApp Master PC Relay Queue
  try {
    const stmt = db.prepare(`
      INSERT INTO whatsapp_outgoing_queue (phone, message, ticket_id, recipient_name, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const info = stmt.run(formattedPhone, message, ticket_id || null, recipient_name || null);
    console.log(`[WhatsAppProvider] Enqueued message #${info.lastInsertRowid} for Master PC Relay to ${formattedPhone}`);
  } catch (e) {
    console.warn('[WhatsAppProvider] Notice enqueueing to relay:', e.message);
  }

  if (provider === 'META_CLOUD_API') {
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      throw new Error('Meta Cloud API credentials missing (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN)');
    }

    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanTo.startsWith('+') ? cleanTo.substring(1) : cleanTo,
        type: 'text',
        text: { body: message }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ? data.error.message : 'Meta WhatsApp API error');
    }
    return { success: true, provider: 'META_CLOUD_API', messageId: data.messages?.[0]?.id };
  }

  if (provider === 'TWILIO') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const formattedTo = cleanTo.startsWith('whatsapp:') ? cleanTo : `whatsapp:${cleanTo.startsWith('+') ? cleanTo : '+' + cleanTo}`;

    const params = new URLSearchParams();
    params.append('From', fromNumber);
    params.append('To', formattedTo);
    params.append('Body', message);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Twilio WhatsApp API error');
    }
    return { success: true, provider: 'TWILIO', messageId: data.sid };
  }

  // Default: SIMULATED Mode (Live in-app simulator)
  console.log('\n================== [SIMULATED WHATSAPP SENT] ==================');
  console.log(`To: ${to}`);
  console.log(`Content:\n${message}`);
  console.log('=================================================================\n');

  return {
    success: true,
    provider: 'SIMULATED',
    messageId: 'sim_wa_' + Date.now()
  };
}

module.exports = { sendWhatsAppMessage };
