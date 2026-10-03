const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notification_templates'");
  console.log('Columns in DB:', cols.rows.map(c => c.column_name));

  const all = await client.query('SELECT id, template_key, meta_template_name, meta_status FROM notification_templates ORDER BY id ASC');
  console.log('Total templates in DB:', all.rows.length);
  console.log('Templates in DB:', all.rows);

  await client.end();
}

run().catch(console.error);
