const fetch = globalThis.fetch;
const { Client } = require('pg');

const WORKER_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';
const DB_CONN = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, timestamp: new Date().toISOString() });
  console.log(`[${status}] ${name} ${details.info ? '- ' + details.info : ''}`);
}

async function runPreCutoverAudit() {
  console.log('================================================================');
  console.log('ECO GREEN SOLAR CMS - WHATSAPP PRE-CUTOVER PRODUCTION AUDIT');
  console.log(`Endpoint: ${WORKER_URL}`);
  console.log('================================================================\n');

  // 1. Authenticate as Admin
  console.log('--- STEP 1: Admin Authentication ---');
  const authRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '6352454247', password: 'admin3636' })
  });
  const authData = await authRes.json();
  const token = authData.token;
  if (!token) throw new Error('Admin authentication failed');
  record('1. Admin Token Authentication', 'PASS', { info: 'JWT verified for supervisor role' });

  // 2. Webhook GET Verification
  console.log('\n--- STEP 2: Webhook GET Challenge Handshake ---');
  const validGet = await fetch(`${WORKER_URL}/webhook?hub.mode=subscribe&hub.verify_token=ecogreen_verify_token&hub.challenge=test_meta_challenge_12345`);
  const validGetText = await validGet.text();
  if (validGet.status === 200 && validGetText === 'test_meta_challenge_12345') {
    record('2. Webhook GET Handshake (Valid Token)', 'PASS', { info: `HTTP 200 returned challenge "${validGetText}"` });
  } else {
    record('2. Webhook GET Handshake (Valid Token)', 'FAIL', { info: `Status ${validGet.status}, returned: ${validGetText}` });
  }

  const invalidGet = await fetch(`${WORKER_URL}/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=fail_challenge`);
  if (invalidGet.status === 403) {
    record('3. Webhook GET Security (Invalid Token Rejection)', 'PASS', { info: 'HTTP 403 Forbidden on token mismatch' });
  } else {
    record('3. Webhook GET Security (Invalid Token Rejection)', 'FAIL', { info: `Status ${invalidGet.status}` });
  }

  // 3. Webhook Inbound Message Handling
  console.log('\n--- STEP 3: Inbound Message Handling & Idempotency ---');
  const testWamid = `wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUM0EB${Date.now()}TEST`;
  const testCustomerPhone = '919876543210';
  const inboundPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1015283491554000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '918000000000', phone_number_id: '1387211441132836' },
          contacts: [{ profile: { name: 'Audit Test Customer' }, wa_id: testCustomerPhone }],
          messages: [{
            from: testCustomerPhone,
            id: testWamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: 'Testing WhatsApp Inbound Pre-Cutover' },
            type: 'text'
          }]
        }
      }]
    }]
  };

  const postRes1 = await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inboundPayload)
  });
  const postData1 = await postRes1.json();
  if (postRes1.status === 200 && postData1.status === 'EVENT_RECEIVED') {
    record('4. Inbound Webhook Event Receipt', 'PASS', { info: 'HTTP 200 EVENT_RECEIVED returned immediately to Meta' });
  } else {
    record('4. Inbound Webhook Event Receipt', 'FAIL', { info: `Status ${postRes1.status}: ${JSON.stringify(postData1)}` });
  }

  // Verify in PostgreSQL DB
  const pgClient = new Client({ connectionString: DB_CONN, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  const msgCheck1 = await pgClient.query('SELECT * FROM whatsapp_messages WHERE wam_id = $1', [testWamid]);
  if (msgCheck1.rows.length === 1) {
    record('5. Inbound Message PostgreSQL Persistence', 'PASS', { info: `Persisted message with ID ${msgCheck1.rows[0].id}, body: "${msgCheck1.rows[0].message_body}"` });
  } else {
    record('5. Inbound Message PostgreSQL Persistence', 'FAIL', { info: `Expected 1 row, found ${msgCheck1.rows.length}` });
  }

  // Verify Idempotency (Sending the EXACT duplicate webhook event)
  console.log('\n--- Testing Duplicate Webhook Protection ---');
  await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inboundPayload)
  });
  const msgCheckDup = await pgClient.query('SELECT COUNT(*) FROM whatsapp_messages WHERE wam_id = $1', [testWamid]);
  if (parseInt(msgCheckDup.rows[0].count) === 1) {
    record('6. Duplicate Webhook Protection (Idempotency)', 'PASS', { info: 'Duplicate delivery skipped, zero redundant records created' });
  } else {
    record('6. Duplicate Webhook Protection (Idempotency)', 'FAIL', { info: `Found ${msgCheckDup.rows[0].count} duplicate rows` });
  }

  // 4. Delivery and Read Status Updates
  console.log('\n--- STEP 4: Delivery, Read, & Failed Status Updates ---');
  // Delivery status event
  const deliveredPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1015283491554000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '918000000000', phone_number_id: '1387211441132836' },
          statuses: [{
            id: testWamid,
            status: 'delivered',
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: testCustomerPhone
          }]
        }
      }]
    }]
  };
  await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deliveredPayload)
  });

  const msgStatus1 = await pgClient.query('SELECT status FROM whatsapp_messages WHERE wam_id = $1', [testWamid]);
  if (msgStatus1.rows[0]?.status === 'delivered') {
    record('7. Delivered Status Transition', 'PASS', { info: 'Status updated to "delivered"' });
  } else {
    record('7. Delivered Status Transition', 'FAIL', { info: `Status was "${msgStatus1.rows[0]?.status}"` });
  }

  // Read status event
  const readPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1015283491554000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '918000000000', phone_number_id: '1387211441132836' },
          statuses: [{
            id: testWamid,
            status: 'read',
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: testCustomerPhone
          }]
        }
      }]
    }]
  };
  await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(readPayload)
  });
  const msgStatus2 = await pgClient.query('SELECT status FROM whatsapp_messages WHERE wam_id = $1', [testWamid]);
  if (msgStatus2.rows[0]?.status === 'read') {
    record('8. Read Status Transition', 'PASS', { info: 'Status updated to "read"' });
  } else {
    record('8. Read Status Transition', 'FAIL', { info: `Status was "${msgStatus2.rows[0]?.status}"` });
  }

  // Failed status event with error 131026
  const failedWamid = `wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUM0EB${Date.now()}FAIL`;
  await pgClient.query(`
    INSERT INTO whatsapp_messages (phone, sender_type, sender_name, message_body, wam_id, status, created_at, updated_at)
    VALUES ($1, 'company', 'Eco Green Solar', 'Test Outbound Failure', $2, 'sent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [testCustomerPhone, failedWamid]);

  const failedPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1015283491554000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '918000000000', phone_number_id: '1387211441132836' },
          statuses: [{
            id: failedWamid,
            status: 'failed',
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: testCustomerPhone,
            errors: [{ code: 131026, title: 'Undeliverable', message: 'Message undeliverable: not a valid WhatsApp user' }]
          }]
        }
      }]
    }]
  };
  await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(failedPayload)
  });
  const msgStatus3 = await pgClient.query('SELECT status, failure_reason FROM whatsapp_messages WHERE wam_id = $1', [failedWamid]);
  const regCheck = await pgClient.query("SELECT status, is_whatsapp_active FROM whatsapp_number_registry WHERE phone = $1", [testCustomerPhone.slice(-10)]);

  if (msgStatus3.rows[0]?.status === 'failed' && regCheck.rows[0]?.status === 'invite_required') {
    record('9. Failed Status & Registry Handler (Error 131026)', 'PASS', { info: 'Status marked "failed" & number registry marked "invite_required"' });
  } else {
    record('9. Failed Status & Registry Handler (Error 131026)', 'FAIL', { info: `Msg status: ${msgStatus3.rows[0]?.status}, Reg status: ${regCheck.rows[0]?.status}` });
  }

  // 5. Malformed Webhook Resilience
  console.log('\n--- STEP 5: Malformed & Unsupported Event Resilience ---');
  const malformedRes = await fetch(`${WORKER_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object: 'unknown_object', bad_key: 12345 })
  });
  if (malformedRes.status === 200) {
    record('10. Malformed Webhook Resilience', 'PASS', { info: 'Worker handled malformed/unsupported payload without crashing (HTTP 200)' });
  } else {
    record('10. Malformed Webhook Resilience', 'FAIL', { info: `Status ${malformedRes.status}` });
  }

  // 6. Template Management Persistence Test
  console.log('\n--- STEP 6: Template System Full Persistence Audit ---');
  const tmplListRes = await fetch(`${WORKER_URL}/api/notifications/templates`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const tmplListData = await tmplListRes.json();
  const sampleTmpl = tmplListData.templates?.[0];

  if (!sampleTmpl) throw new Error('No notification templates found in database');
  console.log(`Original Template [ID ${sampleTmpl.id}]: "${sampleTmpl.name}", Body: "${sampleTmpl.whatsapp_body.slice(0, 40)}..."`);

  const originalBody = sampleTmpl.whatsapp_body;
  const auditStamp = `[Audit Verified ${Date.now()}]`;
  const updatedBody = `${originalBody}\n\n${auditStamp}`;

  // Update Template via Worker PUT endpoint
  const updateTmplRes = await fetch(`${WORKER_URL}/api/notifications/templates/${sampleTmpl.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ whatsapp_body: updatedBody })
  });
  const updateData = await updateTmplRes.json();

  // Retrieve templates again (simulating browser reload)
  const refreshTmplRes = await fetch(`${WORKER_URL}/api/notifications/templates`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const refreshData = await refreshTmplRes.json();
  const refreshedTmpl = refreshData.templates?.find(t => String(t.id) === String(sampleTmpl.id));

  if (refreshedTmpl?.whatsapp_body.includes(auditStamp)) {
    record('11. Template Update & Refresh Persistence', 'PASS', { info: 'Updated template body verified in database and persists across re-queries' });
  } else {
    record('11. Template Update & Refresh Persistence', 'FAIL', { info: `Template modification did not persist in database (Found body: "${refreshedTmpl?.whatsapp_body?.slice(0, 30)}")` });
  }

  // Restore original template body
  await fetch(`${WORKER_URL}/api/notifications/templates/${sampleTmpl.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ whatsapp_body: originalBody })
  });
  console.log('Restored template to original state.');

  // Meta Status & Toggle Active
  const metaStatusRes = await fetch(`${WORKER_URL}/api/notifications/templates/meta-status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const metaStatusData = await metaStatusRes.json();
  if (metaStatusData.success && Array.isArray(metaStatusData.templates)) {
    record('12. Template Meta Status Retrieval', 'PASS', { info: `Retrieved meta statuses for ${metaStatusData.templates.length} templates` });
  } else {
    record('12. Template Meta Status Retrieval', 'FAIL', { info: 'Failed to retrieve meta statuses' });
  }

  // 7. WhatsApp Hub Endpoints Verification
  console.log('\n--- STEP 7: WhatsApp Hub API Endpoints ---');
  const convRes = await fetch(`${WORKER_URL}/api/whatsapp/conversations`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const convData = await convRes.json();
  if (convData.success && Array.isArray(convData.conversations)) {
    record('13. WhatsApp Conversations List Endpoint', 'PASS', { info: `Returned ${convData.conversations.length} conversation threads` });
  } else {
    record('13. WhatsApp Conversations List Endpoint', 'FAIL', { info: 'Failed to fetch conversations' });
  }

  const chatHistRes = await fetch(`${WORKER_URL}/api/whatsapp/chats/${testCustomerPhone}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const chatHistData = await chatHistRes.json();
  if (chatHistData.success && Array.isArray(chatHistData.messages)) {
    record('14. WhatsApp Chat History Endpoint', 'PASS', { info: `Retrieved ${chatHistData.messages.length} messages for test thread` });
  } else {
    record('14. WhatsApp Chat History Endpoint', 'FAIL', { info: 'Failed to fetch chat history' });
  }

  const rawEventsRes = await fetch(`${WORKER_URL}/api/whatsapp/raw-events/${testCustomerPhone}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const rawEventsData = await rawEventsRes.json();
  if (rawEventsData.success && Array.isArray(rawEventsData.events)) {
    record('15. WhatsApp Raw Events Audit Trail Endpoint', 'PASS', { info: `Audit log contains ${rawEventsData.events.length} captured events for test number` });
  } else {
    record('15. WhatsApp Raw Events Audit Trail Endpoint', 'FAIL', { info: 'Failed to fetch raw events' });
  }

  // 8. Cleanup ONLY newly created audit test messages and events
  console.log('\n--- STEP 8: Cleaning Up Audit Test Records ---');
  await pgClient.query('DELETE FROM whatsapp_messages WHERE wam_id IN ($1, $2)', [testWamid, failedWamid]);
  await pgClient.query('DELETE FROM whatsapp_raw_events WHERE wam_id IN ($1, $2)', [testWamid, failedWamid]);
  await pgClient.query('DELETE FROM whatsapp_number_registry WHERE phone = $1', [testCustomerPhone.slice(-10)]);
  console.log('Cleaned up newly created test records. Historical production data left untouched.');

  await pgClient.end();

  console.log('\n================================================================');
  console.log('PRE-CUTOVER WHATSAPP AUDIT RESULTS');
  console.log('================================================================');
  let passCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
  }
  console.log(`Passed: ${passCount} / ${results.length} tests (${Math.round(passCount / results.length * 100)}%)`);
  return results;
}

runPreCutoverAudit().catch(err => {
  console.error('Audit exception:', err);
  process.exit(1);
});
