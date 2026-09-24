const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedDatabase(forceReset = false) {
  console.log('Syncing Eco Green Solar CMS Core Setup...');

  // 1. Seed Single Admin User (no dummy staff or technicians)
  const passwordHash = await bcrypt.hash('admin3636', 10);

  const insertOrUpdateAdmin = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, is_active)
    VALUES (1, 'Admin Supervisor', 'admin@ecogreensolar.com', ?, 'admin', '6352454247', 1)
    ON CONFLICT(id) DO UPDATE SET
      password_hash = excluded.password_hash,
      phone = excluded.phone,
      email = excluded.email,
      role = 'admin',
      is_active = 1
  `);
  insertOrUpdateAdmin.run(passwordHash);

  // Clean out any legacy dummy users and technicians
  db.prepare("DELETE FROM users WHERE id != 1").run();
  db.prepare("DELETE FROM technicians").run();

  if (forceReset) {
    db.prepare("DELETE FROM complaints").run();
    db.prepare("DELETE FROM complaint_timelines").run();
    db.prepare("DELETE FROM complaint_attachments").run();
    console.log('All complaints and dummy entities cleared for fresh testing.');
  }

  // 2. Notification Templates (Preserved for automated WhatsApp/Email lifecycle triggers)
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO notification_templates (template_key, name, whatsapp_body, email_subject, email_body)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertTemplate.run(
    'complaint_registered',
    'Complaint Registered Notification',
    `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: +91 78784 44414 | Eco Green Solar Care`,
    `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly. You can track your complaint status live at any time.`
  );

  insertTemplate.run(
    'technician_assigned',
    'Technician Assigned Notification',
    `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nExpected Visit Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
  );

  insertTemplate.run(
    'status_update',
    'Status & Follow-up Note Update',
    `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
    `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
  );

  insertTemplate.run(
    'complaint_resolved',
    'Complaint Resolved Notification',
    `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly. If you have any questions, please contact our helpline.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
    `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket. If you need any further assistance, please let us know.`
  );

  insertTemplate.run(
    'complaint_closed',
    'Complaint Closed & Feedback Request',
    `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
    `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
    `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nWe hope our service technician resolved your issue to your satisfaction.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
  );

  insertTemplate.run(
    'complaint_reopened',
    'Complaint Reopened Notification',
    `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* upon your request.\n\nA senior service supervisor will review the case and arrange an expedited follow-up.\n\n🔗 *Track:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nOur senior operations lead will review the service history and arrange an immediate re-inspection.`
  );

  insertTemplate.run(
    'technician_work_order',
    'Technician Work Order (Job Assignment)',
    `🛠️ *Eco Green Solar - New Job Assignment*\n\nHello {{technician_name}}, you have been assigned ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}} - {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nPlease check your Eco Green technician portal for details and coordinate with the customer.`,
    `[Eco Green Solar] Work Order: Ticket #{{complaint_id}} - {{customer_name}}`,
    `Dear {{technician_name}},\n\nYou have been assigned to service complaint ticket #{{complaint_id}}.\n\nCustomer: {{customer_name}}\nPhone: {{customer_phone}}\nAddress: {{customer_address}}\nProduct: {{product_type}}\nIssue Category: {{issue_category}}\nDetails: {{notes}}\nPriority: {{priority}}\nScheduled Visit: {{expected_visit_date}}\n\nPlease log in to your Technician Portal to view complete details, update progress, and record spare parts or payment collections.`
  );

  insertTemplate.run(
    'technician_pending_visit_reminder',
    'Technician Pending Visit Reminder',
    `⏰ *Eco Green Solar - Job Reminder*\n\nHello {{technician_name}}, this is a friendly reminder for scheduled ticket *{{complaint_id}}*.\n\n👤 *Customer:* {{customer_name}}\n📞 *Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n📅 *Visit Date:* {{expected_visit_date}}\n\nPlease contact the customer before visiting and ensure the service is updated in your portal.`,
    `[Eco Green Solar] Reminder: Scheduled Visit for Ticket #{{complaint_id}}`,
    `Dear {{technician_name}},\n\nReminder: You have a scheduled service visit for ticket #{{complaint_id}} (Customer: {{customer_name}}, Address: {{customer_address}}).\n\nPlease ensure your visit is completed on schedule.`
  );

  insertTemplate.run(
    'technician_job_reassigned_notice',
    'Technician Job Reassignment Notice',
    `📋 *Eco Green Solar Notice*\n\nTicket *{{complaint_id}}* ({{customer_name}}) has been reassigned to another technician or updated.\n\nNotes: {{notes}}\n\nThank you for your cooperation.\n- Eco Green Solar`,
    `[Eco Green Solar] Ticket Reassignment Notice - {{complaint_id}}`,
    `Dear {{technician_name}},\n\nTicket #{{complaint_id}} for customer {{customer_name}} has been updated or reassigned.\n\nNotes: {{notes}}\n\nPlease check your portal for your active queue.`
  );

  console.log('Database sync complete: 1 Admin active (6352454247 / admin3636). Zero dummy staff, tech or complaints.');
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase(true).then(() => process.exit(0));
}
