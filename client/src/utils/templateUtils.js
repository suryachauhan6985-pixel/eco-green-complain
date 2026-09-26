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
      return cachedTemplates;
    }
  } catch (err) {
    console.warn('Could not fetch remote templates, falling back to local defaults:', err.message);
  }

  // Fallback to local defaults if API fails or is offline
  cachedTemplates = INITIAL_TEMPLATES;
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
 * Build WhatsApp URL and text for Complaint Registered
 */
export async function buildComplaintRegisteredWhatsApp(ticket) {
  const templates = await getNotificationTemplates();
  const tmpl = templates.find(t => t.template_key === 'complaint_registered');

  const defaultBody = `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`;

  const rawBody = tmpl?.whatsapp_body || defaultBody;

  const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  const trackingUrl = `${window.location.origin}/track/${ticket.ticket_id}`;
  const estCharges = Number(ticket.estimated_charges || 0);
  const chargesLine = (estCharges > 0 && ticket.notify_charges !== false && ticket.notify_charges !== 0)
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
  const tmpl = templates.find(t => t.template_key === 'technician_assigned');

  const defaultBody = `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`;

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

  const workOrderText = `🛠️ *Eco Green Solar — New Field Work Order*

Dear ${technician?.name || 'Technician'}, a new complaint ticket has been assigned to you.

📌 *Ticket ID:* ${ticket.ticket_id}
👤 *Customer:* ${ticket.customer_name}
📞 *Customer Phone:* ${ticket.customer_phone}
📍 *Address:* ${ticket.customer_address}${ticket.city ? ', ' + ticket.city : ''}
${ticket.location_url ? `🗺️ *Location Map:* ${ticket.location_url}\n` : ''}🔧 *Product:* ${ticket.product_type}
⚠️ *Issue:* ${ticket.issue_category}
📝 *Description:* ${ticket.issue_description}
🛡️ *Warranty:* ${ticket.is_in_warranty ? 'In-Warranty (Free Service)' : 'Out-of-Warranty'}
📅 *Scheduled Visit:* ${formattedDate}

🔗 *Direct Field Ticket Link:*
${portalLink}

Please call the customer before visiting and confirm site access.
- Eco Green Solar Operations Desk`;

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
 * Dynamic and editable from Admin Panel (Template Manager > technician_reach_out_customer).
 * Sends exactly one unified message.
 */
export function buildTechnicianCustomerWhatsApp(ticket, technicianName) {
  const cleanPhone = (ticket?.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  
  const tmpl = getTemplateSync('technician_reach_out_customer');

  const defaultBody = 
    `☀️ *Eco Green Solar - Field Service Desk*\n\n` +
    `Namaste *{{customer_name}}*,\n\n` +
    `This is *{{technician_name}}* regarding complaint ticket *#{{complaint_id}}* ({{product_type}}).\n\n` +
    `I am preparing to visit your site for the inspection and service. Please confirm if the premises are accessible.\n\n` +
    `📞 Helpdesk: +91 78784 44414\n` +
    `- Eco Green Technical Services`;

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
    product_type: ticket?.product_type || 'Solar System',
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

