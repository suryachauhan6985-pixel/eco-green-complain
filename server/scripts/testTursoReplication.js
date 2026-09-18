const db = require('../config/database');
const { createClient } = require('@libsql/client');

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function testMutation() {
  console.log('1. Executing local DB update for Rohit Kumar...');
  db.prepare('UPDATE technicians SET phone = ? WHERE name LIKE ?').run('+916352454247', '%Rohit%');
  
  console.log('2. Waiting 2 seconds for asynchronous cloud replication...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('3. Querying Turso Cloud directly...');
  const res = await turso.execute("SELECT id, name, phone FROM technicians WHERE name LIKE '%Rohit%'");
  console.log('Turso Cloud Result:', JSON.stringify(res.rows, null, 2));

  if (res.rows[0]?.phone === '+916352454247') {
    console.log('✅ REPLICATION SUCCESS: Phone number updated in Turso Cloud in real-time!');
  } else {
    console.error('❌ REPLICATION FAILED: Phone does not match.');
  }
}

testMutation().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
