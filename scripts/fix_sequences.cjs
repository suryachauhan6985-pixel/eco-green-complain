const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL...');

  const fixP = await client.query("SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE(MAX(id), 1)) FROM products;");
  console.log('Products sequence reset to MAX(id):', fixP.rows[0]);

  const fixC = await client.query("SELECT setval(pg_get_serial_sequence('issue_categories', 'id'), COALESCE(MAX(id), 1)) FROM issue_categories;");
  console.log('Issue categories sequence reset to MAX(id):', fixC.rows[0]);

  await client.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Error:', err);
  client.end();
  process.exit(1);
});
