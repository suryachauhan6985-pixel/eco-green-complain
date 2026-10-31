const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  await client.query(`
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS media_purged INTEGER DEFAULT 0;
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS media_purged_at TIMESTAMP;
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS retention_days INTEGER;

    ALTER TABLE complaint_attachments ADD COLUMN IF NOT EXISTS is_purged INTEGER DEFAULT 0;
    ALTER TABLE complaint_attachments ADD COLUMN IF NOT EXISTS purge_reason TEXT;

    ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_purged INTEGER DEFAULT 0;
    ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS purge_reason TEXT;
  `);

  console.log('Retention schema columns confirmed/added successfully.');

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('complaints', 'complaint_attachments', 'whatsapp_messages')
      AND column_name IN ('media_purged', 'media_purged_at', 'retention_days', 'is_purged', 'purge_reason')
    ORDER BY table_name, column_name;
  `);

  console.log('Verified columns:', res.rows);
  await client.end();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
