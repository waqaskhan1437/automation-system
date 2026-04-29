const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'automation-config.json');

function readGithubEventInputs() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }

  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return payload && typeof payload === 'object' && payload.inputs && typeof payload.inputs === 'object'
      ? payload.inputs
      : {};
  } catch (error) {
    throw new Error(`Could not read GitHub event payload: ${error.message}`);
  }
}

function readInputValue(eventInputs, envName, inputName) {
  const envValue = String(process.env[envName] || '').trim();
  if (envValue) {
    return envValue;
  }

  const rawValue = eventInputs && typeof eventInputs[inputName] === 'string' ? eventInputs[inputName] : '';
  return String(rawValue || '').trim();
}

function parseBaseConfig(eventInputs) {
  const raw = readInputValue(eventInputs, 'CONFIG', 'automation_config');
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`CONFIG is not valid JSON: ${error.message}`);
  }
}

function resolveWorkerBaseUrl(workerWebhookUrl) {
  if (!workerWebhookUrl) {
    return '';
  }

  return workerWebhookUrl.replace(/\/api\/webhook\/github\/?$/, '');
}

async function fetchRuntimeConfig(jobId, workerWebhookUrl, runtimeToken) {
  const baseUrl = resolveWorkerBaseUrl(workerWebhookUrl);
  if (!baseUrl) {
    throw new Error('WORKER_WEBHOOK_URL is missing or invalid');
  }

  const url = new URL('/api/github/runtime-config', baseUrl);
  url.searchParams.set('job_id', String(jobId));
  url.searchParams.set('token', runtimeToken);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AutomationSystemRunner/1.0',
      'Accept': 'application/json',
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok || !payload?.success || !payload?.data?.automation_config || typeof payload.data.automation_config !== 'object') {
    const errorMessage = payload?.error || `Runtime config fetch failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload.data.automation_config;
}

async function main() {
  const eventInputs = readGithubEventInputs();
  const baseConfig = parseBaseConfig(eventInputs);
  const runtimeToken = readInputValue(eventInputs, 'RUNTIME_CONFIG_TOKEN', 'runtime_config_token');
  const workerWebhookUrl = readInputValue(eventInputs, 'WORKER_WEBHOOK_URL', 'worker_webhook_url');
  const jobId = Number.parseInt(readInputValue(eventInputs, 'JOB_ID', 'job_id') || '', 10);

  let finalConfig = baseConfig;

  if (runtimeToken) {
    if (!Number.isFinite(jobId) || jobId <= 0) {
      throw new Error('JOB_ID is required when RUNTIME_CONFIG_TOKEN is set');
    }

    console.log(`[CONFIG] Fetching runtime config for job ${jobId} from worker...`);
    const runtimeConfig = await fetchRuntimeConfig(jobId, workerWebhookUrl, runtimeToken);
    finalConfig = {
      ...baseConfig,
      ...runtimeConfig,
    };
    console.log('[CONFIG] Runtime config fetched successfully.');
  } else {
    console.log('[CONFIG] Runtime token not provided, using dispatch payload only.');
  }

  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(finalConfig, null, 2)}\n`, 'utf8');
  console.log(`[CONFIG] Saved ${CONFIG_PATH}`);
}

main().catch((error) => {
  console.error('[CONFIG] Failed:', error.message);
  process.exit(1);
});
