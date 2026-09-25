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
 * Standardized single template for Technician -> Customer WhatsApp greeting (ECO-13)
 * Free of expected date and mobile number placeholders.
 * Consistent across portal cards and ticket drawer.
 */
export function buildTechnicianCustomerWhatsApp(ticket, technicianName) {
  const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  
  const techGreeting = 
    `☀️ *Eco Green Solar - Field Service Desk*\n\n` +
    `Namaste *${ticket.customer_name || 'Customer'}*,\n\n` +
    `This is *${technicianName || ticket.technician_name || 'your assigned service technician'}* regarding complaint ticket *#${ticket.ticket_id || ticket.id}* (${ticket.product_type || 'Solar System'}).\n\n` +
    `I am preparing to visit your site for the inspection and service. Please confirm if the premises are accessible.\n\n` +
    `📞 Helpdesk: +91 78784 44414\n` +
    `- Eco Green Technical Services`;

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(techGreeting)}`;

  return {
    rawText: techGreeting,
    sendUrl: waUrl,
    phone: formattedPhone
  };
}

