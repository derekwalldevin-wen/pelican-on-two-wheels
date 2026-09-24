import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/verify-live.mjs <url>');
const projectDir = fileURLToPath(new URL('..', import.meta.url));
const artifactsDir = join(projectDir, 'artifacts');
mkdirSync(artifactsDir, { recursive: true });

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge was not found.');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

const errors = [];
const failedRequests = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (!request.url().includes('fonts.googleapis.com') && !request.url().includes('fonts.gstatic.com')) {
      failedRequests.push(`${request.url()} — ${request.failure()?.errorText || 'failed'}`);
    }
  });
  const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });
  assert.equal(response?.status(), 200, `Expected HTTP 200, got ${response?.status()}`);
  await page.waitForSelector('#loading.is-done', { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
      title: document.title,
      hasCanvas: Boolean(canvas),
      hasWebGL: Boolean(canvas?.getContext('webgl2') || canvas?.getContext('webgl')),
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      fallbackHidden: document.querySelector('#fallback')?.hidden || false,
      experienceReady: Boolean(window.__pelicanExperience),
    };
  });
  assert.equal(state.hasCanvas, true);
  assert.equal(state.hasWebGL, true);
  assert.equal(state.fallbackHidden, true);
  assert.equal(state.horizontalOverflow, false);
  assert.equal(state.experienceReady, true);

  await page.click('[data-environment="noon"]');
  await page.click('#ride-toggle');
  assert.equal(await page.$eval('#ride-toggle', (element) => element.getAttribute('aria-pressed')), 'false');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: join(artifactsDir, 'live-github-pages.png'), fullPage: true });

  assert.deepEqual(failedRequests, [], `Failed requests: ${failedRequests.join('\n')}`);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log(JSON.stringify({ status: 'passed', url, httpStatus: response.status(), state }, null, 2));
} finally {
  await browser.close();
}
