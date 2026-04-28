/**
 * Test: Google Photos download strategies
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEST_URL = 'https://photos.app.goo.gl/5Cwb2EfgTbabTJ7SA';
const OUTPUT_DIR = path.join(__dirname, 'test-output');
const OUT_FILE = path.join(OUTPUT_DIR, 'test-video.mp4');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function strategy1_NetworkIntercept() {
  console.log('\n=== STRATEGY 1: Network Request Interception ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const videoUrls = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (/videoplayback|googleusercontent\.com|fife\.usercontent/i.test(url) || contentType.includes('video/')) {
      console.log(`  [RESPONSE] ${url.substring(0, 150)}...`);
      console.log(`  [TYPE] ${contentType}`);
      videoUrls.push({ url, contentType });
    }
  });

  try {
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Try to click video if in album view
    const videoTile = page.locator('a[aria-label^="Video"]').first();
    if (await videoTile.count()) {
      console.log('  [CLICK] Clicking video tile...');
      await Promise.allSettled([
        page.waitForURL(/\/photo\//, { timeout: 15000 }),
        videoTile.click(),
      ]);
      await page.waitForTimeout(5000);
    }

    // Try download button
    const moreBtn = page.locator('button[aria-label="More options"]').last();
    if (await moreBtn.count()) {
      console.log('  [CLICK] Clicking more options...');
      await moreBtn.click();
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(3000);

    console.log(`\n  [RESULT] Found ${videoUrls.length} video URLs`);
    for (const v of videoUrls) {
      console.log(`    - ${v.url.substring(0, 120)}...`);
    }

    if (videoUrls.length > 0) {
      const targetUrl = videoUrls.find(v => v.contentType.includes('video')) || videoUrls[0];
      console.log(`\n  [DOWNLOAD] Trying curl with URL...`);
      try {
        execSync(`curl -L -o "${OUT_FILE}" --max-time 120 -H "User-Agent: Mozilla/5.0" -H "Referer: https://photos.google.com/" "${targetUrl.url}"`, { stdio: 'inherit', timeout: 130000 });
        if (fs.existsSync(OUT_FILE)) {
          const size = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
          console.log(`  [RESULT] File size: ${size} MB`);
          if (fs.statSync(OUT_FILE).size > 50000) {
            console.log('  [SUCCESS] Strategy 1 WORKED!');
            return true;
          }
        }
      } catch (e) {
        console.log(`  [ERROR] curl failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  [ERROR] ${e.message}`);
  } finally {
    await browser.close();
  }
  return false;
}

async function strategy2_PageSourceRegex() {
  console.log('\n=== STRATEGY 2: Page Source Regex ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const videoTile = page.locator('a[aria-label^="Video"]').first();
    if (await videoTile.count()) {
      await Promise.allSettled([
        page.waitForURL(/\/photo\//, { timeout: 15000 }),
        videoTile.click(),
      ]);
      await page.waitForTimeout(5000);
    }

    const content = await page.content();
    const videoRegex = /https?:\/\/[^"'\s]+videoplayback[^"'\s]*/gi;
    const matches = content.match(videoRegex) || [];

    console.log(`  [RESULT] Found ${matches.length} URLs in page source`);
    for (const m of matches.slice(0, 3)) {
      console.log(`    - ${m.substring(0, 120)}...`);
    }

    if (matches.length > 0) {
      const outFile2 = path.join(OUTPUT_DIR, 'test-video-2.mp4');
      execSync(`curl -L -o "${outFile2}" --max-time 120 -H "Referer: https://photos.google.com/" "${matches[0]}"`, { stdio: 'inherit', timeout: 130000 });
      if (fs.existsSync(outFile2) && fs.statSync(outFile2).size > 50000) {
        console.log(`  [SUCCESS] Strategy 2 WORKED! Size: ${(fs.statSync(outFile2).size / 1024 / 1024).toFixed(2)} MB`);
        return true;
      }
    }
  } catch (e) {
    console.log(`  [ERROR] ${e.message}`);
  } finally {
    await browser.close();
  }
  return false;
}

async function strategy3_DownloadEvent() {
  console.log('\n=== STRATEGY 3: Download Event (original approach) ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const videoTile = page.locator('a[aria-label^="Video"]').first();
    if (await videoTile.count()) {
      await Promise.allSettled([
        page.waitForURL(/\/photo\//, { timeout: 15000 }),
        videoTile.click(),
      ]);
      await page.waitForTimeout(5000);
    }

    const moreBtn = page.locator('button[aria-label="More options"]').last();
    if (await moreBtn.count()) {
      console.log('  [CLICK] More options...');
      await moreBtn.click();
      await page.waitForTimeout(2000);

      const downloadItem = page.locator('[role="menuitem"][aria-label^="Download"]').first();
      if (await downloadItem.count()) {
        console.log('  [CLICK] Download menu item...');
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60000 }),
          downloadItem.click(),
        ]);
        console.log(`  [DOWNLOAD] Suggested filename: ${download.suggestedFilename()}`);
        const outFile3 = path.join(OUTPUT_DIR, 'test-video-3.mp4');
        await download.saveAs(outFile3);
        if (fs.existsSync(outFile3) && fs.statSync(outFile3).size > 50000) {
          console.log(`  [SUCCESS] Strategy 3 WORKED! Size: ${(fs.statSync(outFile3).size / 1024 / 1024).toFixed(2)} MB`);
          return true;
        }
      }
    }

    // Fallback: Shift+D shortcut
    console.log('  [KEYBOARD] Trying Shift+D shortcut...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.keyboard.press('Shift+D'),
    ]);
    const outFile3 = path.join(OUTPUT_DIR, 'test-video-3.mp4');
    await download.saveAs(outFile3);
    if (fs.existsSync(outFile3) && fs.statSync(outFile3).size > 50000) {
      console.log(`  [SUCCESS] Strategy 3 WORKED! Size: ${(fs.statSync(outFile3).size / 1024 / 1024).toFixed(2)} MB`);
      return true;
    }
  } catch (e) {
    console.log(`  [ERROR] ${e.message}`);
  } finally {
    await browser.close();
  }
  return false;
}

async function main() {
  console.log('Google Photos Download - Strategy Test');
  console.log('======================================');

  const results = {};

  results['Strategy1_NetworkIntercept'] = await strategy1_NetworkIntercept();
  await new Promise(r => setTimeout(r, 2000));

  results['Strategy2_PageSourceRegex'] = await strategy2_PageSourceRegex();
  await new Promise(r => setTimeout(r, 2000));

  results['Strategy3_DownloadEvent'] = await strategy3_DownloadEvent();

  console.log('\n======================================');
  console.log('RESULTS:');
  for (const [name, success] of Object.entries(results)) {
    console.log(`  ${name}: ${success ? '✅ WORKED' : '❌ FAILED'}`);
  }
  const winner = Object.entries(results).find(([, v]) => v);
  if (winner) {
    console.log(`\n🏆 WINNER: ${winner[0]}`);
  } else {
    console.log('\n❌ All strategies failed');
  }
}

main().catch(console.error);
