/**
 * Test: Google Photos download with createReadStream fix
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://photos.app.goo.gl/5Cwb2EfgTbabTJ7SA';
const OUTPUT_DIR = path.join(__dirname, 'test-output');
const OUT_FILE = path.join(OUTPUT_DIR, 'test-stream-download.mp4');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function openGooglePhotosVideo(page) {
  if (!/\/photo\//.test(page.url())) {
    const videoTile = page.locator('a[aria-label^="Video"]').first();
    if (await videoTile.count()) {
      await Promise.allSettled([
        page.waitForURL(/\/photo\//, { timeout: 15000 }),
        videoTile.click(),
      ]);
    }
  }
  await page.waitForTimeout(3000);
}

async function triggerGooglePhotosDownload(page) {
  const moreOptions = page.locator('button[aria-label="More options"]').last();
  if (await moreOptions.count()) {
    await page.mouse.move(1000, 120);
    await page.waitForTimeout(500);
    await moreOptions.click();

    const downloadItem = page.locator('[role="menuitem"][aria-label^="Download"], [role="menuitem"]:has-text("Download")').first();
    if (await downloadItem.count()) {
      const menuDownload = page.waitForEvent('download', { timeout: 60000 });
      await downloadItem.click();
      return menuDownload;
    }
  }

  const shortcutDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.keyboard.press('Shift+D');
  return shortcutDownload;
}

async function testStreamDownload() {
  console.log('=== Testing createReadStream Download ===');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    await openGooglePhotosVideo(page);
    console.log('[1] Page loaded, triggering download...');

    const download = await triggerGooglePhotosDownload(page);
    console.log(`[2] Download started: ${download.suggestedFilename()}`);

    console.log('[3] Using createReadStream...');
    const stream = await download.createReadStream();
    const writeStream = fs.createWriteStream(OUT_FILE);

    await new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      stream.on('error', reject);
    });

    if (fs.existsSync(OUT_FILE)) {
      const size = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
      console.log(`[4] File saved: ${size} MB`);
      if (fs.statSync(OUT_FILE).size > 50000) {
        console.log('✅ SUCCESS! createReadStream works!');
        return true;
      }
    }
    console.log('❌ File too small');
    return false;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  } finally {
    await browser.close();
  }
}

testStreamDownload().then(success => {
  console.log(`\nResult: ${success ? 'PASSED' : 'FAILED'}`);
  process.exit(success ? 0 : 1);
});
