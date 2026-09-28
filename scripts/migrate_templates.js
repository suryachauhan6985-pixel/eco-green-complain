const { Client } = require('pg');
require('dotenv').config({ path: 'server/.env' });

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Running database migration for dynamic WhatsApp templates...');

  // 1. Add new columns to notification_templates if they don't exist
  const alterSqls = [
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS meta_template_id TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS parameter_format TEXT DEFAULT 'POSITIONAL'",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS components_json TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS header_text TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS footer_text TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS buttons_json TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variables_json TEXT",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ",
    "ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'SYNCED'"
  ];

  for (const sql of alterSqls) {
    try {
      await client.query(sql);
      console.log('Executed:', sql);
    } catch (e) {
      console.warn('Alter note:', e.message);
    }
  }

  // 2. Add unique index on meta_template_id where not null
  try {
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_meta_id ON notification_templates(meta_template_id) WHERE meta_template_id IS NOT NULL;"
    );
    console.log('Created unique index on meta_template_id');
  } catch (e) {
    console.warn('Index note:', e.message);
  }

  // 3. Create template_sync_logs table for audit trail
  const createLogSql = `
    CREATE TABLE IF NOT EXISTS template_sync_logs (
      id BIGSERIAL PRIMARY KEY,
      sync_started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      sync_completed_at TIMESTAMPTZ,
      total_meta_templates INTEGER DEFAULT 0,
      added_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      deactivated_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'SUCCESS',
      error_details TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(createLogSql);
  console.log('Created template_sync_logs table');

  await client.end();
  console.log('Migration complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
