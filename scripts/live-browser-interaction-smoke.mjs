import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const results = [];
const hardIssues = [];
const warnings = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
async function runTest(browser, name, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: false });
  const page = await context.newPage();
  const pageErrors = [];
  const requestFailures = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    try {
      const url = new URL(request.url());
      if (url.origin === new URL(siteUrl).origin) requestFailures.push(`${request.method()} ${url.pathname}: ${request.failure()?.errorText || 'failed'}`);
    } catch {}
  });
  const started = Date.now();
  try {
    await fn(page);
    if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join(' | ')}`);
    if (requestFailures.length) throw new Error(`Same-origin request failures: ${requestFailures.join(' | ')}`);
    if (consoleErrors.length) warnings.push(`${name}: console error output: ${consoleErrors.slice(0, 5).join(' | ')}`);
    results.push({ name, ok: true, durationMs: Date.now() - started, url: page.url(), consoleErrors });
  } catch (error) {
    const issue = `${name}: ${String(error?.message || error)}`;
    hardIssues.push(issue);
    results.push({ name, ok: false, durationMs: Date.now() - started, url: page.url(), error: issue, pageErrors, requestFailures, consoleErrors });
  } finally { await context.close(); }
}

const browser = await chromium.launch({ headless: true });
try {
  await runTest(browser, 'Search interaction', async page => {
    await page.goto(`${siteUrl}/search.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const input = page.locator('#archive-search');
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.fill('Epstein');
    await input.press('Enter');
    const resultsNode = page.locator('#search-results');
    await resultsNode.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('#search-results')?.textContent || '').trim().length > 20, null, { timeout: 20000 });
    const text = (await resultsNode.innerText()).trim();
    assert(/epstein/i.test(text) || text.length > 80, 'Search did not render a meaningful result set');
  });

  await runTest(browser, 'Geographic Power Atlas interaction', async page => {
    await page.goto(`${siteUrl}/geographic-power-atlas.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const map = page.locator('#power-atlas-map');
    await map.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#power-atlas-map canvas');
      const status = document.querySelector('#atlas-status')?.textContent || '';
      return Boolean(canvas && /mapped locations|interactive map/i.test(status));
    }, null, { timeout: 30000 });
    assert(await page.locator('#power-atlas-map canvas').count() > 0, 'Atlas did not create a MapLibre canvas');
    assert(await page.locator('#power-atlas-list .power-atlas-item').count() > 0, 'Atlas accessible location list is empty');
    await map.click({ position: { x: 80, y: 80 } });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const select = page.locator('#atlas-category');
    const options = await select.locator('option').count();
    if (options > 1) await select.selectOption({ index: 1 });
    await page.waitForFunction(() => /shown|updated|mapped locations/i.test(document.querySelector('#atlas-status')?.textContent || ''), null, { timeout: 10000 });
  });

  await runTest(browser, 'Epstein source-intake validation', async page => {
    await page.goto(`${siteUrl}/epstein-upload-check.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const form = page.locator('#epstein-source-intake-form');
    await form.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[name="leadTitle"]').fill('Browser smoke-test public record');
    await page.locator('[name="shows"]').fill('This is a non-submitted validation test of the reviewed intake form.');
    await page.locator('[name="doesNotShow"]').fill('It does not submit a claim or alter any evidence record.');
    await page.locator('[name="note"]').fill('Automated smoke test; no submission performed.');
    const valid = await form.evaluate(node => node.checkValidity());
    assert(valid === true, 'Reviewed source-intake form did not validate with complete safe input');
    const submit = page.locator('#epstein-source-intake-form button[type="submit"]');
    assert(await submit.count() === 1, 'Source-intake submit control is missing');
    const label = (await submit.innerText()).trim();
    assert(/submit|review|pending/i.test(label), `Source-intake submit control is mislabeled: ${label || '[empty]'}`);
  });

  await runTest(browser, 'Forum feed interaction', async page => {
    await page.goto(`${siteUrl}/forum.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const response = await page.evaluate(async () => {
      const result = await fetch('/forum-feed-main', { cache: 'no-store' });
      let data = null; try { data = await result.json(); } catch {}
      return { status: result.status, origin: result.headers.get('x-matrix-origin'), data };
    });
    assert(response.status === 200, `Forum feed returned HTTP ${response.status}`);
    assert(response.origin === 'cloudflare-worker-forum-d1', `Forum feed origin was ${response.origin || 'missing'}`);
    assert(response.data && typeof response.data === 'object', 'Forum feed did not return JSON');
  });

  await runTest(browser, 'Member-login validation', async page => {
    await page.goto(`${siteUrl}/member-login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const form = page.locator('#login-form');
    const email = page.locator('#login-email');
    await form.waitFor({ state: 'visible', timeout: 15000 });
    await email.fill('browser-smoke@example.com');
    assert(await form.evaluate(node => node.checkValidity()), 'Member login form rejected a syntactically valid email');
    assert((await page.locator('#login-status').innerText()) === '', 'Member login emitted a status before submission');
  });

  await runTest(browser, 'Voluntary-support controls', async page => {
    await page.goto(`${siteUrl}/store.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const card = page.locator('[data-donation-card]').first();
    await card.waitFor({ state: 'visible', timeout: 20000 });
    const input = card.locator('[data-donation-amount]');
    const quick = card.locator('[data-donation-quick]').first();
    const submit = card.locator('[data-donation-submit]');
    await quick.click();
    const amount = Number(await input.inputValue());
    assert(Number.isFinite(amount) && amount >= 1 && amount <= 5000, 'Quick amount did not populate a valid €1–€5,000 value');
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-donation-submit]');
      const status = document.querySelector('[data-donation-global-status]');
      return Boolean(button && button.disabled && status && status.textContent.trim());
    }, null, { timeout: 15000 });
    assert(await submit.isDisabled(), 'Support checkout unexpectedly enabled during disabled-payment audit state');
    const globalStatus = (await page.locator('[data-donation-global-status]').innerText()).trim();
    assert(/disabled|not configured|currently/i.test(globalStatus), 'Disabled support boundary was not explained to the visitor');
  });

  await runTest(browser, 'Email launch console unauthorized controls', async page => {
    await page.goto(`${siteUrl}/admin-email-launch.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#email-admin-token').fill('invalid-browser-smoke-token');
    const output = page.locator('#email-launch-output');
    const readiness = page.locator('#email-readiness-check');
    await readiness.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('#email-readiness-check');
      const text = document.querySelector('#email-launch-output')?.textContent || '';
      return Boolean(button && !button.disabled && /"ok"\s*:\s*false|forbidden|unauthor|error/i.test(text));
    }, null, { timeout: 15000 });
    const readinessText = (await output.innerText()).trim();
    assert(/"ok"\s*:\s*false|forbidden|unauthor|error|failed/i.test(readinessText), 'Readiness console did not fail closed for an invalid token');
    const transactional = await page.evaluate(async () => {
      const response = await fetch('/api/email/admin/test-transactional', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'invalid-browser-smoke-token' }, body: '{}' });
      let data = null; try { data = await response.json(); } catch {}
      return { status: response.status, origin: response.headers.get('x-matrix-origin'), data };
    });
    assert(transactional.status === 403, `Controlled email test authorization returned HTTP ${transactional.status}`);
    assert(transactional.origin === 'cloudflare-worker-email-lifecycle', `Controlled email test origin was ${transactional.origin || 'missing'}`);
    assert(transactional.data?.ok === false, 'Controlled email test did not return a fail-closed JSON contract');
  });
} finally { await browser.close(); }

const report = {
  ok: hardIssues.length === 0,
  generatedAt: new Date().toISOString(),
  siteUrl,
  tests: results,
  hardIssues,
  warnings,
  boundary: 'Non-destructive Chromium smoke tests. No forum post, source intake, login email, PayPal approval, payment capture, marketing campaign or transactional email is submitted. Protected actions are tested only through validation or deliberately invalid authorization.'
};
fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, 'live-browser-interaction-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(downloads, 'live-browser-interaction-smoke.md'), [
  '# Live Browser Interaction Smoke', '', `Generated: ${report.generatedAt}`, `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Tests', ...results.map(item => `- ${item.ok ? 'PASS' : 'FAIL'} — ${item.name} (${item.durationMs} ms)${item.error ? `: ${item.error}` : ''}`), '',
  '## Hard issues', ...(hardIssues.length ? hardIssues.map(item => `- ${item}`) : ['- None']), '',
  '## Warnings', ...(warnings.length ? warnings.map(item => `- ${item}`) : ['- None']), '',
  `Boundary: ${report.boundary}`
].join('\n'));
if (hardIssues.length) {
  console.error(`LIVE BROWSER INTERACTION SMOKE FAILED: ${hardIssues.length} hard issue(s).`);
  hardIssues.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`LIVE BROWSER INTERACTION SMOKE PASSED: ${results.length} interaction tests; warnings=${warnings.length}.`);
