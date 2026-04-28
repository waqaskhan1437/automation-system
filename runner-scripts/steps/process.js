/**
 * Step: Process
 */
const { execSync, fs, path } = require('../lib/core');
const { OUTPUT_DIR, ROOT_DIR } = require('../lib/paths');

module.exports = async function process() {
  console.log('[PROCESS] Starting FFmpeg...');
  
  const inputFile = path.join(OUTPUT_DIR, 'input-video.mp4');
  const outputFile = path.join(OUTPUT_DIR, 'processed-video.mp4');
  
  if (!fs.existsSync(inputFile)) {
    throw new Error('Input file not found');
  }
  
  try {
    execSync('node process-video.js', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      timeout: 600000
    });
    
    if (!fs.existsSync(outputFile)) {
      throw new Error('Output file not created');
    }
    
    console.log('[PROCESS] OK');
  } catch (e) {
    console.error('[PROCESS] Failed:', e.message);
    throw e;
  }
};
