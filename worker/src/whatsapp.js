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
    } else if (templateName === 'charges_added') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const estCharges = Number(variables.estimated_charges || 0);

      renderedBody = `☀️ *Eco Green Solar - Service Charges Update*\n\nDear *${custName}*,\n\nEstimated service charges have been updated for your complaint ticket *${ticketId}*.\n\n🔧 *Product:* ${prodType}\n⚠️ *Issue:* ${issueCat}\n💰 *Estimated Service Charges:* ₹${estCharges}\n\n🔗 *Track Live Status:* ${trackingUrl}\n\nOur service team will attend to your request. For any questions, please contact our support.\n- Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'charges_added',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: prodType },
            { type: 'text', text: issueCat },
            { type: 'text', text: String(estCharges) },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'charges_removed') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');

      renderedBody = `☀️ *Eco Green Solar - Charges Waived / Removed*\n\nDear *${custName}*,\n\nThe service charges for your complaint ticket *${ticketId}* have been waived / removed (₹0).\n\n🔧 *Product:* ${prodType}\n⚠️ *Issue:* ${issueCat}\n💰 *Revised Service Charges:* ₹0 (Free / Covered Under Warranty)\n\n🔗 *Track Live Status:* ${trackingUrl}\n\nOur technician will proceed with the service visit without additional charges.\n- Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'charges_removed',
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
    } else if (templateName === 'technician_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, 'Phone');
      const custAddress = cleanParam(variables.customer_address, 'Address on file');
      const prodType = cleanParam(variables.product_type, 'Solar Rooftop Systems');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const notes = cleanParam(variables.notes || variables.issue_description, 'Inspect site and equipment');
      const priority = cleanParam(variables.priority, 'Medium');
      const visitDate = cleanParam(variables.expected_visit_date, 'Immediate');
      const portalLink = `${appUrl}/technician?ticket=${encodeURIComponent(ticketId)}`;
      renderedBody = `Hello ${techName}, ticket *${ticketId}* has been assigned to you.\n\nCustomer: ${custName} (${custPhone})\nAddress: ${custAddress}\nProduct: ${prodType}\nIssue: ${issueCat}\nNotes: ${notes}\nPriority: ${priority}\nExpected Visit: ${visitDate}\n\nPortal: ${portalLink}`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_work_order',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'technician_name', text: techName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'customer_phone', text: custPhone },
            { type: 'text', parameter_name: 'customer_address', text: custAddress },
            { type: 'text', parameter_name: 'product_type', text: prodType },
            { type: 'text', parameter_name: 'issue_category', text: issueCat },
            { type: 'text', parameter_name: 'notes', text: notes },
            { type: 'text', parameter_name: 'priority', text: priority },
            { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
          ]
        }]
      };
    } else if (templateName === 'technician_reminder' || templateName === 'technician_pending_visit_reminder') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, 'Phone');
      const custAddress = cleanParam(variables.customer_address, 'Address on file');
      const visitDate = cleanParam(variables.expected_visit_date, 'Today');
      renderedBody = `Hello ${techName}, this is a reminder for scheduled ticket *${ticketId}*.\n\nCustomer: ${custName} (${custPhone})\nAddress: ${custAddress}\nVisit Date: ${visitDate}`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_pending_visit_reminder',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'technician_name', text: techName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'customer_phone', text: custPhone },
            { type: 'text', parameter_name: 'customer_address', text: custAddress },
            { type: 'text', parameter_name: 'expected_visit_date', text: visitDate }
          ]
        }]
      };
    } else if (templateName === 'complaint_closed' || templateName === 'complaint_closed__feedback_request') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      renderedBody = `Namaste ${custName}, your complaint *${ticketId}* has been closed. Please rate your service: ${trackingUrl}`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_closed__feedback_request',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'complaint_reopened' || templateName === 'complaint_reopened_notification') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      renderedBody = `Namaste ${custName}, your complaint ticket *${ticketId}* has been reopened for follow-up inspection. Track status: ${trackingUrl}`;

      payload.type = 'template';
      payload.template = {
        name: 'complaint_reopened_notification',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'customer_name', text: custName },
            { type: 'text', parameter_name: 'complaint_id', text: ticketId },
            { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'customer_technician_reassigned' || templateName === 'technician_reassigned_customer') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const techName = cleanParam(variables.technician_name, 'Field Technician');

      renderedBody = `*Eco Green Solar - Technician Reassigned*\n\nDear ${custName}, your complaint *${ticketId}* (${prodType}) has been reassigned to a new technician: *${techName}*.\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* ${trackingUrl}\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'customer_technician_reassigned',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'complaint_id', text: ticketId },
              { type: 'text', parameter_name: 'product_type', text: prodType },
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'feedback_url', text: trackingUrl }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reassigned' || templateName === 'technician_job_transferred') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');

      renderedBody = `*Eco Green Solar - Job Transferred*\n\nHello ${techName}, please note that ticket *${ticketId}* (Customer: ${custName}) previously assigned to you has been reassigned/transferred to another technician.\n\nYou are no longer required to visit this site. Please check your technician portal for updated schedules.\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_transferred_notice',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: ticketId },
              { type: 'text', parameter_name: 'customer_name', text: custName }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reopened_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, '-');
      const custAddress = cleanParam(variables.customer_address, 'Customer Site Address');
      const prodType = cleanParam(variables.product_type, 'Solar System');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Issue recurring / follow-up requested');
      const priority = cleanParam(variables.priority, 'High');
      const portalLink = `${appUrl}/technician?ticket=${encodeURIComponent(ticketId)}`;

      renderedBody = `*Eco Green Solar - Reopened Work Order*\n\nHello ${techName}, ticket *${ticketId}* has been *REOPENED* for service follow-up.\n\n*Customer:* ${custName}\n*Phone:* ${custPhone}\n*Address:* ${custAddress}\n*Product:* ${prodType}\n*Issue:* ${issueCat}\n*Reason for Reopening:* ${reopenReason}\n*Priority:* ${priority}\n\n🔗 *Technician Portal:* ${portalLink}\n\nPlease review previous site visit notes and coordinate with the customer immediately.`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_reopened_work_order',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: ticketId },
              { type: 'text', parameter_name: 'reopen_reason', text: reopenReason },
              { type: 'text', parameter_name: 'customer_name', text: custName },
              { type: 'text', parameter_name: 'customer_phone', text: custPhone },
              { type: 'text', parameter_name: 'customer_address', text: custAddress },
              { type: 'text', parameter_name: 'issue_category', text: issueCat },
              { type: 'text', parameter_name: 'product_type', text: prodType },
              { type: 'text', parameter_name: 'priority', text: priority },
              { type: 'text', parameter_name: 'portal_url', text: portalLink }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_reopen_job_transferred' || templateName === 'technician_reopened_transferred') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const reopenReason = cleanParam(variables.reopen_reason || variables.reason, 'Follow-up requested');

      renderedBody = `*Eco Green Solar - Reopened Job Transferred*\n\nHello ${techName}, please note that ticket *${ticketId}* (Customer: ${custName}) previously resolved by you has been *REOPENED* upon customer request and reassigned to another technician.\n\n*Customer Reopen Reason:* ${reopenReason}\n\nYou are not required to attend to this complaint as another technician has been dispatched.\n- Eco Green Solar`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_job_transferred_notice',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'technician_name', text: techName },
              { type: 'text', parameter_name: 'complaint_id', text: ticketId },
              { type: 'text', parameter_name: 'customer_name', text: custName }
            ]
          }
        ]
      };
    } else if (templateName === 'technician_work_order_reassigned' || templateName === 'technician_reassigned_work_order') {
      const techName = cleanParam(variables.technician_name, 'Technician');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, 'Phone');
      const custAddress = cleanParam(variables.customer_address, 'Address on file');
      const issueCat = cleanParam(variables.issue_category, 'Service Request');
      const prodType = cleanParam(variables.product_type, 'Solar Rooftop Systems');
      const priority = cleanParam(variables.priority, 'Medium');
      const visitDate = cleanParam(variables.expected_visit_date, 'Immediate');
      const portalUrl = `${appUrl}/technician`;
      renderedBody = `Hello ${techName}, ticket *${ticketId}* has been reassigned to you.\nCustomer: ${custName} (${custPhone})\nAddress: ${custAddress}\nIssue: ${issueCat}\nProduct: ${prodType}\nPriority: ${priority}\nVisit Date: ${visitDate}`;

      payload.type = 'template';
      payload.template = {
        name: 'technician_work_order_reassigned',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: techName },
            { type: 'text', text: ticketId },
            { type: 'text', text: custName },
            { type: 'text', text: custPhone },
            { type: 'text', text: custAddress },
            { type: 'text', text: issueCat },
            { type: 'text', text: prodType },
            { type: 'text', text: priority },
            { type: 'text', text: visitDate },
            { type: 'text', text: portalUrl }
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
    } else if (templateName === 'site_survey_registered') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const prodType = cleanParam(variables.product_type, 'SITE SURVEY');
      const issueCat = cleanParam(variables.issue_category, 'Site Feasibility & Shadow Analysis');
      const estCharges = Number(variables.estimated_charges || 0);
      const isNotifyActive = (variables.notify_charges === 1 || variables.notify_charges === '1' || variables.notify_charges === true || variables.notify_charges === 'true');
      const chargesLine = (estCharges > 0 && isNotifyActive) ? `\n💰 *Estimated Survey Charge:* ₹${estCharges}` : '';

      renderedBody = `☀️ *Eco Green Solar Site Survey*\n\nDear ${custName}, your site survey request has been registered successfully.\n\n📌 *Survey Ticket ID:* ${ticketId}\n🔍 *Type:* ${prodType}\n📋 *Scope:* ${issueCat}${chargesLine}\n\nOur engineering team is reviewing your site requirements and will assign an expert site survey engineer shortly.\n\n🔗 *Track Live Status:* ${trackingUrl}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'site_survey_registered',
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
    } else if (templateName === 'site_survey_assigned') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Survey Engineer');
      const visitDate = cleanParam(variables.expected_visit_date, 'Within 24-48 Hours');

      renderedBody = `☀️ *Eco Green Solar Site Survey Update*\n\nHello ${custName}, a technical survey engineer has been assigned for your site feasibility assessment (Ticket *${ticketId}*).\n\n👨‍💼 *Survey Engineer:* ${techName}\n📅 *Scheduled Visit:* ${visitDate}\n\nKindly provide rooftop and electrical meter access to our engineer upon arrival for accurate measurement and shadow analysis.\n\n🔗 *Track Status:* ${trackingUrl}\n- Eco Green Solar Operations`;

      payload.type = 'template';
      payload.template = {
        name: 'site_survey_assigned',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: ticketId },
            { type: 'text', text: techName },
            { type: 'text', text: visitDate },
            { type: 'text', text: trackingUrl }
          ]
        }]
      };
    } else if (templateName === 'site_survey_work_order') {
      const techName = cleanParam(variables.technician_name, 'Engineer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const custName = cleanParam(variables.customer_name, 'Customer');
      const custPhone = cleanParam(variables.customer_phone, 'Phone');
      const custAddress = cleanParam(variables.customer_address, 'Address on file');
      const issueCat = cleanParam(variables.issue_category, 'Site Feasibility');
      const notes = cleanParam(variables.notes || variables.issue_description, 'Conduct roof measurements and shadow analysis');
      const visitDate = cleanParam(variables.expected_visit_date, 'Immediate');
      const portalLink = `${appUrl}/technician?ticket=${encodeURIComponent(ticketId)}`;

      renderedBody = `📐 *Eco Green Solar — Site Survey Field Assignment*\n\nDear ${techName}, a new rooftop site survey has been assigned to you.\n\n📌 *Survey Ticket ID:* ${ticketId}\n👤 *Customer:* ${custName} (${custPhone})\n📍 *Site Address:* ${custAddress}\n🔍 *Survey Category:* ${issueCat}\n📝 *Survey Scope:* ${notes}\n📅 *Scheduled Visit:* ${visitDate}\n\n🔗 *Portal:* ${portalLink}`;

      payload.type = 'template';
      payload.template = {
        name: 'site_survey_work_order',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: techName },
            { type: 'text', text: ticketId },
            { type: 'text', text: custName },
            { type: 'text', text: custPhone },
            { type: 'text', text: custAddress },
            { type: 'text', text: issueCat },
            { type: 'text', text: notes },
            { type: 'text', text: visitDate }
          ]
        }]
      };
    } else if (templateName === 'site_survey_resolved') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Survey Engineer');
      const resNotes = cleanParam(variables.resolution_notes || variables.notes || 'Site feasibility assessment completed');

      renderedBody = `☀️ *Eco Green Solar - Site Survey Completed*\n\nDear ${custName},\n\nYour site feasibility survey for Ticket *${ticketId}* has been completed by survey engineer *${techName}*.\n\n📋 *Survey Findings & Summary:* ${resNotes}\n\nOur design & engineering department will prepare your customized solar proposal based on these rooftop measurements.\n\n🔗 *View Survey Report & Status:* ${trackingUrl}\n- Eco Green Solar Care`;

      payload.type = 'template';
      payload.template = {
        name: 'site_survey_resolved',
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
    } else if (templateName === 'site_survey_reach_out') {
      const custName = cleanParam(variables.customer_name, 'Valued Customer');
      const ticketId = cleanParam(variables.ticket_id || variables.complaint_id, 'Ticket');
      const techName = cleanParam(variables.technician_name, 'Survey Engineer');
      const custAddress = cleanParam(variables.customer_address, 'your site');
      const visitDate = cleanParam(variables.expected_visit_date, 'the scheduled visit');

      renderedBody = `Namaste ${custName} ji,\n\nI am ${techName} from *Eco Green Solar Care*. I have received your site survey request (Ticket: ${ticketId}).\n\nI am planning to visit your site at ${custAddress} on ${visitDate} for rooftop measurement and feasibility assessment.\n\nPlease let me know if this time suits you or share your current location/directions if required.\n\nThank you!\n${techName}\nEco Green Solar Team`;

      payload.type = 'template';
      payload.template = {
        name: 'site_survey_reach_out',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: custName },
            { type: 'text', text: techName },
            { type: 'text', text: ticketId },
            { type: 'text', text: custAddress },
            { type: 'text', text: visitDate }
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
