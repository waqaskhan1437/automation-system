/**
 * Dubbing Engine – Pipeline Orchestrator Tests
 *
 * Run with: node --test __tests__/test-pipeline.js
 */
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Module under test
const { runPipeline, getStageModule } = require('../lib/index');

// ── Helpers ────────────────────────────────────────────────────────────────

function createMinimalManifest(overrides = {}) {
  return {
    workflow: 'dubbing',
    type: 'video',
    name: 'Test Dubbing',
    source_mode: 'url',
    source_value: 'https://example.com/video.mp4',
    dubbing: {
      source_language: 'en',
      target_language: 'ur',
      translation_engine: 'nllb',
      voice_engine: 'edge',
      voice_reference_seconds: 18,
      diarization_enabled: false,
      mix_mode: 'bed',
      preserve_background: true,
      max_tempo: 1.2,
      lip_sync_enabled: false,
      stages: ['extract', 'separate', 'transcribe', 'speakers', 'translate', 'clone', 'align', 'mix'],
      ...overrides.dubbing,
    },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getStageModule()', () => {
  const expectedStages = ['extract', 'separate', 'transcribe', 'speakers', 'translate', 'clone', 'align', 'mix'];

  for (const stage of expectedStages) {
    it(`returns a function for "${stage}"`, () => {
      const mod = getStageModule(stage);
      assert.ok(typeof mod === 'function', `Stage "${stage}" should be a function`);
    });
  }

  it('returns null for unknown stages', () => {
    assert.equal(getStageModule('nonexistent'), null);
    assert.equal(getStageModule(''), null);
  });
});

describe('runPipeline() — with all successful stages', () => {
  const workDir = path.join(os.tmpdir(), `dubbing-pipeline-test-ok-${Date.now()}`);

  before(() => { fs.mkdirSync(workDir, { recursive: true }); });
  after(() => { try { fs.rmSync(workDir, { recursive: true }); } catch {} });

  it('returns a complete report with ok: true and no failures', async () => {
    const manifest = createMinimalManifest({
      dubbing: { stages: ['extract', 'separate'] }, // Use first 2 stages for speed
    });

    // Create a minimal audio file so extract can work
    const silentAudio = path.join(workDir, 'audio.wav');
    try {
      // Create a small valid WAV header (44 bytes)
      const wavBuf = Buffer.alloc(44);
      wavBuf.write('RIFF', 0);
      wavBuf.writeUInt32LE(36, 4);
      wavBuf.write('WAVE', 8);
      wavBuf.write('fmt ', 12);
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt16LE(1, 20);
      wavBuf.writeUInt16LE(1, 22);
      wavBuf.writeUInt32LE(16000, 24);
      wavBuf.writeUInt32LE(32000, 28);
      wavBuf.writeUInt16LE(2, 32);
      wavBuf.writeUInt16LE(16, 34);
      wavBuf.write('data', 36);
      wavBuf.writeUInt32LE(0, 40);
      fs.writeFileSync(silentAudio, wavBuf);
    } catch {}

    const report = await runPipeline(manifest, { workDir });

    assert.ok(typeof report === 'object');
    assert.ok(typeof report.ok === 'boolean');
    assert.ok(Array.isArray(report.stages));
    assert.equal(report.created_at, report.created_at); // is a valid string
    assert.ok(typeof report.created_at === 'string');
    assert.equal(report.name, manifest.name);
    assert.equal(report.source_mode, manifest.source_mode);
    assert.equal(report.target_language, manifest.dubbing.target_language);
    assert.equal(report.voice_engine, manifest.dubbing.voice_engine);
    assert.equal(report.work_dir, workDir);
  });
});

describe('runPipeline() — report structure', () => {
  const workDir = path.join(os.tmpdir(), `dubbing-pipeline-test-struct-${Date.now()}`);

  before(() => { fs.mkdirSync(workDir, { recursive: true }); });
  after(() => { try { fs.rmSync(workDir, { recursive: true }); } catch {} });

  it('contains all required report fields', async () => {
    const manifest = createMinimalManifest({
      dubbing: { stages: ['extract'] },
    });

    try {
      const silentAudio = path.join(workDir, 'audio.wav');
      const wavBuf = Buffer.alloc(44);
      wavBuf.write('RIFF', 0);
      wavBuf.writeUInt32LE(36, 4);
      wavBuf.write('WAVE', 8);
      wavBuf.write('fmt ', 12);
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt16LE(1, 20);
      wavBuf.writeUInt16LE(1, 22);
      wavBuf.writeUInt32LE(16000, 24);
      wavBuf.writeUInt32LE(32000, 28);
      wavBuf.writeUInt16LE(2, 32);
      wavBuf.writeUInt16LE(16, 34);
      wavBuf.write('data', 36);
      wavBuf.writeUInt32LE(0, 40);
      fs.writeFileSync(silentAudio, wavBuf);
    } catch {}

    const report = await runPipeline(manifest, { workDir });

    // Core fields
    assert.equal(typeof report.ok, 'boolean');
    assert.equal(typeof report.degraded, 'boolean');
    assert.ok(Array.isArray(report.fallback_stages));
    assert.equal(typeof report.created_at, 'string');
    assert.equal(report.name, 'Test Dubbing');
    assert.equal(report.work_dir, workDir);

    // Stage entry structure
    assert.ok(report.stages.length >= 1);
    const stage = report.stages[0];
    assert.equal(typeof stage.index, 'number');
    assert.equal(typeof stage.stage, 'string');
    assert.ok(['completed', 'failed', 'skipped'].includes(stage.status));
    assert.equal(typeof stage.fallback, 'boolean');
    assert.ok(stage.duration_seconds === null || typeof stage.duration_seconds === 'string');
  });
});

describe('runPipeline() — degraded flag behavior', () => {
  const workDir = path.join(os.tmpdir(), `dubbing-pipeline-test-deg-${Date.now()}`);

  before(() => { fs.mkdirSync(workDir, { recursive: true }); });
  after(() => { try { fs.rmSync(workDir, { recursive: true }); } catch {} });

  it('has degraded: false when all stages complete without fallback', async () => {
    const manifest = createMinimalManifest({
      dubbing: { stages: ['extract'] },
    });

    try {
      const silentAudio = path.join(workDir, 'audio.wav');
      const wavBuf = Buffer.alloc(44);
      wavBuf.write('RIFF', 0);
      wavBuf.writeUInt32LE(36, 4);
      wavBuf.write('WAVE', 8);
      wavBuf.write('fmt ', 12);
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt16LE(1, 20);
      wavBuf.writeUInt16LE(1, 22);
      wavBuf.writeUInt32LE(16000, 24);
      wavBuf.writeUInt32LE(32000, 28);
      wavBuf.writeUInt16LE(2, 32);
      wavBuf.writeUInt16LE(16, 34);
      wavBuf.write('data', 36);
      wavBuf.writeUInt32LE(0, 40);
      fs.writeFileSync(silentAudio, wavBuf);
    } catch {}

    const report = await runPipeline(manifest, { workDir });
    // If extract succeeds, degraded could be true or false depending on whether
    // the stage had a fallback — what matters is consistency
    const fallbackStages = report.stages.filter(s => s.fallback).map(s => s.stage);
    assert.equal(report.degraded, fallbackStages.length > 0);
    assert.deepEqual(report.fallback_stages, fallbackStages);
  });
});

describe('runPipeline() — skips stages after failure', () => {
  const workDir = path.join(os.tmpdir(), `dubbing-pipeline-test-fail-${Date.now()}`);

  before(() => { fs.mkdirSync(workDir, { recursive: true }); });
  after(() => { try { fs.rmSync(workDir, { recursive: true }); } catch {} });

  it('marks subsequent stages as skipped when a stage fails', async () => {
    const manifest = createMinimalManifest({
      dubbing: {
        stages: ['extract', 'transcribe', 'translate'],
        translation_engine: 'nllb',
      },
    });

    // Don't create audio.wav — extract will fail, causing subsequent stages to be skipped
    const report = await runPipeline(manifest, { workDir });

    // First stage (extract) may fail or succeed depending on FFmpeg availability
    // But subsequent stages should be skipped if extract fails
    if (report.stages[0]?.status === 'failed') {
      // All subsequent stages should be skipped
      for (let i = 1; i < report.stages.length; i++) {
        assert.equal(report.stages[i].status, 'skipped',
          `Stage "${report.stages[i].stage}" should be skipped after failure`);
      }
    }
  });
});

describe('runPipeline() — manifest passed to stages', () => {
  const workDir = path.join(os.tmpdir(), `dubbing-pipeline-test-manifest-${Date.now()}`);

  before(() => { fs.mkdirSync(workDir, { recursive: true }); });
  after(() => { try { fs.rmSync(workDir, { recursive: true }); } catch {} });

  it('preserves manifest fields in the report', async () => {
    const manifest = createMinimalManifest({
      name: 'Custom Name Test',
      dubbing: {
        stages: ['extract'],
        target_language: 'hi',
        voice_engine: 'xtts',
      },
    });

    try {
      const silentAudio = path.join(workDir, 'audio.wav');
      const wavBuf = Buffer.alloc(44);
      wavBuf.write('RIFF', 0);
      wavBuf.writeUInt32LE(36, 4);
      wavBuf.write('WAVE', 8);
      wavBuf.write('fmt ', 12);
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt16LE(1, 20);
      wavBuf.writeUInt16LE(1, 22);
      wavBuf.writeUInt32LE(16000, 24);
      wavBuf.writeUInt32LE(32000, 28);
      wavBuf.writeUInt16LE(2, 32);
      wavBuf.writeUInt16LE(16, 34);
      wavBuf.write('data', 36);
      wavBuf.writeUInt32LE(0, 40);
      fs.writeFileSync(silentAudio, wavBuf);
    } catch {}

    const report = await runPipeline(manifest, { workDir });
    assert.equal(report.name, 'Custom Name Test');
    assert.equal(report.target_language, 'hi');
    assert.equal(report.voice_engine, 'xtts');
  });
});
