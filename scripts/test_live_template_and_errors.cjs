const fetch = globalThis.fetch;
const { Client } = require('pg');

const WORKER_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';
const DB_CONN = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function runLiveVerification() {
  console.log('================================================================');
  console.log('FINAL PRODUCTION OUTBOUND + BIDIRECTIONAL WHATSAPP AUDIT');
  console.log('================================================================\n');

  // Authenticate Admin
  const authRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '6352454247', password: 'admin3636' })
  });
  const { token } = await authRes.json();
  const testPhone = '916352454247';

  const client = new Client({ connectionString: DB_CONN });
  await client.connect();

  // -------------------------------------------------------------
  // PART 1: SEND APPROVED TEMPLATE MESSAGE
  // -------------------------------------------------------------
  console.log('--- TEST 1: Sending Meta-Approved Template ("hello_world") ---');
  const tmplSendRes = await fetch(`${WORKER_URL}/api/whatsapp/send-template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      phone: testPhone,
      template_name: 'hello_world'
    })
  });
  const tmplSendData = await tmplSendRes.json();
  console.log('Template Send Result:', tmplSendRes.status, tmplSendData);

  if (tmplSendData.success && tmplSendData.wamid) {
    console.log(`[PASS] Template accepted by Meta Cloud API! WAMID: ${tmplSendData.wamid}`);
    
    // Check DB record
    await new Promise(r => setTimeout(r, 2000));
    const tmplDbRes = await client.query('SELECT * FROM whatsapp_messages WHERE wam_id = $1', [tmplSendData.wamid]);
    if (tmplDbRes.rows.length > 0) {
      const row = tmplDbRes.rows[0];
      console.log(`[PASS] Template persisted in DB (ID: ${row.id}, Status: ${row.status}, Template: ${row.template_name})`);
    } else {
      console.error('[FAIL] Template message row not found in DB!');
    }
  } else {
    console.error('[FAIL] Template send rejected by Meta:', tmplSendData.error);
  }

  // -------------------------------------------------------------
  // PART 2: ERROR HANDLING TESTS
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Error Handling Tests ---');

  // 2a. Invalid phone number format (<10 digits)
  console.log('2a. Testing Invalid Recipient Number ("12345")...');
  const invalidPhoneRes = await fetch(`${WORKER_URL}/api/whatsapp/direct-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      phone: '12345',
      message: 'This should fail'
    })
  });
  const invalidPhoneData = await invalidPhoneRes.json();
  if (!invalidPhoneData.success && invalidPhoneData.error) {
    console.log(`[PASS] Correctly rejected invalid phone number: "${invalidPhoneData.error}"`);
  } else {
    console.error('[FAIL] Expected failure on invalid phone, got:', invalidPhoneData);
  }

  // 2b. Non-existent/unapproved template
  console.log('\n2b. Testing Invalid/Non-Existent Template ("fake_template_xyz123")...');
  const invalidTmplRes = await fetch(`${WORKER_URL}/api/whatsapp/send-template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      phone: testPhone,
      template_name: 'fake_template_xyz123'
    })
  });
  const invalidTmplData = await invalidTmplRes.json();
  if (!invalidTmplData.success && invalidTmplData.error) {
    console.log(`[PASS] Correctly rejected non-existent template: "${invalidTmplData.error}"`);
  } else {
    console.error('[FAIL] Expected failure on invalid template, got:', invalidTmplData);
  }

  // 2c. Unauthorized API call without JWT
  console.log('\n2c. Testing Unauthorized API Request (No Auth Header)...');
  const unauthRes = await fetch(`${WORKER_URL}/api/whatsapp/direct-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, message: 'Unauthorized test' })
  });
  if (unauthRes.status === 401 || unauthRes.status === 403) {
    console.log(`[PASS] Correctly rejected unauthenticated request: HTTP ${unauthRes.status}`);
  } else {
    console.error(`[FAIL] Expected HTTP 401/403, got: HTTP ${unauthRes.status}`);
  }

  // -------------------------------------------------------------
  // PART 3: BIDIRECTIONAL CONVERSATION THREAD VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: WhatsApp Hub Thread & Chronological Consistency ---');
  const chatRes = await fetch(`${WORKER_URL}/api/whatsapp/chats/${testPhone}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const chatData = await chatRes.json();
  console.log(`Total messages in thread ${testPhone}: ${chatData.messages?.length || 0}`);

  const sampleMessages = (chatData.messages || []).slice(-5);
  sampleMessages.forEach(m => {
    console.log(` - [${m.sender_type.toUpperCase()}] Status: ${m.status.padEnd(9)} | WAMID: ${m.wam_id?.slice(0, 32)}... | Msg: "${m.message_body?.slice(0, 45)}"`);
  });

  // Verify Conversation List Grouping
  const convRes = await fetch(`${WORKER_URL}/api/whatsapp/conversations`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const convData = await convRes.json();
  const thread = convData.conversations?.find(c => c.phone?.includes('6352454247'));

  console.log('\nConversation Thread Summary:');
  console.log(' - Customer Name:', thread?.sender_name);
  console.log(' - Last Message :', thread?.last_message?.slice(0, 50));
  console.log(' - Last Activity:', thread?.last_activity);
  console.log(' - Last Status  :', thread?.last_status);

  await client.end();
  console.log('\n================================================================');
  console.log('LIVE PRODUCTION AUDIT COMPLETE');
  console.log('================================================================');
}

runLiveVerification().catch(console.error);
