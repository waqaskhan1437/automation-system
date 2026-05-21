/**
 * Dubbing Engine – Shared Utilities
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
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
// Dubbing engine packages that count toward "richest venv" ranking.
const DUBBING_PYTHON_PACKAGES = [
  'voxcpm', 'voxcpm2', 'TTS', 'edge_tts', 'whisperx', 'whisper',
  'demucs', 'pyannote', 'transformers', 'torch', 'speechbrain',
];

function listPythonCandidates() {
  const candidates = [];
  const seen = new Set();
  const push = (p) => {
    if (!p) return;
    const norm = String(p).replace(/\\/g, '/').toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    candidates.push(p);
  };

  // 1. Pre-existing venvs the user is known to have created for dubbing/voice work.
  //    Highest priority because they almost always contain heavy ML packages.
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  if (userHome) {
    const knownVenvLocations = [
      // VoxCPM repo's venv (common — the upstream README tells users to create it here)
      path.join(userHome, 'VoxCPM', 'venv', 'Scripts', 'python.exe'),
      path.join(userHome, 'VoxCPM', '.venv', 'Scripts', 'python.exe'),
      // Generic whisper venvs people make
      path.join(userHome, 'whisper-env', 'Scripts', 'python.exe'),
      path.join(userHome, 'whisperx-env', 'Scripts', 'python.exe'),
      // Catch-all "dubbing" venv
      path.join(userHome, 'dubbing-env', 'Scripts', 'python.exe'),
      path.join(userHome, 'dubbing', 'venv', 'Scripts', 'python.exe'),
    ];
    for (const p of knownVenvLocations) {
      if (fs.existsSync(p)) push(p);
    }
  }

  // 2. Env override
  if (process.env.DUBBING_PYTHON && fs.existsSync(process.env.DUBBING_PYTHON)) {
    push(process.env.DUBBING_PYTHON);
  }

  // 3. PATH-resolved python launchers (python3 / python / py)
  for (const c of ['python3', 'python', 'py']) {
    try {
      const out = execSync(`${c} --version 2>&1`, { encoding: 'utf8', timeout: 5000 });
      if (out.toLowerCase().includes('python')) push(c);
    } catch {}
  }

  // 4. Common Windows install locations
  const winCandidates = [
    'C:\\Python311\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python313\\python.exe',
    'C:\\Python314\\python.exe',
    'C:\\Program Files\\Python311\\python.exe', 'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python313\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) push(c);
  }

  return candidates;
}

function scoreDubbingPython(pythonExe) {
  // Returns number of DUBBING_PYTHON_PACKAGES that can be imported by this interpreter.
  // We write a temp probe script so multi-line Python (try/except) works correctly —
  // semicolons cannot substitute for newlines around compound statements.
  const tmpDir = os.tmpdir();
  const probePath = path.join(tmpDir, `dubbing-probe-${process.pid}-${Date.now()}.py`);
  const probeSource = [
    'import importlib, json, sys',
    `mods = ${JSON.stringify(DUBBING_PYTHON_PACKAGES)}`,
    'found = []',
    'for name in mods:',
    '    try:',
    '        importlib.import_module(name)',
    '        found.append(name)',
    '    except Exception:',
    '        pass',
    'sys.stdout.write(json.dumps(found))',
  ].join('\n');

  try {
    fs.writeFileSync(probePath, probeSource, 'utf8');
    const out = execSync(`"${pythonExe}" "${probePath}"`, {
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    });
    const lastLine = out.trim().split(/\r?\n/).pop();
    const parsed = JSON.parse(lastLine);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  } finally {
    try { fs.unlinkSync(probePath); } catch {}
  }
}

function resolvePython() {
  const allCandidates = listPythonCandidates();
  if (allCandidates.length === 0) return 'python';

  // Don't bother scoring if there's only one candidate.
  if (allCandidates.length === 1) return allCandidates[0];

  // Cache scoring results on the module to avoid re-running heavy imports
  // when other helpers also call resolvePython() in the same process.
  let best = allCandidates[0];
  let bestScore = -1;
  for (const candidate of allCandidates) {
    const score = scoreDubbingPython(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    // Short-circuit: if we already found a venv with most packages, stop.
    if (bestScore >= 5) break;
  }
  return best;
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
  listPythonCandidates,
  scoreDubbingPython,
  DUBBING_PYTHON_PACKAGES,
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
