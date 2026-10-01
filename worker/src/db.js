import { Client } from 'pg';

export async function query(sql, params = [], env = {}, ctx = null) {
  const connStr = env?.HYPERDRIVE?.connectionString || env?.DATABASE_URL || 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const client = new Client({ connectionString: connStr });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(client.end().catch(() => {}));
    }
    return res;
  } catch (err) {
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(client.end().catch(() => {}));
    }
    throw err;
  }
}

