const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT id, ticket_id, status, media_purged, documents_purged FROM complaints WHERE status NOT IN ('Closed', 'closed') AND (media_purged = 1 OR documents_purged = 1);");
  console.log('Non-closed complaints marked purged:', res.rows);
  if (res.rows.length > 0) {
    await client.query("UPDATE complaints SET media_purged = 0, documents_purged = 0 WHERE status NOT IN ('Closed', 'closed');");
    console.log('Reset non-closed complaints to media_purged = 0');
  }
  await client.end();
}

run().catch(console.error);
