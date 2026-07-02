const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');

if (!fs.existsSync(workerPath)) {
  console.error('Worker patch failed: src/worker.js missing');
  process.exit(1);
}

let s = fs.readFileSync(workerPath, 'utf8');
const before = s;

function isCleanWorker(text) {
  const hasAssets = text.includes('env.ASSETS.fetch');
  const hasPages = /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(text);
  return hasAssets && !hasPages;
}

function patchNewsletterFormMarker() {
  const newsletterPath = path.join(root, 'newsletter.html');
  if (!fs.existsSync(newsletterPath)) return;
  let html = fs.readFileSync(newsletterPath, 'utf8');
  const htmlBefore = html;
  if (!html.includes('data-newsletter-form')) {
    html = html.replace('<form id="newsletter-form"', '<form id="newsletter-form" data-newsletter-form');
  }
  if (html !== htmlBefore) {
    fs.writeFileSync(newsletterPath, html);
    console.log('Newsletter form live-test marker patched.');
  }
}

function patchNewsletterWorkerHandlers(text) {
  if (text.includes('async function handleSubscribeNewsletter')) return text;

  const anchor = 'async function handleNewsletterHealth(env)';
  if (!text.includes(anchor)) {
    console.error('Worker patch failed: newsletter handler anchor not found');
    process.exit(1);
  }

  const handlers = `async function handleSubscribeNewsletter(request, env) {
  if (!env.FORUM_POSTS) return json({ ok: false, configured: false, persistent: false, error: 'FORUM_POSTS KV binding missing', worker: workerName }, 503);
  const body = await readBody(request);
  if (body.website) return json({ ok: false, error: 'Spam trap triggered' }, 400);
  const email = cleanEmail(body.email);
  if (!isEmail(email)) return json({ ok: false, error: 'Valid email required' }, 400);
  const id = await hashText(email);
  const now = new Date().toISOString();
  const subscriber = {
    id,
    email,
    name: cleanText(body.name || '', 120),
    source: cleanText(body.source || 'newsletter', 180),
    tags: cleanText(body.tags || '', 240),
    path: cleanText(body.path || '/newsletter.html', 180),
    interest: cleanText(body.interest || 'Matrix Reprogrammed weekly signal drop', 400),
    consent: body.consent === undefined ? true : !/^(false|no|0)$/i.test(String(body.consent)),
    createdAt: now,
    updatedAt: now,
    status: 'subscribed'
  };
  await env.FORUM_POSTS.put('newsletter:subscriber:' + id, JSON.stringify(subscriber), {
    metadata: { emailHash: id, status: 'subscribed', createdAt: now, source: subscriber.source }
  });
  const index = await getNewsletterIndex(env);
  const existing = index.find(item => item && item.id === id);
  if (existing) {
    existing.email = email;
    existing.name = subscriber.name || existing.name;
    existing.status = 'subscribed';
    existing.updatedAt = now;
  } else {
    index.unshift({ id, email, name: subscriber.name, source: subscriber.source, createdAt: now, status: 'subscribed' });
  }
  await saveNewsletterIndex(env, index);
  return json({
    ok: true,
    persistent: true,
    storage: 'Cloudflare KV FORUM_POSTS',
    worker: workerName,
    subscriber,
    subscriberId: id,
    status: 'subscribed',
    message: 'Saved. Weekly Signal Drop enabled.',
    downloadUrl: '/downloads/the-black-file-matrix-reprogrammed.pdf'
  });
}

async function handleUnsubscribeNewsletter(request, env) {
  if (!env.FORUM_POSTS) return json({ ok: false, configured: false, error: 'FORUM_POSTS KV binding missing', worker: workerName }, 503);
  const url = new URL(request.url);
  const email = cleanEmail(url.searchParams.get('email') || '');
  if (!isEmail(email)) return json({ ok: false, error: 'Valid email required' }, 400);
  const id = await hashText(email);
  const now = new Date().toISOString();
  let subscriber = { id, email };
  try {
    const raw = await env.FORUM_POSTS.get('newsletter:subscriber:' + id);
    subscriber = { ...subscriber, ...(JSON.parse(raw || '{}') || {}) };
  } catch {}
  subscriber.status = 'unsubscribed';
  subscriber.updatedAt = now;
  await env.FORUM_POSTS.put('newsletter:subscriber:' + id, JSON.stringify(subscriber), {
    metadata: { emailHash: id, status: 'unsubscribed', updatedAt: now }
  });
  const index = await getNewsletterIndex(env);
  const existing = index.find(item => item && item.id === id);
  if (existing) {
    existing.status = 'unsubscribed';
    existing.updatedAt = now;
  } else {
    index.unshift({ id, email, createdAt: now, status: 'unsubscribed' });
  }
  await saveNewsletterIndex(env, index);
  return json({ ok: true, persistent: true, storage: 'Cloudflare KV FORUM_POSTS', subscriber, status: 'unsubscribed' });
}

async function handleSendWeeklyNewsletter(request, env) {
  return handleNewsletterSendWeekly(request, env);
}

`;

  return text.replace(anchor, handlers + anchor);
}

patchNewsletterFormMarker();
s = s.replace(/^const PAGES_STATIC_ORIGIN = ['"]https:\/\/matrixreprogrammed\.pages\.dev['"];\n\n?/m, '');
s = s.replace("'/newsletter': '/optin-center.html',", "'/newsletter': '/newsletter.html',");
s = patchNewsletterWorkerHandlers(s);

if (isCleanWorker(s)) {
  if (s !== before) fs.writeFileSync(workerPath, s);
  console.log('Worker static routing already uses bundled Cloudflare assets.');
  process.exit(0);
}

const replacement = `const tryAsset = async (pathname) => {
      if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
        return new Response('Static assets unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'worker-assets-missing' }
        });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'worker-assets-method' }
        });
      }

      const assetUrl = new URL(request.url);
      assetUrl.pathname = pathname;
      assetUrl.search = url.search;

      const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      const headers = new Headers(response.headers);
      headers.set('X-Matrix-Origin', 'worker-assets');
      headers.set('X-Matrix-Asset-Path', pathname);
      if (pathname === '/' || pathname.endsWith('.html') || !/\.[a-z0-9]{2,8}$/i.test(pathname)) {
        headers.set('Cache-Control', 'no-store, must-revalidate');
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };`;

const block = /const tryAsset = async \(pathname\) => \{[\s\S]*?\n    \};\n\n    let response = await tryAsset\(routedPath\);/;
if (!block.test(s)) {
  console.error('Worker patch failed: tryAsset block not found and Worker is not already clean');
  console.error(JSON.stringify({ clean: isCleanWorker(s), hasAssets: s.includes('env.ASSETS.fetch'), hasPages: /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(s) }, null, 2));
  process.exit(1);
}

s = s.replace(block, `${replacement}\n\n    let response = await tryAsset(routedPath);`);

if (!isCleanWorker(s)) {
  console.error('Worker patch failed: bundled asset routing not clean');
  console.error(JSON.stringify({ hasAssets: s.includes('env.ASSETS.fetch'), hasPages: /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(s) }, null, 2));
  process.exit(1);
}

if (s !== before) {
  fs.writeFileSync(workerPath, s);
  console.log('Worker static routing now uses bundled Cloudflare assets.');
} else {
  console.log('Worker static routing already uses bundled Cloudflare assets.');
}
