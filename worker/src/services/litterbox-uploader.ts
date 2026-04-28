/**
 * ============================================================================
 * Litterbox Uploader Service
 * ============================================================================
 * Server-to-server file upload to Litterbox temporary file hosting
 * API: https://litterbox.catbox.moe/resources/internals/api.php
 * 
 * Features:
 * - Multipart/form-data uploads
 * - Configurable expiry time (1h, 12h, 24h, 72h)
 * - Progress tracking
 * - Retry logic with exponential backoff
 * - Max 1GB file size
 * ============================================================================
 */

import { sleep, calculateBackoff } from "../lib/retry";

export type LitterboxExpiry = "1h" | "12h" | "24h" | "72h";

export interface LitterboxUploadOptions {
  expiry?: LitterboxExpiry;
  maxRetries?: number;
  timeout?: number;
}

export interface LitterboxUploadResult {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  expiry?: LitterboxExpiry;
  expiresAt?: Date;
  error?: string;
}

export interface UploadProgress {
  status: "uploading" | "processing" | "completed" | "error";
  progress: number;
  uploadedBytes?: number;
  totalBytes?: number;
  speed?: string;
  eta?: string;
  error?: string;
}

const LITTERBOX_API_URL = "https://litterbox.catbox.moe/resources/internals/api.php";
const DEFAULT_OPTIONS: Required<LitterboxUploadOptions> = {
  expiry: "72h",
  maxRetries: 3,
  timeout: 300000, // 5 minutes
};

const EXPIRY_HOURS: Record<LitterboxExpiry, number> = {
  "1h": 1,
  "12h": 12,
  "24h": 24,
  "72h": 72,
};

/**
 * Validate file size (max 1GB for Litterbox)
 */
export function validateFileSize(size: number): { valid: boolean; error?: string } {
  const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 1GB limit (${(size / MAX_SIZE).toFixed(2)}GB)`,
    };
  }
  if (size <= 0) {
    return {
      valid: false,
      error: "Invalid file size",
    };
  }
  return { valid: true };
}

/**
 * Validate expiry time
 */
export function isValidExpiry(expiry: string): expiry is LitterboxExpiry {
  return ["1h", "12h", "24h", "72h"].includes(expiry);
}

/**
 * Calculate expiration date from expiry option
 */
export function calculateExpiryDate(expiry: LitterboxExpiry): Date {
  const hours = EXPIRY_HOURS[expiry];
  const now = new Date();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Create multipart/form-data body
 */
function createMultipartBody(
  fileBuffer: Uint8Array,
  fileName: string,
  expiry: LitterboxExpiry
): { body: Uint8Array; boundary: string; contentType: string } {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;
  const encoder = new TextEncoder();

  // Build multipart form data
  const parts: Uint8Array[] = [];

  // reqtype field
  const reqtypeHeader = `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\n`;
  parts.push(encoder.encode(reqtypeHeader));
  parts.push(encoder.encode("fileupload"));
  parts.push(encoder.encode("\r\n"));

  // time field
  const timeHeader = `--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n`;
  parts.push(encoder.encode(timeHeader));
  parts.push(encoder.encode(expiry));
  parts.push(encoder.encode("\r\n"));

  // file field
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  parts.push(encoder.encode(fileHeader));
  parts.push(fileBuffer);
  parts.push(encoder.encode("\r\n"));

  // Closing boundary
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  // Calculate total size
  const totalSize = parts.reduce((acc, part) => acc + part.length, 0);
  const body = new Uint8Array(totalSize);

  // Concatenate all parts
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }

  return {
    body,
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Upload file to Litterbox
 */
export async function uploadToLitterbox(
  fileBuffer: Uint8Array,
  fileName: string,
  options: LitterboxUploadOptions = {}
): Promise<LitterboxUploadResult> {
  const mergedOptions: Required<LitterboxUploadOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Validate file size
  const sizeValidation = validateFileSize(fileBuffer.length);
  if (!sizeValidation.valid) {
    return {
      success: false,
      error: sizeValidation.error,
    };
  }

  // Validate expiry
  if (!isValidExpiry(mergedOptions.expiry)) {
    return {
      success: false,
      error: `Invalid expiry time. Must be one of: 1h, 12h, 24h, 72h`,
    };
  }

  console.log(`Starting Litterbox upload: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
  console.log(`Expiry: ${mergedOptions.expiry}, Max retries: ${mergedOptions.maxRetries}`);

  let lastError: string | undefined;

  for (let attempt = 0; attempt < mergedOptions.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoff(attempt - 1);
        console.log(`Retry attempt ${attempt + 1}/${mergedOptions.maxRetries} after ${Math.round(delay)}ms delay`);
        await sleep(delay);
      }

      // Create multipart body
      const { body, contentType } = createMultipartBody(
        fileBuffer,
        fileName,
        mergedOptions.expiry
      );

      console.log(`Upload attempt ${attempt + 1}/${mergedOptions.maxRetries}`);

      const response = await fetch(LITTERBOX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "User-Agent": "AutomationSystem/1.0",
        },
        body: body,
      });

      console.log(`Litterbox response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`Litterbox response: ${responseText}`);

      // Response should be a URL
      if (responseText.startsWith("https://")) {
        const result: LitterboxUploadResult = {
          success: true,
          fileUrl: responseText.trim(),
          fileName,
          fileSize: fileBuffer.length,
          expiry: mergedOptions.expiry,
          expiresAt: calculateExpiryDate(mergedOptions.expiry),
        };

        console.log(`Upload successful: ${result.fileUrl}`);
        console.log(`File expires at: ${result.expiresAt?.toISOString()}`);

        return result;
      }

      throw new Error(`Unexpected response format: ${responseText}`);

    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`Upload attempt ${attempt + 1} failed:`, lastError);
    }
  }

  return {
    success: false,
    error: lastError || "Upload failed after all retries",
  };
}

/**
 * Upload from URL (fetch then upload to Litterbox)
 * This is useful for server-to-server transfers
 */
export async function uploadFromUrlToLitterbox(
  sourceUrl: string,
  fileName: string,
  options: LitterboxUploadOptions = {}
): Promise<LitterboxUploadResult> {
  const mergedOptions: Required<LitterboxUploadOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  console.log(`Fetching file from: ${sourceUrl}`);

  try {
    // Fetch the file from source URL
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "User-Agent": "AutomationSystem/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch source file: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      console.log(`File size: ${(size / 1024 / 1024).toFixed(2)}MB`);

      const validation = validateFileSize(size);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    // Download to buffer
    const fileBuffer = new Uint8Array(await response.arrayBuffer());

    // Upload to Litterbox
    return uploadToLitterbox(fileBuffer, fileName, mergedOptions);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in uploadFromUrlToLitterbox:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify Litterbox URL is accessible
 */
export async function verifyLitterboxUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!url.startsWith("https://litterbox.catbox.moe/") && 
        !url.startsWith("https://files.catbox.moe/")) {
      return { valid: false, error: "Invalid Litterbox URL format" };
    }

    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "AutomationSystem/1.0",
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `URL returned status ${response.status}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get time until expiry
 */
export function getTimeUntilExpiry(expiresAt: Date): { hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { hours, minutes, seconds };
}
