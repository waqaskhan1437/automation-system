const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  try {
    console.log('--- Testing / (Dashboard) ---');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: 'C:\\Users\\waqas\\Desktop\\new automation\\screenshot-dashboard.png' });
    const bodyText = await page.textContent('body');
    console.log('Dashboard body text length:', bodyText?.length || 0);
    console.log('Dashboard has content:', (bodyText?.length || 0) > 50);
    if (errors.length) console.log('Dashboard errors:', errors.join('\n'));
    errors.length = 0;

    console.log('\n--- Testing /automations ---');
    await page.goto('http://localhost:3001/automations', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: 'C:\\Users\\waqas\\Desktop\\new automation\\screenshot-automations.png' });
    const autoText = await page.textContent('body');
    console.log('Automations body text length:', autoText?.length || 0);
    console.log('Automations has content:', (autoText?.length || 0) > 50);
    if (errors.length) console.log('Automations errors:', errors.join('\n'));
    errors.length = 0;

    // Click + Video button to open modal
    console.log('\n--- Testing Modal Open ---');
    const videoBtn = await page.$('button:has-text("+ Video")');
    if (videoBtn) {
      await videoBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'C:\\Users\\waqas\\Desktop\\new automation\\screenshot-modal.png' });
      const modalText = await page.textContent('body');
      console.log('Modal body text length:', modalText?.length || 0);
      console.log('Modal has content:', (modalText?.length || 0) > 50);
      
      // Check each tab
      const tabs = ['Video', 'Taglines', 'Social', 'Publish'];
      for (const tab of tabs) {
        console.log(`\n--- Testing Tab: ${tab} ---`);
        const tabBtn = await page.$(`button:has-text("${tab}")`);
        if (tabBtn) {
          await tabBtn.click();
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `C:\\Users\\waqas\\Desktop\\new automation\\screenshot-tab-${tab.toLowerCase()}.png` });
          const tabText = await page.textContent('body');
          console.log(`${tab} tab text length:`, tabText?.length || 0);
          if (errors.length) console.log(`${tab} tab errors:`, errors.join('\n'));
          errors.length = 0;
        } else {
          console.log(`Tab button "${tab}" not found`);
        }
      }
    } else {
      console.log('+ Video button not found');
    }
    if (errors.length) console.log('Modal errors:', errors.join('\n'));

  } catch (err) {
    console.error('Test error:', err.message);
    await page.screenshot({ path: 'C:\\Users\\waqas\\Desktop\\new automation\\screenshot-error.png' });
  }

  await browser.close();
  console.log('\n--- All tests complete ---');
})();
