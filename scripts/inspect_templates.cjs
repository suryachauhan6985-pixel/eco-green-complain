const { Client } = require('pg');
const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notification_templates'");
  console.table(res.rows);
  const sample = await c.query('SELECT * FROM notification_templates LIMIT 3');
  console.log(sample.rows);
  await c.end();
}

run().catch(console.error);
