#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TOKEN_FILE = path.join(__dirname, '.puter-token');
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.puter-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');

const AVAILABLE_MODELS = {
  'claude-opus-4-6': { name: 'Claude Opus 4.6', context: '1M', output: '128K', best: 'coding/agentic' },
  'claude-opus-4-5': { name: 'Claude Opus 4.5', context: '200K', output: '64K', best: 'coding/production' },
  'claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', context: '1M', output: '128K', best: 'balanced' },
  'claude-sonnet-4-5': { name: 'Claude Sonnet 4.5', context: '200K', output: '64K', best: 'balanced' },
  'claude-haiku-4-5': { name: 'Claude Haiku 4.5', context: '200K', output: '64K', best: 'fast/cheap' },
  'claude-opus-4': { name: 'Claude Opus 4', context: '200K', output: '64K', best: 'coding' },
  'claude-sonnet-4': { name: 'Claude Sonnet 4', context: '200K', output: '64K', best: 'balanced' },
  'claude-3-5-sonnet': { name: 'Claude 3.5 Sonnet', context: '200K', output: '64K', best: 'fast' },
  'claude-3-haiku': { name: 'Claude 3 Haiku', context: '200K', output: '64K', best: 'fastest' },
};

const DEFAULT_MODEL = 'claude-opus-4-6';

let config = {
  model: DEFAULT_MODEL,
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '',
  stream: true,
  jsonMode: false,
};

let conversationHistory = [];
let currentModel = DEFAULT_MODEL;

function getToken() {
  if (process.env.PUTER_TOKEN) return process.env.PUTER_TOKEN;
  if (fs.existsSync(TOKEN_FILE)) {
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) {}
  }
  return null;
}

function saveToken(token) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, token);
    console.log('Token saved successfully!');
  } catch (e) {
    console.error('Failed to save token:', e.message);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
      currentModel = config.model;
    }
  } catch (e) {}
}

function saveConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {}
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      conversationHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
}

function saveHistory() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(conversationHistory, null, 2));
  } catch (e) {}
}

function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              PUTER CLI - Claude Opus 4.6 FREE                ║
║              Powered by Puter.com (User-Pays Model)          ║
╠═══════════════════════════════════════════════════════════════╣
║  Model: ${currentModel.padEnd(50)}║
║  Commands:                                                     ║
║    /help    - Show this help                                  ║
║    /models  - List available models                           ║
║    /set     - Set model (e.g., /set opus-4-6)                ║
║    /temp    - Set temperature (e.g., /temp 0.5)               ║
║    /system  - Set system prompt                                ║
║    /stream  - Toggle streaming (on/off)                       ║
║    /json    - Toggle JSON mode                                ║
║    /file    - Analyze a file                                  ║
║    /history - Show conversation history                        ║
║    /clear   - Clear conversation history                       ║
║    /export  - Export conversation to file                     ║
║    /token   - Set/verify your Puter token                     ║
║    /whoami  - Check your Puter account status                 ║
║    /quit    - Exit the CLI                                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Token: Get from https://puter.com/dashboard                   ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

function printModels() {
  console.log('\nAvailable Claude Models:');
  console.log('════════════════════════════════════════════════════════════════');
  Object.entries(AVAILABLE_MODELS).forEach(([key, val]) => {
    const marker = key === currentModel ? '>>>' : '   ';
    console.log(`${marker} ${key.padEnd(20)} | ${val.name.padEnd(20)} | Context: ${val.context.padEnd(6)} | Output: ${val.output.padEnd(6)} | ${val.best}`);
  });
  console.log('════════════════════════════════════════════════════════════════\n');
}

let puterInstance = null;

async function getPuter() {
  if (puterInstance) return puterInstance;
  
  const { init } = require('@heyputer/puter.js/src/init.cjs');
  const token = getToken();
  
  if (token) {
    puterInstance = init(token);
  } else {
    puterInstance = init();
  }
  
  return puterInstance;
}

async function callPuterAPI(messages, options = {}) {
  const model = options.model || currentModel;
  const stream = options.stream ?? config.stream;

  let fullResponse = '';
  
  try {
    const puter = await getPuter();
    
    if (stream) {
      const response = await puter.ai.chat(messages, {
        model: model,
        stream: true
      });
      
      for await (const part of response) {
        const text = part?.text || '';
        process.stdout.write(text);
        fullResponse += text;
      }
      console.log('\n');
    } else {
      const response = await puter.ai.chat(messages, {
        model: model,
        stream: false
      });
      
      if (response.message?.content?.[0]?.text) {
        fullResponse = response.message.content[0].text;
        console.log('\n' + fullResponse);
      } else if (response.message?.content) {
        fullResponse = Array.isArray(response.message.content) 
          ? response.message.content.map(c => c.text || c).join('')
          : response.message.content;
        console.log('\n' + fullResponse);
      }
    }
    
    return fullResponse;
  } catch (error) {
    if (error?.error?.code === 'insufficient_funds') {
      throw new Error(`Insufficient credits! Please add credits at https://puter.com/dashboard`);
    } else if (error?.error?.message) {
      throw new Error(`Puter API Error: ${error.error.message}`);
    }
    throw new Error('Puter API Error: ' + (error.message || JSON.stringify(error)));
  }
}

async function chat(message, options = {}) {
  const messages = [];

  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }

  conversationHistory.forEach((msg) => {
    messages.push({ role: msg.role, content: msg.content });
  });

  messages.push({ role: 'user', content: message });

  const startTime = Date.now();

  try {
    const response = await callPuterAPI(messages, options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    conversationHistory.push({ role: 'user', content: message });
    conversationHistory.push({ role: 'assistant', content: response });
    saveHistory();

    console.log(`\n[Response time: ${duration}s | Model: ${options.model || currentModel}]`);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).slice(1);
    const lines = content.split('\n').length;

    const prompt = `Analyze the following ${ext.toUpperCase()} file named "${fileName}" (${lines} lines):

\`\`\`${ext}
${content}
\`\`\`

Provide a comprehensive analysis including:
1. Purpose and functionality
2. Key components and structure
3. Potential issues or bugs
4. Suggestions for improvement
5. Code quality assessment`;

    await chat(prompt);
  } catch (e) {
    console.error('Error reading file:', e.message);
  }
}

async function exportConversation(filename) {
  if (!filename) filename = `conversation-${Date.now()}.json`;

  const exportData = {
    model: currentModel,
    config: config,
    history: conversationHistory,
    exportedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`Conversation exported to: ${filename}`);
  } catch (e) {
    console.error('Export failed:', e.message);
  }
}

function showHistory() {
  if (conversationHistory.length === 0) {
    console.log('No conversation history.');
    return;
  }

  console.log('\nConversation History:');
  console.log('════════════════════════════════════════════════════════════════');
  conversationHistory.forEach((msg, i) => {
    const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '');
    console.log(`[${i + 1}] ${msg.role.toUpperCase()}: ${preview}`);
  });
  console.log(`\nTotal messages: ${conversationHistory.length}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nYou> ',
  });
}

async function interactiveMode() {
  loadConfig();
  loadHistory();

  const token = getToken();
  if (!token) {
    console.log('\n⚠️  No Puter token found!');
    console.log('   Get your token from: https://puter.com/dashboard');
    console.log('   Then run: puter-cli token YOUR_TOKEN\n');
  }

  printBanner();

  const rl = createInterface();
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith('/')) {
      const [cmd, ...args] = input.slice(1).split(' ');
      const arg = args.join(' ');

      switch (cmd.toLowerCase()) {
        case 'quit':
        case 'exit':
          console.log('\nGoodbye! 👋\n');
          rl.close();
          return;

        case 'help':
          printBanner();
          break;

        case 'models':
          printModels();
          break;

        case 'set':
          if (AVAILABLE_MODELS[arg]) {
            currentModel = arg;
            config.model = arg;
            saveConfig();
            console.log(`Model set to: ${AVAILABLE_MODELS[arg].name}`);
          } else {
            console.log(`Unknown model: ${arg}`);
            console.log('Run /models to see available models');
          }
          break;

        case 'temp':
          const temp = parseFloat(arg);
          if (!isNaN(temp) && temp >= 0 && temp <= 2) {
            config.temperature = temp;
            saveConfig();
            console.log(`Temperature set to: ${temp}`);
          } else {
            console.log('Temperature must be between 0 and 2');
          }
          break;

        case 'system':
          config.systemPrompt = arg;
          saveConfig();
          console.log(`System prompt set to: ${arg || '(empty)'}`);
          break;

        case 'stream':
          config.stream = arg.toLowerCase() !== 'off';
          saveConfig();
          console.log(`Streaming ${config.stream ? 'enabled' : 'disabled'}`);
          break;

        case 'json':
          config.jsonMode = arg.toLowerCase() !== 'off';
          saveConfig();
          console.log(`JSON mode ${config.jsonMode ? 'enabled' : 'disabled'}`);
          break;

        case 'file':
          await analyzeFile(arg);
          break;

        case 'history':
          showHistory();
          break;

        case 'clear':
          conversationHistory = [];
          saveHistory();
          console.log('Conversation history cleared.');
          break;

        case 'export':
          await exportConversation(arg);
          break;

        case 'token':
          if (arg) {
            saveToken(arg);
            puterInstance = null;
            console.log('Token updated!');
          } else {
            const current = getToken();
            console.log(current ? `Token set (${current.slice(0, 20)}...)` : 'No token set');
          }
          break;

        case 'whoami':
          try {
            const puter = await getPuter();
            const user = await puter.auth.getUser();
            console.log('\n=== Puter Account Status ===');
            console.log(`Username: ${user.username || 'N/A'}`);
            console.log(`Email: ${user.email || 'Not confirmed'}`);
            console.log(`Account Age: ${user.human_readable_age || 'N/A'}`);
            console.log(`Has Credits: Check at https://puter.com/dashboard`);
            console.log('============================\n');
          } catch (e) {
            console.log('Unable to fetch account info:', e.message);
          }
          break;

        default:
          console.log(`Unknown command: /${cmd}`);
          console.log('Run /help for available commands');
      }
    } else {
      console.log('');
      try {
        await chat(input);
      } catch (e) {
        console.log('Error: ' + e.message);
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    await interactiveMode();
    return;
  }

  switch (command) {
    case 'token':
      if (args[1]) {
        saveToken(args[1]);
      } else {
        const token = getToken();
        if (token) {
          console.log(`Token: ${token.slice(0, 20)}...`);
        } else {
          console.log('No token set. Usage: puter-cli token YOUR_TOKEN');
        }
      }
      break;

    case 'login':
      console.log('Get your token from: https://puter.com/dashboard');
      console.log('Then run: puter-cli token YOUR_TOKEN');
      break;

    case 'models':
      printModels();
      break;

    case 'chat':
      const message = args.slice(1).join(' ');
      if (!message) {
        console.log('Usage: puter-cli chat "Your message here"');
        process.exit(1);
      }
      await chat(message);
      break;

    case 'file':
      if (!args[1]) {
        console.log('Usage: puter-cli file /path/to/file.js');
        process.exit(1);
      }
      await analyzeFile(args[1]);
      break;

    case 'interactive':
    case 'i':
      await interactiveMode();
      break;

    case 'help':
    case '--help':
    case '-h':
      printBanner();
      break;

    default:
      await chat(args.join(' '));
  }
}

main().catch(console.error);
