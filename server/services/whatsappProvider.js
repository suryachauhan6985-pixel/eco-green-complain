/**
 * WhatsApp Provider Service
 * Supports Meta Cloud API, Twilio WhatsApp API, and Built-in Simulator
 */

const db = require('../config/database');

async function sendWhatsAppMessage({ to, message, templateName, variables = {}, ticket_id, recipient_name, mediaUrl, mediaType, mediaFileName }) {
  const provider = process.env.WHATSAPP_PROVIDER || 'SIMULATED';
  const cleanTo = (to || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanTo.startsWith('91') ? cleanTo : (cleanTo.length === 10 ? `91${cleanTo}` : cleanTo);

  let deliveredText = message;

  if (provider === 'META_CLOUD_API') {
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      throw new Error('Meta Cloud API credentials missing (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN)');
    }

    let payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone
    };

    const cleanTrackingUrl = (variables.feedback_url || `https://eco-green-complain.vprotech.online/track/${variables.complaint_id || ticket_id || ''}`)
      .replace(/http:\/\/localhost:\d+/g, 'https://eco-green-complain.vprotech.online');

    // If template matches Meta registered templates, send as template message
    if (templateName === 'complaint_registered' || templateName === 'complaint_registered_customer') {
      deliveredText = `Eco Green Solar Support\nNamaste ${variables.customer_name || 'Valued Customer'},\n\nYour service complaint has been registered with Eco Green Solar.\nTicket ID: ${variables.complaint_id || ticket_id || 'Ticket'}\nProduct: ${variables.product_type || 'Solar Equipment'}\nIssue: ${variables.issue_category || 'Service Request'}\n\nTrack ticket: ${cleanTrackingUrl}\n\nHelpline: +91 78784 44414\nThank you for choosing Eco Green Solar.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_registered',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: variables.customer_name || 'Valued Customer' },
              { type: 'text', text: variables.complaint_id || ticket_id || 'Ticket' },
              { type: 'text', text: variables.product_type || 'Solar Equipment' },
              { type: 'text', text: variables.issue_category || 'Service Request' },
              { type: 'text', text: `${cleanTrackingUrl}\n\nHelpline: +91 78784 44414` }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_assigned' || templateName === 'technician_assigned_customer') {
      deliveredText = `Eco Green Solar Update\nNamaste ${variables.customer_name || 'Valued Customer'},\n\nA service technician has been assigned to your complaint ${variables.complaint_id || ticket_id || 'Ticket'}.\nTechnician: ${variables.technician_name || 'Field Technician'} (${variables.technician_phone || '+91 78784 44414'})\nExpected Visit: ${variables.expected_visit_date || 'Today'}\n\nTrack ticket: ${cleanTrackingUrl}\n\nHelpline: +91 78784 44414\nThank you for choosing Eco Green Solar.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_assigned',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: variables.customer_name || 'Valued Customer' },
              { type: 'text', text: variables.complaint_id || ticket_id || 'Ticket' },
              { type: 'text', text: variables.technician_name || 'Field Technician' },
              { type: 'text', text: variables.technician_phone || '+91 78784 44414' },
              { type: 'text', text: variables.expected_visit_date || 'Today' },
              { type: 'text', text: `${cleanTrackingUrl}\n\nHelpline: +91 78784 44414` }
            ]
          }
        ]
      };
    } else if (templateName === 'complaint_resolved') {
      deliveredText = `Eco Green Solar Resolution\nNamaste ${variables.customer_name || 'Valued Customer'},\n\nYour service complaint ${variables.complaint_id || ticket_id || 'Ticket'} has been resolved.\nTechnician: ${variables.technician_name || 'Technician'}\nNotes: ${variables.notes || 'Service inspection completed successfully.'}\n\nTrack ticket: ${cleanTrackingUrl}\n\nHelpline: +91 78784 44414\nThank you for choosing Eco Green Solar.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_resolved',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: variables.customer_name || 'Valued Customer' },
              { type: 'text', text: variables.complaint_id || ticket_id || 'Ticket' },
              { type: 'text', text: variables.technician_name || 'Technician' },
              { type: 'text', text: variables.notes || 'Service inspection completed successfully.' },
              { type: 'text', text: `${cleanTrackingUrl}\n\nHelpline: +91 78784 44414` }
            ]
          }
        ]
      };
    } else if (mediaUrl) {
      if (mediaType === 'image') {
        payload.type = 'image';
        payload.image = { link: mediaUrl, caption: message || '' };
      } else {
        payload.type = 'document';
        payload.document = { link: mediaUrl, caption: message || '', filename: mediaFileName || 'Document.pdf' };
      }
    } else {
      payload.type = 'text';
      payload.text = { body: message };
    }

    let response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = await response.json();

    // Fallback: If template fails, try direct text fallback
    if (!response.ok && payload.type === 'template') {
      console.warn('[Meta Cloud API] Template failed, trying direct text fallback:', data.error?.message);
      const textResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: deliveredText || message }
        })
      });
      const textData = await textResponse.json();
      if (textResponse.ok) {
        return { success: true, provider: 'META_CLOUD_API', messageId: textData.messages?.[0]?.id, deliveredMessage: deliveredText };
      }
    }

    if (!response.ok) {
      throw new Error(data.error ? data.error.message : 'Meta WhatsApp API error');
    }
    return { success: true, provider: 'META_CLOUD_API', messageId: data.messages?.[0]?.id, deliveredMessage: deliveredText };
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
