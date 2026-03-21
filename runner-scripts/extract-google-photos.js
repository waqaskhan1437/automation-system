const { chromium } = require('playwright-core');

const OUTPUT_DIR = process.cwd();
const VIDEO_FILE = require('path').join(OUTPUT_DIR, 'output', 'input-video.mp4');

async function extractGooglePhotosVideoUrl(googlePhotosUrl) {
  console.log('Opening Google Photos page with Playwright...');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to:', googlePhotosUrl);
    await page.goto(googlePhotosUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for video element to appear
    console.log('Waiting for video to load...');
    await page.waitForSelector('video', { timeout: 15000 });
    
    // Get video source
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });
    
    if (videoSrc) {
      console.log('Found video URL:', videoSrc.substring(0, 80) + '...');
      await browser.close();
      return videoSrc;
    }
    
    // Try alternative: get download link
    console.log('Trying to find download link...');
    const downloadUrl = await page.evaluate(() => {
      // Look for download button or menu
      const buttons = document.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('download') || text.includes('export')) {
          const parent = btn.closest('a') || btn.closest('button');
          if (parent && parent.href) return parent.href;
        }
      }
      return null;
    });
    
    await browser.close();
    return downloadUrl;
    
  } catch (e) {
    console.log('Error:', e.message);
    await browser.close();
    return null;
  }
}

// Run if called directly
const url = process.argv[2];
if (url) {
  extractGooglePhotosVideoUrl(url).then(videoUrl => {
    if (videoUrl) {
      console.log('EXTRACTED_VIDEO_URL=' + videoUrl);
    } else {
      console.log('FAILED_TO_EXTRACT');
      process.exit(1);
    }
  });
}

module.exports = { extractGooglePhotosVideoUrl };