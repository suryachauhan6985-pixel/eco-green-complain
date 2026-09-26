/**
 * WhatsApp Provider Service
 * Supports Meta Cloud API, Twilio WhatsApp API, and Built-in Simulator
 */

const db = require('../config/database');

// Official Eco Green Solar Meta Cloud API Credentials (+91 78784 44414)
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '1387211441132836';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
const META_BUSINESS_ACCOUNT_ID = process.env.META_BUSINESS_ACCOUNT_ID || '1015283491554000';

async function sendWhatsAppMessage({ to, message, templateName, metaStatus, variables = {}, ticket_id, recipient_name, mediaUrl, mediaType, mediaFileName }) {
  const provider = process.env.WHATSAPP_PROVIDER || (META_ACCESS_TOKEN ? 'META_CLOUD_API' : 'SIMULATED');
  const cleanTo = (to || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanTo.startsWith('91') ? cleanTo : (cleanTo.length === 10 ? `91${cleanTo}` : cleanTo);

  let deliveredText = message;

  if (provider === 'META_CLOUD_API') {
    const phoneNumberId = META_PHONE_NUMBER_ID;
    const accessToken = META_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      throw new Error('Meta Cloud API credentials missing (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN)');
    }

    let payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone
    };

    const defaultLiveUrl = (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) ? process.env.APP_URL : 'https://complain.ecogreensolar.co.in';
    const cleanTrackingUrl = (variables.feedback_url || `${defaultLiveUrl}/track/${variables.complaint_id || ticket_id || ''}`)
      .replace(/http:\/\/localhost:\d+/g, defaultLiveUrl);

    // Clean helper to ensure Meta Cloud API parameters never contain newlines/tabs
    const cleanParam = (val, fallback = '') => {
      const s = String(val || fallback).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      return s || fallback;
    };

    const META_OFFICIAL_TEMPLATES = new Set([
      'complaint_registered',
      'complaint_registered_customer',
      'technician_assigned',
      'technician_assigned_customer',
      'customer_technician_reassigned',
      'complaint_resolved',
      'technician_work_order',
      'technician_reminder',
      'technician_pending_visit_reminder',
      'technician_reassigned',
      'technician_job_reassigned_notice',
      'complaint_closed',
      'complaint_closed_feedback_request',
      'complaint_closed__feedback_request',
      'complaint_reopened',
      'complaint_reopened_notification',
      'status_update',
      'status_followup_note_update',
      'status__followup_note_update'
    ]);

    const isMetaApproved = metaStatus === 'APPROVED' || !metaStatus || META_OFFICIAL_TEMPLATES.has(templateName);

    // If template matches Meta registered templates and is approved, send as official template message
    if (isMetaApproved && (templateName === 'complaint_registered' || templateName === 'complaint_registered_customer')) {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.complaint_id || ticket_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar Equipment');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');

      const estCharges = Number(variables.estimated_charges || 0);
      const shouldNotifyCharges = variables.notify_charges !== false && variables.notify_charges !== 0 && estCharges > 0;
      const chargesParam = shouldNotifyCharges ? `₹${estCharges}` : '₹0 (Under Warranty)';

      deliveredText = `Eco Green Solar Support\nNamaste ${custName},\n\nYour service complaint has been registered with Eco Green Solar.\nTicket ID: ${ticketId}\nProduct: ${prodType}\nIssue: ${issueCat}\nEstimated Service Charge: ${chargesParam}\n\nTrack ticket: ${cleanTrackingUrl}\n\nThank you for choosing Eco Green Solar.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_registered',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: custName },
              { type: 'text', text: ticketId },
              { type: 'text', text: prodType },
              { type: 'text', text: issueCat },
              { type: 'text', text: cleanTrackingUrl },
              { type: 'text', text: chargesParam }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_assigned' || templateName === 'technician_assigned_customer') {
      deliveredText = `Namaste ${cleanParam(variables.customer_name, 'Valued Customer')},\n\nA certified technician of Eco Green Solar has been assigned to your ticket No: ${cleanParam(variables.complaint_id || ticket_id, 'Ticket')}.\n\nTechnician Name: *${cleanParam(variables.technician_name, 'Field Technician')}*\n\nTrack visit live: ${cleanTrackingUrl}\n\nEco Green Solar Customer Care.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_assigned',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: cleanParam(variables.customer_name, 'Valued Customer') },
              { type: 'text', text: cleanParam(variables.complaint_id || ticket_id, 'Ticket') },
              { type: 'text', text: cleanParam(variables.technician_name, 'Field Technician') },
              { type: 'text', text: cleanTrackingUrl }
            ]
          }
        ]
      };
    } else if (templateName === 'customer_technician_reassigned') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.complaint_id || ticket_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Field Technician');
      const techPhone = cleanParam(variables.technician_phone, '');
      const visitDate = cleanParam(variables.expected_visit_date, 'Within 24-48 Hours');

      deliveredText = `☀️ *Eco Green Solar - Technician Reassigned*\n\nNamaste *${custName}*,\n\nYour complaint ticket *${ticketId}* has been reassigned to a new technician.\n\n👷 *New Technician:* ${techName}${techPhone ? `\n📞 *Mobile:* ${techPhone}` : ''}\n📅 *Expected Visit:* ${visitDate}\n\nOur service engineer will contact you shortly to coordinate the visit.\n\n🔗 *Track Live:* ${cleanTrackingUrl}\n\nEco Green Solar Customer Care.`;

      // If approved on Meta, send official customer_technician_reassigned; else fallback to approved technician_assigned
      if (isMetaApproved) {
        payload.type = 'template';
        payload.template = {
          name: 'customer_technician_reassigned',
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: custName },
                { type: 'text', text: ticketId },
                { type: 'text', text: techName },
                { type: 'text', text: techPhone || 'Customer Care' },
                { type: 'text', text: cleanTrackingUrl }
              ]
            }
          ]
        };
      } else {
        // Graceful fallback to approved technician_assigned while Meta review is pending
        payload.type = 'template';
        payload.template = {
          name: 'technician_assigned',
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: custName },
                { type: 'text', text: ticketId },
                { type: 'text', text: techName },
                { type: 'text', text: cleanTrackingUrl }
              ]
            }
          ]
        };
      }
    } else if (templateName === 'complaint_resolved') {
      deliveredText = `Service Resolved - Eco Green Solar\nNamaste ${cleanParam(variables.customer_name, 'Valued Customer')},\n\nYour solar equipment complaint for Ticket ${cleanParam(variables.complaint_id || ticket_id, 'Ticket')} has been marked RESOLVED by technician ${cleanParam(variables.technician_name, 'Technician')}.\n\nResolution Notes: ${cleanParam(variables.notes, 'Service inspection completed successfully.')}\n\nPlease rate your service experience here: ${cleanTrackingUrl}\n\nThank you for choosing Eco Green Solar.`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_resolved',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: cleanParam(variables.customer_name, 'Valued Customer') },
              { type: 'text', text: cleanParam(variables.complaint_id || ticket_id, 'Ticket') },
              { type: 'text', text: cleanParam(variables.technician_name, 'Technician') },
              { type: 'text', text: cleanParam(variables.notes, 'Service inspection completed successfully.') },
              { type: 'text', text: cleanTrackingUrl }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddr = cleanParam(variables.customer_address, '-');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const notes = cleanParam(variables.notes || variables.issue_description, 'Inspection required');
      const priority = cleanParam(variables.priority, 'Normal');
      const visitDate = cleanParam(variables.expected_visit_date, 'Immediate / Today');
      const portalLink = `${APP_URL}/technician?ticket=${encodeURIComponent(tktId)}`;

      deliveredText = `🛠️ *Eco Green Solar - New Job Assignment*\n\nHello ${techName}, you have been assigned ticket *${tktId}*.\n\n*Customer:* ${custName}\n*Customer Phone:* ${custPhone}\n*Address:* ${custAddr}\n*Product:* ${prodType}\n*Category:* ${issueCat}\n*issue:* ${notes}\n*Priority:* ${priority}\n*Expected Visit:* ${visitDate}\n\n*Direct Ticket Link:* ${portalLink}\n\nPlease check your Eco Green technician portal for details and coordinate with the customer.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_work_order',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'customer_phone', text: custPhone },
              { type: 'text', parameter_name: 'customer_address', text: custAddr },
              { type: 'text', parameter_name: 'product_type', text: prodType },
              { type: 'text', parameter_name: 'issue_category', text: issueCat },
              { type: 'text', parameter_name: 'notes', text: notes },
              { type: 'text', parameter_name: 'priority', text: priority },
              { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reminder' || templateName === 'technician_pending_visit_reminder') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddr = cleanParam(variables.customer_address, '-');
      const visitDate = cleanParam(variables.expected_visit_date, 'Today');

      deliveredText = `*Eco Green Solar - Job Reminder*\n\nHello ${techName}, this is a friendly reminder for scheduled ticket *${tktId}*.\n\n*Customer:* ${custName}\n*Phone:* ${custPhone}\n*Address:* ${custAddr}\n*Visit Date:* ${visitDate}\n\nPlease contact the customer before visiting and ensure the service is updated in your portal.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_pending_visit_reminder',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'customer_phone', text: custPhone },
              { type: 'text', parameter_name: 'customer_address', text: custAddr },
              { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reassigned' || templateName === 'technician_job_reassigned_notice') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const notes = cleanParam(variables.notes, 'Ticket reassigned.');

      deliveredText = `*Eco Green Solar - Job Update*\n\nHello ${techName}, please note that ticket *${tktId}* (Customer: ${custName}) has been reassigned or updated.\n\n*Notes:* ${notes}\n\nPlease check your Eco Green technician portal for your latest schedule.\n- Eco Green Dispatch`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_reassigned_notice',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'notes', text: notes }
            ]
          }
        ]
      };
    } else if (templateName === 'complaint_closed' || templateName === 'complaint_closed_feedback_request' || templateName === 'complaint_closed__feedback_request') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');

      deliveredText = `*Eco Green Solar Closure*\n\nNamaste, ${custName}, your complaint *${tktId}* has been resolved and closed. Thank you for choosing clean energy!\n\n*Please rate your service experience:*\n${cleanTrackingUrl}\n\n- Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_closed__feedback_request',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'feedback_url', text: cleanTrackingUrl }
            ]
          }
        ]
      };
    } else if (templateName === 'complaint_reopened' || templateName === 'complaint_reopened_notification') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, '');
      const techPhone = cleanParam(variables.technician_phone, '');
      const reason = cleanParam(variables.reason || variables.notes, 'Issue recurring / follow-up requested');
      const techInfo = techName ? `\n\n👷 *Assigned Technician:* ${techName}${techPhone ? ` (${techPhone})` : ''}` : '';

      deliveredText = `☀️ *Eco Green Solar Priority Alert*\n\nNamaste, ${custName}, your complaint *${tktId}* has been *REOPENED* upon your request.\n\n⚠️ *Reason:* ${reason}${techInfo}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n*Track:* ${cleanTrackingUrl}\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_reopened_notification',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'feedback_url', text: cleanTrackingUrl }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reopened_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddress = cleanParam(variables.customer_address, 'Customer Site Address');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Issue recurring / follow-up requested');
      const prevTech = cleanParam(variables.previous_technician_name, '');
      const prevTechLine = prevTech ? `\n👷 *Previous Specialist:* ${prevTech}` : '';
      const portalLink = `https://complain.ecogreensolar.co.in/technician?ticket=${encodeURIComponent(tktId)}`;

      deliveredText = `🔄 *Eco Green Solar - Reopened Work Order*\n\nHello *${techName}*,\n\nTicket *${tktId}* has been *REOPENED* for service follow-up.${prevTechLine}\n\n⚠️ *Reason for Reopening:* ${reopenReason}\n\n👤 *Customer:* ${custName}\n📞 *Phone:* ${custPhone}\n📍 *Address:* ${custAddress}\n\n🔗 *Open Ticket in Portal:* ${portalLink}\n\nPlease review previous site visit notes and coordinate with the customer immediately.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_reopened_work_order',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'customer_phone', text: custPhone },
              { type: 'text', parameter_name: 'customer_address', text: custAddress },
              { type: 'text', parameter_name: 'reopen_reason', text: reopenReason }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reopen_job_transferred' || templateName === 'technician_reopened_transferred') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const newTech = cleanParam(variables.new_technician_name, 'another specialist');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Follow-up requested');

      deliveredText = `⚠️ *Eco Green Solar - Reopened Job Transferred*\n\nHello *${techName}*,\n\nPlease note that ticket *${tktId}* (Customer: ${custName}) previously resolved by you has been *REOPENED* upon customer request and reassigned to another technician (*${newTech}*).\n\n⚠️ *Customer Reopen Reason:* ${reopenReason}\n\nYou are not required to revisit this site as another technician has been assigned for follow-up.\n- Eco Green Dispatch`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_transferred_notice',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'notes', text: `Reopened & reassigned to ${newTech}. Reason: ${reopenReason}` }
            ]
          }
        ]
      };
    } else if (templateName === 'status_update' || templateName === 'status_followup_note_update' || templateName === 'status__followup_note_update') {
      const tktId = cleanParam(variables.complaint_id || variables.ticket_id || ticket_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const status = cleanParam(variables.status, 'In Progress');
      const notes = cleanParam(variables.notes, 'Update added');

      deliveredText = `*Eco Green Solar Alert*\n\nUpdate on Complaint *${tktId}* (${prodType}):\nStatus: *${status}*\n\n*Notes:* ${notes}\n\n*Track Live:* ${cleanTrackingUrl}\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'status__followup_note_update',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'complaint_id', text: tktId },
              { type: 'text', parameter_name: 'product_type', text: prodType },
              { type: 'text', parameter_name: 'status', text: status },
              { type: 'text', parameter_name: 'notes', text: notes },
              { type: 'text', parameter_name: 'feedback_url', text: cleanTrackingUrl }
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

    // Log raw outbound event for complete audit trail
    try {
      const db = require('../config/database');
      db.prepare(`
        INSERT INTO whatsapp_raw_events (
          event_id, wam_id, phone_number_id, recipient_phone, direction, event_type, status, error_code, error_message, raw_payload
        ) VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?)
      `).run(
        data.messages?.[0]?.id || null,
        data.messages?.[0]?.id || null,
        phoneNumberId,
        formattedPhone,
        payload.type,
        response.ok ? 'sent' : 'failed',
        data.error?.code ? String(data.error.code) : null,
        data.error?.message || null,
        JSON.stringify({ request: payload, response: data })
      );
    } catch (auditErr) {
      console.warn('[WhatsAppProvider] Audit log note:', auditErr.message);
    }

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
        try {
          const db = require('../config/database');
          db.prepare(`
            INSERT INTO whatsapp_raw_events (
              event_id, wam_id, phone_number_id, recipient_phone, direction, event_type, status, raw_payload
            ) VALUES (?, ?, ?, ?, 'outbound', 'text_fallback', 'sent', ?)
          `).run(textData.messages?.[0]?.id || null, textData.messages?.[0]?.id || null, phoneNumberId, formattedPhone, JSON.stringify(textData));
        } catch (e) {}

        return { success: true, provider: 'META_CLOUD_API', messageId: textData.messages?.[0]?.id, deliveredMessage: deliveredText || message };
      }
    }

    if (!response.ok) {
      if (data.error?.code === 131047) {
        throw new Error('WhatsApp 24-hour customer window is closed. Freeform messages require the customer to message +91 78784 44414 within the last 24h, or send an official approved template.');
      }
      throw new Error(data.error ? `${data.error.message} (Meta Code: ${data.error.code})` : 'Meta WhatsApp API error');
    }
    return { success: true, provider: 'META_CLOUD_API', messageId: data.messages?.[0]?.id, deliveredMessage: deliveredText || message };
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

async function fetchMetaTemplates() {
  const businessId = META_BUSINESS_ACCOUNT_ID || process.env.META_BUSINESS_ACCOUNT_ID;
  const token = META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;

  if (!businessId || !token) {
    return { success: false, error: 'Meta Business Account ID or Access Token missing', templates: [] };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${businessId}/message_templates?fields=name,status,category,language&limit=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return { 
        success: false, 
        error: data.error ? `${data.error.message} (Meta Code: ${data.error.code})` : 'Meta API error',
        templates: [] 
      };
    }

    return { 
      success: true, 
      templates: (data.data || []).map(t => ({
        meta_name: t.name,
        meta_status: t.status, // 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED'
        meta_category: t.category,
        meta_language: t.language
      }))
    };
  } catch (err) {
    return { success: false, error: err.message, templates: [] };
  }
}

module.exports = { sendWhatsAppMessage, fetchMetaTemplates };
