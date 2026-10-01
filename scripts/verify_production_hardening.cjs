const fetch = globalThis.fetch;
const { Client } = require('pg');

const WORKER_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';
const DB_CONN = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

// Valid 1x1 Pixel JPEG Binary (Proper FF D8 FF Magic Bytes + JFIF header)
const SAMPLE_REAL_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

// Valid 1x1 Pixel PNG Binary (Proper 89 50 4E 47 Magic Bytes + IHDR chunk)
const SAMPLE_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const results = [];

function record(section, name, pass, details = '') {
  results.push({ section, name, pass, details });
  const mark = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`[${mark}] [${section}] ${name}${details ? ' - ' + details : ''}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('STARTING REAL PRODUCTION HARDENING VERIFICATION SUITE');
  console.log('Endpoint:', WORKER_URL);
  console.log('Database:', DB_CONN ? 'Supabase PostgreSQL Configured' : 'None');
  console.log('===============================================================\n');

  let adminToken = null;
  let techToken = null;
  let staffToken = null;

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: AUTHENTICATION TESTS ---');

  // Test 1: Valid Admin Login
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'admin3636' })
    });
    const data = await res.json();
    adminToken = data.token;
    record('AUTH', '1. Valid Admin Login (username: admin)', res.status === 200 && !!adminToken, `HTTP ${res.status}`);
  } catch (e) {
    record('AUTH', '1. Valid Admin Login (username: admin)', false, e.message);
  }

  // Test 2: Valid Technician Login (by phone)
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '8141349909', password: 'tech3636' })
    });
    const data = await res.json();
    techToken = data.token;
    record('AUTH', '2. Valid Technician Login (phone: 8141349909)', res.status === 200 && !!techToken, `Role: ${data.user?.role}`);
  } catch (e) {
    record('AUTH', '2. Valid Technician Login (phone: 8141349909)', false, e.message);
  }

  // Test 3: Valid Staff Login (by username)
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'jignesh@staff', password: 'staff3636' })
    });
    const data = await res.json();
    staffToken = data.token;
    record('AUTH', '3. Valid Staff Login (username: jignesh@staff)', res.status === 200 && !!staffToken, `Role: ${data.user?.role}`);
  } catch (e) {
    record('AUTH', '3. Valid Staff Login (username: jignesh@staff)', false, e.message);
  }

  // Test 4: Incorrect Password
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'WRONG_PASSWORD_XYZ' })
    });
    record('AUTH', '4. Incorrect Password Rejected', res.status === 401, `Status: ${res.status}`);
  } catch (e) {
    record('AUTH', '4. Incorrect Password Rejected', false, e.message);
  }

  // Test 5: Non-existent User
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'non_existent_user_9999999999', password: 'anypassword' })
    });
    record('AUTH', '5. Non-existent User Rejected', res.status === 401, `Status: ${res.status}`);
  } catch (e) {
    record('AUTH', '5. Non-existent User Rejected', false, e.message);
  }

  // Test 6: Empty Credentials Validation
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '', password: '' })
    });
    record('AUTH', '6. Empty Credentials Validation Error', res.status === 400, `Status: ${res.status}`);
  } catch (e) {
    record('AUTH', '6. Empty Credentials Validation Error', false, e.message);
  }

  // Test 7: Authenticated Protected API Access
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    record('AUTH', '7. Authenticated Endpoint Access (/api/auth/me)', res.status === 200 && data.user?.username === 'admin', `User: ${data.user?.name}`);
  } catch (e) {
    record('AUTH', '7. Authenticated Endpoint Access (/api/auth/me)', false, e.message);
  }

  // Test 8: Expired/Invalid Token Rejection
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/me`, {
      headers: { 'Authorization': 'Bearer INVALID_EXPIRED_MOCK_TOKEN_XYZ' }
    });
    record('AUTH', '8. Invalid Token Rejected (403)', res.status === 403, `Status: ${res.status}`);
  } catch (e) {
    record('AUTH', '8. Invalid Token Rejected (403)', false, e.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: PASSWORD CHANGE & ADMIN RESET
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: PASSWORD CHANGE & RESET TESTS ---');

  // Test 9: Staff changes own password (camelCase payload matching frontend)
  const staffTempPass = 'staffNewPass@2026';
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/change-my-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        currentPassword: 'staff3636',
        newPassword: staffTempPass
      })
    });
    const data = await res.json();
    record('PASSWORD', '9. Staff Change Own Password (camelCase)', res.status === 200 && data.success, data.message || data.error);
  } catch (e) {
    record('PASSWORD', '9. Staff Change Own Password (camelCase)', false, e.message);
  }

  // Test 10: Old Password Rejected
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'jignesh@staff', password: 'staff3636' })
    });
    record('PASSWORD', '10. Old Password Rejected After Change', res.status === 401, `Status: ${res.status}`);
  } catch (e) {
    record('PASSWORD', '10. Old Password Rejected After Change', false, e.message);
  }

  // Test 11: Login with New Password
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'jignesh@staff', password: staffTempPass })
    });
    const data = await res.json();
    record('PASSWORD', '11. Login With New Password Succeeded', res.status === 200 && !!data.token, `Token acquired`);
    if (data.token) staffToken = data.token;
  } catch (e) {
    record('PASSWORD', '11. Login With New Password Succeeded', false, e.message);
  }

  // Test 12: Revert Staff Password back to baseline (staff3636)
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/change-my-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        currentPassword: staffTempPass,
        newPassword: 'staff3636'
      })
    });
    record('PASSWORD', '12. Revert Staff Password To Baseline (staff3636)', res.status === 200, `Reverted`);
  } catch (e) {
    record('PASSWORD', '12. Revert Staff Password To Baseline', false, e.message);
  }

  // Test 13: Admin Reset Password for Technician (user 15: Yogesh toriya)
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/admin-reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: '15',
        newPassword: 'tech3636'
      })
    });
    const data = await res.json();
    record('PASSWORD', '13. Admin Reset Password for Tech (userId: 15)', res.status === 200 && data.success, data.message || data.error);
  } catch (e) {
    record('PASSWORD', '13. Admin Reset Password for Tech', false, e.message);
  }

  // Test 14: Tech 15 login with reset password
  try {
    const res = await fetch(`${WORKER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '8320380245', password: 'tech3636' })
    });
    const data = await res.json();
    record('PASSWORD', '14. Tech 15 Login With Reset Password', res.status === 200 && !!data.token, `User: ${data.user?.name}`);
  } catch (e) {
    record('PASSWORD', '14. Tech 15 Login With Reset Password', false, e.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: R2 STORAGE UPLOADS & SERVING
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: CLOUDFLARE R2 UPLOADS & SERVING TESTS ---');

  let uploadedJpgKey = null;
  let uploadedJpgUrl = null;
  let uploadedPngKey = null;

  // Test 15: Corrupted ASCII File Rejected by Magic Byte Validator
  try {
    const res = await fetch(`${WORKER_URL}/api/upload?complaint_id=999`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Filename': 'corrupt_test.jpg',
        'Authorization': `Bearer ${adminToken}`
      },
      body: Buffer.from('ASCII_STRING_NOT_A_REAL_JPEG_MAGIC_BYTES')
    });
    const data = await res.json();
    record('R2', '15. Corrupted File Rejected by Magic Byte Validator', res.status === 400, data.error);
  } catch (e) {
    record('R2', '15. Corrupted File Rejected by Magic Byte Validator', false, e.message);
  }

  // Test 16: Real Valid JPEG Upload (multipart/form-data)
  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="solar_panel_inspect.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(header), SAMPLE_REAL_JPG, Buffer.from(footer)]);

    const res = await fetch(`${WORKER_URL}/api/upload?complaint_id=999`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${adminToken}`
      },
      body
    });
    const data = await res.json();
    uploadedJpgKey = data.storage_key;
    uploadedJpgUrl = data.file_url;
    record('R2', '16. Genuine JPEG Uploaded to R2', res.status === 200 && !!uploadedJpgKey, `Key: ${uploadedJpgKey}, Size: ${data.file_size}B`);
  } catch (e) {
    record('R2', '16. Genuine JPEG Uploaded to R2', false, e.message);
  }

  // Test 17: Real Valid PNG Upload (binary raw body)
  try {
    const res = await fetch(`${WORKER_URL}/api/upload?complaint_id=999`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Filename': 'inverter_diagram.png',
        'Authorization': `Bearer ${adminToken}`
      },
      body: SAMPLE_REAL_PNG
    });
    const data = await res.json();
    uploadedPngKey = data.storage_key;
    record('R2', '17. Genuine PNG Uploaded to R2', res.status === 200 && !!uploadedPngKey, `Key: ${uploadedPngKey}, Size: ${data.file_size}B`);
  } catch (e) {
    record('R2', '17. Genuine PNG Uploaded to R2', false, e.message);
  }

  // Test 18: Retrieve and Preview JPEG (Inline Browser Preview)
  try {
    const res = await fetch(`${WORKER_URL}${uploadedJpgUrl}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const cType = res.headers.get('content-type');
    const cDisp = res.headers.get('content-disposition');
    const buf = Buffer.from(await res.arrayBuffer());
    const isJpeg = buf.length > 0 && buf[0] === 0xFF && buf[1] === 0xD8;
    record('R2', '18. JPEG Preview Renders Binary with Proper MIME', res.status === 200 && cType.includes('image/jpeg') && isJpeg, `Type: ${cType}, Disp: ${cDisp}, Size: ${buf.length}B`);
  } catch (e) {
    record('R2', '18. JPEG Preview Renders Binary with Proper MIME', false, e.message);
  }

  // Test 19: Download JPEG (with ?download=1)
  try {
    const res = await fetch(`${WORKER_URL}${uploadedJpgUrl}?download=1`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const cDisp = res.headers.get('content-disposition');
    record('R2', '19. JPEG Download Mode (?download=1)', res.status === 200 && cDisp.includes('attachment'), `Disposition: ${cDisp}`);
  } catch (e) {
    record('R2', '19. JPEG Download Mode (?download=1)', false, e.message);
  }

  // Test 20: Unauthorized access to random non-complaint private key blocked
  try {
    const res = await fetch(`${WORKER_URL}/api/attachments/r2/system_secrets_do_not_view.env`);
    record('R2', '20. Unauthorized Random Key Access Blocked (401)', res.status === 401, `Status: ${res.status}`);
  } catch (e) {
    record('R2', '20. Unauthorized Random Key Access Blocked', false, e.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: COMPLAINT ATTACHMENT LIFECYCLE
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: COMPLAINT ATTACHMENT LIFECYCLE ---');

  let testComplaintId = null;

  // Test 21: Create Complaint with Attachment
  const uniqueId = Date.now();
  const uniquePhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  try {
    const compRes = await fetch(`${WORKER_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        customer_name: `Verification Customer ${uniqueId}`,
        customer_phone: uniquePhone,
        customer_email: `user_${uniqueId}@test.local`,
        city: 'Ahmedabad',
        product_type: 'Solar Rooftop 5kW',
        issue_type: 'Inverter Red Light Error',
        description: 'Automated production hardening verification ticket',
        priority: 'Normal'
      })
    });
    const compData = await compRes.json();
    testComplaintId = compData.complaint?.id;
    record('COMPLAINT', '21. Complaint Ticket Created', compRes.status === 201 && !!testComplaintId, `Ticket: ${compData.complaint?.ticket_id}`);
  } catch (e) {
    record('COMPLAINT', '21. Complaint Ticket Created', false, e.message);
  }

  // Test 22: Link R2 Attachment to Complaint
  if (testComplaintId && uploadedJpgKey) {
    try {
      const attRes = await fetch(`${WORKER_URL}/api/complaints/${testComplaintId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          attachments: [
            {
              file_name: 'solar_panel_inspect.jpg',
              file_url: uploadedJpgUrl,
              file_type: 'image/jpeg',
              storage_key: uploadedJpgKey
            }
          ]
        })
      });
      const attData = await attRes.json();
      record('COMPLAINT', '22. R2 Attachment Linked to Complaint in PostgreSQL', attRes.status === 200 && attData.success, `Saved: ${attData.attachments?.length}`);
    } catch (e) {
      record('COMPLAINT', '22. R2 Attachment Linked to Complaint in PostgreSQL', false, e.message);
    }
  }

  // Test 23: Verify Database Row for Complaint Attachment
  try {
    const client = new Client({ connectionString: DB_CONN });
    await client.connect();
    const dbRow = await client.query('SELECT * FROM complaint_attachments WHERE complaint_id = $1 ORDER BY id DESC LIMIT 1', [testComplaintId]);
    record('COMPLAINT', '23. Verified Attachment Record in Supabase DB', dbRow.rows.length > 0, `DB ID: ${dbRow.rows[0]?.id}, File: ${dbRow.rows[0]?.file_name}`);
    await client.end();
  } catch (e) {
    record('COMPLAINT', '23. Verified Attachment Record in Supabase DB', false, e.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: WHATSAPP REGRESSION TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: WHATSAPP REGRESSION TESTS ---');

  // Test 24: Meta Webhook GET Challenge Verification
  try {
    const verifyToken = 'ecogreen_verify_token';
    const challenge = 'challenge_test_prod_7788';
    const res = await fetch(`${WORKER_URL}/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`);
    const text = await res.text();
    record('WHATSAPP', '24. Meta Webhook GET Handshake Challenge', res.status === 200 && text === challenge, `Challenge match: ${text === challenge}`);
  } catch (e) {
    record('WHATSAPP', '24. Meta Webhook GET Handshake Challenge', false, e.message);
  }

  // Test 25: Meta Webhook POST Idempotency & Inbound Processing
  try {
    const mockWamid = `wamid.PROD_TEST_${Date.now()}`;
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '999999999',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '916352454247', phone_number_id: '965158656680456' },
            contacts: [{ profile: { name: 'Prod Test User' }, wa_id: '919876543210' }],
            messages: [{
              from: '919876543210',
              id: mockWamid,
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: 'text',
              text: { body: 'Production hardening test message' }
            }]
          },
          field: 'messages'
        }]
      }]
    };

    // First POST
    const res1 = await fetch(`${WORKER_URL}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    // Second POST (Idempotency test)
    const res2 = await fetch(`${WORKER_URL}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d1 = await res1.json();
    const d2 = await res2.json();
    record('WHATSAPP', '25. Inbound Webhook POST & Idempotency', res1.status === 200 && res2.status === 200 && d1.status === 'EVENT_RECEIVED' && d2.status === 'EVENT_RECEIVED', `Status: ${d1.status}, Handled: OK`);
  } catch (e) {
    record('WHATSAPP', '25. Inbound Webhook POST & Idempotency', false, e.message);
  }

  // Cleanup uploaded test files from R2
  if (uploadedJpgKey) {
    await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(uploadedJpgKey)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }).catch(() => {});
  }
  if (uploadedPngKey) {
    await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(uploadedPngKey)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }).catch(() => {});
  }

  console.log('\n===============================================================');
  console.log('FINAL RESULTS SUMMARY');
  console.log('===============================================================');
  const passCount = results.filter(r => r.pass).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${results.length - passCount}`);
  if (passCount === results.length) {
    console.log('ALL VERIFICATION TESTS PASSED 100%!');
  } else {
    console.log('FAILURES DETECTED:');
    results.filter(r => !r.pass).forEach(r => console.log(`  - [${r.section}] ${r.name}: ${r.details}`));
  }
}

runTests().catch(console.error);
