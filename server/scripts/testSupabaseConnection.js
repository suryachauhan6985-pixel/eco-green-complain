const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabaseConfig = require('../config/supabase');

async function testConnection() {
  console.log('====================================================');
  console.log('  ECO GREEN SOLAR CMS - SUPABASE CONNECTION TEST');
  console.log('====================================================');
  console.log(`URL: ${process.env.SUPABASE_URL || '(Not set)'}`);
  console.log(`Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 15) + '...' : '(Not set)'}`);
  console.log('----------------------------------------------------');

  if (!supabaseConfig.isEnabled) {
    console.error('❌ Supabase is NOT configured in server/.env');
    console.log('\nPlease add the following lines to server/.env:');
    console.log('SUPABASE_URL=https://your-project-ref.supabase.co');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-or-anon-key\n');
    process.exit(1);
  }

  try {
    const res = await supabaseConfig.testConnection();
    if (res.success) {
      console.log('✅ ' + res.message);
      process.exit(0);
    } else {
      console.error('❌ Connection test failed:', res.message);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fatal error connecting to Supabase:', err.message);
    process.exit(1);
  }
}

testConnection();
