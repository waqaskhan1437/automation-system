/**
 * Shared Core Utilities
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createFetchAxiosShim() {
  async function post(url, data, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const timeoutMs = Number(options.timeout || 30000);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    const text = await response.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (error) {
      console.error('[CORE] JSON parse error:', error.message);
    }

    if (!response.ok) {
      const message = typeof parsed === 'string' && parsed
        ? parsed
        : `Request failed with status ${response.status}`;
      const err = new Error(message);
      err.response = { status: response.status, data: parsed };
      throw err;
    }

    return { status: response.status, data: parsed };
  }

  return { post };
}

let axios;
try {
  axios = require('axios');
} catch (error) {
  console.log('[CORE] axios not installed, using fetch fallback');
  axios = createFetchAxiosShim();
}

module.exports = { fs, path, execSync, axios, getRandomItem };
