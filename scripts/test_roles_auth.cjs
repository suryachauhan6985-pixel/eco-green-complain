const fetch = globalThis.fetch;

const WORKER_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

async function run() {
  console.log('1. Admin Login...');
  const loginRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '6352454247', password: 'admin3636' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  console.log('[PASS] Admin login success. Role:', loginData.user.role);
  const token = loginData.token;

  console.log('\n2. Reset Staff Password to staff3636 via Admin API...');
  const resetStaff = await fetch(`${WORKER_URL}/api/auth/admin-reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ user_id: '13', new_password: 'staff3636' })
  });
  const staffResetData = await resetStaff.json();
  console.log('[PASS] Staff reset:', staffResetData.message);

  console.log('\n3. Reset Tech Password to tech3636 via Admin API...');
  const resetTech = await fetch(`${WORKER_URL}/api/auth/admin-reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ user_id: '12', new_password: 'tech3636' })
  });
  const techResetData = await resetTech.json();
  console.log('[PASS] Tech reset:', techResetData.message);

  console.log('\n4. Verify Staff Login (6354687931 / staff3636)...');
  const staffLoginRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '6354687931', password: 'staff3636' })
  });
  const staffLoginData = await staffLoginRes.json();
  if (!staffLoginRes.ok) throw new Error(`Staff login failed: ${JSON.stringify(staffLoginData)}`);
  console.log('[PASS] Staff login success! Role:', staffLoginData.user.role, 'Name:', staffLoginData.user.name);

  console.log('\n5. Verify Tech Login (8141349909 / tech3636)...');
  const techLoginRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '8141349909', password: 'tech3636' })
  });
  const techLoginData = await techLoginRes.json();
  if (!techLoginRes.ok) throw new Error(`Tech login failed: ${JSON.stringify(techLoginData)}`);
  console.log('[PASS] Tech login success! Role:', techLoginData.user.role, 'Name:', techLoginData.user.name);
}

run().catch(console.error);
