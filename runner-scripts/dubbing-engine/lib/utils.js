/**
 * Dubbing Engine – Shared Utilities
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ── FFmpeg / FFprobe resolution ────────────────────────────────────────────
function resolveTool(name) {
  const isWin = process.platform === 'win32';
  const ext = isWin ? '.exe' : '';
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'local-runner', 'tools', 'ffmpeg', 'bin', `${name}${ext}`),
    path.resolve(__dirname, '..', '..', 'tools', 'ffmpeg', 'bin', `${name}${ext}`),
    path.resolve(process.cwd(), `${name}${ext}`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Check PATH for WindowsApps skip
  if (isWin) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      if (!dir || /[\\/]WindowsApps([\\/]|$)/i.test(dir)) continue;
      const full = path.join(dir, `${name}.exe`);
      if (fs.existsSync(full)) return full;
    }
  }
  return name;
}

function quote(s) {
  return s.includes(' ') || s.includes('\\') ? `"${s}"` : s;
}

const FFMPEG = quote(resolveTool('ffmpeg'));
const FFPROBE = quote(resolveTool('ffprobe'));

function getFFmpeg() { return FFMPEG; }
function getFFprobe() { return FFPROBE; }

// ── Python resolution ──────────────────────────────────────────────────────
function resolvePython() {
  const candidates = ['python3', 'python', 'py'];
  for (const c of candidates) {
    try {
      const out = execSync(`${c} --version 2>&1`, { encoding: 'utf8', timeout: 5000 });
      if (out.toLowerCase().includes('python')) return c;
    } catch {}
  }
  // Common Windows locations
  const winCandidates = [
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'python'; // fallback
}

const PYTHON_EXE = resolvePython();
function getPython() { return PYTHON_EXE; }

// ── Media probes ───────────────────────────────────────────────────────────
function getVideoDuration(inputFile) {
  try {
    const out = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${quote(inputFile)}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return parseFloat(out.trim());
  } catch { return null; }
}

function hasAudioTrack(inputFile) {
  try {
    const out = execSync(
      `${FFPROBE} -v error -select_streams a -show_entries stream=codec_name ${quote(inputFile)}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return out.includes('codec_name');
  } catch { return false; }
}

function getAudioSampleRate(inputFile) {
  try {
    const out = execSync(
      `${FFPROBE} -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 ${quote(inputFile)}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return parseInt(out.trim(), 10) || 16000;
  } catch { return 16000; }
}

// ── File helpers ───────────────────────────────────────────────────────────
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function safeUnlink(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

// ── Run child process with live logging ────────────────────────────────────
function runProcess(cmd, args, options = {}) {
  const timeoutMs = options.timeoutMs || 3600000;
  const logLabel = options.logLabel || 'PROCESS';
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: options.silent ? 'ignore' : 'inherit',
      windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(cmd)),
    });
    let settled = false;
    let timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid) {
          const { execFileSync } = require('child_process');
          execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        }
      } catch {}
      reject(new Error(`[${logLabel}] Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => { if (!settled) { settled = true; clearTimeout(timeoutHandle); reject(err); } });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (code === 0) return resolve();
      const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      reject(new Error(`[${logLabel}] Exited with ${detail}`));
    });
  });
}

// ── Run Python script ──────────────────────────────────────────────────────
async function runPython(scriptPath, scriptArgs = [], options = {}) {
  const python = options.pythonExe || getPython();
  console.log(`[PYTHON] ${python} ${scriptPath} ${scriptArgs.join(' ')}`);
  await runProcess(python, [scriptPath, ...scriptArgs], {
    ...options,
    logLabel: options.logLabel || 'PYTHON',
  });
}

// ── Step logger ────────────────────────────────────────────────────────────
function logStep(step, message) {
  console.log(`\n━━━ [${step}] ${message} ━━━`);
}

module.exports = {
  FFMPEG,
  FFPROBE,
  getFFmpeg,
  getFFprobe,
  getPython,
  resolvePython,
  getVideoDuration,
  hasAudioTrack,
  getAudioSampleRate,
  ensureDir,
  writeJson,
  readJson,
  copyFile,
  safeUnlink,
  runProcess,
  runPython,
  logStep,
  quote,
  resolveTool,
};
