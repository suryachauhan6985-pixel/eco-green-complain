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
    audience: 'customer',
    trigger_event: 'complaint_registered',
    meta_template_name: 'complaint_registered',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
    email_subject: `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}{{charges_line}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly.`
  },
  {
    id: 2,
    template_key: 'technician_assigned',
    name: 'Technician Assigned Notification',
    audience: 'customer',
    trigger_event: 'technician_assigned',
    meta_template_name: 'technician_assigned',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Scheduled Date:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nScheduled Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
  },
  {
    id: 3,
    template_key: 'customer_technician_reassigned',
    name: 'Customer Technician Reassigned Notice',
    audience: 'customer',
    trigger_event: 'technician_reassigned',
    meta_template_name: 'customer_technician_reassigned',
    meta_status: 'PENDING',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar - Technician Reassigned*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* ({{product_type}}) has been reassigned to a new technician.\n\n👷 *New Technician:* {{technician_name}}\n📞 *Mobile:* {{technician_phone}}\n📅 *Estimated Visit:* {{expected_visit_date}}\n\nOur service engineer will contact you shortly to coordinate your visit.\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Service Technician Update - Ticket {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nYour complaint ticket {{complaint_id}} has been reassigned to technician {{technician_name}} (Phone: {{technician_phone}}).\n\nScheduled Date: {{expected_visit_date}}\n\nOur team is working to resolve your issue as soon as possible.`
  },
  {
    id: 4,
    template_key: 'status_update',
    name: 'Status & Follow-up Note Update',
    audience: 'customer',
    trigger_event: 'status_update',
    meta_template_name: 'status__followup_note_update',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
  },
  {
    id: 5,
    template_key: 'complaint_resolved',
    name: 'Complaint Resolved Notification',
    audience: 'customer',
    trigger_event: 'complaint_resolved',
    meta_template_name: 'complaint_resolved',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket.`
  },
  {
    id: 6,
    template_key: 'complaint_closed',
    name: 'Complaint Closed & Feedback Request',
    audience: 'customer',
    trigger_event: 'complaint_closed',
    meta_template_name: 'complaint_closed_feedback_request',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
    email_subject: `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
    email_body: `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nWe hope our service technician resolved your issue to your satisfaction.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
  },
  {
    id: 7,
    template_key: 'complaint_reopened',
    name: 'Complaint Reopened Notification',
    audience: 'customer',
    trigger_event: 'complaint_reopened',
    meta_template_name: 'complaint_reopened_notification',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* upon your request.\n\nA senior service supervisor will review the case and arrange an expedited follow-up.\n\n🔗 *Track:* {{feedback_url}}\n- Eco Green Solar`,
    email_subject: `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
    email_body: `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nOur senior operations lead will review the service history and arrange an immediate re-inspection.`
  },
  {
    id: 8,
    template_key: 'technician_work_order',
    name: 'Technician Work Order (Job Assignment)',
    audience: 'technician',
    trigger_event: 'technician_work_order',
    meta_template_name: 'technician_work_order',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `⚡ *Eco Green Solar - New Work Order*\n\nHello {{technician_name}}, you have been assigned new ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Issue:* {{issue_category}}\n⚡ *Product:* {{product_type}}\n🚨 *Priority:* {{priority}}\n📅 *Visit By:* {{expected_visit_date}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease contact customer before reaching site.`,
    email_subject: `[Eco Green Solar] New Work Order Assigned: Ticket #{{complaint_id}}`,
    email_body: `Dear {{technician_name}},\n\nYou have been dispatched for service complaint #{{complaint_id}}.\n\nCustomer: {{customer_name}} ({{customer_phone}})\nAddress: {{customer_address}}\nIssue: {{issue_category}}\nScheduled Date: {{expected_visit_date}}\n\nPlease visit your technician dashboard to update work order logs.`
  },
  {
    id: 9,
    template_key: 'technician_reminder',
    name: 'Technician Pending Visit Reminder',
    audience: 'technician',
    trigger_event: 'technician_reminder',
    meta_template_name: 'technician_pending_visit_reminder',
    meta_status: 'APPROVED',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `⏰ *Eco Green Solar - Job Reminder*\n\nHello {{technician_name}}, this is a friendly reminder for scheduled ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n📅 *Visit Date:* {{expected_visit_date}}\n\nPlease contact the customer before visiting and ensure the service is updated in your portal.`,
    email_subject: `[Eco Green Solar] Reminder: Scheduled Visit for Ticket #{{complaint_id}}`,
    email_body: `Dear {{technician_name}},\n\nReminder: You have a scheduled service visit for ticket #{{complaint_id}} (Customer: {{customer_name}}, Address: {{customer_address}}).\n\nPlease ensure your visit is completed on schedule.`
  },
  {
    id: 10,
    template_key: 'technician_reassigned',
    name: 'Technician Job Reassigned Notice',
    audience: 'technician',
    trigger_event: 'technician_reassigned',
    meta_template_name: 'technician_job_reassigned_notice',
    meta_status: 'PENDING',
    is_active: 1,
    channel: 'whatsapp',
    whatsapp_body: `⚠️ *Eco Green Solar - Job Transferred*\n\nHello {{technician_name}}, please note that ticket *{{complaint_id}}* (Customer: {{customer_name}}) previously assigned to you has been reassigned/transferred to another technician.\n\nYou are no longer required to visit this site. Please check your technician portal for updated schedules.\n- Eco Green Dispatch`,
    email_subject: `[Eco Green Solar] Job Transferred: Ticket #{{complaint_id}} - {{customer_name}}`,
    email_body: `Dear {{technician_name}},\n\nThis is to notify you that complaint ticket #{{complaint_id}} (Customer: {{customer_name}}) previously assigned to you has been reassigned to another technician.\n\nYou are no longer required to attend to this complaint. Please check your Technician Portal for your latest active schedule.`
  }
];
