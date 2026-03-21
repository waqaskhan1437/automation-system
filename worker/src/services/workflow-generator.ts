import { VideoAutomationConfig, ImageAutomationConfig } from "../types";

export function generateVideoWorkflow(
  automationName: string,
  config: VideoAutomationConfig
): string {
  const configJson = JSON.stringify(config).replace(/"/g, '\\"');
  const platformsJson = JSON.stringify(config.platforms).replace(/"/g, '\\"');

  return `name: "Video Automation - ${automationName}"
on:
  workflow_dispatch:
    inputs:
      job_id:
        description: 'Job ID from worker'
        required: true
        type: number

jobs:
  process:
    runs-on: self-hosted
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: runner-scripts

      - name: Download Video
        env:
          VIDEO_SOURCE: "${config.video_source}"
          VIDEO_URL: "${config.video_url}"
          GOOGLE_PHOTOS_ALBUM_URL: "${config.google_photos_album_url || ''}"
          BUNNY_API_KEY: \${{ secrets.BUNNY_API_KEY }}
          BUNNY_LIBRARY_ID: \${{ secrets.BUNNY_LIBRARY_ID }}
        run: node download-video.js
        working-directory: runner-scripts

      - name: Process Video (FFmpeg)
        env:
          FFMPEG_CONFIG: "${configJson}"
          OUTPUT_FORMAT: "${config.output_format}"
          OUTPUT_QUALITY: "${config.output_quality}"
          OUTPUT_RESOLUTION: "${config.output_resolution}"
        run: node process-video.js
        working-directory: runner-scripts

      - name: Post to Social Media
        env:
          POSTFORME_API_KEY: \${{ secrets.POSTFORME_API_KEY }}
          PLATFORMS: "${platformsJson}"
          WORKER_WEBHOOK_URL: \${{ secrets.WORKER_WEBHOOK_URL }}
          JOB_ID: \${{ github.event.inputs.job_id }}
        run: node post-via-postforme.js
        working-directory: runner-scripts

      - name: Update Job Status
        if: always()
        env:
          WORKER_WEBHOOK_URL: \${{ secrets.WORKER_WEBHOOK_URL }}
          JOB_ID: \${{ github.event.inputs.job_id }}
          JOB_STATUS: \${{ job.status }}
        run: node update-job-status.js
        working-directory: runner-scripts
`;
}

export function generateImageWorkflow(
  automationName: string,
  config: ImageAutomationConfig
): string {
  const configJson = JSON.stringify(config).replace(/"/g, '\\"');
  const platformsJson = JSON.stringify(config.platforms).replace(/"/g, '\\"');

  return `name: "Image Automation - ${automationName}"
on:
  workflow_dispatch:
    inputs:
      job_id:
        description: 'Job ID from worker'
        required: true
        type: number

jobs:
  process:
    runs-on: self-hosted
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: runner-scripts

      - name: Generate/Fetch Image
        env:
          IMAGE_SOURCE: "${config.image_source}"
          IMAGE_URL: "${config.image_url || ""}"
          PLACEHOLDER_TEXT: "${config.placeholder_text || ""}"
          IMAGE_CONFIG: "${configJson}"
        run: node generate-image.js
        working-directory: runner-scripts

      - name: Post to Social Media
        env:
          POSTFORME_API_KEY: \${{ secrets.POSTFORME_API_KEY }}
          PLATFORMS: "${platformsJson}"
          WORKER_WEBHOOK_URL: \${{ secrets.WORKER_WEBHOOK_URL }}
          JOB_ID: \${{ github.event.inputs.job_id }}
        run: node post-via-postforme.js
        working-directory: runner-scripts

      - name: Update Job Status
        if: always()
        env:
          WORKER_WEBHOOK_URL: \${{ secrets.WORKER_WEBHOOK_URL }}
          JOB_ID: \${{ github.event.inputs.job_id }}
          JOB_STATUS: \${{ job.status }}
        run: node update-job-status.js
        working-directory: runner-scripts
`;
}
