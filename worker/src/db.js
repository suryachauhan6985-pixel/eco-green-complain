import { Client } from 'pg';

export async function query(sql, params = [], env = {}, ctx = null) {
  const connStr = env?.HYPERDRIVE?.connectionString || env?.DATABASE_URL;
  if (!connStr) {
    throw new Error('Database connection configuration (HYPERDRIVE or DATABASE_URL) is required.');
  }
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

