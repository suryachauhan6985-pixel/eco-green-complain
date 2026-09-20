const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

class SupabaseConfig {
  constructor() {
    this.client = null;
    this.isEnabled = false;
    this.init();
  }

  init() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        this.client = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        });
        this.isEnabled = true;
        console.log(`[Supabase] ✅ Initialized Supabase client for: ${supabaseUrl}`);
      } catch (err) {
        console.error('[Supabase] ❌ Failed to initialize Supabase client:', err.message);
        this.isEnabled = false;
      }
    } else {
      console.log('[Supabase] ℹ️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Running in local/Turso database mode.');
    }
  }

  getClient() {
    return this.client;
  }

  async testConnection() {
    if (!this.isEnabled || !this.client) {
      return { success: false, message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env' };
    }

    try {
      // Test querying users table or auth health
      const { data, error } = await this.client.from('users').select('count', { count: 'exact', head: true });
      if (error) {
        // If table doesn't exist yet, it's still connected to Supabase
        if (error.code === '42P01') {
          return { success: true, message: 'Connected to Supabase successfully! (Tables not created yet - run supabase_schema.sql in SQL Editor)' };
        }
        return { success: false, message: error.message };
      }
      return { success: true, message: 'Connected to Supabase successfully!', count: data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

const supabaseConfig = new SupabaseConfig();
module.exports = supabaseConfig;
