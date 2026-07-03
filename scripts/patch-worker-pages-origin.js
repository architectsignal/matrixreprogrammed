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
  const needsSubscribe = !text.includes('async function handleSubscribeNewsletter');
  const needsSendAlias = !text.includes('async function handleSendWeeklyNewsletter');
  if (!needsSubscribe && !needsSendAlias) return text;

  const anchor = 'async function handleNewsletterHealth(env)';
  if (!text.includes(anchor)) {
    console.error('Worker patch failed: newsletter handler anchor not found');
    process.exit(1);
  }

  const blocks = [];
  if (needsSubscribe) {
    blocks.push(`async function handleSubscribeNewsletter(request, env) {
  return handleNewsletterSignup(request, env);
}
`);
  }
  if (needsSendAlias) {
    blocks.push(`async function handleSendWeeklyNewsletter(request, env) {
  return handleNewsletterSendWeekly(request, env);
}
`);
  }

  return text.replace(anchor, blocks.join('\n') + '\n' + anchor);
}

function patchForumPublicFiltering(text) {
  if (text.includes('function isSyntheticForumPost(post)')) return text;

  const anchor = 'function makeId() { return `signal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }';
  if (!text.includes(anchor)) {
    console.error('Worker patch failed: forum makeId anchor not found');
    process.exit(1);
  }

  const helpers = `${anchor}

function isSyntheticForumPost(post) {
  if (!post || typeof post !== 'object') return true;
  const blob = [post.id, post.title, post.body, post.message, post.category, post.name, post.status, post.sourceUrl, post.source]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  if (/\b(synthetic check|synthetic post|smoke test|health check|demo post|fixture post|qa post|seed post|system check|generated check)\b/i.test(blob)) return true;
  if (/^(synthetic|demo|qa|fixture|seed|smoke|health-check|system-check)[:_-]/i.test(String(post.id || ''))) return true;
  if (/^(synthetic|demo|qa|fixture|seed|smoke|health-check|system-check)$/i.test(String(post.status || ''))) return true;
  if (/^(synthetic|demo|qa|fixture|seed|smoke|health-check|system-check)$/i.test(String(post.category || ''))) return true;
  if (/^(matrix qa|matrix bot|system check|demo user|synthetic user)$/i.test(String(post.name || ''))) return true;
  return false;
}

function publicForumPosts(posts = []) {
  return sortPosts((posts || []).filter(post => post && post.status === 'live' && !isSyntheticForumPost(post)));
}`;
  text = text.replace(anchor, helpers);

  text = text.replace(
    "async function getPosts(env, board = 'all') {\n  const posts = await getForumIndex(env);\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}",
    "async function getPosts(env, board = 'all') {\n  const posts = publicForumPosts(await getForumIndex(env));\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}"
  );

  text = text.replace(
    "const posts = await getForumIndex(env);\n  return json({\n    ok: true,",
    "const storedPosts = await getForumIndex(env);\n  const posts = publicForumPosts(storedPosts);\n  return json({\n    ok: true,"
  );
  text = text.replace("indexCount: posts.length,", "indexCount: storedPosts.length,");
  text = text.replace("storedPostCount: posts.length,", "storedPostCount: storedPosts.length,");
  text = text.replace("boardCounts: boardCounts(posts),", "boardCounts: boardCounts(posts),\n    publicPostCount: posts.length,\n    syntheticHidden: Math.max(0, storedPosts.length - posts.length),");

  text = text.replace(
    "return { ok: true, persistent: true, source: 'Cloudflare KV FORUM_POSTS', generatedAt: new Date().toISOString(), board: normalizedBoard, boardLabel: normalizedBoard === 'all' ? 'All Boards' : boardLabels[normalizedBoard], boardCounts: boardCounts(await getForumIndex(env)), count: posts.length, posts: posts.slice(0, 60), boundary: 'Public Signal Board posts are user-submitted public resources. They are not claims verified by Matrix Reprogrammed unless separately source-carded or cited.' };",
    "const publicIndex = publicForumPosts(await getForumIndex(env));\n  return { ok: true, persistent: true, source: 'Cloudflare KV FORUM_POSTS', generatedAt: new Date().toISOString(), board: normalizedBoard, boardLabel: normalizedBoard === 'all' ? 'All Boards' : boardLabels[normalizedBoard], boardCounts: boardCounts(publicIndex), count: posts.length, posts: posts.slice(0, 60), syntheticHidden: Math.max(0, (await getForumIndex(env)).length - publicIndex.length), boundary: 'Public Signal Board posts are user-submitted public resources. Synthetic QA/demo/check records are hidden from public feeds. Posts are not claims verified by Matrix Reprogrammed unless separately source-carded or cited.' };"
  );

  return text;
}

function patchPredictionAliases(text) {
  const aliases = {
    "'/prediction-engine': '/prediction-engine.html'": "  '/prediction-engine': '/prediction-engine.html',",
    "'/probability-lab': '/probability-lab.html'": "  '/probability-lab': '/probability-lab.html',",
    "'/probability-snapshot': '/probability-snapshot.html'": "  '/probability-snapshot': '/probability-snapshot.html',",
    "'/trigger-watchtower': '/trigger-watchtower.html'": "  '/trigger-watchtower': '/trigger-watchtower.html',",
    "'/billionaire-watch': '/billionaire-watch.html'": "  '/billionaire-watch': '/billionaire-watch.html',",
    "'/review-lanes': '/review-lanes.html'": "  '/review-lanes': '/review-lanes.html',",
    "'/system-feed-index': '/system-feed-index.html'": "  '/system-feed-index': '/system-feed-index.html'"
  };
  let insert = '';
  for (const [marker, line] of Object.entries(aliases)) {
    if (!text.includes(marker)) insert += line + '\n';
  }
  if (insert) text = text.replace("  '/amazon-store': '/amazon-store-books.html'", insert + "  '/amazon-store': '/amazon-store-books.html'");
  return text;
}

patchNewsletterFormMarker();
s = s.replace(/^const PAGES_STATIC_ORIGIN = ['"]https:\/\/matrixreprogrammed\.pages\.dev['"];\n\n?/m, '');
s = s.replace("'/newsletter': '/optin-center.html',", "'/newsletter': '/newsletter.html',");
s = patchNewsletterWorkerHandlers(s);
s = patchForumPublicFiltering(s);
s = patchPredictionAliases(s);

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
  console.log('Worker static routing now uses bundled Cloudflare assets and public forum filtering.');
} else {
  console.log('Worker static routing already uses bundled Cloudflare assets.');
}
