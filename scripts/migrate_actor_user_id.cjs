const { Client } = require('pg');

const connStr = process.env.DATABASE_URL || 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function runMigration() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('Running additive migration: ALTER TABLE complaint_timelines ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;');
  await c.query(`ALTER TABLE complaint_timelines ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;`);

  console.log('Verifying column exists in complaint_timelines...');
  const res = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'complaint_timelines' AND column_name = 'actor_user_id';
  `);
  console.table(res.rows);

  await c.end();
  console.log('Migration completed successfully.');
}

runMigration().catch(console.error);
