const { Client } = require('pg');
require('dotenv').config({ path: 'server/.env' });

async function seedTeamTemplate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const check = await client.query("SELECT id FROM notification_templates WHERE template_key = 'technician_team_work_order'");
  if (check.rows.length === 0) {
    await client.query(`
      INSERT INTO notification_templates (
        template_key, name, audience, trigger_event, meta_template_name, meta_language,
        meta_category, meta_status, is_active, channel, whatsapp_body, email_subject, email_body, created_at, updated_at
      ) VALUES (
        'technician_team_work_order',
        'Team Work Order (Dual Technicians Assigned)',
        'technician',
        'technician_team_work_order',
        'technician_work_order',
        'en_US',
        'UTILITY',
        'APPROVED',
        1,
        'whatsapp',
        '🛠️ *Eco Green Solar - Team Work Order (2 Technicians)*\n\nHello {{technician_name}}, you and *{{partner_technician_name}}* have been assigned as a 2-member service team for Ticket *{{complaint_id}}*.\n\n👥 *Assigned Team:* {{technician_name}} & {{partner_technician_name}}\n📞 *Partner Contact:* {{partner_technician_phone}}\n👤 *Customer:* {{customer_name}}\n📞 *Customer Phone:* {{customer_phone}}\n📍 *Address:* {{customer_address}}\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}} - {{notes}}\n🚨 *Priority:* {{priority}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\n🔗 *Technician Portal:* {{technician_portal_url}}\n\nPlease coordinate with {{partner_technician_name}} and call the customer before visiting the site.',
        '[Eco Green Solar] Team Work Order: Ticket #{{complaint_id}} - {{customer_name}}',
        'Dear {{technician_name}},\n\nYou and {{partner_technician_name}} have been assigned as a joint service team for complaint ticket #{{complaint_id}}.\n\nAssigned Team: {{technician_name}} & {{partner_technician_name}} (Phone: {{partner_technician_phone}})\nCustomer: {{customer_name}}\nPhone: {{customer_phone}}\nAddress: {{customer_address}}\nProduct: {{product_type}}\nIssue: {{issue_category}} - {{notes}}\nPriority: {{priority}}\nScheduled Visit: {{expected_visit_date}}\n\nPlease coordinate with your partner specialist and log into the Technician Portal to update progress.',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
    console.log('Seeded technician_team_work_order successfully!');
  } else {
    console.log('technician_team_work_order already exists, updating status to APPROVED...');
    await client.query("UPDATE notification_templates SET meta_template_name = 'technician_work_order', meta_status = 'APPROVED', is_active = 1 WHERE template_key = 'technician_team_work_order'");
  }

  await client.end();
}
seedTeamTemplate().catch(console.error);
