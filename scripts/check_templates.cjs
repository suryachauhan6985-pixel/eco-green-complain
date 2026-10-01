const { Client } = require('pg');
const DB_CONN = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new Client({ connectionString: DB_CONN });
  await client.connect();
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables:', tables.rows.map(r => r.table_name));

  // If notification_templates or whatsapp_templates exists, show rows
  for (const t of tables.rows.map(r => r.table_name)) {
    if (t.includes('template') || t.includes('notif')) {
      console.log(`\nTable ${t}:`);
      const rows = await client.query(`SELECT * FROM ${t} LIMIT 10`);
      console.log(rows.rows);
    }
  }

  await client.end();
}

main().catch(console.error);
