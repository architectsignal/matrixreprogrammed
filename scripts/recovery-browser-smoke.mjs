import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'recovery-browser');
const reportPath = path.join(root, 'downloads', 'recovery-browser-smoke.json');
const baseUrl = process.env.RECOVERY_BASE_URL || 'http://127.0.0.1:4173';
const baseOrigin = new URL(baseUrl).origin;
fs.mkdirSync(outputDir, { recursive: true });

const results = [];
const failures = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const cleanName = value => String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

async function runTest(browser, name, route, test) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const localHttpErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error?.message || String(error)));
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      if (url.origin === baseOrigin && response.status() >= 400 && !/favicon\.ico$/i.test(url.pathname)) {
        localHttpErrors.push(`${response.status()} ${url.pathname}`);
      }
    } catch {}
  });

  const started = Date.now();
  try {
    const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert(response && response.status() < 400, `${route} returned HTTP ${response?.status() || 'no response'}`);
    await page.waitForTimeout(250);
    const bodyText = await page.locator('body').innerText();
    assert(!bodyText.includes('[object Object]'), `${route} publishes [object Object]`);
    await test(page);
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
    assert(localHttpErrors.length === 0, `Local HTTP failures: ${localHttpErrors.join(' | ')}`);
    results.push({ name, route, ok: true, durationMs: Date.now() - started, consoleErrors });
  } catch (error) {
    const screenshot = path.join(outputDir, `${cleanName(name)}.png`);
    try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
    const record = {
      name,
      route,
      ok: false,
      durationMs: Date.now() - started,
      error: error?.message || String(error),
      consoleErrors,
      pageErrors,
      localHttpErrors,
      screenshot: path.relative(root, screenshot).replace(/\\/g, '/')
    };
    results.push(record);
    failures.push(record);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await runTest(browser, 'Homepage navigation', '/index.html', async page => {
    await page.locator('header.topbar').waitFor({ state: 'visible' });
    const primaryLinks = page.locator('header.topbar .nav-primary a');
    assert(await primaryLinks.count() === 8, 'Homepage must show exactly eight primary navigation links');
    assert(await page.locator('header.topbar a[href="data-lab.html"]').count() >= 1, 'Homepage navigation must expose Public Data Lab');
    assert(await page.locator('header.topbar a[href="search.html"]').count() >= 1, 'Homepage navigation must expose Search');
    assert(await page.locator('main').count() === 1, 'Homepage must contain one main element');
  });

  await runTest(browser, 'Start Here safety routes', '/start-here.html', async page => {
    await page.locator('#start-here-safety').waitFor({ state: 'visible' });
    assert(await page.locator('#start-here-security-tools').count() === 1, 'Security tools card missing');
    assert(await page.locator('#start-here-dark-web-safety').count() === 1, 'Dark web safety card missing');
    assert(await page.locator('a[href="data-lab.html"]').count() >= 1, 'Start Here must link to Data Lab');
  });

  await runTest(browser, 'Search returns useful results', '/search.html', async page => {
    const input = page.locator('#archive-search');
    await input.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#search-results .search-result-card').length > 0, null, { timeout: 30000 });
    await input.fill('World Bank');
    await page.waitForTimeout(500);
    const cards = page.locator('#search-results .search-result-card');
    assert(await cards.count() > 0, 'Search V3 returned no cards for World Bank');
    const text = (await page.locator('#search-results').innerText()).toLowerCase();
    assert(!text.includes('no matching record'), 'Search V3 returned the no-match fallback for World Bank');
    assert(await page.locator('#search-results a[href]').count() > 0, 'Search results do not link to records');
  });

  await runTest(browser, 'Entity card opens a deep brief', '/entity-daily-briefs.html', async page => {
    const firstBrief = page.locator('a[href^="entity-briefs/"][href$=".html"]').first();
    await firstBrief.waitFor({ state: 'visible', timeout: 20000 });
    const href = await firstBrief.getAttribute('href');
    assert(Boolean(href), 'Entity brief link is missing an href');
    const response = await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(response && response.status() < 400, `Entity brief returned HTTP ${response?.status() || 'no response'}`);
    const text = await page.locator('body').innerText();
    assert(/evidence boundary/i.test(text), 'Entity brief lacks an evidence boundary');
    assert(/missing records/i.test(text), 'Entity brief lacks a missing-record section');
    assert(/watch next/i.test(text), 'Entity brief lacks a watch-next section');
  });

  await runTest(browser, 'Data Lab executes a browser query', '/data-lab.html', async page => {
    await page.locator('#data-lab-status').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const status = document.querySelector('#data-lab-status');
      const text = status?.textContent || '';
      return status?.dataset.kind === 'success' && /query complete|ready:/i.test(text);
    }, null, { timeout: 120000 });
    const statusKind = await page.locator('#data-lab-status').getAttribute('data-kind');
    const statusText = await page.locator('#data-lab-status').innerText();
    assert(statusKind === 'success', `Data Lab did not reach success: ${statusText}`);
    await page.waitForFunction(() => /\d+ row/.test(document.querySelector('#data-lab-result-meta')?.textContent || ''), null, { timeout: 30000 });
    assert(await page.locator('#data-lab-table tbody tr').count() > 0, 'Data Lab query returned no rendered table rows');
    assert(!(await page.locator('#data-lab-run').isDisabled()), 'Data Lab Run Query button remains disabled');
  });

  await runTest(browser, 'Newsletter form is wired', '/newsletter.html', async page => {
    let submittedBody = null;
    await page.route('**/newsletter-signup', async route => {
      try { submittedBody = route.request().postDataJSON(); } catch {}
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, verification: { sent: true } }) });
    });
    const form = page.locator('#newsletter-form');
    await form.waitFor({ state: 'visible' });
    await form.locator('input[name="name"]').fill('Recovery Test');
    await form.locator('input[type="email"]').fill('recovery-browser@example.invalid');
    await form.locator('input[data-marketing-consent]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => /saved\. check your inbox/i.test(document.querySelector('#newsletter-form .form-status')?.textContent || ''), null, { timeout: 10000 });
    assert(submittedBody?.consent === true, 'Newsletter request did not include explicit consent');
    assert(submittedBody?.public_weekly_digest === true, 'Newsletter request did not select the weekly digest');
  });

  await runTest(browser, 'Evidence network loads', '/evidence-network-map.html', async page => {
    await page.locator('#evidence-network-map').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const text = document.querySelector('#map-status')?.textContent || '';
      return /sourced relationship|select a node|visible/i.test(text) && !/loading|preparing|initial/i.test(text);
    }, null, { timeout: 90000 });
    const status = await page.locator('#map-status').innerText();
    assert(!/failed|unavailable|error/i.test(status), `Evidence network failed: ${status}`);
  });
} finally {
  await browser.close();
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  baseUrl,
  tests: results.length,
  passed: results.filter(item => item.ok).length,
  failed: failures.length,
  results
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Recovery browser smoke: ${report.passed}/${report.tests} passed.`);
if (!report.ok) process.exit(1);
