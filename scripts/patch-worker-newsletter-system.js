const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'src', 'worker.js');
let source = fs.readFileSync(workerPath, 'utf8');
const marker = 'MATRIX NEWSLETTER SYSTEM';

function findFunctionEnd(text, openBraceIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openBraceIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function removeDuplicateFunctionDeclarations(text, name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const ranges = [];
  let match;
  while ((match = pattern.exec(text))) {
    const open = text.indexOf('{', match.index);
    if (open === -1) continue;
    const end = findFunctionEnd(text, open);
    if (end === -1) continue;
    ranges.push({ start: match.index, end });
  }
  if (ranges.length <= 1) return text;
  let out = text;
  for (const range of ranges.slice(1).reverse()) {
    let start = range.start;
    while (start > 0 && /[ \t]/.test(out[start - 1])) start -= 1;
    if (start > 0 && out[start - 1] === '\n') start -= 1;
    let end = range.end;
    while (end < out.length && /[ \t]/.test(out[end])) end += 1;
    if (out[end] === '\n') end += 1;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

function normaliseWorker(text) {
  return removeDuplicateFunctionDeclarations(text, 'handleNewsletterHealth');
}

source = normaliseWorker(source);

const hasNewsletterFunctions = /(?:async\s+function\s+handleSubscribeNewsletter|async\s+function\s+handleNewsletterHealth|function\s+validEmail|const\s+handleNewsletterHealth)/.test(source);
const hasNewsletterRoutes = source.includes("originalPath === '/subscribe-newsletter'") && source.includes("originalPath === '/newsletter-health'");

const functions = String.raw`
// MATRIX NEWSLETTER SYSTEM
function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function subscriberKey(email = '') {
  return 'subscriber:' + cleanText(String(email || '').toLowerCase(), 220).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function readAssetJson(request, env, pathname) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  try {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = pathname;
    assetUrl.search = '';
    const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

async function getSubscribers(env) {
  if (!env.FORUM_POSTS) return null;
  const subscribers = [];
  let cursor;
  do {
    const listed = await env.FORUM_POSTS.list({ prefix: 'subscriber:', limit: 1000, cursor });
    for (const key of listed.keys || []) {
      try {
        const raw = await env.FORUM_POSTS.get(key.name);
        const subscriber = JSON.parse(raw || 'null');
        if (subscriber && subscriber.email && subscriber.status === 'subscribed') subscribers.push(subscriber);
      } catch {}
    }
    cursor = listed.cursor;
    if (listed.list_complete) break;
  } while (cursor);
  return subscribers;
}

async function handleSubscribeNewsletter(request, env) {
  if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding', 'Newsletter capture stores subscribers in the existing persistent KV namespace.');
  const body = await readBody(request);
  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);
  const email = cleanText(body.email || '', 220).toLowerCase();
  if (!validEmail(email)) return json({ ok: false, error: 'Valid email required.' }, 400);
  const now = new Date().toISOString();
  const previousRaw = await env.FORUM_POSTS.get(subscriberKey(email));
  let previous = null;
  try { previous = previousRaw ? JSON.parse(previousRaw) : null; } catch {}
  const subscriber = {
    id: previous && previous.id ? previous.id : makeId(),
    email,
    name: cleanText(body.name || previous && previous.name || '', 120),
    source: cleanText(body.source || body.form || 'newsletter', 120),
    tags: String(body.tags || 'weekly,black-file,live-intel').split(',').map(tag => cleanText(tag, 40)).filter(Boolean).slice(0, 12),
    status: 'subscribed',
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: now,
    consent: true,
    consentText: cleanText(body.consentText || 'I agree to receive the Matrix Reprogrammed weekly signal newsletter and understand I can unsubscribe.', 300)
  };
  await env.FORUM_POSTS.put(subscriberKey(email), JSON.stringify(subscriber), { metadata: { email, status: subscriber.status, source: subscriber.source, updatedAt: now } });
  await env.FORUM_POSTS.put('newsletter:last-subscribe', JSON.stringify({ email, updatedAt: now, source: subscriber.source }), { metadata: { email, updatedAt: now } });
  return json({ ok: true, persistent: true, storage: 'Cloudflare KV FORUM_POSTS', message: 'Subscribed to Matrix Reprogrammed weekly signal.', subscriber: { id: subscriber.id, email: subscriber.email, status: subscriber.status } });
}

async function handleUnsubscribeNewsletter(request, env) {
  if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding');
  const url = new URL(request.url);
  const email = cleanText(url.searchParams.get('email') || '', 220).toLowerCase();
  if (!validEmail(email)) return new Response('Valid email required.', { status: 400, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
  const raw = await env.FORUM_POSTS.get(subscriberKey(email));
  let subscriber = null;
  try { subscriber = raw ? JSON.parse(raw) : null; } catch {}
  if (!subscriber) return new Response('Subscriber not found or already removed.', { status: 404, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
  subscriber.status = 'unsubscribed';
  subscriber.updatedAt = new Date().toISOString();
  await env.FORUM_POSTS.put(subscriberKey(email), JSON.stringify(subscriber), { metadata: { email, status: 'unsubscribed', updatedAt: subscriber.updatedAt } });
  return new Response('You are unsubscribed from Matrix Reprogrammed weekly signals.', { status: 200, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
}

function newsletterText(drop, baseUrl) {
  const title = drop && drop.title ? drop.title : 'The Black File gateway is open';
  const label = drop && drop.label ? drop.label : 'Archive Signal';
  const date = drop && drop.date ? drop.date : new Date().toISOString().slice(0, 10);
  const source = drop && drop.source ? drop.source : 'Matrix Reprogrammed';
  const sourceLink = drop && drop.sourceLink ? drop.sourceLink : baseUrl + '/black-file.html';
  const bookTitle = drop && drop.book && drop.book.title ? drop.book.title : 'The Black File';
  const bookUrl = drop && drop.book && drop.book.localUrl ? drop.book.localUrl : baseUrl + '/books.html';
  return {
    subject: 'Matrix Reprogrammed Weekly Signal — ' + title.slice(0, 70),
    text: [
      'MATRIX REPROGRAMMED — WEEKLY SIGNAL',
      '',
      'Date: ' + date,
      'Evidence label: ' + label,
      'Signal: ' + title,
      'Source: ' + source,
      'Source link: ' + sourceLink,
      '',
      'Read next: ' + bookTitle,
      bookUrl,
      '',
      'Open Live Intel: ' + baseUrl + '/live-intel.html',
      'Open Evidence Vault: ' + baseUrl + '/evidence-vault.html',
      'Download Center: ' + baseUrl + '/download-center.html',
      '',
      'Boundary: source first, claim second, pattern last.'
    ].join('\n'),
    html: '<h1>Matrix Reprogrammed Weekly Signal</h1>' +
      '<p><strong>Date:</strong> ' + date + '</p>' +
      '<p><strong>Evidence label:</strong> ' + label + '</p>' +
      '<h2>' + title.replace(/[<>]/g, '') + '</h2>' +
      '<p><strong>Source:</strong> ' + source.replace(/[<>]/g, '') + '</p>' +
      '<p><a href="' + sourceLink + '">Open source record</a></p>' +
      '<p><strong>Read next:</strong> <a href="' + bookUrl + '">' + bookTitle.replace(/[<>]/g, '') + '</a></p>' +
      '<hr><p><a href="' + baseUrl + '/live-intel.html">Live Intel</a> · <a href="' + baseUrl + '/evidence-vault.html">Evidence Vault</a> · <a href="' + baseUrl + '/download-center.html">Downloads</a></p>' +
      '<p><em>Boundary: source first, claim second, pattern last.</em></p>'
  };
}

async function sendResendEmail(env, from, to, subject, html, text) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text })
  });
  const body = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body: cleanText(body, 800) };
}

async function handleSendWeeklyNewsletter(request, env) {
  if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding');
  if (!env.NEWSLETTER_ADMIN_TOKEN) return safeNotConfigured('NEWSLETTER_ADMIN_TOKEN Cloudflare secret', 'Needed to protect weekly send endpoint.');
  const supplied = request.headers.get('x-newsletter-admin-token') || new URL(request.url).searchParams.get('token') || '';
  if (supplied !== env.NEWSLETTER_ADMIN_TOKEN) return json({ ok: false, error: 'Unauthorized newsletter send request.' }, 401);
  if (!env.RESEND_API_KEY) return safeNotConfigured('RESEND_API_KEY Cloudflare secret', 'Needed to send weekly newsletter emails through Resend.');
  const subscribers = await getSubscribers(env) || [];
  const baseUrl = 'https://www.matrixreprogrammed.com';
  const latestDrop = await readAssetJson(request, env, '/data/latest-drop.json');
  const letter = newsletterText(latestDrop, baseUrl);
  const from = cleanText(env.NEWSLETTER_FROM_EMAIL || 'Matrix Reprogrammed <updates@matrixreprogrammed.com>', 220);
  const results = [];
  for (const subscriber of subscribers) {
    const unsubscribe = baseUrl + '/unsubscribe-newsletter?email=' + encodeURIComponent(subscriber.email);
    const html = letter.html + '<p style="font-size:12px;color:#777">Unsubscribe: <a href="' + unsubscribe + '">' + unsubscribe + '</a></p>';
    const text = letter.text + '\n\nUnsubscribe: ' + unsubscribe;
    const result = await sendResendEmail(env, from, subscriber.email, letter.subject, html, text);
    results.push({ email: subscriber.email, ok: result.ok, status: result.status });
  }
  const sent = results.filter(item => item.ok).length;
  const failed = results.length - sent;
  const run = { id: makeId(), createdAt: new Date().toISOString(), sent, failed, total: results.length, subject: letter.subject, results };
  await env.FORUM_POSTS.put('newsletter:last-send', JSON.stringify(run), { metadata: { sent, failed, total: results.length, createdAt: run.createdAt } });
  await env.FORUM_POSTS.put('newsletter:send:' + run.id, JSON.stringify(run), { metadata: { sent, failed, total: results.length, createdAt: run.createdAt } });
  return json({ ok: failed === 0, persistent: true, sent, failed, total: results.length, subject: letter.subject, runId: run.id });
}

async function handleNewsletterHealth(env) {
  const hasKv = Boolean(env.FORUM_POSTS);
  const subscribers = hasKv ? await getSubscribers(env) : null;
  let lastSend = null;
  if (hasKv) { try { lastSend = JSON.parse(await env.FORUM_POSTS.get('newsletter:last-send') || 'null'); } catch {} }
  return json({
    ok: true,
    capturePersistent: hasKv,
    storage: hasKv ? 'Cloudflare KV FORUM_POSTS subscriber:* records' : 'missing FORUM_POSTS binding',
    subscriberCount: Array.isArray(subscribers) ? subscribers.length : null,
    weeklySenderConfigured: Boolean(env.RESEND_API_KEY && env.NEWSLETTER_ADMIN_TOKEN),
    resendConfigured: Boolean(env.RESEND_API_KEY),
    adminTokenConfigured: Boolean(env.NEWSLETTER_ADMIN_TOKEN),
    fromConfigured: Boolean(env.NEWSLETTER_FROM_EMAIL),
    lastSend,
    requiredSecrets: ['RESEND_API_KEY', 'NEWSLETTER_ADMIN_TOKEN', 'NEWSLETTER_FROM_EMAIL'],
    routes: ['/newsletter', '/subscribe-newsletter', '/newsletter-health', '/send-weekly-newsletter']
  });
}
`;

if (!hasNewsletterFunctions && !source.includes(marker)) {
  const insertBefore = 'async function handleTrackEvent(request, env) {';
  if (!source.includes(insertBefore)) {
    throw new Error('Could not find handleTrackEvent insertion point in src/worker.js');
  }
  source = source.replace(insertBefore, functions + '\n' + insertBefore);
} else {
  console.log('Newsletter Worker functions already present; skipping function injection.');
}

const baseOptions = "if (request.method === 'OPTIONS' && ['/track-event', '/.netlify/functions/track-event', '/intro-voice'].includes(originalPath))";
const newsletterOptions = "if (request.method === 'OPTIONS' && ['/track-event', '/.netlify/functions/track-event', '/intro-voice', '/subscribe-newsletter', '/send-weekly-newsletter'].includes(originalPath))";
if (source.includes(baseOptions)) {
  source = source.replace(baseOptions, newsletterOptions);
}

const introRoute = "if (request.method === 'POST' && originalPath === '/intro-voice') return handleIntroVoice(request, env);";
const newsletterRouteBlock = "if (request.method === 'POST' && originalPath === '/subscribe-newsletter') return handleSubscribeNewsletter(request, env);\n      if (request.method === 'GET' && originalPath === '/newsletter-health') return handleNewsletterHealth(env);\n      if (request.method === 'GET' && originalPath === '/unsubscribe-newsletter') return handleUnsubscribeNewsletter(request, env);\n      if (request.method === 'POST' && originalPath === '/send-weekly-newsletter') return handleSendWeeklyNewsletter(request, env);";
if (!hasNewsletterRoutes) {
  if (!source.includes(introRoute)) {
    throw new Error('Could not find intro-voice route insertion point in src/worker.js');
  }
  source = source.replace(introRoute, introRoute + '\n      ' + newsletterRouteBlock);
} else {
  console.log('Newsletter Worker routes already present; skipping route injection.');
}

source = normaliseWorker(source);
fs.writeFileSync(workerPath, source);
console.log('Patched Worker with idempotent persistent newsletter capture and weekly send endpoints; duplicate newsletter health handlers removed if found.');
