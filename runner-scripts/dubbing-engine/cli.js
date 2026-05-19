#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_STAGES = ["extract", "separate", "transcribe", "speakers", "translate", "clone", "align", "mix"];

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateManifest(manifest) {
  assert(manifest && typeof manifest === "object", "Manifest must be an object");
  assert(manifest.workflow === "dubbing", "Manifest workflow must be 'dubbing'");
  assert(manifest.type === "video", "Dubbing automation must use type 'video'");
  assert(typeof manifest.name === "string" && manifest.name.trim(), "Manifest name is required");
  assert(["upload", "local", "url"].includes(manifest.source_mode), "source_mode must be upload, local, or url");
  assert(typeof manifest.source_value === "string" && manifest.source_value.trim(), "source_value is required");

  const dubbing = manifest.dubbing || {};
  assert(["ur", "hi"].includes(dubbing.target_language), "target_language must be ur or hi");
  assert(["llm", "nllb"].includes(dubbing.translation_engine), "translation_engine must be llm or nllb");
  assert(["voxcpm2", "xtts", "edge"].includes(dubbing.voice_engine), "voice_engine must be voxcpm2, xtts, or edge");
  assert(Number(dubbing.max_tempo) >= 1.05 && Number(dubbing.max_tempo) <= 1.35, "max_tempo must be between 1.05 and 1.35");

  return {
    ...manifest,
    dubbing: {
      ...dubbing,
      stages: Array.isArray(dubbing.stages) && dubbing.stages.length > 0 ? dubbing.stages : DEFAULT_STAGES,
    },
  };
}

function writeStageReport(outputDir, manifest, dryRun) {
  fs.mkdirSync(outputDir, { recursive: true });
  const report = {
    ok: true,
    dry_run: dryRun,
    created_at: new Date().toISOString(),
    name: manifest.name,
    source_mode: manifest.source_mode,
    target_language: manifest.dubbing.target_language,
    voice_engine: manifest.dubbing.voice_engine,
    stages: manifest.dubbing.stages.map((stage, index) => ({
      index: index + 1,
      stage,
      status: dryRun ? "planned" : "pending_implementation",
    })),
  };
  fs.writeFileSync(path.join(outputDir, "dubbing-report.json"), JSON.stringify(report, null, 2));
  return report;
}

function parseArgs(argv) {
  const args = { dryRun: false, selfTest: false, manifest: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") args.dryRun = true;
    if (item === "--self-test") args.selfTest = true;
    if (item === "--manifest") {
      args.manifest = argv[index + 1] || "";
      index += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const sample = validateManifest(readJson(path.join(__dirname, "sample-manifest.json")));
    const report = writeStageReport(path.join(__dirname, "output", "self-test"), sample, true);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  assert(args.manifest, "Usage: node cli.js --manifest manifest.json [--dry-run]");
  const manifest = validateManifest(readJson(args.manifest));
  const outputDir = path.join(__dirname, "output", String(Date.now()));
  const report = writeStageReport(outputDir, manifest, args.dryRun);
  console.log(JSON.stringify({ ...report, output_dir: outputDir }, null, 2));

  if (!args.dryRun) {
    throw new Error("Real dubbing execution is not installed yet. Run with --dry-run until Python engine dependencies are installed.");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
