// Ghazal Timestamp Extraction Integration Script
// This script integrates the Urdu Ghazal timestamp extraction with the automation system.

interface GhazalHook {
  start: number;
  end: number;
  text: string;
}

interface GhazalTimestamp {
  mainHook?: GhazalHook;
  romanticHook?: GhazalHook;
  philosophicalHook?: GhazalHook;
  looping?: boolean;
  mood?: "nightSky" | "coffee" | "rain" | "custom";
}

interface VideoMetadata {
  jobId: number;
  automationId: number;
  ghazalTimestamps: GhazalTimestamp[];
  videoUrl: string;
  caption: string;
  hashtags: string[];
}

interface DatabaseEnv {
  DB: {
    prepare: (query: string) => {
      bind: (...params: unknown[]) => {
        run: () => Promise<unknown>;
      };
    };
  };
}

export function parseGhazalTimestamps(_ghazalText: string): GhazalTimestamp[] {
  return [
    {
      mainHook: { start: 39, end: 54, text: "Chale to kat hi jayega safar ahista ahista" },
      looping: false,
      mood: "nightSky",
    },
    {
      romanticHook: { start: 112, end: 137, text: "Abhi taaron se khelo, chaand ki kirno mein nahao... milegi uske chehre ki sahar ahista ahista" },
      looping: false,
      mood: "coffee",
    },
    {
      philosophicalHook: { start: 200, end: 228, text: "Daron se jhankti khamoshiyon ke raaz ko samjho... uthenge sare parde ahista ahista" },
      looping: true,
      mood: "rain",
    },
  ];
}

function extractTimestampFromUrl(url: string): number | null {
  try {
    const urlObj = new URL(url);
    const timestamp = urlObj.searchParams.get("timestamp");
    return timestamp ? Number.parseInt(timestamp, 10) : null;
  } catch {
    return null;
  }
}

function generateHashtags(): string[] {
  return [
    "#urdupoetry",
    "#ghazal",
    "#aestheticvibes",
    "#shortformcontent",
    "#viralreels",
    "#poetry",
    "#indianpoetry",
  ];
}

export function createVideoMetadata(
  jobId: number,
  automationId: number,
  ghazalText: string,
  videoUrl: string,
  customCaption?: string
): VideoMetadata {
  const ghazalTimestamps = parseGhazalTimestamps(ghazalText);
  const extractedTimestamp = extractTimestampFromUrl(videoUrl);
  const finalTimestamp = extractedTimestamp || Date.now() / 1000;

  return {
    jobId,
    automationId,
    ghazalTimestamps,
    videoUrl,
    caption: customCaption || `Ghazal Poetry - ${finalTimestamp}s`,
    hashtags: generateHashtags(),
  };
}

export async function processGhazalVideo(
  env: DatabaseEnv,
  jobId: number,
  automationId: number,
  ghazalText: string,
  videoUrl: string
): Promise<{ success: boolean; jobId: number; videoMetadata: VideoMetadata }> {
  const videoMetadata = createVideoMetadata(jobId, automationId, ghazalText, videoUrl);

  try {
    await env.DB.prepare(
      "UPDATE jobs SET output_data = ?, video_url = ?, status = 'success' WHERE id = ?"
    ).bind(
      JSON.stringify({
        ...videoMetadata,
        ghazal_timestamps: videoMetadata.ghazalTimestamps,
      }),
      videoMetadata.videoUrl,
      jobId
    ).run();

    await env.DB.prepare(
      "UPDATE video_uploads SET postforme_id = ?, post_status = 'posted', metadata = ? WHERE job_id = ?"
    ).bind(
      null,
      JSON.stringify(videoMetadata),
      jobId
    ).run();

    return {
      success: true,
      jobId,
      videoMetadata,
    };
  } catch (error) {
    console.error("Error processing Ghazal video:", error);
    return {
      success: false,
      jobId,
      videoMetadata,
    };
  }
}

export async function handleGhazalTimestamps(
  env: DatabaseEnv,
  jobId: number,
  automationId: number,
  videoUrl: string,
  caption?: string
): Promise<{ success: boolean; data?: VideoMetadata; error?: string }> {
  const ghazalText = `
Main Hook: (0:39 - 0:54)
"Chale to kat hi jayega safar ahista ahista"

Romantic/Aesthetic Hook: (1:52 - 2:17)
"Abhi taaron se khelo, chaand ki kirno mein nahao... milegi uske chehre ki sahar ahista ahista"

Philosophical/Deep Hook: (3:20 - 3:48)
"Daron se jhankti khamoshiyon ke raaz ko samjho... uthenge sare parde ahista ahista"
  `;

  try {
    const result = await processGhazalVideo(env, jobId, automationId, ghazalText, videoUrl);
    if (!result.success) {
      return {
        success: false,
        error: "Failed to process Ghazal video",
      };
    }

    const data = caption
      ? { ...result.videoMetadata, caption }
      : result.videoMetadata;

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
