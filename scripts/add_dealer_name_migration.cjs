const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
});
async function migrate() {
  await client.connect();
  console.log('Connected to PostgreSQL.');
  await client.query(`
    ALTER TABLE complaints 
    ADD COLUMN IF NOT EXISTS dealer_name VARCHAR(255);
  `);
  console.log('ALTER TABLE complaints ADD COLUMN dealer_name SUCCESS.');
  const check = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'complaints' AND column_name = 'dealer_name'
  `);
  console.log('dealer_name column status:', check.rows);
  await client.end();
}
migrate().catch(console.error);
