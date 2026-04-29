/**
 * Step: Post
 */
const { execSync } = require('../lib/core');
const { fs } = require('../lib/core');
const { ROOT_DIR, CONFIG_PATH } = require('../lib/paths');

function readPostformeApiKeyFromConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return '';
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return typeof config?.postforme_api_key === 'string' ? config.postforme_api_key.trim() : '';
  } catch {
    return '';
  }
}

module.exports = async function post(litterboxUrl) {
  const apiKey = process.env.POSTFORME_API_KEY || readPostformeApiKeyFromConfig();
  
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
      env: { ...process.env, LITTERBOX_URL: litterboxUrl, POSTFORME_API_KEY: apiKey }
    });
    
    console.log('[POST] OK');
  } catch (e) {
    console.error('[POST] Failed:', e.message);
    throw e;
  }
};
