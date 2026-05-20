/**
 * Step: Upload - Saves processed media to local runner storage for 7 days
 * Instead of uploading to external services (Catbox/Litterbox/0x0.st),
 * saves the file locally. The runner's HTTP server serves it via /api/local-media.
 */
const { fs, path } = require('../lib/core');
const { OUTPUT_DIR } = require('../lib/paths');

function readTrimmedEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = async function upload(filePath) {
  console.log('[UPLOAD] Starting...');

  const file = filePath ? path.resolve(filePath) : path.join(OUTPUT_DIR, 'processed-video.mp4');
  if (!fs.existsSync(file)) {
    throw new Error('Processed file not found: ' + file);
  }

  // Create media directory with 7-day persistence
  const mediaDir = path.join(OUTPUT_DIR, 'media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  // Generate unique filename with job ID and timestamp
  const jobId = readTrimmedEnv('JOB_ID') || 'unknown';
  const timestamp = Date.now();
  const ext = path.extname(file);
  const baseName = path.basename(file, ext);
  const destFilename = `${baseName}-job${jobId}-${timestamp}${ext}`;
  const destPath = path.join(mediaDir, destFilename);

  // Copy file to persistent media storage
  fs.copyFileSync(file, destPath);

  const fileSize = (fs.statSync(destPath).size / 1024 / 1024).toFixed(2);
  console.log(`[UPLOAD] Saved to local runner storage: ${destPath} (${fileSize} MB)`);
  console.log(`[UPLOAD] This file will be available for 7 days via runner media server`);

  // Return the absolute local file path.
  // The runner's HTTP server (server.js) will serve this file via /api/local-media.
  // If a PostForMe user has API key configured, post-via-postforme.js will
  // upload to PostForMe storage since this path doesn't start with 'https://'.
  return destPath;
};
