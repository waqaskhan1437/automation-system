/**
 * Step: Post
 */
const { execSync } = require('../lib/core');
const { ROOT_DIR } = require('../lib/paths');

module.exports = async function post(litterboxUrl) {
  const apiKey = process.env.POSTFORME_API_KEY;
  
  if (!apiKey) {
    console.log('[POST] Skipped (no API key)');
    return;
  }
  
  console.log('[POST] Starting...');
  
  try {
    execSync('node post-via-postforme.js', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      timeout: 180000,
      env: { ...process.env, LITTERBOX_URL: litterboxUrl }
    });
    
    console.log('[POST] OK');
  } catch (e) {
    console.error('[POST] Failed:', e.message);
    throw e;
  }
};
