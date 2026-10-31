import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env / .env.local
const rootEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvLocalPath = path.resolve(__dirname, '../../.env.local');
const scriptEnvPath = path.resolve(__dirname, '.env');

if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
if (fs.existsSync(rootEnvLocalPath)) dotenv.config({ path: rootEnvLocalPath });
if (fs.existsSync(scriptEnvPath)) dotenv.config({ path: scriptEnvPath, override: true });

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : Infinity;

// Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eco-green-solar-cms-media';
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

console.log('--- Eco Green Solar Video Repair Tool ---');
console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION REPAIR'}`);
console.log(`Limit: ${Number.isFinite(limit) ? limit : 'ALL'}`);
console.log(`Bucket: ${R2_BUCKET_NAME}`);

// Helper to run ffmpeg/ffprobe executable
function executeCommand(command, cmdArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command ${command} failed with exit code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Check ffprobe / ffmpeg binary presence
async function checkBinaries() {
  try {
    await executeCommand('ffmpeg', ['-version']);
    await executeCommand('ffprobe', ['-version']);
    return true;
  } catch (err) {
    console.error('\n[Error] ffmpeg/ffprobe binary not found in PATH:');
    console.error('Please ensure ffmpeg and ffprobe are installed and available in your environment PATH.');
    return false;
  }
}

// Initialize S3 / R2 client
function getS3Client() {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
    console.error('\n[Configuration Missing]');
    console.error('Please provide R2 credentials in scripts/repair-videos/.env:');
    console.error('R2_ACCOUNT_ID=your_cloudflare_account_id');
    console.error('R2_ACCESS_KEY_ID=your_r2_access_key');
    console.error('R2_SECRET_ACCESS_KEY=your_r2_secret_key');
    console.error('R2_BUCKET_NAME=eco-green-solar-cms-media');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

// Download file stream to disk
async function downloadR2File(s3Client, key, destPath) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  });
  const response = await s3Client.send(command);
  await pipeline(response.Body, fs.createWriteStream(destPath));
}

// Upload repaired file to repaired/ prefix
async function uploadRepairedFile(s3Client, localFilePath, repairedKey) {
  const fileStream = fs.createReadStream(localFilePath);
  const stats = fs.statSync(localFilePath);
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: repairedKey,
    Body: fileStream,
    ContentType: 'video/mp4',
    ContentLength: stats.size
  });
  await s3Client.send(command);
}

// Repair individual video
async function processVideo(s3Client, key, workDir) {
  const filename = path.basename(key);
  const localInput = path.join(workDir, `raw_${filename}`);
  const baseNameWithoutExt = filename.replace(/\.[^.]+$/, '');
  const localOutput = path.join(workDir, `${baseNameWithoutExt}_repaired.mp4`);
  const repairedKey = `repaired/${key}`;

  console.log(`\nProcessing: ${key}`);

  if (isDryRun) {
    return { file: key, status: 'SKIPPED (DRY-RUN)', method: 'NONE', error: '' };
  }

  try {
    // 1. Download
    await downloadR2File(s3Client, key, localInput);

    // 2. Inspect with ffprobe
    let probeOut;
    try {
      probeOut = await executeCommand('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type',
        '-of', 'json',
        localInput
      ]);
    } catch (probeErr) {
      console.warn(`[Probe Warning] ffprobe failed on input: ${probeErr.message}`);
    }

    // 3. Attempt Method A: Fast remux (-c copy with faststart)
    let repairMethod = 'REMUX_COPY';
    let repairSuccess = false;
    try {
      console.log('Attempting remux (-c copy -movflags +faststart)...');
      await executeCommand('ffmpeg', [
        '-y',
        '-i', localInput,
        '-c', 'copy',
        '-movflags', '+faststart',
        localOutput
      ]);
      repairSuccess = true;
    } catch (remuxErr) {
      console.warn(`Remux copy failed (${remuxErr.message}). Falling back to re-encoding...`);
      // 4. Attempt Method B: Re-encode (libx264 + aac with faststart)
      repairMethod = 'REENCODE_H264';
      await executeCommand('ffmpeg', [
        '-y',
        '-i', localInput,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '24',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        localOutput
      ]);
      repairSuccess = true;
    }

    if (!repairSuccess || !fs.existsSync(localOutput)) {
      throw new Error('Both remux and re-encode failed to produce an output file.');
    }

    // 5. Upload fixed file with repaired/ prefix
    console.log(`Uploading to R2: ${repairedKey}...`);
    await uploadRepairedFile(s3Client, localOutput, repairedKey);

    return {
      file: key,
      status: 'SUCCESS',
      method: repairMethod,
      repaired_key: repairedKey,
      error: ''
    };
  } catch (err) {
    console.error(`Failed to repair ${key}: ${err.message}`);
    return {
      file: key,
      status: 'FAILED',
      method: 'FAILED',
      repaired_key: '',
      error: err.message.replace(/[\r\n]+/g, ' ')
    };
  } finally {
    // Cleanup temporary files
    if (fs.existsSync(localInput)) try { fs.unlinkSync(localInput); } catch (_) {}
    if (fs.existsSync(localOutput)) try { fs.unlinkSync(localOutput); } catch (_) {}
  }
}

async function main() {
  const binariesOk = await checkBinaries();
  if (!binariesOk) {
    console.log('\n[Note] Install ffmpeg on your machine (e.g. winget install Gyan.FFmpeg) to execute video repairs.');
  }

  const s3Client = getS3Client();
  if (!s3Client) {
    return;
  }

  const workDir = path.join(__dirname, 'temp_repair');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  console.log('Listing video objects in R2...');
  const videoKeys = [];
  let continuationToken = undefined;

  try {
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        ContinuationToken: continuationToken
      });
      const response = await s3Client.send(listCommand);

      if (response.Contents) {
        for (const item of response.Contents) {
          const key = item.Key;
          // Skip already repaired files or non-video assets
          if (key.startsWith('repaired/')) continue;
          const lower = key.toLowerCase();
          if (lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.3gp')) {
            videoKeys.push(key);
            if (videoKeys.length >= limit) break;
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken && videoKeys.length < limit);
  } catch (err) {
    console.error('Failed to list objects in R2:', err.message);
    return;
  }

  console.log(`Found ${videoKeys.length} video(s) to inspect/repair.`);
  if (videoKeys.length === 0) {
    console.log('No video files found matching criteria.');
    return;
  }

  const results = [];
  for (let i = 0; i < videoKeys.length; i++) {
    const key = videoKeys[i];
    console.log(`\n[${i + 1}/${videoKeys.length}]`);
    const res = await processVideo(s3Client, key, workDir);
    results.push(res);
  }

  // Generate CSV report
  const csvPath = path.join(__dirname, `repair_report_${Date.now()}.csv`);
  const csvHeaders = 'File,Status,Method,RepairedKey,Error\n';
  const csvRows = results.map(r => `"${r.file}","${r.status}","${r.method}","${r.repaired_key || ''}","${r.error || ''}"`).join('\n');
  fs.writeFileSync(csvPath, csvHeaders + csvRows, 'utf8');

  console.log('\n--- Repair Summary ---');
  console.log(`Total processed: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.status === 'SUCCESS').length}`);
  console.log(`Failed: ${results.filter(r => r.status === 'FAILED').length}`);
  console.log(`Report written to: ${csvPath}`);
  console.log('\n[CRITICAL NOTE] Database records in attachments table were NOT modified (as per strict instructions).');
}

main().catch(console.error);
