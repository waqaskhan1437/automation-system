const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const { DEFAULTS, readConfigFile } = require("./lib/config");

const LOCAL_SELF_CHECK_URL = "http://127.0.0.1:3000/api/self-check";
const LOCAL_FRONTEND_URL = "http://127.0.0.1:3001";
const SUPERVISOR_STATE_PATH = path.join(__dirname, "supervisor-state.json");
const LOCK_PATH = path.join(__dirname, "supervisor.lock");
const SERVER_ENTRY = path.join(__dirname, "server.js");
const RUNNER_SCRIPT = path.join(__dirname, "runner.js");
const RUNNER_STATE_PATH = path.join(__dirname, "runner-state.json");
const NODE_EXE = path.join(__dirname, "tools", "node", "node.exe");
const FFMPEG_DIR = path.join(__dirname, "tools", "ffmpeg");
const YTDLP_DIR = path.join(__dirname, "tools", "yt-dlp");
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");
const FRONTEND_NEXT_CLI = path.join(FRONTEND_DIR, "node_modules", "next", "dist", "bin", "next");
const FRONTEND_BUILD_ID = path.join(FRONTEND_DIR, ".next", "BUILD_ID");
const HEALTH_INTERVAL_MS = 10_000;
const RUNNER_STATE_STALE_MS = 90_000;
const RESTART_DELAY_MS = 2_000;

const startedAt = new Date().toISOString();
const children = {
  dashboard: null,
  frontend: null,
  runner: null,
};
const restartTimers = {
  dashboard: null,
  frontend: null,
  runner: null,
};

let lastError = "";
let lastMessage = "Background supervisor starting.";
let shuttingDown = false;
let dashboardFailureCount = 0;
let frontendFailureCount = 0;

process.title = "automation-local-supervisor";

function getNodeCommand() {
  return fs.existsSync(NODE_EXE) ? NODE_EXE : "node";
}

function loadConfig() {
  return readConfigFile();
}

function shouldUseLocalFrontend(config) {
  const frontendUrl = String(config.FRONTEND_URL || "").trim().toLowerCase();
  return frontendUrl === LOCAL_FRONTEND_URL;
}

function readRunnerState() {
  if (!fs.existsSync(RUNNER_STATE_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(RUNNER_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeSupervisorState(overrides = {}) {
  const state = {
    status: shuttingDown ? "stopping" : "running",
    message: lastMessage,
    updatedAt: new Date().toISOString(),
    startedAt,
    supervisorPid: process.pid,
    dashboardPid: children.dashboard?.pid || null,
    frontendPid: children.frontend?.pid || null,
    runnerSupervisorPid: children.runner?.pid || null,
    lastError,
    ...overrides,
  };

  fs.writeFileSync(SUPERVISOR_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function removeSupervisorArtifacts() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {}

  try {
    if (fs.existsSync(SUPERVISOR_STATE_PATH)) {
      fs.unlinkSync(SUPERVISOR_STATE_PATH);
    }
  } catch {}
}

function isProcessAlive(pid) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const raw = fs.readFileSync(LOCK_PATH, "utf8").trim();
      const existingPid = Number.parseInt(raw, 10);
      if (Number.isFinite(existingPid) && isProcessAlive(existingPid)) {
        console.log(`[SUPERVISOR] Another supervisor is already active (PID ${existingPid}).`);
        return false;
      }

      fs.unlinkSync(LOCK_PATH);
    }

    fs.writeFileSync(LOCK_PATH, String(process.pid), "utf8");
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("[SUPERVISOR] Failed to acquire lock:", lastError);
    return false;
  }
}

function escapePowerShellString(value) {
  return String(value || "").replace(/'/g, "''");
}

function hasProcessMatching(filters) {
  const clauses = filters.map((filter) => {
    const fileName = escapePowerShellString(filter.fileName);
    const processName = escapePowerShellString(filter.processName);
    const matchDir = escapePowerShellString(filter.directory || __dirname);
    return `($_.Name -eq '${processName}' -and $_.CommandLine -like '*${matchDir}*${fileName}*')`;
  });

  const command = [
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    `  ${clauses.join(" -or ")}`,
    "}",
    "Write-Output ($targets | Measure-Object).Count",
  ].join("; ");

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });

    return Number.parseInt(String(output).trim(), 10) > 0;
  } catch {
    return false;
  }
}

function isDashboardProcessActive() {
  return hasProcessMatching([
    { processName: "node.exe", fileName: "server.js" },
  ]);
}

function isFrontendProcessActive() {
  return hasProcessMatching([
    { processName: "node.exe", fileName: "next\\dist\\bin\\next", directory: FRONTEND_DIR },
  ]);
}

function isRunnerProcessActive() {
  return hasProcessMatching([
    { processName: "node.exe", fileName: "runner.js" },
  ]);
}

function isRunnerStateFresh() {
  const runnerState = readRunnerState();
  if (!runnerState?.updatedAt) {
    return false;
  }

  const updatedAt = Date.parse(runnerState.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt < RUNNER_STATE_STALE_MS;
}

function pingLocalDashboard() {
  return new Promise((resolve) => {
    const req = http.get(LOCAL_SELF_CHECK_URL, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });

    req.setTimeout(1_500, () => {
      req.destroy(new Error("Dashboard timeout"));
    });

    req.on("error", () => resolve(false));
  });
}

function pingLocalFrontend() {
  return new Promise((resolve) => {
    const req = http.get(LOCAL_FRONTEND_URL, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });

    req.setTimeout(1_500, () => {
      req.destroy(new Error("Frontend timeout"));
    });

    req.on("error", () => resolve(false));
  });
}

function buildChildEnv() {
  const ffmpegBin = path.join(FFMPEG_DIR, "bin");
  return {
    ...process.env,
    LOCAL_BACKGROUND_SUPERVISOR: "1",
    PATH: `${NODE_EXE ? path.dirname(NODE_EXE) : ""};${ffmpegBin};${YTDLP_DIR};${process.env.PATH}`,
  };
}

function scheduleRestart(key, reason) {
  if (shuttingDown || restartTimers[key]) {
    return;
  }

  lastMessage = reason;
  writeSupervisorState({ message: reason });

  restartTimers[key] = setTimeout(() => {
    restartTimers[key] = null;
    startManagedChild(key, reason);
  }, RESTART_DELAY_MS);
}

function registerChildLifecycle(key, child) {
  child.on("exit", (code, signal) => {
    if (children[key] && children[key].pid === child.pid) {
      children[key] = null;
    }

    const reason = `${key} exited (${signal || code || 0}). Restarting.`;
    lastError = reason;
    if (!shuttingDown) {
      scheduleRestart(key, reason);
    }
  });

  child.on("error", (error) => {
    lastError = error instanceof Error ? error.message : String(error);
    if (!shuttingDown) {
      scheduleRestart(key, `${key} failed to start. Restarting.`);
    }
  });
}

function startManagedChild(key, message) {
  if (shuttingDown || children[key]) {
    return;
  }

  let child;
  if (key === "dashboard") {
    child = spawn(getNodeCommand(), [SERVER_ENTRY], {
      cwd: __dirname,
      stdio: "ignore",
      windowsHide: true,
      env: buildChildEnv(),
    });
  } else if (key === "frontend") {
    if (!fs.existsSync(FRONTEND_NEXT_CLI) || !fs.existsSync(FRONTEND_BUILD_ID)) {
      lastError = "Local frontend build is missing. Run a frontend production build before enabling local frontend mode.";
      writeSupervisorState({ message: lastError, lastError });
      scheduleRestart(key, lastError);
      return;
    }

    child = spawn(getNodeCommand(), [FRONTEND_NEXT_CLI, "start", "-p", "3001", "-H", "127.0.0.1"], {
      cwd: FRONTEND_DIR,
      stdio: "ignore",
      windowsHide: true,
      env: buildChildEnv(),
    });
  } else {
    child = spawn(getNodeCommand(), [RUNNER_SCRIPT], {
      cwd: __dirname,
      stdio: "ignore",
      windowsHide: true,
      env: buildChildEnv(),
    });
  }

  children[key] = child;
  lastMessage = message;
  lastError = "";
  writeSupervisorState({ message });
  registerChildLifecycle(key, child);
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  try {
    execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {}
}

function restartManagedChild(key, reason) {
  lastMessage = reason;
  lastError = reason;
  writeSupervisorState({ message: reason, lastError });

  if (children[key]?.pid) {
    killProcessTree(children[key].pid);
    return;
  }

  scheduleRestart(key, reason);
}

async function reconcileChildren() {
  if (shuttingDown) {
    return;
  }

  const config = loadConfig();
  const dashboardReachable = await pingLocalDashboard();
  const localFrontendEnabled = shouldUseLocalFrontend(config);
  const frontendReachable = localFrontendEnabled ? await pingLocalFrontend() : true;
  if (dashboardReachable) {
    dashboardFailureCount = 0;
  } else {
    dashboardFailureCount += 1;
  }
  if (frontendReachable) {
    frontendFailureCount = 0;
  } else {
    frontendFailureCount += 1;
  }

  if (!children.dashboard) {
    if (!dashboardReachable && !isDashboardProcessActive()) {
      startManagedChild("dashboard", "Dashboard server missing. Starting background dashboard.");
    }
  } else if (dashboardFailureCount >= 2) {
    dashboardFailureCount = 0;
    restartManagedChild("dashboard", "Dashboard health check failed twice. Restarting dashboard.");
  }

  if (localFrontendEnabled) {
    if (!children.frontend) {
      if (!frontendReachable && !isFrontendProcessActive()) {
        startManagedChild("frontend", "Local frontend missing. Starting background frontend.");
      }
    } else if (frontendFailureCount >= 2) {
      frontendFailureCount = 0;
      restartManagedChild("frontend", "Local frontend health check failed twice. Restarting frontend.");
    }
  } else if (children.frontend?.pid) {
    killProcessTree(children.frontend.pid);
  }

  if (!children.runner) {
    if (!isRunnerProcessActive()) {
      startManagedChild("runner", "Runner missing. Starting background runner.");
    }
  } else if (!isRunnerStateFresh()) {
    restartManagedChild("runner", "Runner heartbeat is stale. Restarting runner.");
  }

  writeSupervisorState({
    message: lastMessage || "Background supervisor is keeping the local runner online.",
  });
}

function shutdown(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  lastMessage = reason;
  writeSupervisorState({
    status: "stopping",
    message: reason,
  });

  if (restartTimers.dashboard) {
    clearTimeout(restartTimers.dashboard);
  }
  if (restartTimers.frontend) {
    clearTimeout(restartTimers.frontend);
  }
  if (restartTimers.runner) {
    clearTimeout(restartTimers.runner);
  }

  killProcessTree(children.dashboard?.pid);
  killProcessTree(children.frontend?.pid);
  killProcessTree(children.runner?.pid);
  removeSupervisorArtifacts();
}

process.on("SIGINT", () => shutdown("Supervisor stopping (SIGINT)."));
process.on("SIGTERM", () => shutdown("Supervisor stopping (SIGTERM)."));
process.on("exit", () => removeSupervisorArtifacts());

process.on("uncaughtException", (error) => {
  lastError = error instanceof Error ? error.message : String(error);
  writeSupervisorState({
    status: "error",
    message: "Supervisor crashed with an uncaught exception.",
    lastError,
  });
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  lastError = error instanceof Error ? error.message : String(error);
  writeSupervisorState({
    status: "error",
    message: "Supervisor crashed with an unhandled rejection.",
    lastError,
  });
  process.exit(1);
});

if (!acquireLock()) {
  process.exit(10);
}

writeSupervisorState({
  status: "starting",
  message: "Background supervisor booted successfully.",
});

void reconcileChildren();
setInterval(() => {
  void reconcileChildren();
}, HEALTH_INTERVAL_MS);
