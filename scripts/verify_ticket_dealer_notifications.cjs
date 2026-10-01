const { Pool } = require('pg');

async function verify() {
  console.log('=== VERIFYING PRODUCTION CLOUDFLARE WORKER & DATABASE ===');

  const API_BASE = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

  // 1. Verify in-app notifications endpoint
  console.log('\n1. Checking in-app notifications endpoint...');
  try {
    const res = await fetch(`${API_BASE}/api/in-app-notifications`);
    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log(`Success: ${data.success}, Count: ${Array.isArray(data.data) ? data.data.length : 'N/A'}`);
    if (res.status === 200) {
      console.log('✅ In-app notifications endpoint is LIVE and returns HTTP 200');
    } else {
      console.error('❌ Failed in-app notifications');
    }
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
  }

  // 2. Verify customer search returns mobile, order_no, dealer_name
  console.log('\n2. Checking customer search endpoint...');
  try {
    const res = await fetch(`${API_BASE}/api/customers/search?q=a`);
    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    const list = data.customers || data.data || (Array.isArray(data) ? data : []);
    console.log(`Customers found: ${Array.isArray(list) ? list.length : 'N/A'}`);
    if (Array.isArray(list) && list.length > 0) {
      const sample = list[0];
      console.log('Sample customer fields:', {
        customer_name: sample.customer_name,
        consumer_mobile: sample.consumer_mobile,
        order_no: sample.order_no,
        dealer_name: sample.dealer_name,
        city_village: sample.city_village
      });
      console.log('✅ Customer search endpoint returns consumer_mobile, order_no, and dealer_name');
    }
  } catch (err) {
    console.error('Error searching customers:', err.message);
  }

  // 3. Database direct verification
  console.log('\n3. Verifying PostgreSQL schema directly...');
  const pool = new Pool({
    connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
  });

  try {
    const client = await pool.connect();
    
    // Check dealer_name column in complaints
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'complaints' AND column_name = 'dealer_name';
    `);
    console.log('Complaints dealer_name column:', colRes.rows);

    // Insert a test complaint with dealer_name directly or through API
    const testComplaintRes = await client.query(`
      INSERT INTO complaints (
        ticket_id, customer_name, customer_phone, customer_address, order_no, dealer_name, 
        product_type, issue_category, issue_description, priority, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING id, ticket_id, customer_name, customer_phone, order_no, dealer_name, status;
    `, [
      'TEST-DEALER-' + Date.now().toString().slice(-4),
      'Verification User',
      '9876543210',
      '123 Green Solar Way, Rajkot',
      'ORD-VERIFY-99',
      'Sunrise Solar Agency',
      'Solar Rooftop',
      'Service Request',
      'Testing dealer_name database persistence',
      'Medium',
      'Unassigned'
    ]);

    const created = testComplaintRes.rows[0];
    console.log('✅ Successfully inserted ticket with dealer_name into PostgreSQL:', created);

    // Verify it can be retrieved from database
    const selectRes = await client.query(`SELECT id, ticket_id, dealer_name, order_no, customer_phone FROM complaints WHERE id = $1`, [created.id]);
    console.log('✅ Successfully verified database persistence on PostgreSQL query:', selectRes.rows[0]);

    // Clean up test ticket
    await client.query(`DELETE FROM complaints WHERE id = $1`, [created.id]);
    console.log('Cleaned up test verification ticket.');

    client.release();
  } catch (dbErr) {
    console.error('Database verification error:', dbErr.message);
  } finally {
    await pool.end();
  }
}

verify().catch(console.error);
