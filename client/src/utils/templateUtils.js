import { api } from '../api/client';
import { INITIAL_TEMPLATES } from '../data/demoData';

let cachedTemplates = null;
let lastFetchTime = 0;

/**
 * Fetch latest templates with 15-second in-memory cache
 */
export async function getNotificationTemplates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedTemplates && (now - lastFetchTime < 15000)) {
    return cachedTemplates;
  }

  try {
    const res = await api.getTemplates();
    if (res && Array.isArray(res.templates) && res.templates.length > 0) {
      cachedTemplates = res.templates;
      lastFetchTime = now;
      try {
        localStorage.setItem('egs_cached_templates', JSON.stringify(res.templates));
      } catch (_) {}
      return cachedTemplates;
    }
  } catch (err) {
    console.warn('Could not fetch remote templates, falling back to local defaults:', err.message);
  }

  // Fallback to local defaults if API fails or is offline
  if (!cachedTemplates) {
    try {
      const stored = localStorage.getItem('egs_cached_templates');
      if (stored) {
        cachedTemplates = JSON.parse(stored);
      }
    } catch (_) {}
  }
  if (!cachedTemplates) {
    cachedTemplates = INITIAL_TEMPLATES;
  }
  lastFetchTime = now;
  return cachedTemplates;
}

/**
 * Replace {{placeholder}} tags with actual values
 */
export function renderTemplateText(templateString, data = {}) {
  if (!templateString) return '';
  return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
  });
}

/**
 * Check if a ticket represents a Site Survey
 */
export function isSiteSurvey(ticket) {
  if (!ticket) return false;
  const p = String(ticket.product_type || '').toUpperCase();
  const c = String(ticket.issue_category || '').toUpperCase();
  return p.includes('SURVEY') || c.includes('SURVEY');
}

/**
 * Build WhatsApp URL and text for Complaint Registered or Site Survey Registered
 */
export async function buildComplaintRegisteredWhatsApp(ticket) {
  const templates = await getNotificationTemplates();
  const isSurvey = isSiteSurvey(ticket);
  const targetKey = isSurvey ? 'site_survey_registered' : 'complaint_registered';
  const tmpl = templates.find(t => t.template_key === targetKey) || (!isSurvey ? templates.find(t => t.template_key === 'complaint_registered') : null);

  const defaultBody = isSurvey
    ? `☀️ *Eco Green Solar Site Survey*\n\nDear {{customer_name}}, your site survey request has been registered successfully.\n\n📌 *Survey Ticket ID:* {{complaint_id}}\n🔍 *Type:* {{product_type}}\n📋 *Scope:* {{issue_category}}\n📅 *Registered Date:* {{date}}{{charges_line}}\n\nOur engineering team is reviewing your site requirements and will assign an expert site survey engineer shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`
    : `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`;

  const rawBody = tmpl?.whatsapp_body || defaultBody;

  const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  const trackingUrl = `${window.location.origin}/track/${ticket.ticket_id}`;
  const estCharges = Number(ticket.estimated_charges || 0);
  const isNotifyActive = (ticket.notify_charges === 1 || ticket.notify_charges === '1' || ticket.notify_charges === true || ticket.notify_charges === 'true');
  const chargesLine = (estCharges > 0 && isNotifyActive)
    ? `\n💰 *Estimated Service Charge:* ₹${estCharges} (Standard Visit & Diagnostic Fee)`
    : '';

  const data = {
    customer_name: ticket.customer_name || 'Valued Customer',
    complaint_id: ticket.ticket_id,
    product_type: ticket.product_type,
    issue_category: ticket.issue_category,
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    charges_line: chargesLine,
    feedback_url: trackingUrl
  };

  const renderedText = renderTemplateText(rawBody, data);
  const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(renderedText)}`;

  return {
    rawText: renderedText,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

/**
 * Build WhatsApp URL and text for Technician Assigned (sent to customer)
 */
export async function buildTechnicianAssignedWhatsApp(ticket, technician, expectedVisitDate) {
  const templates = await getNotificationTemplates();
  const isSurvey = isSiteSurvey(ticket);
  const targetKey = isSurvey ? 'site_survey_assigned' : 'technician_assigned';
  const tmpl = templates.find(t => t.template_key === targetKey) || (!isSurvey ? templates.find(t => t.template_key === 'technician_assigned') : null);

  const defaultBody = isSurvey
    ? `☀️ *Eco Green Solar Site Survey Update*\n\nHello {{customer_name}}, a technical survey engineer has been assigned for your site feasibility assessment (Ticket *{{complaint_id}}*).\n\n👨‍💼 *Survey Engineer:* {{technician_name}}\n📅 *Scheduled Visit:* {{expected_visit_date}}\n\nKindly provide rooftop and electrical meter access to our engineer upon arrival for accurate measurement and shadow analysis.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar Operations`
    : `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`;

  const rawBody = tmpl?.whatsapp_body || defaultBody;

  const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  const trackingUrl = `${window.location.origin}/track/${ticket.ticket_id}`;

  const formattedDate = expectedVisitDate
    ? new Date(expectedVisitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Within 24-48 Hours';

  const data = {
    customer_name: ticket.customer_name || 'Valued Customer',
    complaint_id: ticket.ticket_id,
    product_type: ticket.product_type,
    issue_category: ticket.issue_category,
    technician_name: technician?.name || 'Assigned Specialist',
    technician_phone: technician?.phone || '',
    expected_visit_date: formattedDate,
    feedback_url: trackingUrl,
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const renderedText = renderTemplateText(rawBody, data);
  const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(renderedText)}`;

  return {
    rawText: renderedText,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

/**
 * Build WhatsApp URL and text for Work Order (sent to technician)
 */
export function buildTechnicianWorkOrderWhatsApp(ticket, technician, expectedVisitDate) {
  const cleanPhone = (technician?.phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  
  const formattedDate = expectedVisitDate
    ? new Date(expectedVisitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Immediate / Next Available Slot';

  const portalLink = `${window.location.origin}/technician?ticket=${encodeURIComponent(ticket.ticket_id)}`;
  const isSurvey = isSiteSurvey(ticket);

  let workOrderText;
  if (isSurvey) {
    workOrderText = `📐 *Eco Green Solar — Site Survey Field Assignment*\n\nDear ${technician?.name || 'Engineer'}, a new rooftop site survey has been assigned to you.\n\n📌 *Survey Ticket ID:* ${ticket.ticket_id}\n👤 *Customer:* ${ticket.customer_name}\n📞 *Customer Phone:* ${ticket.customer_phone}\n📍 *Site Address:* ${ticket.customer_address}${ticket.city ? ', ' + ticket.city : ''}\n${ticket.location_url ? `🗺️ *Location Map:* ${ticket.location_url}\n` : ''}🔍 *Survey Category:* ${ticket.issue_category}\n📝 *Survey Scope / Notes:* ${ticket.issue_description || 'Site feasibility assessment'}\n📅 *Scheduled Visit:* ${formattedDate}\n\n🔗 *Direct Field Portal Link:*\n${portalLink}\n\nPlease call the customer before visiting, verify rooftop structure, take photos/videos, and complete the feasibility checklist.\n- Eco Green Solar Projects Desk`;
  } else {
    workOrderText = `🛠️ *Eco Green Solar — New Field Work Order*\n\nDear ${technician?.name || 'Technician'}, a new complaint ticket has been assigned to you.\n\n📌 *Ticket ID:* ${ticket.ticket_id}\n👤 *Customer:* ${ticket.customer_name}\n📞 *Customer Phone:* ${ticket.customer_phone}\n📍 *Address:* ${ticket.customer_address}${ticket.city ? ', ' + ticket.city : ''}\n${ticket.location_url ? `🗺️ *Location Map:* ${ticket.location_url}\n` : ''}🔧 *Product:* ${ticket.product_type}\n⚠️ *Issue:* ${ticket.issue_category}\n📝 *Description:* ${ticket.issue_description}\n🛡️ *Warranty:* ${ticket.is_in_warranty ? 'In-Warranty (Free Service)' : 'Out-of-Warranty'}\n📅 *Scheduled Visit:* ${formattedDate}\n\n🔗 *Direct Field Ticket Link:*\n${portalLink}\n\nPlease call the customer before visiting and confirm site access.\n- Eco Green Solar Operations Desk`;
  }

  const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(workOrderText)}`;

  return {
    rawText: workOrderText,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

/**
 * Build WhatsApp URL and text for Dual Technician Team Work Order (sent to technician with teammate info)
 */
export function buildTechnicianTeamWorkOrderWhatsApp(ticket, technician, partnerTechnician, expectedVisitDate) {
  const cleanPhone = (technician?.phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  
  const formattedDate = expectedVisitDate
    ? new Date(expectedVisitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Immediate / Next Available Slot';

  const portalLink = `${window.location.origin}/technician?ticket=${encodeURIComponent(ticket.ticket_id)}`;
  const isSurvey = isSiteSurvey(ticket);

  let workOrderText;
  if (isSurvey) {
    workOrderText = `📐 *Eco Green Solar — Joint Site Survey Assignment (2 Engineers)*\n\nDear ${technician?.name || 'Engineer'}, you and *${partnerTechnician?.name || 'Partner Engineer'}* have been assigned to conduct a joint rooftop site survey.\n\n👥 *Assigned Survey Team:*\n1. ${technician?.name || 'Engineer'} (${technician?.phone || 'N/A'})\n2. ${partnerTechnician?.name || 'Partner Specialist'} (${partnerTechnician?.phone || 'N/A'})\n\n📌 *Survey Ticket ID:* ${ticket.ticket_id}\n👤 *Customer:* ${ticket.customer_name}\n📞 *Customer Phone:* ${ticket.customer_phone}\n📍 *Site Address:* ${ticket.customer_address}${ticket.city ? ', ' + ticket.city : ''}\n${ticket.location_url ? `🗺️ *Location Map:* ${ticket.location_url}\n` : ''}🔍 *Survey Category:* ${ticket.issue_category}\n📝 *Survey Scope / Notes:* ${ticket.issue_description || 'Site feasibility assessment'}\n📅 *Scheduled Visit:* ${formattedDate}\n\n🔗 *Direct Field Portal Link:*\n${portalLink}\n\n🤝 Coordinate with your teammate ${partnerTechnician?.name || ''} and call the customer before visiting site.\n- Eco Green Solar Projects Desk`;
  } else {
    workOrderText = `🛠️ *Eco Green Solar — Joint Team Work Order (2 Technicians)*\n\nDear ${technician?.name || 'Technician'}, you have been assigned to a field complaint along with your co-technician teammate.\n\n👥 *Assigned Team:*\n1. ${technician?.name || 'Technician'} (${technician?.phone || 'N/A'})\n2. ${partnerTechnician?.name || 'Partner Specialist'} (${partnerTechnician?.phone || 'N/A'})\n\n📌 *Ticket ID:* ${ticket.ticket_id}\n👤 *Customer:* ${ticket.customer_name}\n📞 *Customer Phone:* ${ticket.customer_phone}\n📍 *Address:* ${ticket.customer_address}${ticket.city ? ', ' + ticket.city : ''}\n${ticket.location_url ? `🗺️ *Location Map:* ${ticket.location_url}\n` : ''}🔧 *Product:* ${ticket.product_type}\n⚠️ *Issue:* ${ticket.issue_category}\n📝 *Description:* ${ticket.issue_description || 'N/A'}\n🛡️ *Warranty:* ${ticket.is_in_warranty ? 'In-Warranty (Free Service)' : 'Out-of-Warranty'}\n📅 *Scheduled Visit:* ${formattedDate}\n\n🔗 *Direct Field Ticket Link:*\n${portalLink}\n\n🤝 Coordinate with your teammate ${partnerTechnician?.name || ''} and call the customer before visiting site.\n- Eco Green Solar Operations Desk`;
  }

  const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(workOrderText)}`;

  return {
    rawText: workOrderText,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

/**
 * Helper to get template synchronously from in-memory cache, localStorage, or INITIAL_TEMPLATES
 */
export function getTemplateSync(templateKey) {
  let list = cachedTemplates;
  if (!list || !Array.isArray(list) || list.length === 0) {
    try {
      const cached = localStorage.getItem('egs_cached_templates');
      if (cached) {
        list = JSON.parse(cached);
        cachedTemplates = list;
      }
    } catch (_) {}
  }
  if (!list || !Array.isArray(list) || list.length === 0) {
    try {
      const stored = localStorage.getItem('egs_mock_templates');
      if (stored) {
        list = JSON.parse(stored);
        cachedTemplates = list;
      }
    } catch (_) {}
  }
  if (!list || !Array.isArray(list) || list.length === 0) {
    list = INITIAL_TEMPLATES;
  }
  return list.find(t => t.template_key === templateKey);
}

/**
 * Standardized single template for Technician -> Customer WhatsApp greeting (ECO-13)
 * Dynamic and editable from Admin Panel (Template Manager).
 * Sends exactly one unified message (handles Site Survey if applicable).
 */
export function buildTechnicianCustomerWhatsApp(ticket, technicianName) {
  const cleanPhone = (ticket?.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  
  const isSurvey = isSiteSurvey(ticket);
  const tmpl = isSurvey ? getTemplateSync('site_survey_reach_out') : getTemplateSync('technician_reach_out_customer');

  const defaultBody = isSurvey
    ? `☀️ *Eco Green Solar - Site Survey Coordination*\n\n` +
      `Hello {{customer_name}},\n\n` +
      `This is {{technician_name}} from Eco Green Solar engineering team. I am assigned for your site survey (Ticket *{{complaint_id}}* - {{product_type}}).\n\n` +
      `I will be arriving to evaluate your site and rooftop layout. Please let me know if the location is accessible or if there are specific directions.\n\n` +
      `Thank you!`
    : `*Eco Green Support - Field Service Desk*\n\n` +
      `Dear *{{customer_name}}*,\n\n` +
      `This is *{{technician_name}}* regarding complaint ticket *#{{complaint_id}}* ({{product_type}}).\n\n` +
      `I am preparing to visit your site for inspection and service. Please confirm if the premises are accessible.\n\n` +
      `- Eco Green Support Desk`;

  const rawBody = (tmpl && tmpl.whatsapp_body && tmpl.whatsapp_body.trim()) ? tmpl.whatsapp_body : defaultBody;

  const trackingUrl = `${window.location.origin}/track/${ticket?.ticket_id || ticket?.id || ''}`;
  const formattedDate = ticket?.expected_visit_date
    ? new Date(ticket.expected_visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Scheduled Visit';

  const data = {
    customer_name: ticket?.customer_name || 'Customer',
    customer_phone: ticket?.customer_phone || '',
    customer_address: ticket?.customer_address || '',
    complaint_id: ticket?.ticket_id || ticket?.id || '',
    ticket_id: ticket?.ticket_id || ticket?.id || '',
    product_type: ticket?.product_type || (isSurvey ? 'SITE SURVEY' : 'Solar System'),
    issue_category: ticket?.issue_category || '',
    priority: ticket?.priority || 'Normal',
    technician_name: technicianName || ticket?.technician_name || 'your assigned service technician',
    technician_phone: ticket?.technician_phone || '',
    expected_visit_date: formattedDate,
    status: ticket?.status || 'Assigned',
    notes: ticket?.notes || ticket?.issue_description || '',
    feedback_url: trackingUrl,
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const renderedText = renderTemplateText(rawBody, data);
  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(renderedText)}`;

  return {
    rawText: renderedText,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

