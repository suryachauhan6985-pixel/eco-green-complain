/**
 * Supabase Storage Direct Upload Utility
 * Bypasses Vercel Serverless Function 4.5MB payload limit by streaming large files
 * (Photos, Videos, PDFs up to 50MB) directly to Supabase Cloud Storage.
 */

const SUPABASE_STORAGE_URL = 'https://pirlkhjljjnwuunpqwbb.supabase.co/storage/v1/object/attachments';
const SUPABASE_PUBLIC_URL = 'https://pirlkhjljjnwuunpqwbb.supabase.co/storage/v1/object/public/attachments';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcmxraGpsampud3V1bnBxd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTA5NjAsImV4cCI6MjEwNTQ2Njk2MH0.A1_AoY2tR6i4Y9A4zw5jsRSXGg-4H7EKH2dA8Q2L8Wg';

/**
 * Compress an image file in the browser using HTML Canvas before upload.
 * Reduces 8MB-15MB smartphone camera photos down to crisp ~300KB-600KB JPEGs.
 * Non-image files (PDFs, videos) pass through untouched.
 */
export async function compressImageFile(file, maxWidth = 1920, maxHeight = 1920, quality = 0.82) {
  if (!file) return file;
  if (!file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }
  // If already very small (< 250KB), no need to compress
  if (file.size < 250 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (!blob || blob.size >= file.size) {
                  resolve(file);
                } else {
                  const compressedFile = new File(
                    [blob],
                    file.name.replace(/\.[^.]+$/, '.jpg'),
                    { type: 'image/jpeg', lastModified: Date.now() }
                  );
                  resolve(compressedFile);
                }
              },
              'image/jpeg',
              quality
            );
          } catch (_) {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    } catch (_) {
      resolve(file);
    }
  });
}

export async function uploadFileToSupabase(file, identifier = 'temp', uploadType = 'complaint') {
  if (!file) return null;
  
  if (file.size > 50 * 1024 * 1024) {
    throw new Error(`File "${file.name}" exceeds the 50MB limit.`);
  }

  // Auto-compress large camera photos before sending over mobile networks
  const optimizedFile = await compressImageFile(file);

  // 1. Primary: Cloudflare R2 Direct Upload via Cloudflare Worker API
  try {
    const formData = new FormData();
    formData.append('file', optimizedFile);
    if (uploadType === 'whatsapp') {
      formData.append('type', 'whatsapp');
      formData.append('phone', identifier);
    } else {
      formData.append('complaint_id', identifier);
    }

    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('egs_token') || localStorage.getItem('egs_token'))
      : null;

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const r2Res = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData
    });

    if (r2Res.ok) {
      const data = await r2Res.json();
      if (data && data.success) {
        return {
          file_name: data.file_name || optimizedFile.name,
          file_type: data.file_type || optimizedFile.type || 'application/octet-stream',
          file_size: data.file_size || optimizedFile.size,
          file_url: data.file_url,
          storage_key: data.storage_key
        };
      }
    }
  } catch (r2Err) {
    console.warn('[Cloudflare R2 Direct Upload Fallback Triggered]', r2Err);
  }

  // 2. Secondary Fallback: Supabase Storage
  const ext = (optimizedFile.name.split('.').pop() || 'bin').toLowerCase();
  const cleanBase = optimizedFile.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const uniqueName = `egs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanBase}.${ext}`;

  const res = await fetch(`${SUPABASE_STORAGE_URL}/${uniqueName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': optimizedFile.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: optimizedFile
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Supabase Storage Upload Error]', res.status, errText);
    throw new Error(`Cloud storage upload failed: ${errText || res.statusText}`);
  }

  const publicUrl = `${SUPABASE_PUBLIC_URL}/${uniqueName}`;
  return {
    file_name: optimizedFile.name,
    file_type: optimizedFile.type || 'application/octet-stream',
    file_size: optimizedFile.size,
    file_url: publicUrl
  };
}

export async function uploadMultipleFilesToSupabase(files, onProgress) {
  if (!files || files.length === 0) return [];
  
  // Parallel batch upload (up to 4 concurrent uploads) for high speed
  const concurrency = 4;
  const results = [];
  let completed = 0;

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(async (f) => {
      const uploaded = await uploadFileToSupabase(f);
      completed++;
      if (onProgress) onProgress(completed, files.length, f.name);
      return uploaded;
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
