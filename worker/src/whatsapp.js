import { query } from './db.js';

export const META_PHONE_NUMBER_ID = '1387211441132836';
export const META_WABA_ID = '1015283491554000';
export const DEFAULT_META_ACCESS_TOKEN = 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
export const WEBHOOK_VERIFY_TOKEN = 'ecogreen_verify_token';
export const APP_URL = 'https://complain.ecogreensolar.co.in';

export async function sendWhatsApp({
  to,
  message,
  templateName,
  variables = {},
  mediaUrl,
  mediaType,
  mediaFileName,
  senderName,
  env
}) {
  const cleanDigits = (to || '').replace(/[^0-9]/g, '');
  if (!cleanDigits || cleanDigits.length < 10) {
    return { success: false, error: 'Invalid phone number' };
  }
  const last10 = cleanDigits.slice(-10);
  const formattedPhone = `91${last10}`;
  const maskedPhone = `******${last10.slice(-4)}`;

  const token = env?.META_ACCESS_TOKEN || DEFAULT_META_ACCESS_TOKEN;
  const phoneId = env?.META_PHONE_NUMBER_ID || META_PHONE_NUMBER_ID;
  const appUrl = env?.APP_URL || APP_URL;

  try {
    let payload = { messaging_product: 'whatsapp', to: formattedPhone };
    const trackingUrl = `${appUrl}/track/${variables.ticket_id || variables.complaint_id || ''}`;
    const cleanParam = (val, fb = '') => String(val || fb).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || fb;

    let renderedBody = message || '';

    if (templateName === 'complaint_registered' || templateName === 'complaint_registered_customer' || templateName === 'complaint_registered_no_charges') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar Equipment');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const estCharges = Number(variables.estimated_charges || 0);
      const isNotifyActive = (variables.notify_charges === 1 || variables.notify_charges === '1' || variables.notify_charges === true || variables.notify_charges === 'true');

      if (isNotifyActive && estCharges > 0) {
        renderedBody = `Namaste ${custName},\n\nYour service complaint has been registered with Eco Green Solar.\nTicket ID: ${ticketId}\nProduct: ${prodType}\nIssue: ${issueCat}\nEstimated Service Charge: ₹${estCharges}\n\nTrack ticket: ${trackingUrl}\n\nThank you for choosing Eco Green Solar.`;
        payload.type = 'template';
        payload.template = {
          name: 'complaint_registered',
          language: { code: 'en_US' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: custName },
              { type: 'text', text: ticketId },
              { type: 'text', text: prodType },
              { type: 'text', text: issueCat },
              { type: 'text', text: trackingUrl },
              { type: 'text', text: `₹${estCharges}` }
            ]
          }]
        };
      } else {
        renderedBody = `Namaste ${custName},\n\nYour service complaint has been registered with Eco Green Solar.\nTicket ID: ${ticketId}\nProduct: ${prodType}\nIssue: ${issueCat}\n\nTrack ticket: ${trackingUrl}\n\nThank you for choosing Eco Green Solar.`;
        payload.type = 'template';
        payload.template = {
          name: 'complaint_registered_no_charges',
          language: { code: 'en_US' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: custName },
              { type: 'text', text: ticketId },
              { type: 'text', text: prodType },
              { type: 'text', text: issueCat },
              { type: 'text', text: trackingUrl }
            ]
          }]
        };
      }
    } else if (templateName === 'technician_assigned' || templateName === 'technician_assigned_customer') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Technician');
      renderedBody = `Namaste *${custName}*,\n\nA certified technician of Eco Green Solar has been assigned to your Ticket No.: *${ticketId}*.\n\nTechnician Name: *${techName}*\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\nTrack visit live: ${trackingUrl}\n\nEco Green Solar Customer Care.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_assigned',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: techName },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'complaint_resolved') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Technician');
      const resNotes = cleanParam(variables.resolution_notes || variables.closure_remarks, 'Service completed');
      renderedBody = `Namaste *${custName}*,\n\nYour solar equipment complaint for Ticket No.: *${ticketId}* has been marked *RESOLVED* by technician - *${techName}*.\n\nResolution Notes: *${resNotes}*\n\nPlease rate your service experience here: *${trackingUrl}*\n\nThank you for choosing *Eco Green Solar*.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_resolved',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: techName },
            { type: 'text', text: resNotes },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'hello_world') {
      renderedBody = 'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.';
      payload.type = 'template';
      payload.template = {
        name: 'hello_world',
        language: { code: 'en_US' }
      };
    } else if (templateName) {
      payload.type = 'template';
      payload.template = {
        name: templateName,
        language: { code: variables.language_code || 'en_US' }
      };
      if (variables.components) {
        payload.template.components = variables.components;
      }
    } else if (message) {
      payload.type = 'text';
      payload.text = { body: message };
    }

    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await resp.json(); } catch (_) {}
    let wamid = data?.messages?.[0]?.id || null;
    let isSuccess = resp.ok && !!wamid;
    let errorMsg = !isSuccess ? (data?.error?.message || `Meta HTTP ${resp.status}`) : null;

    // Graceful fallback to text payload if template fails
    if (!isSuccess && payload.type === 'template' && renderedBody) {
      try {
        const textPayload = {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: renderedBody }
        };
        const textResp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(textPayload)
        });
        const textData = await textResp.json();
        if (textResp.ok && textData?.messages?.[0]?.id) {
          data = textData;
          wamid = textData.messages[0].id;
          isSuccess = true;
          errorMsg = null;
        }
      } catch (_) {}
    }

    // Persist to whatsapp_messages table
    try {
      await query(
        `INSERT INTO whatsapp_messages (
          complaint_id, phone, sender_type, sender_name, message_body, media_url, media_type, media_caption, wam_id, status, failure_reason, template_name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (wam_id) DO UPDATE SET
          status = EXCLUDED.status,
          failure_reason = EXCLUDED.failure_reason,
          updated_at = CURRENT_TIMESTAMP`,
        [
          variables.db_complaint_id || null,
          formattedPhone,
          'company',
          senderName || 'Eco Green Solar',
          renderedBody,
          mediaUrl || null,
          mediaType || null,
          mediaFileName || null,
          wamid,
          isSuccess ? 'sent' : 'failed',
          errorMsg,
          templateName || null
        ],
        env
      );
    } catch (dbErr) {
      console.warn('[WhatsApp DB Insert Warn]', dbErr.message);
    }

    return { success: isSuccess, wamid, error: errorMsg, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
