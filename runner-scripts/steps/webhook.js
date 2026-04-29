/**
 * Step: Webhook (Final status update only)
 */
const { axios, fs, path } = require('../lib/core');
const { getRunnerEnv } = require('../lib/env');
const { OUTPUT_DIR } = require('../lib/paths');

const FAILURE_REPORT_PATH = path.join(OUTPUT_DIR, 'failure-report.json');
const ERROR_LOG_PATH = path.join(OUTPUT_DIR, 'error.log');

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { read_error: error.message };
  }
}

function readTextTail(filePath, maxChars = 4000) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const value = fs.readFileSync(filePath, 'utf8');
    return value.length > maxChars ? value.slice(-maxChars) : value;
  } catch (error) {
    return `Could not read ${path.basename(filePath)}: ${error.message}`;
  }
}

function normalizeErrorMessage(failureReport, errorLogTail, successCount, totalProcessed) {
  const reportError = failureReport && typeof failureReport === 'object'
    ? (failureReport.last_error || failureReport.error || failureReport.message)
    : null;
  if (typeof reportError === 'string' && reportError.trim()) {
    return reportError.trim().slice(0, 1000);
  }

  if (errorLogTail && errorLogTail.trim()) {
    const lastLine = errorLogTail.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || errorLogTail.trim();
    return lastLine.slice(0, 1000);
  }

  if (successCount <= 0) {
    return `Video pipeline failed: 0 successful videos out of ${totalProcessed || 0} attempted.`;
  }

  return null;
}

module.exports.final = async function webhookFinal(successCount, totalProcessed, allDone, lastUrl, processedVideos = [], outputData = null) {
  const { jobId, automationId, workerWebhookUrl } = getRunnerEnv();

  if (!jobId || !workerWebhookUrl) return;

  console.log('[WEBHOOK] Final...');
  console.log('[WEBHOOK] Sending', processedVideos.length, 'processed videos');

  const status = successCount > 0 ? 'success' : 'failed';
  const failureReport = readJsonFile(FAILURE_REPORT_PATH);
  const errorLogTail = readTextTail(ERROR_LOG_PATH);
  const errorMessage = status === 'failed'
    ? normalizeErrorMessage(failureReport, errorLogTail, successCount, totalProcessed)
    : null;

  const payload = {
    job_id: Number(jobId),
    automation_id: automationId ? Number(automationId) : undefined,
    status,
    videos_completed: successCount,
    all_links_processed: allDone,
    video_url: lastUrl || null,
    processed_videos: processedVideos,
    error_message: errorMessage,
  };

  let mergedOutput = null;
  if (outputData) {
    try {
      mergedOutput = typeof outputData === 'string' ? JSON.parse(outputData) : outputData;
    } catch {
      mergedOutput = { raw_output: String(outputData) };
    }
  }

  if (failureReport || errorLogTail) {
    mergedOutput = {
      ...(mergedOutput || {}),
      runner_failure: failureReport || undefined,
      error_log_tail: errorLogTail || undefined,
    };
  }

  // Forward post results (live_post_id, draft_post_id, etc.) so worker knows posting already happened.
  // On failure, also forward failure-report/error-log-tail so the backend never stores a blank failed job.
  if (mergedOutput) {
    payload.output_data = JSON.stringify(mergedOutput);
  }

  try {
    const response = await axios.post(workerWebhookUrl, payload, { timeout: 30000 });
    console.log('[WEBHOOK] Final OK:', response.status);
  } catch (e) {
    const details = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
    console.error('[WEBHOOK] Final Error:', details);
  }
};
