#!/usr/bin/env node
/**
 * Dubbing Engine – CLI
 *
 * Usage:
 *   node cli.js --manifest manifest.json           # Run the full pipeline
 *   node cli.js --manifest manifest.json --dry-run  # Validate only
 *   node cli.js --self-test                         # Validate sample manifest
 *   node cli.js --resume /path/to/workdir           # Resume from failed stage
 *   node cli.js --manifest manifest.json --stages extract,separate  # Run specific stages
 */
const fs = require("fs");
const path = require("path");
const { runPipeline } = require("./lib/index");
const utils = require("./lib/utils");

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
  const maxTempo = Number(dubbing.max_tempo);
  assert(maxTempo >= 1.05 && maxTempo <= 1.35, "max_tempo must be between 1.05 and 1.35");

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
  const reportPath = path.join(outputDir, "dubbing-report.json");
  const latestDir = path.join(__dirname, "output", "latest");
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(latestDir, "dubbing-report.json"), JSON.stringify(report, null, 2));
  return report;
}

function parseArgs(argv) {
  const args = { dryRun: false, selfTest: false, manifest: "", resume: "", stages: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") args.dryRun = true;
    if (item === "--self-test") args.selfTest = true;
    if (item === "--manifest") {
      args.manifest = argv[index + 1] || "";
      index += 1;
    }
    if (item === "--resume") {
      args.resume = argv[index + 1] || "";
      index += 1;
    }
    if (item === "--stages") {
      args.stages = String(argv[index + 1] || "").split(",").map(s => s.trim()).filter(Boolean);
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --self-test: validate sample manifest
  if (args.selfTest) {
    const sample = validateManifest(readJson(path.join(__dirname, "sample-manifest.json")));
    const report = writeStageReport(path.join(__dirname, "output", "self-test"), sample, true);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // --dry-run: validate manifest and report what would be done
  if (args.dryRun) {
    assert(args.manifest, "Usage: node cli.js --manifest manifest.json [--dry-run]");
    const manifest = validateManifest(readJson(args.manifest));
    const outputDir = path.join(__dirname, "output", String(Date.now()));
    const report = writeStageReport(outputDir, manifest, true);
    console.log(JSON.stringify({ ...report, output_dir: outputDir }, null, 2));
    return;
  }

  // --manifest: Run the actual pipeline
  if (args.manifest) {
    const manifest = validateManifest(readJson(args.manifest));

    // If specific stages provided, override manifest stages
    if (args.stages.length > 0) {
      manifest.dubbing.stages = args.stages;
    }

    console.log(`\n🚀 Dubbing Engine v0.2.0`);
    console.log(`   Name: ${manifest.name}`);
    console.log(`   Source: ${manifest.source_value}`);
    console.log(`   Target: ${manifest.dubbing.target_language}`);
    console.log(`   Voice: ${manifest.dubbing.voice_engine}`);
    console.log(`   Translation: ${manifest.dubbing.translation_engine}\n`);

    const workDir = path.join(__dirname, "output", String(Date.now()));
    const report = await runPipeline(manifest, { workDir });

    // Write report to output directory
    const reportPath = path.join(workDir, "dubbing-report.json");
    const latestDir = path.join(__dirname, "output", "latest");
    utils.ensureDir(latestDir);
    utils.writeJson(reportPath, report);
    utils.writeJson(path.join(latestDir, "dubbing-report.json"), report);

    console.log(`\n${'='.repeat(60)}`);
    if (report.ok) {
      console.log(`  ✅ DUBBING COMPLETE`);
      console.log(`  Final video: ${report.final_video || 'N/A'}`);
    } else {
      console.log(`  ❌ DUBBING FAILED`);
      console.log(`  Error: ${report.last_error || 'Unknown error'}`);
    }
    console.log(`${'='.repeat(60)}\n`);

    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      process.exit(1);
    }
    return;
  }

  // --resume: Resume from a previously failed work directory
  if (args.resume) {
    const workDir = path.resolve(args.resume);
    if (!fs.existsSync(workDir)) {
      throw new Error(`Work directory not found: ${workDir}`);
    }

    // Find the last report
    const reportPath = path.join(workDir, "dubbing-report.json");
    if (!fs.existsSync(reportPath)) {
      throw new Error(`No report found in: ${workDir}`);
    }

    const prevReport = readJson(reportPath);
    const failedStages = (prevReport.stages || []).filter(s => s.status === 'failed').map(s => s.stage);

    if (failedStages.length === 0) {
      console.log(`[RESUME] Pipeline already completed successfully`);
      console.log(JSON.stringify(prevReport, null, 2));
      return;
    }

    console.log(`[RESUME] Retrying ${failedStages.length} failed stage(s): ${failedStages.join(', ')}`);

    // Build manifest from workDir
    const manifestPath = path.join(workDir, '..', 'latest', 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
    if (!manifest) {
      throw new Error(`Manifest not found in: ${path.join(workDir, '..', 'latest')}`);
    }

    manifest.dubbing.stages = failedStages;
    const report = await runPipeline(manifest, { workDir });

    const newReportPath = path.join(workDir, "dubbing-report.json");
    const latestDir = path.join(__dirname, "output", "latest");
    utils.ensureDir(latestDir);
    utils.writeJson(newReportPath, report);
    utils.writeJson(path.join(latestDir, "dubbing-report.json"), report);

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exit(1);
    }
    return;
  }

  // No valid command
  console.log(`Usage:
  node cli.js --self-test                         # Validate setup
  node cli.js --manifest manifest.json --dry-run   # Plan only
  node cli.js --manifest manifest.json             # Run full pipeline
  node cli.js --manifest manifest.json --stages extract,separate  # Run specific stages
  node cli.js --resume /path/to/workdir            # Resume failed run`);
}

try {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
