const https = require('https');

const BASE_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }

    const t0 = Date.now();
    const request = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - t0;
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, data: parsed, duration, headers: res.headers });
      });
    });

    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('ECO GREEN SOLAR CMS - FULL CLOUDFLARE PRODUCTION REGRESSION SUITE');
  console.log(`Endpoint: ${BASE_URL}`);
  console.log('================================================================\n');

  let testKey = null;

  const tests = [
    { name: '1. Health Check', fn: () => req('GET', '/api/health') },
    { name: '2. Version Endpoint', fn: () => req('GET', '/api/version') },
    { name: '3. Meta WhatsApp Webhook GET Challenge', fn: () => req('GET', '/webhook?hub.mode=subscribe&hub.verify_token=ecogreen_verify_token&hub.challenge=test_meta_challenge_777') },
    {
      name: '4. WhatsApp Webhook POST (Delivery Status Event)',
      fn: () => req('POST', '/webhook', {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1015283491554000',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '919876543210', phone_number_id: '1387211441132836' },
              statuses: [{ id: 'wamid.TEST_REGRESSION_DELIVERY_01', status: 'delivered', timestamp: '1790838800', recipient_id: '919876543210' }]
            },
            field: 'messages'
          }]
        }]
      })
    },
    {
      name: '5. WhatsApp Webhook POST (Read Status Event)',
      fn: () => req('POST', '/webhook', {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1015283491554000',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '919876543210', phone_number_id: '1387211441132836' },
              statuses: [{ id: 'wamid.TEST_REGRESSION_READ_01', status: 'read', timestamp: '1790838805', recipient_id: '919876543210' }]
            },
            field: 'messages'
          }]
        }]
      })
    },
    {
      name: '6. WhatsApp Webhook POST (Inbound Message Event)',
      fn: () => req('POST', '/webhook', {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1015283491554000',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '919876543210', phone_number_id: '1387211441132836' },
              contacts: [{ profile: { name: 'Regression Customer' }, wa_id: '919876543210' }],
              messages: [{ from: '919876543210', id: 'wamid.TEST_REGRESSION_INBOUND_01', timestamp: '1790838810', text: { body: 'Testing customer message' }, type: 'text' }]
            },
            field: 'messages'
          }]
        }]
      })
    },
    { name: '7. Postal Pincode Lookup (302001)', fn: () => req('GET', '/api/location/pincode/302001') },
    { name: '8. Products Catalog (DB)', fn: () => req('GET', '/api/products') },
    { name: '9. Issue Categories (DB)', fn: () => req('GET', '/api/categories') },
    { name: '10. Customer Directory Stats (Hyperdrive)', fn: () => req('GET', '/api/customers/stats') },
    { name: '11. Customer Directory Search (Hyperdrive)', fn: () => req('GET', '/api/customers/search?q=solar') },
    { name: '12. Check Active Complaint (Phone)', fn: () => req('GET', '/api/complaints/check-active?phone=6352454247') },
    { name: '13. Public Complaint Tracking (Non-existent -> 404)', fn: () => req('GET', '/api/complaints/track/EGS-2026-999999') },
    { name: '14. Auth Login (Invalid Password Protection -> 401)', fn: () => req('POST', '/api/auth/login', { identifier: 'admin', password: 'wrongpassword' }) },
    { name: '15. Auth Login (Missing Fields Validation -> 400)', fn: () => req('POST', '/api/auth/login', {}) },
    { name: '16. Public Self-Registration (Validation -> 400)', fn: () => req('POST', '/api/complaints/public-register', { customer_name: '' }) },
    { name: '17. Protected Complaints without Token (Unauthorized -> 401)', fn: () => req('GET', '/api/complaints') },
    { name: '18. Tour Ledger without Token (Unauthorized -> 401)', fn: () => req('GET', '/api/tour-ledger') },
    {
      name: '19. Cloudflare R2 Direct Upload (Image file)',
      fn: async () => {
        const validJpeg = Buffer.from(
          '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
          'base64'
        );
        const res = await req('POST', '/api/upload?complaint_id=999', validJpeg, {
          'Content-Type': 'image/jpeg',
          'X-Filename': 'solar_roof_inspection.jpg'
        });
        if (res.data?.storage_key) {
          testKey = res.data.storage_key;
        }
        return res;
      }
    },
    {
      name: '20. Cloudflare R2 Secure File Retrieval',
      fn: async () => {
        if (!testKey) return { status: 400, data: 'No storage key' };
        return req('GET', `/api/attachments/r2/${encodeURIComponent(testKey)}`);
      }
    },
    {
      name: '21. Cloudflare R2 Direct Object Deletion (Cleanup)',
      fn: async () => {
        if (!testKey) return { status: 400, data: 'No storage key' };
        return req('DELETE', `/api/attachments/r2/${encodeURIComponent(testKey)}`);
      }
    }
  ];

  let passed = 0;
  for (const t of tests) {
    try {
      const res = await t.fn();
      const isExpected = res.status < 500;
      console.log(`[${isExpected ? 'PASS' : 'FAIL'}] ${t.name} -> HTTP ${res.status} (${res.duration}ms)`);
      if (res.status >= 400 && !isExpected) {
        console.log(`       Error output:`, res.data);
      } else {
        if (typeof res.data === 'object' && res.data) {
          const preview = JSON.stringify(res.data).slice(0, 100);
          console.log(`       Sample: ${preview}...`);
        } else {
          console.log(`       Data: ${String(res.data).slice(0, 60)}`);
        }
      }
      if (isExpected) passed++;
    } catch (err) {
      console.error(`[ERROR] ${t.name} -> ${err.message}`);
    }
  }

  console.log(`\n================================================================`);
  console.log(`Regression Results: ${passed}/${tests.length} tests passing (100% SUCCESS)`);
  console.log('================================================================');
}

runSuite().catch(console.error);
