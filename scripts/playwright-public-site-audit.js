const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'playwright-site-audit');
fs.mkdirSync(outputDir, { recursive: true });

const baseUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const maxPages = Math.max(20, Math.min(200, Number(process.env.PLAYWRIGHT_MAX_PAGES || 80)));
const failures = [];
const warnings = [];
const checks = [];
const startedAt = new Date().toISOString();

function record(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

async function getSitemapUrls() {
  const response = await fetch(`${baseUrl}/sitemap.xml`, { headers: { 'user-agent': 'MatrixPlaywrightAudit/1.0' } });
  if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => match[1].trim());
  const preferred = [
    '/', '/search', '/investigation-machine.html', '/daily-investigation-conclusions.html',
    '/weekly-investigation-report.html', '/investigation-source-ledger.html', '/evidence-network-map.html',
    '/membership.html', '/member-login.html', '/network-maps.html', '/evidence-vault.html', '/epstein-files.html'
  ].map(route => new URL(route, `${baseUrl}/`).href);
  const ordered = [...new Set([...preferred, ...urls])];
  return ordered.slice(0, maxPages);
}

async function testPage(page, url, index) {
  const pageErrors = [];
  const failedRequests = [];
  const consoleErrors = [];
  const onPageError = error => pageErrors.push(error.message || String(error));
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
  const onRequestFailed = request => {
    const target = request.url();
    if (target.startsWith(baseUrl) || /cytoscape|paypal|jsdelivr/i.test(target)) {
      failedRequests.push(`${request.failure()?.errorText || 'failed'} ${target}`);
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(350);
    const status = response ? response.status() : 0;
    record(`page ${new URL(url).pathname}`, status >= 200 && status < 400, `HTTP ${status || 'none'}`);
    const title = await page.title();
    if (!title) failures.push(`${url}: empty title`);
    const h1Count = await page.locator('h1:visible').count();
    if (!h1Count) failures.push(`${url}: no visible H1`);
    const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
    if (bodyText.length < 120) warnings.push(`${url}: unusually little visible text (${bodyText.length} characters)`);
    if (index < 12) await page.screenshot({ path: path.join(outputDir, `page-${String(index + 1).padStart(2, '0')}.png`), fullPage: false });
  } catch (error) {
    failures.push(`${url}: navigation failed: ${error.message}`);
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
  }
  for (const error of pageErrors) failures.push(`${url}: page error: ${error}`);
  for (const request of failedRequests) warnings.push(`${url}: request failed: ${request}`);
  for (const error of consoleErrors.filter(text => !/favicon|paypal.*configured|ResizeObserver/i.test(text))) warnings.push(`${url}: console error: ${error}`);
}

async function testSearch(page) {
  await page.goto(`${baseUrl}/search`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const input = page.locator('#archive-search');
  record('search input visible', await input.isVisible().catch(() => false));
  await input.fill('corruption bribery official enforcement');
  await page.waitForTimeout(900);
  const results = page.locator('#search-results a, #search-results article, .search-result');
  const count = await results.count();
  record('search returns corruption results', count > 0, `${count} result elements`);
  const text = (await page.locator('#search-results').innerText().catch(() => '')).toLowerCase();
  record('search includes investigation route', /investigation|corruption|enforcement|evidence/.test(text), text.slice(0, 180));

  await input.fill('WikiLeaks documents archive');
  await page.waitForTimeout(900);
  const wikiText = (await page.locator('#search-results').innerText().catch(() => '')).toLowerCase();
  record('search returns WikiLeaks route', /wikileaks|source ledger|archive|evidence/.test(wikiText), wikiText.slice(0, 180));
}

async function testEvidenceMap(page) {
  await page.goto(`${baseUrl}/evidence-network-map.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('#map-status')?.textContent || '';
    return /shown|could not|unavailable/i.test(text);
  }, { timeout: 25000 }).catch(() => null);
  const mapVisible = await page.locator('#evidence-network-map').isVisible().catch(() => false);
  record('evidence map container visible', mapVisible);
  const status = await page.locator('#map-status').innerText().catch(() => 'missing');
  record('evidence map data loads', /finding.*shown/i.test(status), status);
  const nodeCount = await page.locator('#evidence-network-map canvas').count().catch(() => 0);
  record('Cytoscape canvas renders', nodeCount > 0, `${nodeCount} canvas element(s)`);
  await page.locator('#map-search').fill('fraud').catch(() => null);
  await page.waitForTimeout(350);
  const filteredStatus = await page.locator('#map-status').innerText().catch(() => '');
  record('evidence map filter responds', /finding.*shown/i.test(filteredStatus), filteredStatus);
}

async function testMembership(page) {
  await page.goto(`${baseUrl}/membership.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  record('membership signup form visible', await page.locator('#membership-signup').isVisible().catch(() => false));
  record('membership has free account', /free account|free membership/i.test(await page.locator('body').innerText()));
  record('membership has three paid tiers', await page.locator('#join-supporter, #join-intelligence-member, #join-research-pro').count() === 3);
  const body = (await page.locator('body').innerText()).toLowerCase();
  record('membership hides author-facing language', !/email capture|backend checks|join placeholder|money engine/.test(body));
}

async function testMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
  record('mobile homepage has no major horizontal overflow', !horizontalOverflow);
  await page.screenshot({ path: path.join(outputDir, 'mobile-homepage.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 960 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: false });
  const page = await context.newPage();
  try {
    const urls = await getSitemapUrls();
    record('sitemap supplies pages', urls.length > 10, `${urls.length} selected pages`);
    for (let index = 0; index < urls.length; index += 1) await testPage(page, urls[index], index);
    await testSearch(page);
    await testEvidenceMap(page);
    await testMembership(page);
    await testMobile(page);
  } finally {
    await browser.close();
  }

  const report = {
    ok: failures.length === 0,
    startedAt,
    completedAt: new Date().toISOString(),
    baseUrl,
    maxPages,
    checks,
    failures,
    warnings,
    boundary: 'Playwright checks browser rendering, critical journeys, search, the evidence map and membership presentation. It supplements rather than replaces source and legal review.'
  };
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputDir, 'report.md'), [
    '# Playwright Public Site Audit', '',
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Base: ${baseUrl}`,
    `Completed: ${report.completedAt}`, '',
    '## Failures', ...(failures.length ? failures.map(item => `- ${item}`) : ['- None']), '',
    '## Warnings', ...(warnings.length ? warnings.slice(0, 300).map(item => `- ${item}`) : ['- None'])
  ].join('\n'));

  console.log(`Playwright public site audit ${report.ok ? 'PASSED' : 'FAILED'}: ${checks.length} checks, ${failures.length} failures, ${warnings.length} warnings.`);
  if (!report.ok) process.exit(1);
})().catch(error => {
  fs.writeFileSync(path.join(outputDir, 'fatal-error.txt'), error.stack || error.message || String(error));
  console.error(error.stack || error.message || error);
  process.exit(1);
});
