const { Client } = require('pg');
const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString: connStr });

async function migrate() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL...');

  // 1. Add attachment_type column if not exists
  await client.query(`
    ALTER TABLE complaint_attachments 
    ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50) DEFAULT 'registration';
    CREATE INDEX IF NOT EXISTS idx_att_type ON complaint_attachments(attachment_type);
  `);
  console.log('Added attachment_type column to complaint_attachments.');

  // 2. Backfill existing resolution proof attachments
  const res = await client.query(`
    UPDATE complaint_attachments ca
    SET attachment_type = 'resolution'
    FROM complaints c
    WHERE ca.complaint_id = c.id
      AND (
        ca.file_url = c.closing_photo_url
        OR ca.file_data = c.closing_photo_url
        OR ca.file_name ILIKE '%resolution_proof%'
        OR ca.file_name ILIKE '%closing_proof%'
        OR ca.uploaded_by ILIKE '%resolution proof%'
        OR (
          c.resolved_by_technician_name IS NOT NULL
          AND TRIM(LOWER(ca.uploaded_by)) = TRIM(LOWER(c.resolved_by_technician_name))
          AND TRIM(LOWER(ca.uploaded_by)) <> TRIM(LOWER(COALESCE(c.customer_name, '')))
        )
      );
  `);
  console.log(`Backfilled ${res.rowCount} attachments as 'resolution'.`);

  // Ensure all others are 'registration'
  const res2 = await client.query(`
    UPDATE complaint_attachments
    SET attachment_type = 'registration'
    WHERE attachment_type IS NULL;
  `);
  console.log(`Updated ${res2.rowCount} remaining attachments as 'registration'.`);

  // Verify ticket EGS-2026-000101
  const check = await client.query(`
    SELECT ca.id, ca.file_name, ca.uploaded_by, ca.attachment_type, c.ticket_id
    FROM complaint_attachments ca
    JOIN complaints c ON ca.complaint_id = c.id
    WHERE c.ticket_id = 'EGS-2026-000101'
    ORDER BY ca.id ASC;
  `);
  console.log('\nVerified attachments for EGS-2026-000101:');
  console.table(check.rows);

  await client.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
