const { Client } = require('pg');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Connected to Supabase PostgreSQL database.');

  try {
    const totalRes = await client.query('SELECT count(*) FROM complaint_attachments');
    const total = parseInt(totalRes.rows[0].count, 10);
    console.log(`Total complaint_attachments count: ${total}`);

    const typesRes = await client.query(`
      SELECT 
        COALESCE(file_type, 'unknown') as file_type, 
        count(*) as count 
      FROM complaint_attachments 
      GROUP BY file_type 
      ORDER BY count DESC
    `);
    console.log('\n--- Attachments by file_type ---');
    console.table(typesRes.rows);

    const storageTypeRes = await client.query(`
      SELECT 
        CASE 
          WHEN file_data LIKE 'data:%' THEN 'PostgreSQL Base64'
          WHEN file_url LIKE 'https://%' THEN 'External/Cloud URL'
          WHEN file_url LIKE 'r2://%' OR file_data LIKE 'r2://%' THEN 'Cloudflare R2'
          ELSE 'Other/Null'
        END as storage_mode,
        count(*) as count,
        round(sum(length(coalesce(file_data, '')))::numeric / (1024*1024), 2) as total_size_mb
      FROM complaint_attachments
      GROUP BY 1
    `);
    console.log('\n--- Storage Mode Breakdown ---');
    console.table(storageTypeRes.rows);

    // Sample 5 records to inspect columns
    const sampleRes = await client.query(`
      SELECT id, complaint_id, file_name, file_type, substring(file_url from 1 for 40) as sample_url, 
             substring(file_data from 1 for 30) as sample_data, length(coalesce(file_data, '')) as data_len, created_at
      FROM complaint_attachments
      ORDER BY id DESC
      LIMIT 5
    `);
    console.log('\n--- Sample 5 Latest Records ---');
    console.table(sampleRes.rows);

  } catch (err) {
    console.error('Error querying attachments:', err.message);
  } finally {
    await client.end();
  }
}

main();
