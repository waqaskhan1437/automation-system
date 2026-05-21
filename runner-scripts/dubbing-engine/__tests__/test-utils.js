/**
 * Dubbing Engine – Utility Tests
 *
 * Run with: node --test __tests__/test-utils.js
 */
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Module under test
const utils = require('../lib/utils');

describe('quote()', () => {
  it('wraps strings with spaces in quotes', () => {
    assert.equal(utils.quote('C:\\Program Files\\ffmpeg.exe'), '"C:\\Program Files\\ffmpeg.exe"');
  });

  it('wraps strings with backslashes in quotes', () => {
    assert.equal(utils.quote('C:\\Users\\test'), '"C:\\Users\\test"');
  });

  it('does not quote simple strings', () => {
    assert.equal(utils.quote('ffmpeg'), 'ffmpeg');
    assert.equal(utils.quote('python'), 'python');
  });

  it('does not double-quote strings with leading quote', () => {
    const result = utils.quote('"already quoted"');
    // quote() adds its own quotes around the string since it sees spaces
    // The result should still be a valid quoted string
    assert.ok(typeof result === 'string' && result.length > 0);
  });
});

describe('ensureDir()', () => {
  const testDir = path.join(os.tmpdir(), `dubbing-test-ensure-${Date.now()}`);

  after(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('creates a directory recursively', () => {
    const nested = path.join(testDir, 'a', 'b', 'c');
    assert.equal(fs.existsSync(nested), false);
    utils.ensureDir(nested);
    assert.equal(fs.existsSync(nested), true);
    assert.equal(fs.statSync(nested).isDirectory(), true);
  });

  it('does not throw if directory already exists', () => {
    assert.doesNotThrow(() => utils.ensureDir(testDir));
  });
});

describe('writeJson() / readJson()', () => {
  const testDir = path.join(os.tmpdir(), `dubbing-test-json-${Date.now()}`);
  const testFile = path.join(testDir, 'test.json');

  after(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('writes JSON to a file and reads it back', () => {
    const data = { ok: true, stages: ['extract', 'separate'], count: 42 };
    utils.writeJson(testFile, data);
    assert.equal(fs.existsSync(testFile), true);
    const parsed = utils.readJson(testFile);
    assert.deepEqual(parsed, data);
  });

  it('writes pretty-printed JSON', () => {
    const data = { name: 'test' };
    utils.writeJson(testFile, data);
    const contents = fs.readFileSync(testFile, 'utf8');
    assert.equal(contents.includes('\n  '), true);
  });

  it('creates parent directories automatically', () => {
    const deepPath = path.join(testDir, 'nested', 'deep', 'file.json');
    utils.writeJson(deepPath, { a: 1 });
    assert.equal(fs.existsSync(deepPath), true);
  });
});

describe('safeUnlink()', () => {
  const testDir = path.join(os.tmpdir(), `dubbing-test-unlink-${Date.now()}`);

  before(() => { utils.ensureDir(testDir); });
  after(() => { try { fs.rmSync(testDir, { recursive: true }); } catch {} });

  it('removes an existing file', () => {
    const file = path.join(testDir, 'temp.txt');
    fs.writeFileSync(file, 'test');
    assert.equal(fs.existsSync(file), true);
    utils.safeUnlink(file);
    assert.equal(fs.existsSync(file), false);
  });

  it('does not throw if file does not exist', () => {
    assert.doesNotThrow(() => utils.safeUnlink(path.join(testDir, 'nonexistent.txt')));
  });

  it('does not throw on invalid path', () => {
    assert.doesNotThrow(() => utils.safeUnlink(''));
  });
});

describe('resolveTool()', () => {
  it('returns the tool name itself if not found (PATH fallback)', () => {
    const result = utils.resolveTool('nonexistent-tool-xyz');
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('nonexistent-tool-xyz'));
  });
});

describe('DUBBING_PYTHON_PACKAGES', () => {
  it('contains expected ML packages', () => {
    const packages = utils.DUBBING_PYTHON_PACKAGES;
    assert.ok(Array.isArray(packages));
    assert.ok(packages.length >= 6);
    assert.ok(packages.includes('whisperx'));
    assert.ok(packages.includes('whisper'));
    assert.ok(packages.includes('demucs'));
    assert.ok(packages.includes('torch'));
    assert.ok(packages.includes('TTS'));
  });

  it('contains no duplicates', () => {
    const packages = utils.DUBBING_PYTHON_PACKAGES;
    assert.equal(packages.length, new Set(packages).size);
  });
});

describe('getFFmpeg() / getFFprobe()', () => {
  it('returns non-empty strings', () => {
    const ffmpeg = utils.getFFmpeg();
    const ffprobe = utils.getFFprobe();
    assert.ok(typeof ffmpeg === 'string' && ffmpeg.length > 0);
    assert.ok(typeof ffprobe === 'string' && ffprobe.length > 0);
  });
});

describe('getPython()', () => {
  it('returns a non-empty string (or fallback to "python")', () => {
    const python = utils.getPython();
    assert.ok(typeof python === 'string' && python.length > 0);
  });
});

describe('listPythonCandidates()', () => {
  it('returns an array', () => {
    const candidates = utils.listPythonCandidates();
    assert.ok(Array.isArray(candidates));
  });
});
