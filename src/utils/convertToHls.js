const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

/**
 * Converts a video file to HLS (.m3u8 + .ts segments)
 *
 * @param {string} inputPath   - Absolute path to the uploaded video file
 * @param {string} outputDir   - Directory where HLS files will be saved
 * @param {string} baseName    - Base name (no extension) for output files
 * @returns {Promise<{ m3u8Path: string, segmentPattern: string }>}
 */
function convertToHls(inputPath, outputDir, baseName) {
  return new Promise((resolve, reject) => {
    // Create a subdirectory for this video's HLS files
    const hlsDir = path.join(outputDir, baseName);
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    const m3u8Path = path.join(hlsDir, 'index.m3u8');
    const segmentPattern = path.join(hlsDir, 'segment%03d.ts');
    const m3u8PathFfmpeg = m3u8Path.replace(/\\/g, '/');
    const segmentPatternFfmpeg = segmentPattern.replace(/\\/g, '/');

    ffmpeg(inputPath)
      .outputOptions([
        '-codec:v libx264',       // H.264 video codec (widely compatible)
        '-codec:a aac',           // AAC audio codec
        '-hls_time 6',            // Each segment = 6 seconds
        '-hls_list_size 0',       // Keep all segments in the playlist
        '-f hls',                 // Output format: HLS
        '-preset fast',           // Encoding speed vs compression tradeoff
        '-crf 23',                // Quality (lower = better, 18-28 is sane range)
        '-movflags +faststart',   // Web-optimised
      ])
      .outputOptions('-hls_segment_filename', segmentPatternFfmpeg)
      .output(m3u8PathFfmpeg)
      .on('start', (cmd) => {
        console.log('[HLS] ffmpeg command:', cmd);
      })
      .on('progress', (progress) => {
        console.log(`[HLS] Processing: ${Math.round(progress.percent || 0)}% done`);
      })
      .on('end', () => {
        console.log('[HLS] Conversion complete:', m3u8Path);
        resolve({ m3u8Path, hlsDir, segmentPattern });
      })
      .on('error', (err) => {
        console.error('[HLS] ffmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

module.exports = convertToHls;
