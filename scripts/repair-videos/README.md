# Video Repair Tool — Eco Green Solar CMS

Offline Node.js tool to download, inspect with `ffprobe`, and remux/re-encode uploaded videos with `ffmpeg` to resolve VLC/browser seeking and playback issues.

## Features
- **Non-Destructive**: Never alters or overwrites existing raw videos in R2.
- **Prefix Isolation**: Repaired files are saved to `repaired/...`.
- **Database Safety**: Does not modify PostgreSQL/D1 `attachments` rows until explicitly verified and approved.
- **Two-Stage Fix**:
  1. Fast remux (`ffmpeg -c copy -movflags +faststart`) to fix container header / moov atom index without lossy re-encoding.
  2. Fallback transcode (`libx264` + `aac` + `-movflags +faststart`) if raw stream is corrupted or non-standard.
- **Report**: Outputs timestamped CSV report (`repair_report_<timestamp>.csv`) detailing status, method, and errors.
- **Options**: Supports `--dry-run` and `--limit N`.

---

## Setup & Prerequisites

### 1. Install FFmpeg on your local PC
- **Windows (Winget)**:
  ```powershell
  winget install Gyan.FFmpeg
  ```
- **Windows (Chocolatey)**:
  ```powershell
  choco install ffmpeg
  ```
- Verify:
  ```powershell
  ffmpeg -version
  ffprobe -version
  ```

### 2. Configure R2 API Tokens
Copy `.env.example` to `.env` in this directory:
```bash
cp .env.example .env
```
Fill in your credentials from Cloudflare Dashboard (R2 -> Manage R2 API Tokens):
```ini
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=eco-green-solar-cms-media
```

### 3. Install Dependencies
```bash
cd scripts/repair-videos
npm install
```

---

## Usage Examples

### 1. Test Run / Simulation (Dry-Run)
```bash
node repair_videos.js --dry-run
```

### 2. Repair First 5 Videos (Smoke Test)
```bash
node repair_videos.js --limit 5
```

### 3. Full Production Repair
```bash
node repair_videos.js
```
