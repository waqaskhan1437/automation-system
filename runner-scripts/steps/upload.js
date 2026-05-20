/**
 * Step: Upload - Uploads processed media to Catbox or Litterbox
 */
const { fs, path } = require('../lib/core');
const { OUTPUT_DIR } = require('../lib/paths');

function readTrimmedEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function createMultipartBody(fileBuffer, fileName, extraFields, fileFieldName = 'fileToUpload') {
  const boundary = `----AutomationBoundary${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const parts = [];

  for (const [key, value] of Object.entries(extraFields)) {
    if (typeof value !== 'string' || !value) {
      continue;
    }
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
    parts.push(encoder.encode(value));
    parts.push(encoder.encode('\r\n'));
  }

  parts.push(encoder.encode(`--${boundary}\r\n`));
  parts.push(
    encoder.encode(
      `Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(encoder.encode('\r\n'));
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  const totalSize = parts.reduce((sum, part) => sum + part.length, 0);
  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadToService(name, url, file, extraFields, fileFieldName = 'fileToUpload') {
  console.log(`[UPLOAD] Uploading to ${name}...`);
  const fileBuffer = new Uint8Array(fs.readFileSync(file));
  const fileName = path.basename(file);
  const { body, contentType } = createMultipartBody(fileBuffer, fileName, extraFields, fileFieldName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      body,
      signal: controller.signal,
    });

    const text = (await response.text()).trim();
    console.log(`[UPLOAD] ${name} HTTP ${response.status} response:`, text.slice(0, 200));
    if (response.ok && text.startsWith('https://')) {
      console.log(`[UPLOAD] ${name} OK:`, text);
      return text;
    }
    throw new Error(`${name} returned [HTTP ${response.status}]: ${text || response.statusText}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadWithRetry(name, url, file, extraFields, attempts = 2, fileFieldName = 'fileToUpload') {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`[UPLOAD] Retrying ${name} (${attempt}/${attempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
      return await uploadToService(name, url, file, extraFields, fileFieldName);
    } catch (error) {
      lastError = error;
      console.error(`[UPLOAD] ${name} attempt ${attempt} failed:`, error.message);
    }
  }
  throw lastError || new Error(`${name} upload failed`);
}

module.exports = async function upload(filePath) {
  console.log('[UPLOAD] Starting...');

  const file = filePath ? path.resolve(filePath) : path.join(OUTPUT_DIR, 'processed-video.mp4');
  if (!fs.existsSync(file)) {
    throw new Error('Processed file not found');
  }

  const catboxUserhash = readTrimmedEnv('CATBOX_USERHASH');
  const uploadTargets = [
    {
      name: catboxUserhash ? 'Catbox' : 'Catbox Anonymous',
      url: 'https://catbox.moe/user/api.php',
      fields: {
        reqtype: 'fileupload',
        userhash: catboxUserhash,
      },
      fileFieldName: 'fileToUpload',
      attempts: 2,
    },
    {
      name: 'Litterbox',
      url: 'https://litterbox.catbox.moe/resources/internals/api.php',
      fields: {
        reqtype: 'fileupload',
        time: readTrimmedEnv('LITTERBOX_EXPIRY') || '72h',
      },
      fileFieldName: 'fileToUpload',
      attempts: 2,
    },
    {
      name: '0x0.st',
      url: 'https://0x0.st',
      fields: {
        expires: readTrimmedEnv('NULLPOINTER_EXPIRES') || '24',
      },
      fileFieldName: 'file',
      attempts: 2,
    },
  ];

  let lastError = null;
  for (const target of uploadTargets) {
    try {
      const uploadedUrl = await uploadWithRetry(
        target.name,
        target.url,
        file,
        target.fields,
        target.attempts,
        target.fileFieldName
      );
      if (target.name === 'Litterbox') {
        console.warn('[UPLOAD] Using temporary Litterbox URL fallback');
      } else if (target.name === '0x0.st') {
        console.warn('[UPLOAD] Using 0x0.st temporary URL fallback');
      }
      return uploadedUrl;
    } catch (error) {
      lastError = error;
      console.error(`[UPLOAD] ${target.name} failed:`, error.message);
    }
  }

  throw new Error(`Media upload failed: ${lastError ? lastError.message : 'Unknown upload error'}`);
};
