const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
});
async function check() {
  await client.connect();
  const resInstalled = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'installed_customers'
    ORDER BY ordinal_position
  `);
  console.log('installed_customers columns:', resInstalled.rows.map(r => r.column_name));

  const resComplaints = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'complaints'
    ORDER BY ordinal_position
  `);
  console.log('complaints columns:', resComplaints.rows.map(r => r.column_name));

  const resNotif = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'in_app_notifications'
    ORDER BY ordinal_position
  `);
  console.log('in_app_notifications columns:', resNotif.rows.map(r => r.column_name));

  await client.end();
}
check().catch(console.error);
