const { Client } = require('pg');
require('dotenv').config({ path: 'server/.env' });

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notification_templates' ORDER BY ordinal_position;"
  );
  console.log('Columns:', cols.rows);

  const rows = await client.query("SELECT id, template_key, name, meta_template_name, meta_status FROM notification_templates;");
  console.log('Existing rows count:', rows.rows.length);
  console.log('Existing rows:', rows.rows);

  await client.end();
}

check().catch(console.error);
