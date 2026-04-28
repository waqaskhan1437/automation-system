function parseEnvInt(name, fallback = 0) {
  const parsed = parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRunnerEnv() {
  return {
    jobId: parseEnvInt('JOB_ID'),
    automationId: parseEnvInt('AUTOMATION_ID'),
    automationType: process.env.AUTOMATION_TYPE || 'video',
    workerWebhookUrl: process.env.WORKER_WEBHOOK_URL || '',
    executionMode: process.env.RUNNER_EXECUTION_MODE || 'github',
  };
}

module.exports = {
  getRunnerEnv,
  parseEnvInt,
};
