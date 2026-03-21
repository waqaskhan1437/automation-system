const API = "https://automation-api.waqaskhan1437.workers.dev";

async function createAutomation() {
  const config = {
    name: "Test YouTube Shorts",
    video_source: "youtube_channel",
    youtube_channel_url: "https://photos.app.goo.gl/N5QNJTJreUduW6Yd9",
    schedule_type: "daily",
    schedule_hour: "12",
    videos_per_run: "1",
    short_duration: "60",
    aspect_ratio: "9:16",
    playback_speed: "1.0",
    rotation_enabled: true,
    rotation_shuffle: true,
    whisper_enabled: true,
    whisper_language: "en",
    split_enabled: false,
    combine_enabled: false,
    mute_audio: false,
    top_taglines: ["Watch till end!", "You won't believe this!", "Must watch!", "Incredible!", "Amazing!"],
    bottom_taglines: ["Follow for more!", "Like & Share!", "Subscribe!", "Comment below!"],
    tagline_rotation: "random",
    tagline_style: "bold",
    auto_publish: true,
    publish_mode: "immediate"
  };

  const body = {
    name: "Test YouTube Shorts",
    type: "video",
    config: JSON.stringify(config)
  };

  console.log("Creating automation...\n");
  
  const res = await fetch(`${API}/api/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
  
  if (data.success && data.data?.id) {
    console.log(`\n✅ Automation created with ID: ${data.data.id}`);
    console.log("\nTo run the automation, visit:");
    console.log(`https://frontend-nine-jet-27.vercel.app/automations`);
    console.log("\nOr click the Play button next to 'Test YouTube Shorts'");
    
    // Try to auto-run
    console.log("\nAttempting to auto-run...");
    const runRes = await fetch(`${API}/api/automations/${data.data.id}/run`, {
      method: "POST"
    });
    const runData = await runRes.json();
    console.log("Run response:", JSON.stringify(runData, null, 2));
  }
}

createAutomation().catch(console.error);
