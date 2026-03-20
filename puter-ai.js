#!/usr/bin/env node

/**
 * Claude AI via Puter.js - Using the official library!
 */

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '.puter-token');
let currentModel = 'claude-sonnet-4.5';

function getToken() {
  if (process.env.PUTER_TOKEN) return process.env.PUTER_TOKEN;
  if (fs.existsSync(TOKEN_FILE)) {
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) {}
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('\n🤖 Claude AI via Puter.js\n');
  console.log('═══════════════════════════════\n');

  const token = getToken();
  if (!token) {
    console.log('❌ No token! Run: node puter-ai.js login');
    process.exit(1);
  }

  // Use puter.js library
  const { init } = require('@heyputer/puter.js/src/init.cjs');
  const puter = init(token);

  const message = args.join(' ');
  
  if (!message) {
    console.log('Usage: node puter-ai.js "Your question here"');
    console.log('Example: node puter-ai.js "Explain quantum computing"');
    process.exit(0);
  }

  console.log(`Asking: ${message}\n`);
  
  try {
    const response = await puter.ai.chat(message, { model: currentModel });
    console.log('═══════════════════════════════════════');
    // Extract the text content from response
    if (response.message && response.message.content) {
      const text = response.message.content.map(c => c.text || c).join('');
      console.log(text);
    } else {
      console.log(response);
    }
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }
}

main();