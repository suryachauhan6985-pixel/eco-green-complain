const { Client } = require('pg');

async function testConn(name, connStr) {
  console.log(`\nTesting ${name}:`);
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  try {
    const t0 = Date.now();
    await c.connect();
    const res = await c.query('SELECT 1 as num, NOW() as time');
    console.log(`  -> SUCCESS in ${Date.now() - t0}ms:`, res.rows[0]);
  } catch (err) {
    console.error(`  -> FAILED:`, err.message);
  } finally {
    try { await c.end(); } catch (_) {}
  }
}

async function main() {
  // Option 1: Supabase Pooler Session Mode (Port 5432)
  await testConn(
    'Supabase Pooler Session Mode (Port 5432)',
    'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
  );

  // Option 2: Direct Supabase Host (Port 5432)
  await testConn(
    'Direct Supabase Host (Port 5432)',
    'postgresql://postgres:Ge%40286296ecogreen@db.pirlkhjljjnwuunpqwbb.supabase.co:5432/postgres'
  );

  // Option 3: Current PgBouncer Transaction Mode (Port 6543)
  await testConn(
    'Supabase PgBouncer Transaction Mode (Port 6543)',
    'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
  );
}

main();
