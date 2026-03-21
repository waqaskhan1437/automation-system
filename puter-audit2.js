const https = require('https');

const prompt = `You are auditing a React Next.js automation modal component. The modal has these issues:
1. Tabs are on the LEFT side - they should be on the RIGHT side vertically
2. When switching tabs, content gets cut off/hidden
3. Layout doesn't use full width properly

Current code is in AutomationModal.tsx. Here's the key structure:
- Outer div: fixed inset-0, centered with flex
- Inner div: max-w-4xl, flex flex-col
- Header: top
- Tabs: horizontal row (should be VERTICAL on right side)
- Content: middle with overflow
- Footer: bottom

Please provide the COMPLETE FIXED code for AutomationModal.tsx that:
1. Changes layout to have tabs on the RIGHT side as a VERTICAL sidebar
2. Content on the LEFT side  
3. Header at top
4. Footer at bottom
5. Uses full width properly (maybe max-w-6xl)
6. Ensures NO content gets hidden when switching tabs
7. Proper flex layout: [Header] [Left: Content] [Right: Tabs] [Footer]

Respond with ONLY the complete new code file starting with "use client";`;

const body = JSON.stringify({
  model: "claude-3-5-sonnet",
  messages: [
    {
      role: "user",
      content: prompt
    }
  ],
  max_tokens: 4000
});

const options = {
  hostname: 'api.puter.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer free',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(body);
req.end();
