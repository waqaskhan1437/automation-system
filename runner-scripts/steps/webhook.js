/**
 * Step: Webhook (Final status update only)
 */
const { axios } = require('../lib/core');
const { getRunnerEnv } = require('../lib/env');

module.exports.final = async function webhookFinal(successCount, totalProcessed, allDone, lastUrl, processedVideos = [], outputData = null) {
  const { jobId, automationId, workerWebhookUrl } = getRunnerEnv();

  if (!jobId || !workerWebhookUrl) return;

  console.log('[WEBHOOK] Final...');
  console.log('[WEBHOOK] Sending', processedVideos.length, 'processed videos');

  const payload = {
    job_id: jobId,
    automation_id: automationId,
    status: successCount > 0 ? 'success' : 'failed',
    videos_completed: successCount,
    all_links_processed: allDone,
    video_url: lastUrl || null,
    processed_videos: processedVideos,
  };

  // Forward post results (live_post_id, draft_post_id, etc.) so worker knows posting already happened
  if (outputData) {
    payload.output_data = typeof outputData === 'string' ? outputData : JSON.stringify(outputData);
  }

  try {
    await axios.post(workerWebhookUrl, payload, { timeout: 30000 });
    console.log('[WEBHOOK] Final OK');
  } catch (e) {
    console.error('[WEBHOOK] Final Error:', e.message);
  }
};
