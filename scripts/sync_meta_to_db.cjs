const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const templatesToInsert = [
    {
      template_key: 'charges_added',
      name: 'Service Charges Added / Updated',
      audience: 'customer',
      trigger_event: 'charges_added',
      meta_template_name: 'charges_added',
      meta_template_id: '1418929633000278',
      meta_language: 'en_US',
      meta_category: 'UTILITY',
      meta_status: 'APPROVED',
      is_active: 1,
      channel: 'whatsapp',
      sync_status: 'SYNCED',
      whatsapp_body: '☀️ *Eco Green Solar - Service Charges Update*\n\nDear {{customer_name}},\n\nEstimated service charges have been updated for your complaint ticket *{{complaint_id}}*.\n\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}}\n💰 *Estimated Service Charges:* ₹{{estimated_charges}}\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nOur service team will attend to your request. For any questions, please contact our support.\n- Eco Green Solar Care',
      email_subject: '[Eco Green Solar] Service Charges Updated - Ticket #{{complaint_id}}',
      email_body: 'Dear {{customer_name}},\n\nEstimated service charges have been updated for your complaint ticket #{{complaint_id}}.\n\nProduct: {{product_type}}\nIssue: {{issue_category}}\nEstimated Charges: ₹{{estimated_charges}}\n\nTrack live status at: {{feedback_url}}'
    },
    {
      template_key: 'charges_removed',
      name: 'Service Charges Removed / Waived',
      audience: 'customer',
      trigger_event: 'charges_removed',
      meta_template_name: 'charges_removed',
      meta_template_id: '1108744301519385',
      meta_language: 'en_US',
      meta_category: 'UTILITY',
      meta_status: 'APPROVED',
      is_active: 1,
      channel: 'whatsapp',
      sync_status: 'SYNCED',
      whatsapp_body: '☀️ *Eco Green Solar - Charges Waived / Removed*\n\nDear {{customer_name}},\n\nThe service charges for your complaint ticket *{{complaint_id}}* have been waived / removed (₹0).\n\n🔧 *Product:* {{product_type}}\n⚠️ *Issue:* {{issue_category}}\n💰 *Revised Service Charges:* ₹0 (Free / Covered Under Warranty)\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nOur technician will proceed with the service visit without additional charges.\n- Eco Green Solar Care',
      email_subject: '[Eco Green Solar] Service Charges Waived - Ticket #{{complaint_id}}',
      email_body: 'Dear {{customer_name}},\n\nThe service charges for your complaint ticket #{{complaint_id}} have been waived / removed (₹0).\n\nProduct: {{product_type}}\nIssue: {{issue_category}}\nRevised Charges: ₹0 (Covered Under Warranty)\n\nTrack live status at: {{feedback_url}}'
    }
  ];

  for (const t of templatesToInsert) {
    const check = await client.query('SELECT id FROM notification_templates WHERE template_key = $1', [t.template_key]);
    if (check.rows.length === 0) {
      await client.query(`
        INSERT INTO notification_templates (
          template_key, name, whatsapp_body, email_subject, email_body,
          audience, trigger_event, meta_template_name, meta_template_id,
          meta_language, meta_category, meta_status, is_active, channel, sync_status,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `, [
        t.template_key, t.name, t.whatsapp_body, t.email_subject, t.email_body,
        t.audience, t.trigger_event, t.meta_template_name, t.meta_template_id,
        t.meta_language, t.meta_category, t.meta_status, t.is_active, t.channel, t.sync_status
      ]);
      console.log(`Inserted ${t.template_key} with status APPROVED!`);
    } else {
      await client.query(`
        UPDATE notification_templates SET
          meta_status = 'APPROVED',
          meta_template_id = $1,
          sync_status = 'SYNCED',
          last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE template_key = $2
      `, [t.meta_template_id, t.template_key]);
      console.log(`Updated ${t.template_key} to APPROVED!`);
    }
  }

  // Also query Meta live and sync ALL templates in PostgreSQL
  const token = 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
  const wabaId = '1015283491554000';
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,language,id&limit=100`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const metaData = await metaRes.json();
  if (metaData?.data) {
    for (const mt of metaData.data) {
      await client.query(`
        UPDATE notification_templates SET
          meta_status = $1,
          meta_template_id = $2,
          last_synced_at = CURRENT_TIMESTAMP,
          sync_status = 'SYNCED',
          updated_at = CURRENT_TIMESTAMP
        WHERE meta_template_name = $3 OR template_key = $3
      `, [mt.status, String(mt.id), mt.name]);
    }
    console.log(`Synced ${metaData.data.length} templates directly from Meta into PostgreSQL.`);
  }

  const all = await client.query('SELECT id, template_key, meta_template_name, meta_status FROM notification_templates ORDER BY id ASC');
  console.log('Final Total in DB:', all.rows.length);
  console.log(all.rows);

  await client.end();
}

run().catch(console.error);
