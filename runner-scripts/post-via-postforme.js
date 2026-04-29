const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const FETCH_TIMEOUT_MS = 30000;
const TITLE_PLATFORMS = new Set(["youtube", "tiktok", "tiktok_business"]);

async function timedFetch(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function getRandomFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)] || "";
}

function parsePositiveInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHashtags(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .map((item) => {
      if (!item) return "";
      const normalized = item.replace(/\s+/g, "").replace(/^#+/, "");
      return normalized ? `#${normalized}` : "";
    })
    .filter((item, index, array) => item && array.indexOf(item) === index);
}

function parseTimeValue(value) {
  const raw = cleanString(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function normalizeTimezone(value) {
  const candidate = cleanString(value) || "UTC";
  try {
    Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
      year: "numeric",
    }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function getZonedLocalDateTimeParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.create(null);
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number.parseInt(values.year, 10),
    month: Number.parseInt(values.month, 10),
    day: Number.parseInt(values.day, 10),
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
    second: Number.parseInt(values.second, 10),
  };
}

function buildScheduledUtcDate(dateText, timeText, timezone) {
  const dateMatch = cleanString(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = parseTimeValue(timeText);
  if (!dateMatch || !timeParts) {
    return null;
  }

  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const day = Number.parseInt(dateMatch[3], 10);
  const desiredLocalTimestamp = Date.UTC(year, month - 1, day, timeParts.hour, timeParts.minute);

  let guess = new Date(desiredLocalTimestamp);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = getZonedLocalDateTimeParts(guess, timezone);
    const currentLocalTimestamp = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute);
    const diffMs = desiredLocalTimestamp - currentLocalTimestamp;

    if (diffMs === 0) {
      return guess;
    }

    guess = new Date(guess.getTime() + diffMs);
  }

  const resolved = getZonedLocalDateTimeParts(guess, timezone);
  if (
    resolved.year === year
    && resolved.month === month
    && resolved.day === day
    && resolved.hour === timeParts.hour
    && resolved.minute === timeParts.minute
  ) {
    return guess;
  }

  return null;
}

function roundUpToNextMinute(date) {
  const next = new Date(date.getTime());
  next.setUTCSeconds(0, 0);
  if (next.getTime() < date.getTime()) {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }
  return next;
}

function ensureMinimumScheduledLead(date, minimumMinutes = 1) {
  const minimum = roundUpToNextMinute(new Date(Date.now() + minimumMinutes * 60_000));
  return date.getTime() <= minimum.getTime() ? minimum : date;
}

function getDelayMinutes(config) {
  if (cleanString(config.delay_minutes) === "custom") {
    return Math.min(1440, Math.max(1, parsePositiveInteger(config.delay_minutes_custom, 60)));
  }
  return Math.min(1440, Math.max(1, parsePositiveInteger(config.delay_minutes, 60)));
}

function getStaggerMinutes(config) {
  return Math.max(1, parsePositiveInteger(config.post_stagger_minutes, 15));
}

function buildPublishingPlan(config, socialAccounts) {
  const autoPublish = config.auto_publish === true;
  const publishMode = cleanString(config.publish_mode) || (autoPublish ? "delay" : "immediate");
  const publishTimezone = normalizeTimezone(config.postforme_schedule_timezone || config.schedule_timezone);
  const delayMinutes = getDelayMinutes(config);
  const staggerMinutes = getStaggerMinutes(config);
  const scheduleDate = cleanString(config.schedule_date);
  const scheduleTime = cleanString(config.schedule_time);
  const accountStaggerEnabled = config.postforme_account_stagger_enabled === true;

  if (!autoPublish || !Array.isArray(socialAccounts) || socialAccounts.length === 0) {
    return {
      autoPublish: false,
      publishMode,
      postStatus: "pending",
      scheduledAt: null,
      scheduledAccounts: [],
      publishTimezone,
    };
  }

  if (publishMode === "scheduled" && scheduleDate && scheduleTime) {
    const scheduledDate = buildScheduledUtcDate(scheduleDate, scheduleTime, publishTimezone);
    if (!scheduledDate) {
      throw new Error("Invalid scheduled publish date/time");
    }

    return {
      autoPublish: true,
      publishMode,
      postStatus: "scheduled",
      scheduledAt: ensureMinimumScheduledLead(scheduledDate).toISOString(),
      scheduledAccounts: [],
      publishTimezone,
    };
  }

  if (publishMode === "scheduled") {
    return {
      autoPublish: true,
      publishMode,
      postStatus: "scheduled",
      scheduledAt: ensureMinimumScheduledLead(new Date(Date.now() + delayMinutes * 60 * 1000)).toISOString(),
      scheduledAccounts: [],
      publishTimezone,
    };
  }

  if (publishMode === "delay") {
    return {
      autoPublish: true,
      publishMode,
      postStatus: "scheduled",
      scheduledAt: ensureMinimumScheduledLead(new Date(Date.now() + delayMinutes * 60 * 1000)).toISOString(),
      scheduledAccounts: [],
      publishTimezone,
    };
  }

  if (publishMode === "stagger" && socialAccounts.length > 1) {
    if (accountStaggerEnabled) {
      return {
        autoPublish: true,
        publishMode,
        postStatus: "scheduled",
        scheduledAt: ensureMinimumScheduledLead(new Date(Date.now())).toISOString(),
        scheduledAccounts: socialAccounts.map((accountId, index) => ({
          id: accountId,
          scheduled_at: ensureMinimumScheduledLead(new Date(Date.now() + index * staggerMinutes * 60 * 1000)).toISOString(),
        })),
        publishTimezone,
      };
    }

    return {
      autoPublish: true,
      publishMode,
      postStatus: "scheduled",
      scheduledAt: ensureMinimumScheduledLead(new Date(Date.now() + staggerMinutes * 60 * 1000)).toISOString(),
      scheduledAccounts: [],
      publishTimezone,
    };
  }

  return {
    autoPublish: true,
    publishMode,
    postStatus: "posted",
    scheduledAt: null,
    scheduledAccounts: [],
    publishTimezone,
  };
}

async function fetchSelectedPostformeAccounts(apiKey, accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("limit", String(Math.max(accountIds.length, 50)));
  for (const accountId of accountIds) {
    params.append("id", accountId);
  }

  const response = await timedFetch(`https://api.postforme.dev/v1/social-accounts?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch social accounts: ${errorText}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function buildPlatformConfigurations(selectedAccounts, title) {
  if (!title) {
    return {};
  }

  const platforms = Array.from(
    new Set(
      (Array.isArray(selectedAccounts) ? selectedAccounts : [])
        .map((account) => cleanString(account && account.platform))
        .filter(Boolean)
    )
  );

  return platforms.reduce((accumulator, platform) => {
    if (!TITLE_PLATFORMS.has(platform)) {
      return accumulator;
    }

    accumulator[platform] = { title };
    if (platform === "tiktok") {
      accumulator.tiktok_business = { title };
    }
    return accumulator;
  }, {});
}

async function uploadMediaToPostforme(apiKey, filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);
  console.log(`Uploading ${fileName} to PostForMe (${(fileData.length / 1024 / 1024).toFixed(2)} MB)...`);

  const createUrlBody = JSON.stringify({
    filename: fileName,
    content_type: "video/mp4",
  });

  const createUrlResponse = await timedFetch("https://api.postforme.dev/v1/media/create-upload-url", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: createUrlBody,
  });

  if (!createUrlResponse.ok) {
    const errorText = await createUrlResponse.text();
    throw new Error(`Failed to create upload URL: ${errorText}`);
  }

  const urlData = await createUrlResponse.json();
  const { upload_url: uploadUrl, media_url: mediaUrl } = urlData;

  const uploadResponse = await timedFetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: fileData,
  }, 120000);

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload media: ${uploadResponse.status}`);
  }

  console.log(`Media uploaded to PostForMe: ${mediaUrl}`);
  return mediaUrl;
}

async function createPostformePost(apiKey, mediaUrl, caption, socialAccounts, scheduledAt, isDraft, platformConfigurations) {
  const postBody = {
    caption,
    media: [{ url: mediaUrl }],
    social_accounts: socialAccounts,
    isDraft,
  };

  if (scheduledAt && !isDraft) {
    postBody.scheduled_at = scheduledAt;
  }
  if (platformConfigurations && Object.keys(platformConfigurations).length > 0 && socialAccounts.length > 0) {
    postBody.platform_configurations = platformConfigurations;
  }

  const response = await timedFetch("https://api.postforme.dev/v1/social-posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create post: ${errorText}`);
  }

  return await response.json();
}

async function main() {
  console.log("=== PostForMe Posting ===");

  const apiKeyFromEnv = process.env.POSTFORME_API_KEY;
  const litterboxUrl = process.env.LITTERBOX_URL;

  let config = {};
  try {
    const configPath = path.join(process.cwd(), "automation-config.json");
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch {
    console.log("Could not read config file");
  }

  const apiKey = apiKeyFromEnv || cleanString(config.postforme_api_key);
  if (!apiKey) {
    console.log("No POSTFORME_API_KEY - skipping PostForMe");
    process.exit(0);
  }

  const autoPublish = config.auto_publish === true;
  const socialAccounts = Array.isArray(config.postforme_account_ids) ? config.postforme_account_ids : [];
  const topTaglines = Array.isArray(config.top_taglines) ? config.top_taglines : [];
  const bottomTaglines = Array.isArray(config.bottom_taglines) ? config.bottom_taglines : [];
  const titles = Array.isArray(config.titles) ? config.titles : [];
  const descriptions = Array.isArray(config.descriptions) ? config.descriptions : [];
  const hashtags = Array.isArray(config.hashtags) ? config.hashtags : [];

  let selectedAccountDetails = [];
  if (autoPublish && socialAccounts.length > 0) {
    try {
      selectedAccountDetails = await fetchSelectedPostformeAccounts(apiKey, socialAccounts);
    } catch (err) {
      console.warn(`Could not preload selected account details: ${err.message}`);
    }
  }

  const topTagline = getRandomFromArray(topTaglines);
  const bottomTagline = getRandomFromArray(bottomTaglines);
  const title = getRandomFromArray(titles);
  const description = getRandomFromArray(descriptions);
  const normalizedHashtags = normalizeHashtags(hashtags);
  const hashtagsStr = normalizedHashtags.join(" ");
  const caption = [topTagline, title, description, hashtagsStr, bottomTagline]
    .filter(Boolean)
    .join("\n\n");
  const platformConfigurations = buildPlatformConfigurations(selectedAccountDetails, title || "");

  let mediaUrl = null;
  if (litterboxUrl && litterboxUrl.startsWith("https://")) {
    console.log(`Using Litterbox URL: ${litterboxUrl}`);
    mediaUrl = litterboxUrl;
  } else {
    console.log("No Litterbox URL, uploading to PostForMe storage...");
    const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
    if (!fs.existsSync(videoFile)) {
      console.error("No processed video file found");
      process.exit(1);
    }
    mediaUrl = await uploadMediaToPostforme(apiKey, videoFile);
  }

  let livePostId = null;
  let draftPostId = null;
  let postStatus = "pending";
  let scheduledAt = null;
  let scheduledAccounts = [];
  let livePostIds = [];

  try {
    const publishingPlan = buildPublishingPlan(config, socialAccounts);
    postStatus = publishingPlan.postStatus;
    scheduledAt = publishingPlan.scheduledAt;
    scheduledAccounts = publishingPlan.scheduledAccounts;

    if (publishingPlan.autoPublish) {
      console.log(`Publishing to ${socialAccounts.length} account(s) with mode ${publishingPlan.publishMode}...`);

      if (publishingPlan.publishMode === "stagger" && scheduledAccounts.length > 0) {
        for (const scheduledAccount of scheduledAccounts) {
          const livePost = await createPostformePost(
            apiKey,
            mediaUrl,
            caption,
            [scheduledAccount.id],
            scheduledAccount.scheduled_at,
            false,
            platformConfigurations
          );

          const createdId = livePost && (livePost.id || (livePost.data && livePost.data.id)) || null;
          livePostIds.push(createdId);
        }

        livePostId = livePostIds.find(Boolean) || null;
      } else {
        const livePost = await createPostformePost(
          apiKey,
          mediaUrl,
          caption,
          socialAccounts,
          scheduledAt,
          false,
          platformConfigurations
        );
        livePostId = livePost && (livePost.id || (livePost.data && livePost.data.id)) || null;
        livePostIds = livePostId ? [livePostId] : [];
      }
    } else {
      console.log("Auto-publish disabled or no accounts selected - skipping live post");
    }

    console.log("Creating draft post for review queue...");
    const draftPost = await createPostformePost(
      apiKey,
      mediaUrl,
      caption,
      [],
      null,
      true
    );
    draftPostId = draftPost && (draftPost.id || (draftPost.data && draftPost.data.id)) || null;
    console.log(`Draft post created: ${draftPostId}`);
  } catch (err) {
    console.error(`PostForMe error: ${err.message}`);
  }

  const scheduledAccountMetadata = socialAccounts.map((accountId, index) => {
    const account = selectedAccountDetails.find((item) => item && item.id === accountId) || null;
    const scheduledRecord = scheduledAccounts.find((item) => item.id === accountId) || null;
    const perAccountPostId = scheduledRecord
      ? livePostIds[index] || null
      : livePostId || null;

    return {
      id: accountId,
      platform: cleanString(account && account.platform),
      username: cleanString(account && account.username) || accountId,
      scheduled_at: scheduledRecord ? scheduledRecord.scheduled_at : scheduledAt,
      postforme_id: perAccountPostId,
    };
  });

  const platformConfigurationMetadata = Object.entries(platformConfigurations).map(([platform, configuration]) => ({
    platform,
    title: cleanString(configuration && configuration.title),
    caption,
  }));

  const outputData = {
    success: true,
    media_url: mediaUrl,
    live_post_id: livePostId,
    live_post_ids: livePostIds.filter(Boolean),
    draft_post_id: draftPostId,
    platforms: socialAccounts.length,
    caption,
    post_status: postStatus,
    scheduled_at: scheduledAt,
    post_metadata: {
      title: title || "",
      description: description || "",
      hashtags: normalizedHashtags,
      caption,
      top_tagline: topTagline || "",
      bottom_tagline: bottomTagline || "",
      schedule_mode: cleanString(config.publish_mode) || (autoPublish ? "delay" : "immediate"),
      scheduled_accounts: scheduledAccountMetadata,
      platform_configurations: platformConfigurationMetadata,
    },
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "post_result.json"),
    JSON.stringify(outputData)
  );

  console.log("=== SUCCESS ===");
  process.exit(0);
}

module.exports = {
  buildPublishingPlan,
  buildScheduledUtcDate,
  ensureMinimumScheduledLead,
  normalizeTimezone,
  parseTimeValue,
};

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
}
