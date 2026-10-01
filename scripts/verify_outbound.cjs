const { Client } = require('pg');
const DB_CONN = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function check() {
  const wamid = 'wamid.HBgMOTE2MzUyNDU0MjQ3FQIAERgSMUVCN0FGQzAyRUY0RDk5N0IyAA==';
  const client = new Client({ connectionString: DB_CONN });
  await client.connect();
  const res = await client.query('SELECT * FROM whatsapp_messages WHERE wam_id = $1', [wamid]);
  console.log('Database row for outbound message:');
  console.log(res.rows[0]);

  const rawRes = await client.query('SELECT * FROM whatsapp_raw_events WHERE wam_id = $1 OR raw_payload LIKE $2 ORDER BY id DESC', [wamid, `%${wamid}%`]);
  console.log('\nRaw events for this wamid:');
  console.log(rawRes.rows);

  await client.end();
}
check().catch(console.error);
