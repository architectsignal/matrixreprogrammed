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
const jsonResponse = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function runTest(browser, name, route, test, prepare = null) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.route('**/track-event', async requestRoute => {
    await requestRoute.fulfill({ status: 204, contentType: 'application/json', body: '' });
  });
  if (prepare) await prepare(page);
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
    assert(!/&(?:#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt);/i.test(text), 'Entity brief exposes an encoded HTML entity');
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
      await jsonResponse(route, { ok: true, verification: { sent: true } }, 202);
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

  await runTest(browser, 'Membership tiers and free signup', '/membership.html', async page => {
    const body = await page.locator('body').innerText();
    const supporter = page.locator('#join-supporter');
    const intelligence = page.locator('#join-intelligence-member');
    const research = page.locator('#join-research-pro');
    assert(await supporter.count() === 1 && /€\s*3/.test(await supporter.innerText()) && /month/i.test(await supporter.innerText()), 'Supporter card is not the €3 monthly tier');
    assert(await intelligence.count() === 1 && /€\s*6/.test(await intelligence.innerText()) && /month/i.test(await intelligence.innerText()), 'Intelligence card is not the €6 monthly tier');
    assert(await research.count() === 1 && /€\s*9/.test(await research.innerText()) && /month/i.test(await research.innerText()), 'Research Pro card is not the €9 monthly tier');
    assert(await supporter.locator('#paypal-button-supporter').count() === 1, 'Supporter PayPal slot is missing');
    assert(await intelligence.locator('#paypal-button-intelligence').count() === 1, 'Intelligence PayPal slot is missing');
    assert(await research.locator('#paypal-button-research_pro').count() === 1, 'Research Pro PayPal slot is missing');
    assert(!/€\s*19|€\s*49/.test(body), 'Legacy membership prices remain visible');
    assert(/paid memberships are opening soon/i.test(body), 'Reader-facing paid launch state is missing');

    const form = page.locator('#newsletter-form');
    await form.waitFor({ state: 'visible' });
    await form.locator('input[name="name"]').fill('Recovery Member');
    await form.locator('input[type="email"]').fill('recovery-member@example.invalid');
    const consent = form.locator('input[data-marketing-consent]');
    await consent.waitFor({ state: 'visible' });
    await consent.check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => /saved\. check your inbox/i.test(document.querySelector('#newsletter-form .form-status')?.textContent || ''), null, { timeout: 10000 });
    const payload = await page.evaluate(() => window.__membershipSignupPayload || null);
    assert(payload?.marketingConsent === true, 'Membership free signup omitted explicit marketing consent');
    assert(payload?.email === 'recovery-member@example.invalid', 'Membership free signup sent the wrong email');
    assert(payload?.public_daily_brief === true, 'Membership free signup did not preserve Daily Control Brief preference');
    assert(payload?.release_notices === true, 'Membership free signup did not preserve release notices');
  }, async page => {
    await page.addInitScript(() => { window.__membershipSignupPayload = null; });
    await page.route('**/api/paypal/config', route => jsonResponse(route, { ok: true, configured: false, checkoutEnabled: false }));
    await page.route('**/newsletter-signup', async route => {
      let payload = null;
      try { payload = route.request().postDataJSON(); } catch {}
      await page.evaluate(value => { window.__membershipSignupPayload = value; }, payload);
      await jsonResponse(route, { ok: true, saved: true, verificationRequired: true, verification: { sent: true } }, 202);
    });
  });

  await runTest(browser, 'Passwordless login request', '/member-login.html', async page => {
    const form = page.locator('#login-form');
    await form.locator('#login-email').fill('recovery-member@example.invalid');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => /one-time link has been sent|matching account exists/i.test(document.querySelector('#login-status')?.textContent || ''), null, { timeout: 10000 });
    const payload = await page.evaluate(() => window.__loginRequestPayload || null);
    assert(payload?.email === 'recovery-member@example.invalid', 'Login request sent the wrong email');
  }, async page => {
    await page.addInitScript(() => { window.__loginRequestPayload = null; });
    await page.route('**/api/auth/request-link', async route => {
      let payload = null;
      try { payload = route.request().postDataJSON(); } catch {}
      await page.evaluate(value => { window.__loginRequestPayload = value; }, payload);
      await jsonResponse(route, { ok: true, accepted: true, message: 'If a matching account exists, a one-time link has been sent.' }, 202);
    });
  });

  await runTest(browser, 'Registered member dashboard', '/member-dashboard.html', async page => {
    await page.locator('#dashboard-content').waitFor({ state: 'visible', timeout: 15000 });
    assert((await page.locator('#member-name').innerText()) === 'Recovery Member', 'Dashboard did not render the member name');
    assert(/registered/i.test(await page.locator('#member-tier').innerText()), 'Dashboard did not render the registered tier');
    assert(/free registered access/i.test(await page.locator('#paid-state').innerText()), 'Dashboard did not show the free entitlement boundary');
    const capabilities = (await page.locator('#member-capabilities').innerText()).toLowerCase();
    assert(capabilities.includes('free dashboard') && capabilities.includes('session controls'), 'Dashboard capabilities are incomplete');
    assert(/current/i.test(await page.locator('#dashboard-status').innerText()), 'Dashboard did not complete loading');
  }, async page => {
    await page.route('**/api/member/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/member/dashboard') return jsonResponse(route, {
        ok: true,
        authenticated: true,
        member: {
          displayName: 'Recovery Member', email: 'recovery-member@example.invalid', effectiveTier: 'registered',
          accountStatus: 'active', emailVerifiedAt: '2026-07-18T00:00:00.000Z', paidAccess: false, isAdmin: false,
          capabilities: ['free_dashboard', 'session_controls', 'saved_public_content']
        },
        counts: { saved: 0, followed: 0, watchlists: 0, downloads: 0, activeSessions: 1, archiveEntries: 2 }
      });
      if (pathname === '/api/member/sessions') return jsonResponse(route, { ok: true, sessions: [{ id: 'session-current', current: true, active: true, createdAt: '2026-07-18T00:00:00.000Z', lastSeenAt: '2026-07-18T00:00:00.000Z', expiresAt: '2026-08-18T00:00:00.000Z' }] });
      if (pathname === '/api/member/saved') return jsonResponse(route, { ok: true, items: [] });
      if (pathname === '/api/member/follows') return jsonResponse(route, { ok: true, items: [] });
      if (pathname === '/api/member/watchlists') return jsonResponse(route, { ok: true, items: [] });
      if (pathname === '/api/member/archive') return jsonResponse(route, { ok: true, entries: [] });
      if (pathname === '/api/member/downloads') return jsonResponse(route, { ok: true, downloads: [] });
      return jsonResponse(route, { ok: true });
    });
  });

  await runTest(browser, 'Forum public reading and member gate', '/forum.html', async page => {
    await page.locator('#signal-board-feed').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /no persistent signals yet|source lead/i.test(document.querySelector('#signal-board-feed')?.textContent || ''), null, { timeout: 10000 });
    const body = await page.locator('body').innerText();
    assert(!/pay €1|i.ve paid|paypal\.me/i.test(body), 'Forum still exposes the false payment gate');
    assert(/reading is public/i.test(await page.locator('#forum-member-status').innerText()), 'Forum does not explain public reading');
    assert(await page.locator('#signal-board-form button[type="submit"]').isDisabled(), 'Anonymous forum posting is not locked');
  }, async page => {
    await page.route('**/api/member/me', route => jsonResponse(route, { ok: false, authenticated: false }));
    await page.route('**/forum-feed-main*', route => jsonResponse(route, { ok: true, persistent: true, posts: [], board: 'main' }));
  });

  await runTest(browser, 'Verified member forum posting', '/forum.html', async page => {
    const form = page.locator('#signal-board-form');
    await page.waitForFunction(() => !document.querySelector('#signal-board-form button[type="submit"]')?.disabled, null, { timeout: 10000 });
    await form.locator('input[name="name"]').fill('Recovery Member');
    await form.locator('input[name="title"]').fill('Recovery source lead');
    await form.locator('input[name="sourceUrl"]').fill('https://example.com/source');
    await form.locator('textarea[name="body"]').fill('A browser-tested public-record source lead for the recovery gate.');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => /posted live and saved persistently/i.test(document.querySelector('#signal-form-status')?.textContent || ''), null, { timeout: 10000 });
    const payload = await page.evaluate(() => window.__forumSubmitPayload || null);
    assert(payload?.board === 'main', 'Forum post was sent to the wrong board');
    assert(payload?.title === 'Recovery source lead', 'Forum post title was not submitted');
  }, async page => {
    await page.addInitScript(() => { window.__forumSubmitPayload = null; });
    await page.route('**/api/member/me', route => jsonResponse(route, { ok: true, authenticated: true, member: { displayName: 'Recovery Member', effectiveTier: 'registered', emailVerifiedAt: '2026-07-18T00:00:00.000Z' } }));
    await page.route('**/forum-feed-main*', route => jsonResponse(route, { ok: true, persistent: true, posts: [], board: 'main' }));
    await page.route('**/submit-main-post', async route => {
      let payload = null;
      try { payload = route.request().postDataJSON(); } catch {}
      await page.evaluate(value => { window.__forumSubmitPayload = value; }, payload);
      await jsonResponse(route, { ok: true, authenticated: true, persistent: true, saved: true, post: { id: 'recovery-post', board: 'main', title: payload?.title, body: payload?.body, name: 'Recovery Member', sourceUrl: payload?.sourceUrl, status: 'live', createdAt: new Date().toISOString() } }, 201);
    });
  });

  await runTest(browser, 'Evidence network loads', '/evidence-network-map.html', async page => {
    await page.locator('#evidence-network-map').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const text = document.querySelector('#map-status')?.textContent || '';
      return /sourced relationship|select a node|shown across/i.test(text) && !/loading|preparing|initial/i.test(text);
    }, null, { timeout: 45000 });
    const status = await page.locator('#map-status').innerText();
    assert(!/failed|unavailable|error/i.test(status), `Evidence network failed: ${status}`);
    assert(await page.locator('#evidence-network-map canvas').count() > 0, 'Evidence network did not create a Cytoscape canvas');
    assert(Number(await page.locator('#map-visible-relationships').innerText()) > 0, 'Evidence network rendered zero relationships');
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
