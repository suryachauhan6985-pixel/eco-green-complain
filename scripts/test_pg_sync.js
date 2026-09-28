const { Client } = require('pg');
require('dotenv').config({ path: 'server/.env' });

function parseMetaComponents(components = []) {
  let headerText = '';
  let bodyText = '';
  let footerText = '';
  let buttons = [];
  const variables = [];

  if (!Array.isArray(components)) return { headerText, bodyText, footerText, buttons, variables };

  for (const comp of components) {
    if (comp.type === 'HEADER') {
      if (comp.format === 'TEXT') headerText = comp.text || '';
    } else if (comp.type === 'BODY') {
      bodyText = comp.text || '';
      if (comp.example?.body_text_named_params) {
        comp.example.body_text_named_params.forEach(p => {
          variables.push({ name: p.param_name, example: p.example || '', type: 'named' });
        });
      } else if (comp.example?.body_text?.[0]) {
        comp.example.body_text[0].forEach((ex, idx) => {
          variables.push({ index: idx + 1, placeholder: `{{${idx + 1}}}`, example: ex || '', type: 'positional' });
        });
      } else {
        const matches = bodyText.match(/\{\{([^{}]+)\}\}/g) || [];
        matches.forEach(m => {
          const raw = m.replace(/[{}]/g, '').trim();
          const isNum = /^\d+$/.test(raw);
          variables.push({
            name: isNum ? undefined : raw,
            index: isNum ? parseInt(raw, 10) : undefined,
            placeholder: m,
            type: isNum ? 'positional' : 'named'
          });
        });
      }
    } else if (comp.type === 'FOOTER') {
      footerText = comp.text || '';
    } else if (comp.type === 'BUTTONS') {
      buttons = Array.isArray(comp.buttons) ? comp.buttons : [];
    }
  }

  return { headerText, bodyText, footerText, buttons, variables };
}

async function syncToPg() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const wabaId = process.env.META_WABA_ID || '1015283491554000';
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=id,name,status,category,language,components,parameter_format&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const metaTemplates = data.data || [];

  console.log(`Fetched ${metaTemplates.length} templates from Meta.`);

  await client.query(`
    ALTER TABLE notification_templates 
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  `);

  let added = 0;
  let updated = 0;
  const metaIds = new Set();

  for (const mt of metaTemplates) {
    metaIds.add(String(mt.id));
    const { headerText, bodyText, footerText, buttons, variables } = parseMetaComponents(mt.components);
    const paramFormat = mt.parameter_format || (/\{\{[a-zA-Z_]/.test(bodyText) ? 'NAMED' : 'POSITIONAL');
    const autoAudience = (mt.name.toLowerCase().includes('technician') || mt.name.toLowerCase().includes('tech')) 
      ? 'technician' 
      : 'customer';
    const formattedName = mt.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Check if exists in PG by meta_template_id or meta_template_name
    const existing = await client.query(
      "SELECT id FROM notification_templates WHERE meta_template_id = $1 OR meta_template_name = $2 LIMIT 1",
      [String(mt.id), mt.name]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE notification_templates SET
          meta_template_id = $1,
          meta_template_name = $2,
          meta_language = $3,
          meta_category = $4,
          meta_status = $5,
          parameter_format = $6,
          whatsapp_body = $7,
          header_text = $8,
          footer_text = $9,
          buttons_json = $10,
          components_json = $11,
          variables_json = $12,
          sync_status = 'SYNCED',
          is_active = 1,
          last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13`,
        [
          String(mt.id), mt.name, mt.language || 'en_US', mt.category || 'UTILITY',
          mt.status || 'APPROVED', paramFormat, bodyText, headerText, footerText,
          JSON.stringify(buttons), JSON.stringify(mt.components || []), JSON.stringify(variables),
          existing.rows[0].id
        ]
      );
      updated++;
    } else {
      const cleanKey = mt.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
      await client.query(
        `INSERT INTO notification_templates (
          meta_template_id, template_key, name, meta_template_name,
          meta_language, meta_category, meta_status, parameter_format,
          whatsapp_body, header_text, footer_text, buttons_json,
          components_json, variables_json, audience, trigger_event,
          channel, is_active, sync_status, last_synced_at, email_subject, email_body,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          'whatsapp', 1, 'SYNCED', CURRENT_TIMESTAMP, $17, $18,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        [
          String(mt.id), cleanKey, formattedName, mt.name,
          mt.language || 'en_US', mt.category || 'UTILITY', mt.status || 'APPROVED', paramFormat,
          bodyText, headerText, footerText, JSON.stringify(buttons),
          JSON.stringify(mt.components || []), JSON.stringify(variables), autoAudience, cleanKey,
          `[Eco Green Solar] ${formattedName}`, bodyText
        ]
      );
      added++;
    }
  }

  // Deactivate missing templates
  const allSynced = await client.query("SELECT id, meta_template_id FROM notification_templates WHERE sync_status = 'SYNCED'");
  let deactivated = 0;
  for (const row of allSynced.rows) {
    if (row.meta_template_id && !metaIds.has(String(row.meta_template_id))) {
      await client.query("UPDATE notification_templates SET sync_status = 'DELETED_IN_META', is_active = 0 WHERE id = $1", [row.id]);
      deactivated++;
    }
  }

  // Log sync audit record
  await client.query(
    `INSERT INTO template_sync_logs (
      sync_started_at, sync_completed_at, total_meta_templates,
      added_count, updated_count, deactivated_count, status
    ) VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $1, $2, $3, $4, 'SUCCESS')`,
    [metaTemplates.length, added, updated, deactivated]
  );

  console.log(`Sync completed: ${added} added, ${updated} updated, ${deactivated} deactivated.`);

  const current = await client.query("SELECT id, meta_template_id, meta_template_name, meta_status, parameter_format, last_synced_at FROM notification_templates ORDER BY id ASC");
  console.log('Current DB Templates:', current.rows);

  await client.end();
}

syncToPg().catch(console.error);
