const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'automation-config.json');

function parseBaseConfig() {
  const raw = String(process.env.CONFIG || '').trim();
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
  const baseConfig = parseBaseConfig();
  const runtimeToken = String(process.env.RUNTIME_CONFIG_TOKEN || '').trim();
  const workerWebhookUrl = String(process.env.WORKER_WEBHOOK_URL || '').trim();
  const jobId = Number.parseInt(process.env.JOB_ID || '', 10);

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
