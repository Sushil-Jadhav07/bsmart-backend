/**
 * convertToHlsAndUpload.js
 *
 * Utility: download a raw video from S3, convert it to HLS locally,
 * upload every HLS file (.m3u8 + .ts segments) back to S3, then clean up.
 *
 * This is the missing piece that was being skipped with
 * "we skip HLS conversion for now" in upload.routes.js.
 *
 * Flow:
 *   S3 raw video  →  /tmp local  →  ffmpeg HLS  →  S3 hls folder  →  CloudFront URL
 *
 * Usage:
 *   const { convertToHlsAndUpload } = require('../utils/convertToHlsAndUpload');
 *   const result = await convertToHlsAndUpload(s3Key, userId, subfolder);
 *   // result.m3u8Key   → S3 key  e.g. "uploads/users/123/reels/abc/index.m3u8"
 *   // result.m3u8Url   → CloudFront URL to save in MongoDB
 *   // result.hlsFolder → S3 folder prefix for all segments
 */

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const ffmpeg  = require('fluent-ffmpeg');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { pipeline } = require('stream/promises');

try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCloudfrontBase() {
  let cf = process.env.CLOUDFRONT_BASE_URL || '';
  if (cf && !cf.startsWith('http')) cf = `https://${cf}`;
  return cf.replace(/\/+$/, '');
}

function s3KeyToUrl(key) {
  const cf = getCloudfrontBase();
  if (cf) return `${cf}/${key}`;
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
  if (ext === '.ts')   return 'video/mp2t';
  return 'application/octet-stream';
}

// ─── Step 1: Download raw video from S3 to a temp file ───────────────────────

async function downloadFromS3(s3Key, destPath) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const { Body } = await s3.send(cmd);
  const writeStream = fs.createWriteStream(destPath);
  await pipeline(Body, writeStream);
}

// ─── Step 2: Run ffmpeg HLS conversion on the local temp file ────────────────

function runHlsConversion(inputPath, hlsDir, baseName) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(hlsDir, { recursive: true });

    const m3u8Path       = path.join(hlsDir, 'index.m3u8');
    const segmentPattern = path.join(hlsDir, 'segment%03d.ts');

    ffmpeg(inputPath)
      .outputOptions([
        '-codec:v libx264',
        '-codec:a aac',
        '-hls_time 3',          // 3s segments — better for short reels on mobile
        '-hls_list_size 0',     // keep all segments in playlist
        '-f hls',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
      ])
      .outputOptions('-hls_segment_filename', segmentPattern)
      .output(m3u8Path)
      .on('start', cmd  => console.log('[HLS] ffmpeg started:', cmd))
      .on('progress', p => console.log(`[HLS] ${Math.round(p.percent || 0)}%`))
      .on('end',   ()   => resolve(m3u8Path))
      .on('error', err  => reject(err))
      .run();
  });
}

// ─── Step 3: Upload every file in hlsDir to S3 under the hls folder key ──────

async function uploadHlsDirToS3(hlsDir, s3FolderKey) {
  const files = fs.readdirSync(hlsDir);
  const uploadedKeys = [];

  for (const file of files) {
    const localPath = path.join(hlsDir, file);
    const s3Key     = `${s3FolderKey}/${file}`;
    const body      = fs.readFileSync(localPath);

    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        body,
      ContentType: getMimeType(localPath),
      // Make segments publicly readable via CloudFront
      // (if your bucket is private + CloudFront OAC this is fine to omit)
    }));

    uploadedKeys.push(s3Key);
    console.log('[HLS] Uploaded to S3:', s3Key);
  }

  return uploadedKeys;
}

// ─── Step 4: Delete the original raw video from S3 ───────────────────────────

async function deleteRawFromS3(s3Key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    console.log('[HLS] Deleted raw video from S3:', s3Key);
  } catch (err) {
    // Non-fatal — log and continue
    console.warn('[HLS] Could not delete raw video from S3:', err.message);
  }
}

// ─── Step 5: Clean up local temp files ───────────────────────────────────────

function cleanupLocal(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        if (fs.statSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        } else {
          fs.unlinkSync(p);
        }
      }
    } catch (err) {
      console.warn('[HLS] Cleanup warning:', err.message);
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {string} rawS3Key   - S3 key of the just-uploaded raw video
 *                              e.g. "uploads/users/123/reels/1234567890-abc.mp4"
 * @param {string} hlsS3Folder - S3 folder where HLS files will go
 *                              e.g. "uploads/users/123/reels/1234567890-abc"
 * @returns {Promise<{ m3u8Key: string, m3u8Url: string, hlsFolder: string }>}
 */
async function convertToHlsAndUpload(rawS3Key, hlsS3Folder) {
  // Unique temp dir per conversion so parallel uploads don't collide
  const tmpId    = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpVideo = path.join(os.tmpdir(), `hls-raw-${tmpId}${path.extname(rawS3Key)}`);
  const tmpHlsDir = path.join(os.tmpdir(), `hls-out-${tmpId}`);

  try {
    console.log('[HLS] Downloading raw video from S3:', rawS3Key);
    await downloadFromS3(rawS3Key, tmpVideo);

    console.log('[HLS] Running ffmpeg conversion...');
    await runHlsConversion(tmpVideo, tmpHlsDir, tmpId);

    console.log('[HLS] Uploading HLS files to S3:', hlsS3Folder);
    await uploadHlsDirToS3(tmpHlsDir, hlsS3Folder);

    // Delete the raw .mp4 from S3 — no longer needed
    await deleteRawFromS3(rawS3Key);

    const m3u8Key = `${hlsS3Folder}/index.m3u8`;
    const m3u8Url = s3KeyToUrl(m3u8Key);

    return { m3u8Key, m3u8Url, hlsFolder: hlsS3Folder };
  } finally {
    // Always clean up local temp files even if something throws
    cleanupLocal(tmpVideo, tmpHlsDir);
  }
}

module.exports = { convertToHlsAndUpload };
