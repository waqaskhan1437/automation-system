/**
 * Video Progress Tracker
 * Marks videos as processed after each one completes
 * Collects all processed videos and sends final summary
 */
const { fs, path, axios } = require('../lib/core');
const { getRunnerEnv } = require('../lib/env');
const { OUTPUT_DIR } = require('../lib/paths');

const PROCESSED_VIDEOS_FILE = path.join(OUTPUT_DIR, 'processed-videos.json');

function loadProcessedVideos() {
  try {
    if (fs.existsSync(PROCESSED_VIDEOS_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESSED_VIDEOS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveProcessedVideos(videos) {
  try {
    fs.writeFileSync(PROCESSED_VIDEOS_FILE, JSON.stringify(videos, null, 2));
  } catch (e) {
    console.error('[TRACKER] Error saving processed videos:', e.message);
  }
}

function addProcessedVideo(videoRecord) {
  const videos = loadProcessedVideos();
  videos.push({
    ...(videoRecord || {}),
    processed_at: new Date().toISOString(),
  });
  saveProcessedVideos(videos);
  console.log(`[TRACKER] Added to processed list: ${videoRecord?.original_url || 'unknown'} -> ${videoRecord?.video_url || 'unknown'}`);
}

async function markVideoProcessed(videoUrl) {
  const { automationId, workerWebhookUrl } = getRunnerEnv();
  
  if (!workerWebhookUrl || !videoUrl) {
    console.log('[TRACKER] Skipped (missing env vars or video URL)');
    return false;
  }
  
  try {
    const base = workerWebhookUrl.replace('/api/webhook/github', '');
    await axios.post(`${base}/api/automations/${automationId}/processed-videos`, {
      video_url: videoUrl,
    }, { timeout: 30000 });
    console.log(`[TRACKER] Marked as processed: ${videoUrl}`);
    return true;
  } catch (e) {
    console.error('[TRACKER] Error marking video:', e.message);
    return false;
  }
}

async function sendProgressUpdate(videoRecord) {
  addProcessedVideo(videoRecord);
  
  const { jobId, automationId, workerWebhookUrl } = getRunnerEnv();
  
  if (!jobId || !workerWebhookUrl) {
    return;
  }
  
  const allProcessed = loadProcessedVideos();
  const processedUrls = allProcessed.map((video) => video.video_url).filter(Boolean);
  const lastUrl = processedUrls[processedUrls.length - 1] || videoRecord?.video_url || null;
  
  try {
    await axios.post(workerWebhookUrl, {
      job_id: jobId,
      automation_id: automationId,
      status: 'running',
      video_url: lastUrl,
      videos_completed: processedUrls.length,
      processed_videos: allProcessed.filter((video) => video && video.video_url),
    }, { timeout: 30000 });
  } catch (e) {
    console.error('[TRACKER] Progress update error:', e.message);
  }
}

module.exports = {
  markVideoProcessed,
  sendProgressUpdate,
  loadProcessedVideos,
};
