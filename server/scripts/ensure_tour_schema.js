const { Client } = require('pg');

async function ensureSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
  });

  await client.connect();
  console.log('Connected to PostgreSQL database');

  await client.query(`
    ALTER TABLE technician_tour_advances 
      ADD COLUMN IF NOT EXISTS ticket_id TEXT,
      ADD COLUMN IF NOT EXISTS complaint_id BIGINT,
      ADD COLUMN IF NOT EXISTS purpose TEXT,
      ADD COLUMN IF NOT EXISTS tour_title TEXT,
      ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'Cash',
      ADD COLUMN IF NOT EXISTS reference_no TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

    ALTER TABLE technician_tour_expenses 
      ADD COLUMN IF NOT EXISTS voucher_no TEXT,
      ADD COLUMN IF NOT EXISTS ticket_id TEXT,
      ADD COLUMN IF NOT EXISTS complaint_id BIGINT,
      ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

    ALTER TABLE technician_tour_settlements 
      ADD COLUMN IF NOT EXISTS settlement_type TEXT DEFAULT 'return',
      ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'Cash',
      ADD COLUMN IF NOT EXISTS reference_no TEXT,
      ADD COLUMN IF NOT EXISTS receipt_url TEXT,
      ADD COLUMN IF NOT EXISTS ticket_id TEXT,
      ADD COLUMN IF NOT EXISTS voucher_no TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Settled',
      ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

    UPDATE technician_tour_advances 
    SET reference_no = 'ADV-' || LPAD(id::text, 6, '0')
    WHERE reference_no IS NULL OR reference_no = '';

    UPDATE technician_tour_settlements 
    SET reference_no = CASE 
      WHEN returned_amount > 0 THEN 'RET-' || LPAD(id::text, 6, '0')
      ELSE 'REIM-' || LPAD(id::text, 6, '0')
    END
    WHERE reference_no IS NULL OR reference_no = '';
  `);

  console.log('Tour advances, expenses, settlements schema updated & references backfilled successfully.');
  await client.end();
}

ensureSchema().catch(err => {
  console.error('Schema update failed:', err);
  process.exit(1);
});
