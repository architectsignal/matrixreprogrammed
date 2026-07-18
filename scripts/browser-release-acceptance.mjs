import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = process.cwd();
const deploy = path.resolve(root, process.env.DEPLOY_DIR || '_site');
const baseUrl = process.env.RELEASE_BASE_URL || 'http://127.0.0.1:4173';
const concurrency = Math.max(1, Number(process.env.RELEASE_BROWSER_CONCURRENCY || 4));
const timeout = Math.max(2000, Number(process.env.RELEASE_BROWSER_TIMEOUT || 8000));
const problems = [];
const warnings = [];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}
function relative(file) { return path.relative(deploy, file).split(path.sep).join('/'); }
function route(file) {
  const rel = relative(file);
  return rel === 'index.html' ? '/' : `/${rel}`;
}
function addProblem(value) { problems.push(value); }
function isLocal(url) {
  const parsed = new URL(url);
  return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
}

if (!fs.existsSync(deploy)) throw new Error(`Deploy directory missing: ${deploy}`);
const files = walk(deploy).sort();
const browser = await chromium.launch({ headless: true });
let cursor = 0;
let checked = 0;

async function testAnalyticsConsent() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', routeHandler => isLocal(routeHandler.request().url()) ? routeHandler.continue() : routeHandler.abort());
  const page = await context.newPage();
  const tracking = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/track-event') tracking.push(request.url()); });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(250);
  const consent = await page.evaluate(() => ({
    banner: Boolean(document.getElementById('matrix-analytics-consent')),
    buttons: document.querySelectorAll('#matrix-analytics-consent button[data-analytics-choice]').length,
    privacyLink: Boolean(document.querySelector('#matrix-analytics-consent a[href*="privacy"]')),
    state: window.MatrixPrivacy?.status?.() || 'missing',
    cookies: document.cookie
  }));
  if (tracking.length) addProblem(`analytics consent: ${tracking.length} tracking request(s) sent before consent`);
  if (!consent.banner || consent.buttons < 2 || !consent.privacyLink) addProblem('analytics consent: accessible accept, decline and privacy controls are incomplete');
  if (consent.state !== 'unset') addProblem(`analytics consent: first-visit state should be unset, received ${consent.state}`);
  if (consent.cookies) addProblem(`analytics consent: cookies appeared before consent (${consent.cookies})`);
  const essential = page.locator('[data-analytics-choice="denied"]');
  if (await essential.count()) await essential.click();
  await page.waitForTimeout(100);
  const denied = await page.evaluate(() => ({ state: window.MatrixPrivacy?.status?.(), banner: Boolean(document.getElementById('matrix-analytics-consent')) }));
  if (denied.state !== 'denied' || denied.banner) addProblem('analytics consent: Essential only did not persist denial and close the prompt');
  if (tracking.length) addProblem('analytics consent: denial caused a tracking request');
  await context.close();

  const grantedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await grantedContext.addInitScript(() => {
    localStorage.setItem('matrix_analytics_consent', JSON.stringify({ choice: 'granted', version: 'analytics-consent-v1', updatedAt: new Date().toISOString() }));
  });
  await grantedContext.route('**/*', routeHandler => isLocal(routeHandler.request().url()) ? routeHandler.continue() : routeHandler.abort());
  const grantedPage = await grantedContext.newPage();
  const grantedTracking = [];
  grantedPage.on('request', request => { if (new URL(request.url()).pathname === '/track-event') grantedTracking.push(request.url()); });
  await grantedPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout });
  await grantedPage.waitForTimeout(250);
  const granted = await grantedPage.evaluate(() => ({ state: window.MatrixPrivacy?.status?.(), banner: Boolean(document.getElementById('matrix-analytics-consent')) }));
  if (granted.state !== 'granted' || granted.banner) addProblem('analytics consent: granted state was not respected');
  if (!grantedTracking.length) addProblem('analytics consent: no first-party page-view request was sent after explicit consent');
  await grantedContext.close();
}

async function keyboardCheck(page, rel) {
  const focusableCount = await page.evaluate(() => {
    const selector = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    }).length;
  });
  if (!focusableCount) return;
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const element = document.activeElement;
    return element && element !== document.body && element !== document.documentElement
      ? `${element.tagName.toLowerCase()}#${element.id || ''}.${String(element.className || '').split(/\s+/).slice(0,2).join('.')}`
      : '';
  });
  if (!first) addProblem(`${rel}: keyboard Tab did not reach a visible interactive control`);
  const signatures = new Set(first ? [first] : []);
  for (let index = 0; index < Math.min(8, focusableCount + 1); index += 1) {
    await page.keyboard.press('Tab');
    const signature = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return '';
      return `${element.tagName.toLowerCase()}#${element.id || ''}.${String(element.className || '').split(/\s+/).slice(0,2).join('.')}`;
    });
    if (signature) signatures.add(signature);
  }
  if (focusableCount > 1 && signatures.size < 2) addProblem(`${rel}: keyboard focus appears trapped on one control`);
}

async function auditWorker() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', routeHandler => isLocal(routeHandler.request().url()) ? routeHandler.continue() : routeHandler.abort());
  while (true) {
    const index = cursor++;
    if (index >= files.length) break;
    const file = files[index];
    const rel = relative(file);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') warnings.push(`${rel}: console error: ${message.text()}`); });
    try {
      const response = await page.goto(`${baseUrl}${route(file)}`, { waitUntil: 'domcontentloaded', timeout });
      if (!response || response.status() >= 400) addProblem(`${rel}: route returned ${response ? response.status() : 'no response'}`);
      const metrics = await page.evaluate(() => ({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        clientWidth: document.documentElement.clientWidth,
        title: document.title,
        loadingText: /Loading boundary|Loading lanes|The operational board is loading/i.test(document.body?.innerText || ''),
        visibleEscapedNewline: /\\n/.test((document.body?.innerText || '').replace(/https?:\/\/\S+/g, ''))
      }));
      if (metrics.scrollWidth > metrics.clientWidth + 3) addProblem(`${rel}: mobile horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
      if (!metrics.title.trim()) addProblem(`${rel}: empty browser title`);
      if (/case-status-dashboard/i.test(rel) && metrics.loadingText) addProblem(`${rel}: loading placeholder remains visible`);
      if (metrics.visibleEscapedNewline) addProblem(`${rel}: escaped newline is visible in rendered copy`);
      if (pageErrors.length) addProblem(`${rel}: uncaught page error: ${pageErrors.join(' | ')}`);
      await keyboardCheck(page, rel);
      const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
      for (const violation of results.violations) {
        if (!['critical', 'serious'].includes(violation.impact || '')) continue;
        addProblem(`${rel}: accessibility ${violation.impact} ${violation.id} (${violation.nodes.length} node(s))`);
      }
      checked += 1;
    } catch (error) {
      addProblem(`${rel}: browser audit failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await testAnalyticsConsent();
await Promise.all(Array.from({ length: concurrency }, () => auditWorker()));
await browser.close();

if (problems.length) {
  console.error('\nMOBILE, KEYBOARD, PRIVACY AND ACCESSIBILITY ACCEPTANCE FAILED\n');
  problems.slice(0, 300).forEach(problem => console.error(`- ${problem}`));
  console.error(`\nChecked ${checked}/${files.length} HTML routes; ${problems.length} problem(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`MOBILE, KEYBOARD, PRIVACY AND ACCESSIBILITY ACCEPTANCE PASSED: ${checked} HTML routes; consent-first analytics verified; ${warnings.length} non-blocking console warning(s).`);
