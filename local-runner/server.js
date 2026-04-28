const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { execFileSync, execSync, spawn } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "config.txt");
const RUNNER_STATE_PATH = path.join(__dirname, "runner-state.json");
const SUPERVISOR_STATE_PATH = path.join(__dirname, "supervisor-state.json");
const LOCAL_MEDIA_ROOTS_PATH = path.join(__dirname, "local-media-roots.json");
const BACKGROUND_SUPERVISOR_PATH = path.join(__dirname, "supervisor.js");
const NODE_EXE = path.join(__dirname, "tools", "node", "node.exe");
const LOCAL_BASE_URL = "http://127.0.0.1:3000";
const RUNNER_SCRIPTS_OUTPUT_DIR = path.resolve(__dirname, "..", "runner-scripts", "output");
const DEFAULT_LOCAL_MEDIA_ROOTS = [
  RUNNER_SCRIPTS_OUTPUT_DIR,
  path.join(__dirname, "processed"),
  path.join(__dirname, "downloads"),
].map((rootPath) => path.resolve(rootPath));
const TOOL_PATHS = {
  node: [
    path.join(__dirname, "tools", "node", "node.exe"),
  ],
  ffmpeg: [
    path.join(__dirname, "tools", "ffmpeg", "bin", "ffmpeg.exe"),
  ],
  "yt-dlp": [
    path.join(__dirname, "tools", "yt-dlp", "yt-dlp.exe"),
  ],
};
const DEFAULTS = {
  SERVER_URL: "https://automation-api.waqaskhan1437.workers.dev",
  FRONTEND_URL: "https://automation-frontend-woad.vercel.app",
  RUNNER_TOKEN: "",
  ACCESS_TOKEN: "",
};

function loadConfig() {
  const config = { ...DEFAULTS };
  if (!fs.existsSync(CONFIG_PATH)) {
    return config;
  }

  const lines = fs.readFileSync(CONFIG_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    config[key.trim()] = rest.join("=").trim();
  }
  return config;
}

function saveConfig(nextConfig) {
  const lines = [
    "# Lightweight local launcher",
    `SERVER_URL=${nextConfig.SERVER_URL || DEFAULTS.SERVER_URL}`,
    `FRONTEND_URL=${nextConfig.FRONTEND_URL || DEFAULTS.FRONTEND_URL}`,
    `RUNNER_TOKEN=${nextConfig.RUNNER_TOKEN || ""}`,
    `ACCESS_TOKEN=${nextConfig.ACCESS_TOKEN || ""}`,
  ];
  fs.writeFileSync(CONFIG_PATH, `${lines.join("\n")}\n`, "utf8");
}

function readRunnerState() {
  if (!fs.existsSync(RUNNER_STATE_PATH)) {
    return {
      status: "not_started",
      message: "Runner has not reported status yet.",
      updatedAt: null,
      currentJobId: null,
      processedVideos: 0,
      lastError: "",
    };
  }

  try {
    return JSON.parse(fs.readFileSync(RUNNER_STATE_PATH, "utf8"));
  } catch {
    return {
      status: "error",
      message: "Runner state file is unreadable.",
      updatedAt: null,
      currentJobId: null,
      processedVideos: 0,
      lastError: "Invalid runner-state.json",
    };
  }
}

function readSupervisorState() {
  if (!fs.existsSync(SUPERVISOR_STATE_PATH)) {
    return {
      status: "not_started",
      message: "Background supervisor has not reported status yet.",
      updatedAt: null,
      supervisorPid: null,
      lastError: "",
    };
  }

  try {
    return JSON.parse(fs.readFileSync(SUPERVISOR_STATE_PATH, "utf8"));
  } catch {
    return {
      status: "error",
      message: "Supervisor state file is unreadable.",
      updatedAt: null,
      supervisorPid: null,
      lastError: "Invalid supervisor-state.json",
    };
  }
}

function writeRunnerState(nextState) {
  const currentState = readRunnerState();
  const state = {
    ...currentState,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(RUNNER_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function escapePowerShellString(value) {
  return String(value || "").replace(/'/g, "''");
}

function getMatchingLocalProcessIds(filters) {
  const runnerDir = escapePowerShellString(__dirname);
  const clauses = filters.map((filter) => {
    const processName = escapePowerShellString(filter.processName);
    const fileName = escapePowerShellString(filter.fileName);
    return `($_.Name -eq '${processName}' -and $_.CommandLine -like '*${runnerDir}*${fileName}*')`;
  });

  const findScript = [
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    `  ${clauses.join(" -or ")}`,
    "}",
    "$targets | ForEach-Object { $_.ProcessId }",
  ].join("; ");

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      findScript,
    ], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });

    return String(output)
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

function stopLocalRunnerProcesses() {
  const processIds = getMatchingLocalProcessIds([
    { processName: "node.exe", fileName: "runner.js" },
    { processName: "cmd.exe", fileName: "run-runner.bat" },
  ]);

  for (const pid of processIds) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {}
  }
}

function hasBackgroundSupervisorProcess() {
  const runnerDir = escapePowerShellString(__dirname);
  const countScript = [
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    `  ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*${runnerDir}*supervisor.js*') -or`,
    `  ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*${runnerDir}*run-background-supervisor.bat*')`,
    "}",
    "Write-Output ($targets | Measure-Object).Count",
  ].join("; ");

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      countScript,
    ], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });

    return Number.parseInt(String(output).trim(), 10) > 0;
  } catch {
    return false;
  }
}

function ensureBackgroundSupervisor() {
  if (hasBackgroundSupervisorProcess()) {
    return false;
  }

  if (!fs.existsSync(BACKGROUND_SUPERVISOR_PATH)) {
    throw new Error(`Background supervisor not found: ${BACKGROUND_SUPERVISOR_PATH}`);
  }

  const nodeCmd = fs.existsSync(NODE_EXE) ? NODE_EXE : "node";
  spawn(nodeCmd, [BACKGROUND_SUPERVISOR_PATH], {
    cwd: __dirname,
    stdio: "ignore",
    windowsHide: true,
  });
  return true;
}

function commandExists(command) {
  const bundledPaths = TOOL_PATHS[command] || [];
  if (bundledPaths.some((filePath) => fs.existsSync(filePath))) {
    return true;
  }

  try {
    execSync(`where ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getSelfCheck(config) {
  const state = readRunnerState();
  const supervisor = readSupervisorState();
  return {
    config: {
      serverUrl: config.SERVER_URL || DEFAULTS.SERVER_URL,
      dashboardMode: "local_proxy",
      dashboardUrl: "http://localhost:3000",
      hasAccessToken: Boolean(config.ACCESS_TOKEN),
      hasRunnerToken: Boolean(config.RUNNER_TOKEN),
      runnerAuthMode: config.RUNNER_TOKEN ? "runner_token" : "missing",
    },
    dependencies: {
      node: commandExists("node"),
      ffmpeg: commandExists("ffmpeg"),
      ytDlp: commandExists("yt-dlp"),
      winget: commandExists("winget"),
    },
    supervisor,
    runner: state,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isVideoFilePath(filePath) {
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(filePath);
}

function isImageFilePath(filePath) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filePath);
}

function getMediaContentType(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function readAllowedLocalMediaRoots() {
  const roots = [...DEFAULT_LOCAL_MEDIA_ROOTS];
  if (!fs.existsSync(LOCAL_MEDIA_ROOTS_PATH)) {
    return roots;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_MEDIA_ROOTS_PATH, "utf8"));
    if (!Array.isArray(parsed)) {
      return roots;
    }

    for (const value of parsed) {
      if (typeof value === "string" && value.trim()) {
        roots.push(path.resolve(value));
      }
    }
  } catch {}

  return Array.from(new Set(roots));
}

function isPathInsideAllowedRoot(absolutePath, allowedRoots) {
  return allowedRoots.some((rootPath) => {
    const relative = path.relative(rootPath, absolutePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function resolveSafeLocalMediaPath(rawPath) {
  const requestedPath = String(rawPath || "").trim();
  if (!requestedPath) {
    return null;
  }

  const absolutePath = path.resolve(requestedPath);
  if (!isPathInsideAllowedRoot(absolutePath, readAllowedLocalMediaRoots())) {
    return null;
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  if (!isVideoFilePath(absolutePath) && !isImageFilePath(absolutePath)) {
    return null;
  }

  return absolutePath;
}

function buildLocalMediaUrl(filePath, req) {
  const localOrigin = `http://${req.headers.host || "127.0.0.1:3000"}`;
  return `${localOrigin}/api/local-media?path=${encodeURIComponent(filePath)}`;
}

function rewriteLocalMediaFields(job, req) {
  if (!job || typeof job !== "object") {
    return job;
  }

  const nextJob = { ...job };
  const rawVideoUrl = typeof nextJob.video_url === "string" ? nextJob.video_url.trim() : "";
  if (rawVideoUrl && resolveSafeLocalMediaPath(rawVideoUrl)) {
    nextJob.video_url = buildLocalMediaUrl(rawVideoUrl, req);
  }

  if (typeof nextJob.output_data === "string" && nextJob.output_data.trim()) {
    try {
      const parsed = JSON.parse(nextJob.output_data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const output = { ...parsed };
        for (const key of ["local_output_media", "video_url", "media_url", "merged_video_url", "merged_local_output_media"]) {
          const value = typeof output[key] === "string" ? output[key].trim() : "";
          if (value && resolveSafeLocalMediaPath(value)) {
            output[key] = buildLocalMediaUrl(value, req);
          }
        }

        if (Array.isArray(output.processed_videos)) {
          output.processed_videos = output.processed_videos.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return item;
            }

            const nextItem = { ...item };
            const videoUrl = typeof nextItem.video_url === "string" ? nextItem.video_url.trim() : "";
            if (videoUrl && resolveSafeLocalMediaPath(videoUrl)) {
              nextItem.video_url = buildLocalMediaUrl(videoUrl, req);
            }
            return nextItem;
          });
        }

        if (!output.video_url && typeof output.local_output_media === "string") {
          output.video_url = output.local_output_media;
        }

        if (!nextJob.video_url && typeof output.video_url === "string") {
          nextJob.video_url = output.video_url;
        }

        nextJob.output_data = JSON.stringify(output);
      }
    } catch {}
  }

  return nextJob;
}

function rewriteJobsApiPayload(payload, req) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const nextPayload = { ...payload };
  if (Array.isArray(nextPayload.data)) {
    nextPayload.data = nextPayload.data.map((job) => rewriteLocalMediaFields(job, req));
    return nextPayload;
  }

  if (nextPayload.data && typeof nextPayload.data === "object") {
    nextPayload.data = rewriteLocalMediaFields(nextPayload.data, req);
  }

  return nextPayload;
}

function sendLocalMediaFile(req, res, absolutePath) {
  const stats = fs.statSync(absolutePath);
  const contentType = getMediaContentType(absolutePath);
  const rangeHeader = req.headers.range || "";

  if (!isVideoFilePath(absolutePath) || !rangeHeader) {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(absolutePath).pipe(res);
    return;
  }

  const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(absolutePath).pipe(res);
    return;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : stats.size - 1;
  const safeEnd = Math.min(end, stats.size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(safeEnd) || start > safeEnd || start >= stats.size) {
    res.writeHead(416, {
      "Content-Range": `bytes */${stats.size}`,
    });
    res.end();
    return;
  }

  res.writeHead(206, {
    "Content-Type": contentType,
    "Content-Length": safeEnd - start + 1,
    "Content-Range": `bytes ${start}-${safeEnd}/${stats.size}`,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(absolutePath, { start, end: safeEnd }).pipe(res);
}

function yesNo(ok) {
  return ok ? "Ready" : "Missing";
}

function renderBadge(ok) {
  const tone = ok ? "#16a34a" : "#dc2626";
  return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${tone};color:white;font-size:12px;font-weight:600;">${yesNo(ok)}</span>`;
}

function renderPage(config, selfCheck, error = "") {
  const existingAccessToken = config.ACCESS_TOKEN || "";
  const existingRunnerToken = config.RUNNER_TOKEN || "";
  const supervisor = selfCheck.supervisor;
  const runner = selfCheck.runner;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Automation Launcher</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #1f2937, #020617 58%); color: #e5e7eb; font-family: "Segoe UI", sans-serif; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero { margin-bottom: 22px; }
    .hero h1 { margin: 0 0 10px; font-size: 34px; }
    .hero p { margin: 0; color: #94a3b8; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; }
    .card { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(148,163,184,0.18); border-radius: 18px; padding: 22px; box-shadow: 0 24px 64px rgba(0,0,0,0.3); }
    .card h2 { margin: 0 0 14px; font-size: 20px; }
    .card p { color: #94a3b8; line-height: 1.5; }
    label { display: block; margin: 16px 0 8px; font-size: 13px; color: #cbd5e1; }
    input { width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(148,163,184,0.24); background: rgba(15,23,42,0.7); color: white; }
    button, .button-link { display: inline-block; text-decoration: none; width: 100%; margin-top: 16px; padding: 14px 16px; border: 0; border-radius: 12px; cursor: pointer; background: linear-gradient(135deg, #2563eb, #0ea5e9); color: white; font-weight: 600; text-align: center; box-sizing: border-box; }
    .button-link.secondary { background: rgba(30, 41, 59, 0.92); border: 1px solid rgba(148,163,184,0.2); }
    .error { margin-top: 12px; color: #fca5a5; font-size: 14px; }
    .meta { margin-top: 12px; font-size: 13px; color: #94a3b8; }
    .stats, .deps { display: grid; gap: 12px; }
    .stat { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 12px 14px; border-radius: 14px; background: rgba(2, 6, 23, 0.55); }
    .stat strong { font-size: 14px; }
    .stat span, .stat code { color: #cbd5e1; font-size: 13px; }
    .hint { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(59, 130, 246, 0.12); color: #bfdbfe; font-size: 13px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>Automation Launcher</h1>
      <p>Open the dashboard from this PC and use this page to confirm runner health and dependency status.</p>
    </div>
    <div class="grid">
      <form class="card" method="POST" action="/connect">
        <h2>Workspace Access</h2>
        <p>Bind this PC to one user only. The runner token locks the machine to a specific local-runner user, and the access token opens that same user's dashboard on localhost.</p>
        <label for="runner_token">Runner Token</label>
        <input id="runner_token" name="runner_token" type="password" placeholder="rnr_..." value="${escapeHtml(existingRunnerToken)}" />
        <label for="access_token">Access Token</label>
        <input id="access_token" name="access_token" type="password" placeholder="atk_..." value="${escapeHtml(existingAccessToken)}" />
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        <button type="submit">Open Dashboard</button>
        <a class="button-link secondary" href="/open">Resume Current Session</a>
        <div class="meta">Dashboard URL: http://localhost:3000</div>
        <div class="meta">Worker API: ${escapeHtml(selfCheck.config.serverUrl)}</div>
        <div class="hint">Checklist: add the same user's <code>RUNNER_TOKEN</code> and <code>ACCESS_TOKEN</code>. Different users on the same PC are blocked.</div>
      </form>
      <div class="card">
        <h2>Runner Self-Check</h2>
        <div class="stats" id="runner-stats">
          <div class="stat"><strong>Background</strong><span>${escapeHtml(supervisor.status || "-")}</span></div>
          <div class="stat"><strong>Status</strong><span>${escapeHtml(runner.status)}</span></div>
          <div class="stat"><strong>Message</strong><span>${escapeHtml(runner.message || "-")}</span></div>
          <div class="stat"><strong>Current Job</strong><span>${escapeHtml(runner.currentJobId || "-")}</span></div>
          <div class="stat"><strong>Processed Videos</strong><span>${escapeHtml(runner.processedVideos || 0)}</span></div>
          <div class="stat"><strong>Updated</strong><span>${escapeHtml(runner.updatedAt || "-")}</span></div>
        </div>
        <div class="hint" id="runner-error">${escapeHtml(runner.lastError || supervisor.lastError || "No runner errors reported.")}</div>
      </div>
      <div class="card">
        <h2>Dependency Health</h2>
        <div class="deps" id="deps">
          <div class="stat"><strong>Node.js</strong>${renderBadge(selfCheck.dependencies.node)}</div>
          <div class="stat"><strong>FFmpeg</strong>${renderBadge(selfCheck.dependencies.ffmpeg)}</div>
          <div class="stat"><strong>yt-dlp</strong>${renderBadge(selfCheck.dependencies.ytDlp)}</div>
          <div class="stat"><strong>winget</strong>${renderBadge(selfCheck.dependencies.winget)}</div>
        </div>
        <div class="hint">If FFmpeg or yt-dlp show as missing, rerun <code>setup.bat</code>. It attempts automatic install where possible.</div>
      </div>
      <div class="card">
        <h2>Configuration</h2>
        <div class="stats">
          <div class="stat"><strong>Access Token</strong>${renderBadge(selfCheck.config.hasAccessToken)}</div>
          <div class="stat"><strong>Runner Token</strong>${renderBadge(selfCheck.config.hasRunnerToken)}</div>
          <div class="stat"><strong>Runner Auth Mode</strong><code>${escapeHtml(selfCheck.config.runnerAuthMode)}</code></div>
          <div class="stat"><strong>Dashboard Mode</strong><code>${escapeHtml(selfCheck.config.dashboardMode)}</code></div>
          <div class="stat"><strong>Dashboard URL</strong><code>${escapeHtml(selfCheck.config.dashboardUrl)}</code></div>
          <div class="stat"><strong>Server URL</strong><code>${escapeHtml(selfCheck.config.serverUrl)}</code></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    async function refreshSelfCheck() {
      try {
        const response = await fetch("/api/self-check");
        const data = await response.json();
        const supervisor = data.supervisor || {};
        const runner = data.runner || {};
        const deps = data.dependencies || {};
        document.getElementById("runner-stats").innerHTML = [
          ["Background", supervisor.status || "-"],
          ["Status", runner.status || "-"],
          ["Message", runner.message || "-"],
          ["Current Job", runner.currentJobId || "-"],
          ["Processed Videos", runner.processedVideos || 0],
          ["Updated", runner.updatedAt || "-"]
        ].map(([label, value]) => '<div class="stat"><strong>' + label + '</strong><span>' + String(value) + '</span></div>').join("");
        document.getElementById("runner-error").textContent = runner.lastError || supervisor.lastError || "No runner errors reported.";
        document.getElementById("deps").innerHTML = [
          ["Node.js", deps.node],
          ["FFmpeg", deps.ffmpeg],
          ["yt-dlp", deps.ytDlp],
          ["winget", deps.winget]
        ].map(([label, ok]) => {
          const color = ok ? "#16a34a" : "#dc2626";
          const text = ok ? "Ready" : "Missing";
          return '<div class="stat"><strong>' + label + '</strong><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:' + color + ';color:white;font-size:12px;font-weight:600;">' + text + "</span></div>";
        }).join("");
      } catch {}
    }

    setInterval(refreshSelfCheck, 8000);
  </script>
</body>
</html>`;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendProxyError(res, error) {
  res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Local proxy error: ${error.message}`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function extractBearerToken(req) {
  const headerValue = req.headers.authorization || "";
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function requestJson(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      method: options.method || "GET",
      path: `${url.pathname}${url.search}`,
      headers: options.headers || {},
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {}

        if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
          const message = parsed && typeof parsed.error === "string"
            ? parsed.error
            : `Request failed with status ${res.statusCode || 500}`;
          reject(new Error(message));
          return;
        }

        resolve(parsed);
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function fetchAccessTokenUser(config, accessToken) {
  if (!accessToken) {
    return null;
  }

  const response = await requestJson(
    new URL("/api/auth/token", config.SERVER_URL || DEFAULTS.SERVER_URL).toString(),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response?.data?.user || null;
}

async function fetchRunnerTokenUser(config, runnerToken) {
  if (!runnerToken) {
    return null;
  }

  const identityUrl = new URL("/api/runner/identity", config.SERVER_URL || DEFAULTS.SERVER_URL);
  identityUrl.searchParams.set("token", runnerToken);
  const response = await requestJson(identityUrl.toString());
  return response?.data?.user || null;
}

async function resolveWorkspaceBinding(config, accessToken = config.ACCESS_TOKEN || "") {
  const runnerToken = config.RUNNER_TOKEN || "";
  if (!runnerToken) {
    return {
      ok: false,
      accessUser: null,
      runnerUser: null,
      error: "Runner token is required on this PC before the local runner can be used.",
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      accessUser: null,
      runnerUser: null,
      error: "Access token is required to open the local dashboard for this PC.",
    };
  }

  const [accessUser, runnerUser] = await Promise.all([
    fetchAccessTokenUser(config, accessToken).catch(() => null),
    fetchRunnerTokenUser(config, runnerToken).catch(() => null),
  ]);

  if (!runnerUser) {
    return {
      ok: false,
      accessUser,
      runnerUser: null,
      error: "Runner token is invalid or not linked to an active user.",
    };
  }

  if (accessToken && !accessUser) {
    return {
      ok: false,
      accessUser: null,
      runnerUser,
      error: "Access token is invalid or revoked.",
    };
  }

  if (accessUser && runnerUser && accessUser.id !== runnerUser.id) {
    return {
      ok: false,
      accessUser,
      runnerUser,
      error: `This PC is linked to runner workspace user ${runnerUser.id}, but the dashboard token belongs to user ${accessUser.id}. Use the matching token for this PC.`,
    };
  }

  return {
    ok: true,
    accessUser,
    runnerUser,
    error: "",
  };
}

function rewriteLocationHeader(location, req) {
  if (!location) {
    return location;
  }

  const localOrigin = `http://${req.headers.host || "127.0.0.1:3000"}`;
  const configuredFrontend = loadConfig().FRONTEND_URL || DEFAULTS.FRONTEND_URL;

  try {
    const nextLocation = new URL(location, configuredFrontend);
    const frontendOrigin = new URL(configuredFrontend).origin;
    if (nextLocation.origin === frontendOrigin) {
      return `${localOrigin}${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    }
  } catch {}

  return location;
}

function injectLocalApiRewriteScript(html, req, config) {
  const localOrigin = `http://${req.headers.host || "127.0.0.1:3000"}`;
  const configuredServer = String(config.SERVER_URL || DEFAULTS.SERVER_URL).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const localOriginLiteral = localOrigin.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const rewriteScript = `
<script>
(() => {
  const LOCAL_ORIGIN = "${localOriginLiteral}";
  const REMOTE_API_BASE = "${configuredServer}";

  function isLocalMediaPath(value) {
    return typeof value === "string" && /^[A-Za-z]:\\\\/.test(value.trim());
  }

  function toLocalMediaUrl(value) {
    return LOCAL_ORIGIN + "/api/local-media?path=" + encodeURIComponent(String(value || "").trim());
  }

  function rewriteJobRecord(job) {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      return job;
    }

    const nextJob = { ...job };
    if (isLocalMediaPath(nextJob.video_url)) {
      nextJob.video_url = toLocalMediaUrl(nextJob.video_url);
    }

    if (typeof nextJob.output_data === "string" && nextJob.output_data.trim()) {
      try {
        const parsed = JSON.parse(nextJob.output_data);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const output = { ...parsed };
          for (const key of ["local_output_media", "video_url", "media_url", "merged_video_url", "merged_local_output_media"]) {
            if (isLocalMediaPath(output[key])) {
              output[key] = toLocalMediaUrl(output[key]);
            }
          }

          if (Array.isArray(output.processed_videos)) {
            output.processed_videos = output.processed_videos.map((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) {
                return item;
              }

              const nextItem = { ...item };
              if (isLocalMediaPath(nextItem.video_url)) {
                nextItem.video_url = toLocalMediaUrl(nextItem.video_url);
              }
              return nextItem;
            });
          }

          if (!output.video_url && typeof output.local_output_media === "string") {
            output.video_url = output.local_output_media;
          }

          if (!nextJob.video_url && typeof output.video_url === "string") {
            nextJob.video_url = output.video_url;
          }

          nextJob.output_data = JSON.stringify(output);
        }
      } catch {}
    }

    return nextJob;
  }

  function rewriteJobsPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return payload;
    }

    const nextPayload = { ...payload };
    if (Array.isArray(nextPayload.data)) {
      nextPayload.data = nextPayload.data.map((job) => rewriteJobRecord(job));
      return nextPayload;
    }

    if (nextPayload.data && typeof nextPayload.data === "object") {
      nextPayload.data = rewriteJobRecord(nextPayload.data);
    }

    return nextPayload;
  }

  function shouldRewriteJobsResponse(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname === "/api/jobs" || /^\\/api\\/jobs\\/\\d+$/.test(parsed.pathname);
    } catch {}

    return false;
  }

  function cloneJsonResponse(response, payload) {
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  function rewriteUrl(input) {
    try {
      const candidate = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input && typeof input.url === "string"
        ? input.url
        : "";
      if (!candidate) {
        return null;
      }

      const parsed = new URL(candidate, window.location.origin);
      const remote = new URL(REMOTE_API_BASE, window.location.origin);
      if (parsed.origin === remote.origin && parsed.pathname.startsWith("/api/")) {
        return LOCAL_ORIGIN + parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {}

    return null;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const rewritten = rewriteUrl(input);
    const requestUrl = rewritten || (typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input && typeof input.url === "string"
      ? input.url
      : "");

    let response;
    if (!rewritten) {
      response = await originalFetch(input, init);
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      response = await originalFetch(new Request(rewritten, input), init);
    } else {
      response = await originalFetch(rewritten, init);
    }

    if (!shouldRewriteJobsResponse(requestUrl) || !response || !response.ok) {
      return response;
    }

    try {
      const payload = await response.clone().json();
      return cloneJsonResponse(response, rewriteJobsPayload(payload));
    } catch {
      return response;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    const rewritten = rewriteUrl(url);
    return originalOpen.call(this, method, rewritten || url, async, user, password);
  };
})();
</script>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${rewriteScript}</head>`);
  }

  return `${rewriteScript}${html}`;
}

function getProxyHeaders(req, targetUrl) {
  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  headers.connection = "close";
  delete headers["content-length"];
  return headers;
}

function proxyFrontend(req, res, config, hooks = {}) {
  const onProxyResponse = typeof hooks.onProxyResponse === "function" ? hooks.onProxyResponse : null;
  const onProxyError = typeof hooks.onProxyError === "function" ? hooks.onProxyError : null;
  const transformJson = typeof hooks.transformJson === "function" ? hooks.transformJson : null;
  const transformHtml = typeof hooks.transformHtml === "function" ? hooks.transformHtml : null;
  const requestUrl = new URL(req.url, LOCAL_BASE_URL);
  const frontendBase = new URL(config.FRONTEND_URL || DEFAULTS.FRONTEND_URL);
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, frontendBase);
  const transport = targetUrl.protocol === "https:" ? https : http;

  const proxyReq = transport.request({
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
    method: req.method,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers: getProxyHeaders(req, targetUrl),
  }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    if (responseHeaders.location) {
      responseHeaders.location = rewriteLocationHeader(responseHeaders.location, req);
    }

    if (onProxyResponse) {
      onProxyResponse(proxyRes);
    }

    const contentType = String(proxyRes.headers["content-type"] || "");
    if (transformJson && contentType.includes("application/json")) {
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", (chunk) => {
        body += chunk;
      });
      proxyRes.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          const transformed = transformJson(parsed, proxyRes) ?? parsed;
          const nextBody = JSON.stringify(transformed);
          responseHeaders["content-length"] = Buffer.byteLength(nextBody);
          res.writeHead(proxyRes.statusCode || 502, responseHeaders);
          res.end(nextBody);
        } catch {
          res.writeHead(proxyRes.statusCode || 502, responseHeaders);
          res.end(body);
        }
      });
      return;
    }

    if (transformHtml && contentType.includes("text/html")) {
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", (chunk) => {
        body += chunk;
      });
      proxyRes.on("end", () => {
        const nextBody = transformHtml(body, proxyRes) ?? body;
        responseHeaders["content-length"] = Buffer.byteLength(nextBody);
        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        res.end(nextBody);
      });
      return;
    }

    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    if (onProxyError) {
      onProxyError(error);
    }
    sendProxyError(res, error);
  });

  if (req.method === "GET" || req.method === "HEAD") {
    proxyReq.end();
    return;
  }

  req.pipe(proxyReq);
}

function isLocalAutomationRunRequest(method, pathname) {
  return method === "POST" && /^\/api\/automations\/\d+\/run$/.test(pathname);
}

function isLocalJobCancelRequest(method, pathname) {
  return method === "POST" && /^\/api\/jobs\/\d+\/cancel$/.test(pathname);
}

function isJobsApiRequest(method, pathname) {
  if (method !== "GET") {
    return false;
  }

  return pathname === "/api/jobs" || /^\/api\/jobs\/\d+$/.test(pathname);
}

async function handleLocalAutomationRun(req, res, config) {
  const requestToken = extractBearerToken(req) || config.ACCESS_TOKEN || "";
  const workspaceBinding = await resolveWorkspaceBinding(config, requestToken);
  if (!workspaceBinding.ok) {
    writeRunnerState({
      status: "error",
      message: "Blocked local automation run because dashboard and runner tokens point to different workspaces.",
      currentJobId: null,
      lastError: workspaceBinding.error,
    });
    sendJson(res, 409, {
      success: false,
      error: workspaceBinding.error,
      code: "LOCAL_RUNNER_WORKSPACE_MISMATCH",
      data: {
        runner_user_id: workspaceBinding.runnerUser?.id || null,
        access_user_id: workspaceBinding.accessUser?.id || null,
      },
    });
    return;
  }

  writeRunnerState({
    status: "restarting",
    message: "Stopping previous local runner before starting the latest automation run.",
    currentJobId: null,
    lastError: "",
  });

  try {
    stopLocalRunnerProcesses();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeRunnerState({
      status: "error",
      message: "Failed to stop the previous local runner.",
      currentJobId: null,
      lastError: message,
    });
    sendProxyError(res, new Error(`Runner stop failed: ${message}`));
    return;
  }

  let runnerStarted = false;
  const ensureRunnerStarted = () => {
    if (runnerStarted) {
      return;
    }
    runnerStarted = true;

    try {
      ensureBackgroundSupervisor();
      writeRunnerState({
        status: "starting",
        message: "Background supervisor will bring the local runner back online.",
        currentJobId: null,
        lastError: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeRunnerState({
        status: "error",
        message: "Automation was triggered but the background supervisor could not be ensured.",
        currentJobId: null,
        lastError: message,
      });
    }
  };

  proxyFrontend(req, res, config, {
    onProxyResponse: ensureRunnerStarted,
    onProxyError: ensureRunnerStarted,
  });
}

function handleLocalJobCancel(req, res, config) {
  proxyFrontend(req, res, config, {
    onProxyResponse: (proxyRes) => {
      if ((proxyRes.statusCode || 500) < 200 || (proxyRes.statusCode || 500) >= 300) {
        return;
      }

      setTimeout(() => {
        try {
          writeRunnerState({
            status: "restarting",
            message: "Cancelling local job and restarting runner.",
            currentJobId: null,
            lastError: "",
          });
          stopLocalRunnerProcesses();
          ensureBackgroundSupervisor();
          writeRunnerState({
            status: "idle",
            message: "Local job cancelled. Runner is ready for the next job.",
            currentJobId: null,
            lastError: "",
          });
        } catch (error) {
          writeRunnerState({
            status: "error",
            message: "Local job was cancelled but runner restart failed.",
            currentJobId: null,
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      }, 250);
    },
  });
}

function serveLauncher(res, config, selfCheck, error = "", status = 200) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(renderPage(config, selfCheck, error));
}

function chooseLocalVideoFile() {
  const pickerScript = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
    "$dialog.Title = 'Choose video file for Short with Prompt'",
    "$dialog.Filter = 'Video Files|*.mp4;*.mov;*.m4v;*.webm;*.avi;*.mkv|All Files|*.*'",
    "$dialog.Multiselect = $false",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  Write-Output $dialog.FileName",
    "}",
  ].join("; ");

  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    pickerScript,
  ], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });

  return String(output || "").trim();
}

const server = http.createServer((req, res) => {
  const config = loadConfig();
  const selfCheck = getSelfCheck(config);
  const requestUrl = new URL(req.url, LOCAL_BASE_URL);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/self-check") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(selfCheck));
    return;
  }

  if (req.method === "GET" && pathname === "/api/local-session") {
    void resolveWorkspaceBinding(config).then((workspaceBinding) => {
      sendJson(res, workspaceBinding.ok ? 200 : 409, {
        success: workspaceBinding.ok,
        data: {
          runner_user: workspaceBinding.runnerUser,
          access_user: workspaceBinding.accessUser,
        },
        error: workspaceBinding.ok ? null : workspaceBinding.error,
      });
    }).catch((error) => {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/local-media") {
    const requestedPath = requestUrl.searchParams.get("path") || "";
    const resolvedPath = resolveSafeLocalMediaPath(requestedPath);
    if (!resolvedPath) {
      sendJson(res, 404, {
        success: false,
        error: "Local media file not found",
      });
      return;
    }

    sendLocalMediaFile(req, res, resolvedPath);
    return;
  }

  if (req.method === "POST" && pathname === "/api/local-file-picker") {
    try {
      const selectedPath = chooseLocalVideoFile();
      if (!selectedPath) {
        sendJson(res, 200, {
          success: false,
          error: "No file selected",
        });
        return;
      }

      sendJson(res, 200, {
        success: true,
        data: {
          path: selectedPath,
        },
      });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/connect") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const accessToken = (params.get("access_token") || params.get("token") || "").trim();
      const runnerToken = (params.get("runner_token") || "").trim();
      if (!runnerToken) {
        serveLauncher(res, config, selfCheck, "Runner token is required.", 400);
        return;
      }
      if (!accessToken) {
        serveLauncher(res, config, selfCheck, "Access token is required.", 400);
        return;
      }

      const nextConfig = { ...config, RUNNER_TOKEN: runnerToken, ACCESS_TOKEN: accessToken };
      void resolveWorkspaceBinding(nextConfig, accessToken).then((workspaceBinding) => {
        if (!workspaceBinding.ok) {
          serveLauncher(res, config, selfCheck, workspaceBinding.error, 409);
          return;
        }

        saveConfig(nextConfig);
        redirect(res, `/?token=${encodeURIComponent(accessToken)}`);
      }).catch((error) => {
        serveLauncher(
          res,
          config,
          selfCheck,
          error instanceof Error ? error.message : String(error),
          500
        );
      });
    });
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/open") {
    const token = config.ACCESS_TOKEN || "";
    redirect(res, token ? `/?token=${encodeURIComponent(token)}` : "/launcher");
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/logout") {
    saveConfig({ ...config, ACCESS_TOKEN: "" });
    redirect(res, "/launcher");
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/adminlogin") {
    serveLauncher(res, config, selfCheck, "Admin login is only available from the hosted admin portal.", 403);
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/launcher") {
    serveLauncher(res, config, selfCheck);
    return;
  }

  const hasLocalAccessToken = Boolean(config.ACCESS_TOKEN || requestUrl.searchParams.get("token"));
  const hasLocalRunnerToken = Boolean(config.RUNNER_TOKEN);
  if (!hasLocalAccessToken || !hasLocalRunnerToken) {
    serveLauncher(res, config, selfCheck);
    return;
  }

  if (isLocalAutomationRunRequest(req.method, pathname)) {
    void handleLocalAutomationRun(req, res, config);
    return;
  }

  if (isLocalJobCancelRequest(req.method, pathname)) {
    handleLocalJobCancel(req, res, config);
    return;
  }

  if (isJobsApiRequest(req.method, pathname)) {
    proxyFrontend(req, res, config, {
      transformJson: (payload) => rewriteJobsApiPayload(payload, req),
    });
    return;
  }

  proxyFrontend(req, res, config, {
    transformHtml: (html) => injectLocalApiRewriteScript(html, req, config),
  });
});

server.listen(3000, "127.0.0.1", () => {
  console.log("==========================================");
  console.log("  Local User Dashboard Ready");
  console.log("  URL: http://localhost:3000");
  console.log("  Launcher: http://localhost:3000/launcher");
  console.log("  Self-check: http://localhost:3000/api/self-check");
  console.log("==========================================");
});

setTimeout(() => {
  try {
    ensureBackgroundSupervisor();
  } catch (error) {
    console.error("[BACKGROUND] Failed to ensure background supervisor:", error instanceof Error ? error.message : String(error));
  }
}, 1_500);
