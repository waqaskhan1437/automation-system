#!/usr/bin/env node
/**
 * Dubbing Engine — Dependency Doctor
 *
 * Prints a status table showing which heavy dependencies are present and
 * which stages will fall back to placeholders. Read-only — installs nothing.
 *
 * Usage:
 *   node doctor.js
 *   node doctor.js --json     # machine-readable output
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const utils = require('./lib/utils');

const isJson = process.argv.includes('--json');

function probeBinary(name, exePath) {
  if (fs.existsSync(exePath)) {
    return { ok: true, location: exePath };
  }
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${which} ${name}`, { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0];
    if (out && fs.existsSync(out)) return { ok: true, location: out };
  } catch {}
  return { ok: false, location: null };
}

function probePython() {
  // Use the same resolver the pipeline uses so doctor reports the actual venv
  // the runner will execute against.
  let chosen = null;
  let candidates = [];
  try {
    chosen = utils.getPython();
    candidates = utils.listPythonCandidates ? utils.listPythonCandidates() : [];
  } catch {}

  if (!chosen) return { ok: false, location: null, version: null, candidates: [] };

  try {
    const out = execSync(`"${chosen}" --version 2>&1`, { encoding: 'utf8', timeout: 5000 }).trim();
    if (out.toLowerCase().includes('python')) {
      return {
        ok: true,
        location: chosen,
        version: out,
        candidates,
        scanned: candidates.length,
      };
    }
  } catch {}

  return { ok: false, location: chosen, version: null, candidates };
}

function probePyModule(python, moduleName, importName) {
  if (!python) return { ok: false, reason: 'no python' };
  const mod = importName || moduleName;
  const res = spawnSync(python, ['-c', `import ${mod}; print('${mod}')`], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  if (res.status === 0) return { ok: true };
  return { ok: false, reason: (res.stderr || '').split('\n').find(l => l.trim()) || 'import failed' };
}

function probeEnv(name) {
  const v = process.env[name];
  return v ? { ok: true, value: `${v.slice(0, 6)}…` } : { ok: false };
}

function pad(s, n) { return String(s).padEnd(n); }

function color(text, code) {
  if (process.stdout.isTTY) return `\x1b[${code}m${text}\x1b[0m`;
  return text;
}
const GREEN = (t) => color(t, '32');
const RED   = (t) => color(t, '31');
const YEL   = (t) => color(t, '33');

async function main() {
  const ffmpegProbe = probeBinary('ffmpeg', utils.FFMPEG.replace(/^"|"$/g, ''));
  const ffprobeProbe = probeBinary('ffprobe', utils.FFPROBE.replace(/^"|"$/g, ''));
  const ytdlpExePath = path.resolve(__dirname, '..', '..', 'local-runner', 'tools', 'yt-dlp', 'yt-dlp.exe');
  const ytdlpProbe = probeBinary('yt-dlp', ytdlpExePath);

  const py = probePython();

  const pyChecks = [
    { key: 'whisperx',     hint: 'pip install --user whisperx',          stage: 'transcribe (preferred)' },
    { key: 'whisper',      hint: 'pip install --user openai-whisper',    stage: 'transcribe (fallback)' },
    { key: 'demucs',       hint: 'pip install --user demucs torch',      stage: 'separate' },
    { key: 'pyannote.audio', importAs: 'pyannote.audio', hint: 'pip install --user pyannote.audio  (+HF_TOKEN)', stage: 'speakers (optional)' },
    { key: 'transformers', hint: 'pip install --user transformers sentencepiece',  stage: 'translate (NLLB)' },
    { key: 'edge_tts',     hint: 'pip install --user edge-tts',          stage: 'clone (edge fallback)' },
    { key: 'TTS',          hint: 'pip install --user TTS',               stage: 'clone (Coqui XTTS)' },
    { key: 'voxcpm2',      hint: 'pip install --user voxcpm2 speechbrain', stage: 'clone (VoxCPM2)' },
    { key: 'torch',        hint: 'pip install --user torch',             stage: 'shared GPU base' },
  ];

  const envChecks = [
    { key: 'HF_TOKEN', hint: 'needed only when pyannote is installed', stage: 'speakers' },
    { key: 'OPENAI_API_KEY', hint: 'alternative to NLLB for Stage 5', stage: 'translate (LLM)' },
    { key: 'OLLAMA_HOST', hint: 'alternative to NLLB for Stage 5',    stage: 'translate (LLM)' },
  ];

  const rows = [];
  rows.push({ name: 'ffmpeg',  status: ffmpegProbe.ok,  detail: ffmpegProbe.location || 'install FFmpeg or run setup.bat' });
  rows.push({ name: 'ffprobe', status: ffprobeProbe.ok, detail: ffprobeProbe.location || 'ships with FFmpeg' });
  rows.push({ name: 'yt-dlp',  status: ytdlpProbe.ok,   detail: ytdlpProbe.location || 'install yt-dlp or run setup.bat' });
  const pyDetail = py.ok
    ? `${py.version}   @ ${py.location}`
    : 'install Python 3.11/3.12  (see DUBBING_SETUP.md)';
  rows.push({ name: 'python',  status: py.ok,           detail: pyDetail });

  for (const c of pyChecks) {
    if (!py.ok) {
      rows.push({ name: c.key, status: false, detail: `(skipped — no python)  ${c.hint}` });
      continue;
    }
    const r = probePyModule(py.location, c.key, c.importAs);
    rows.push({
      name: `${c.key}`.padEnd(0),
      status: r.ok,
      detail: r.ok ? `module importable  — ${c.stage}` : `${c.hint}   [${c.stage}]`,
    });
  }
  for (const e of envChecks) {
    const r = probeEnv(e.key);
    rows.push({
      name: `env:${e.key}`,
      status: r.ok,
      detail: r.ok ? `set (${r.value})  — ${e.stage}` : `not set — ${e.hint}`,
    });
  }

  if (isJson) {
    console.log(JSON.stringify({ python: py, rows }, null, 2));
    return;
  }

  const nameCol = Math.max(20, ...rows.map(r => r.name.length + 2));
  console.log('\nDUBBING ENGINE — Dependency Doctor');
  console.log('─'.repeat(nameCol + 50));
  for (const r of rows) {
    const tag = r.status ? GREEN('[ OK ]') : RED('[MISS]');
    console.log(`  ${pad(r.name, nameCol)} ${tag}  ${r.detail}`);
  }
  console.log('─'.repeat(nameCol + 50));

  const okCount = rows.filter(r => r.status).length;
  const total = rows.length;

  // Stage-level verdict
  const hasTranscribe = rows.find(r => r.name === 'whisperx')?.status || rows.find(r => r.name === 'whisper')?.status;
  const hasTranslate = rows.find(r => r.name === 'transformers')?.status
                    || rows.find(r => r.name === 'env:OPENAI_API_KEY')?.status
                    || rows.find(r => r.name === 'env:OLLAMA_HOST')?.status;
  const hasVoice = rows.find(r => r.name === 'edge_tts')?.status
                 || rows.find(r => r.name === 'TTS')?.status
                 || rows.find(r => r.name === 'voxcpm2')?.status;

  console.log(`\n  Will the pipeline produce a real dubbed MP4?`);
  console.log(`    Transcription (Stage 3): ${hasTranscribe ? GREEN('YES') : YEL('placeholder')}`);
  console.log(`    Translation   (Stage 5): ${hasTranslate ? GREEN('YES') : YEL('identity copy')}`);
  console.log(`    Voice synth   (Stage 6): ${hasVoice ? GREEN('YES') : RED('NO AUDIO')}`);

  if (hasTranscribe && hasTranslate && hasVoice) {
    console.log(`\n  ${GREEN('✔ Dubbing will work end-to-end.')}`);
  } else if (hasVoice) {
    console.log(`\n  ${YEL('⚠ Pipeline will run, but output quality is degraded.')} See DUBBING_SETUP.md for the missing pieces.`);
  } else {
    console.log(`\n  ${RED('✗ Voice synth is unavailable — install at least edge-tts:')}  pip install --user edge-tts`);
  }
  console.log(`\nSummary: ${okCount}/${total} dependencies present.\n`);
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
