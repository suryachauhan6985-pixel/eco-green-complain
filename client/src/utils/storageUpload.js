/**
 * Supabase Storage Direct Upload Utility
 * Bypasses Vercel Serverless Function 4.5MB payload limit by streaming large files
 * (Photos, Videos, PDFs up to 50MB) directly to Supabase Cloud Storage.
 */

const SUPABASE_STORAGE_URL = 'https://pirlkhjljjnwuunpqwbb.supabase.co/storage/v1/object/attachments';
const SUPABASE_PUBLIC_URL = 'https://pirlkhjljjnwuunpqwbb.supabase.co/storage/v1/object/public/attachments';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcmxraGpsampud3V1bnBxd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTA5NjAsImV4cCI6MjEwNTQ2Njk2MH0.A1_AoY2tR6i4Y9A4zw5jsRSXGg-4H7EKH2dA8Q2L8Wg';

export async function uploadFileToSupabase(file) {
  if (!file) return null;
  
  if (file.size > 50 * 1024 * 1024) {
    throw new Error(`File "${file.name}" exceeds the 50MB limit.`);
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const cleanBase = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const uniqueName = `egs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanBase}.${ext}`;

  const res = await fetch(`${SUPABASE_STORAGE_URL}/${uniqueName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Supabase Storage Upload Error]', res.status, errText);
    throw new Error(`Cloud storage upload failed: ${errText || res.statusText}`);
  }

  const publicUrl = `${SUPABASE_PUBLIC_URL}/${uniqueName}`;
  return {
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
    file_url: publicUrl
  };
}

export async function uploadMultipleFilesToSupabase(files, onProgress) {
  if (!files || files.length === 0) return [];
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (onProgress) onProgress(i + 1, files.length, f.name);
    const uploaded = await uploadFileToSupabase(f);
    results.push(uploaded);
  }
  return results;
}
