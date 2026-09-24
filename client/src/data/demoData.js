/**
 * Master Data Configurations for Eco Green Solar CMS
 * Clean slate for comprehensive production workflow testing
 */

export const INITIAL_TECHNICIANS = [];

export const INITIAL_USERS = [
  { 
    id: 1, 
    name: 'Admin Supervisor', 
    email: 'admin@ecogreensolar.com', 
    role: 'admin', 
    phone: '6352454247', 
    is_active: 1, 
    created_at: '2026-01-01T09:00:00.000Z' 
  }
];

export const INITIAL_COMPLAINTS = [];

export const INITIAL_SIMULATED_NOTIFICATIONS = [];

export const INITIAL_TEMPLATES = [
  {
    id: 1,
    template_key: 'complaint_registered',
    name: 'Complaint Registered Notification',
    whatsapp_body: `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
    email_subject: `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}{{charges_line}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly.`
  },
  {
    id: 2,
    template_key: 'technician_assigned',
    name: 'Technician Assigned Notification',
    whatsapp_body: `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Scheduled Date:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nScheduled Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
  },
  {
    id: 3,
    template_key: 'status_update',
    name: 'Status & Follow-up Note Update',
    whatsapp_body: `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
  },
  {
    id: 4,
    template_key: 'complaint_resolved',
    name: 'Complaint Resolved Notification',
    whatsapp_body: `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket.`
  },
  {
    id: 5,
    template_key: 'complaint_closed',
    name: 'Complaint Closed & Feedback Request',
    whatsapp_body: `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
    email_subject: `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
    email_body: `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nWe hope our service technician resolved your issue to your satisfaction.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
  },
  {
    id: 6,
    template_key: 'complaint_reopened',
    name: 'Complaint Reopened Notification',
    whatsapp_body: `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* upon your request.\n\nA senior service supervisor will review the case and arrange an expedited follow-up.\n\n🔗 *Track:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nOur senior operations lead will review the service history and arrange an immediate re-inspection.`
  }
];
