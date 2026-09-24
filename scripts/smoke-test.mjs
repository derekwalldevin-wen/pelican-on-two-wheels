import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(projectDir, 'dist');
const artifactsDir = join(projectDir, 'artifacts');
mkdirSync(artifactsDir, { recursive: true });

if (!existsSync(join(distDir, 'index.html'))) {
  throw new Error('dist/index.html is missing. Run npm run build first.');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(distDir, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(distDir)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distDir, 'index.html');
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

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
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const errors = [];
const failedRequests = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('fonts.googleapis.com') && !url.includes('fonts.gstatic.com')) {
      failedRequests.push(`${url} — ${request.failure()?.errorText || 'failed'}`);
    }
  });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60_000 });
  await page.waitForSelector('#loading.is-done', { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const desktop = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const app = document.querySelector('#app');
    const context = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return {
      ready: document.readyState,
      hasCanvas: Boolean(canvas),
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      hasWebGL: Boolean(context),
      loaderDone: document.querySelector('#loading')?.classList.contains('is-done') || false,
      fallbackHidden: document.querySelector('#fallback')?.hidden || false,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      appReady: app?.classList.contains('is-ready') || false,
      experienceReady: Boolean(window.__pelicanExperience),
    };
  });
  assert.equal(desktop.ready, 'complete');
  assert.equal(desktop.hasCanvas, true);
  assert.equal(desktop.hasWebGL, true);
  assert.ok(desktop.canvasWidth >= 1000 && desktop.canvasHeight >= 600, 'Desktop canvas should be large');
  assert.equal(desktop.loaderDone, true);
  assert.equal(desktop.fallbackHidden, true);
  assert.equal(desktop.horizontalOverflow, false);
  assert.equal(desktop.appReady, true);
  assert.equal(desktop.experienceReady, true);
  await page.screenshot({ path: join(artifactsDir, 'desktop-initial-1440x900.png'), fullPage: true });

  await page.click('#ride-toggle');
  assert.equal(await page.$eval('#ride-toggle', (element) => element.getAttribute('aria-pressed')), 'false');
  await page.keyboard.press('Space');
  assert.equal(await page.$eval('#ride-toggle', (element) => element.getAttribute('aria-pressed')), 'true');

  await page.$eval('#speed-range', (input) => {
    input.value = '34';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.$eval('#speed-value', (element) => element.textContent), '34');

  await page.click('#sound-toggle');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(await page.$eval('#sound-toggle', (element) => element.getAttribute('aria-pressed')), 'true');
  await page.click('#sound-toggle');
  assert.equal(await page.$eval('#sound-toggle', (element) => element.getAttribute('aria-pressed')), 'false');

  await page.click('[data-environment="sunset"]');
  await new Promise((resolve) => setTimeout(resolve, 1400));
  assert.equal(await page.$eval('[data-environment="sunset"]', (element) => element.getAttribute('aria-pressed')), 'true');

  const cameraBefore = await page.evaluate(() => window.__pelicanExperience.camera.position.toArray());
  await page.mouse.move(840, 430);
  await page.mouse.down();
  await page.mouse.move(1010, 470, { steps: 12 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const cameraAfter = await page.evaluate(() => window.__pelicanExperience.camera.position.toArray());
  assert.notDeepEqual(cameraAfter.map(Math.round), cameraBefore.map(Math.round));

  await page.screenshot({ path: join(artifactsDir, 'desktop-1440x900.png'), fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#loading.is-done', { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const mobile = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const deck = document.querySelector('#ride-panel').getBoundingClientRect();
    const ride = document.querySelector('#ride-toggle').getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      deckVisible: deck.top >= 0 && deck.bottom <= innerHeight + 1,
      rideTouchTarget: Math.min(ride.width, ride.height),
      experienceReady: Boolean(window.__pelicanExperience),
    };
  });
  assert.equal(mobile.horizontalOverflow, false);
  assert.ok(mobile.canvasWidth > 0 && mobile.canvasHeight > 0);
  assert.equal(mobile.deckVisible, true);
  assert.ok(mobile.rideTouchTarget >= 44);
  assert.equal(mobile.experienceReady, true);
  await page.screenshot({ path: join(artifactsDir, 'mobile-390x844.png'), fullPage: true });

  assert.deepEqual(failedRequests, [], `Unexpected failed requests: ${failedRequests.join('\n')}`);
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({ status: 'passed', baseUrl, desktop, mobile, artifactsDir }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
