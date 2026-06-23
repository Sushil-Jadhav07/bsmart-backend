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

const s3     = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET_NAME;

function getCloudfrontBase() {
  let cf = process.env.CLOUDFRONT_BASE_URL || '';
  if (!cf) {
    console.warn('[HLS] WARNING: CLOUDFRONT_BASE_URL is not set. Videos will be served directly from S3 — no CDN caching, slower playback. Set this env var on EC2.');
  }
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

async function downloadFromS3(s3Key, destPath) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const { Body } = await s3.send(cmd);
  const writeStream = fs.createWriteStream(destPath);
  await pipeline(Body, writeStream);
}

// ─── FIX: proper compression settings ────────────────────────────────────────
// Before: no bitrate cap, no resolution cap → 4K video = 7MB segments
// After:  capped at 720p, 1500kbps video → each segment ~150-300KB
function runHlsConversion(inputPath, hlsDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(hlsDir, { recursive: true });

    const m3u8Path       = path.join(hlsDir, 'index.m3u8');
    const segmentPattern = path.join(hlsDir, 'segment%03d.ts');

    ffmpeg(inputPath)
      .outputOptions([
        // Video codec
        '-codec:v libx264',
        '-vf scale=-2:720',
        '-b:v 1500k',
        '-maxrate 1500k',
        '-bufsize 3000k',
        // Audio: force stereo + AAC-LC profile for universal HLS player compatibility.
        // Without -ac 2, mono/surround inputs produce broken audio on many players.
        // Without -profile:a aac_low, some ffmpeg builds emit HE-AAC which iOS/Android players reject.
        '-codec:a aac',
        '-profile:a aac_low',
        '-ac 2',
        '-b:a 128k',
        '-ar 44100',
        // HLS settings
        '-hls_time 2',
        '-hls_list_size 0',
        '-f hls',
        '-preset veryfast',
        '-profile:v main',
        '-level 3.1',
        // NOTE: -movflags +faststart removed — it is an MP4-only option and has no
        // place in HLS output; some ffmpeg versions drop the audio track when it is present.
        '-hls_flags independent_segments',
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

async function uploadHlsDirToS3(hlsDir, s3FolderKey) {
  const files        = fs.readdirSync(hlsDir);
  const uploadedKeys = [];

  for (const file of files) {
    const localPath = path.join(hlsDir, file);
    const s3Key     = `${s3FolderKey}/${file}`;
    const body      = fs.readFileSync(localPath);

    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          s3Key,
      Body:         body,
      ContentType:  getMimeType(localPath),
      // FIX: tell CloudFront to cache segments for 1 year
      // .ts segments never change once created — safe to cache forever
      CacheControl: file.endsWith('.ts')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate', // m3u8 should not be cached
    }));

    uploadedKeys.push(s3Key);
    console.log('[HLS] Uploaded to S3:', s3Key);
  }

  return uploadedKeys;
}

async function deleteRawFromS3(s3Key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    console.log('[HLS] Deleted raw video from S3:', s3Key);
  } catch (err) {
    console.warn('[HLS] Could not delete raw video from S3:', err.message);
  }
}

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

async function convertToHlsAndUpload(rawS3Key, hlsS3Folder) {
  const tmpId     = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpVideo  = path.join(os.tmpdir(), `hls-raw-${tmpId}${path.extname(rawS3Key)}`);
  const tmpHlsDir = path.join(os.tmpdir(), `hls-out-${tmpId}`);

  try {
    console.log('[HLS] Downloading raw video from S3:', rawS3Key);
    await downloadFromS3(rawS3Key, tmpVideo);

    console.log('[HLS] Running ffmpeg conversion...');
    await runHlsConversion(tmpVideo, tmpHlsDir);

    console.log('[HLS] Uploading HLS files to S3:', hlsS3Folder);
    await uploadHlsDirToS3(tmpHlsDir, hlsS3Folder);

    await deleteRawFromS3(rawS3Key);

    const m3u8Key = `${hlsS3Folder}/index.m3u8`;
    const m3u8Url = s3KeyToUrl(m3u8Key);

    return { m3u8Key, m3u8Url, hlsFolder: hlsS3Folder };
  } finally {
    cleanupLocal(tmpVideo, tmpHlsDir);
  }
}

module.exports = { convertToHlsAndUpload };