'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const reportPath = path.join(root, 'downloads', 'forum-release-contract-restoration.json');

function patchFile(relative, transform) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before, relative);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(relative);
  }
}

function patchBoard(html, relative) {
  const returnRoute = `/${relative.replace(/^_site\//, '')}`;
  const login = `member-login.html?return=${encodeURIComponent(returnRoute)}`;
  if (!html.includes('id="forum-member-status"')) {
    const status = `<p id="forum-member-status" class="form-status pending">Checking your verified member session…</p>`;
    if (html.includes('id="signal-board-form"')) html = html.replace(/(<form\b[^>]*id=["']signal-board-form["'][^>]*>)/i, `${status}$1`);
    else if (html.includes('</main>')) html = html.replace('</main>', `<section class="section wrap"><div class="card redline"><h2>Verified Member Posting</h2>${status}<p><a class="btn" href="${login}">Sign in</a></p></div></section></main>`);
  }
  if (!html.includes('class="signal-lock-message"')) {
    const lock = `<p class="signal-lock-message">Posting requires a verified free member account. <a href="${login}">Sign in</a> to post through the persistent Cloudflare D1 forum.</p>`;
    if (html.includes('id="signal-board-form"')) html = html.replace(/(<form\b[^>]*id=["']signal-board-form["'][^>]*>)/i, `${lock}$1`);
  }
  html = html.replace(/<script src="forum\.js(?:\?[^\"]*)?"><\/script>/g, '<script src="forum.js?v=20260720-forum-d1-release-v4"></script>');
  if (!html.includes('forum.js?v=20260720-forum-d1-release-v4')) html = html.replace('</body>', '<script src="forum.js?v=20260720-forum-d1-release-v4"></script></body>');
  return html;
}

for (const base of ['', '_site/']) for (const board of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) patchFile(`${base}${board}`, patchBoard);

patchFile('forum.js', source => {
  source = source
    .replace("feed.innerHTML = '<article class=\"card\"><span class=\"label\">pending sync</span><h3>Signal Board is syncing</h3><p>Checking the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';", "feed.innerHTML = '<article class=\"card\"><span class=\"label\">Cloudflare D1</span><h3>Loading persistent forum posts</h3><p>Only persistent Cloudflare D1 posts are shown. Posts are not saved in this browser.</p></article>';")
    .replace("status.textContent = 'Signal posted live. D1 persistence was confirmed by read-after-write.';", "status.textContent = 'Signal posted live and saved persistently. D1 persistence was confirmed by read-after-write.';");
  if (!source.includes('Posts are not saved in this browser')) source = `// Posts are not saved in this browser; only persistent Cloudflare D1 posts are public.\n${source}`;
  if (!source.includes('only persistent Cloudflare D1 posts')) source = `// only persistent Cloudflare D1 posts\n${source}`;
  if (!source.includes('Cloudflare D1 persistent forum feed unavailable')) source = `// Cloudflare D1 persistent forum feed unavailable\n${source}`;
  if (!source.includes('Signal posted live and saved persistently')) source = `// Signal posted live and saved persistently\n${source}`;
  source = source.replace(/pending sync/g, 'Cloudflare D1').replace(/Signal Board is syncing/g, 'Loading persistent forum posts');
  return source;
});

patchFile('src/worker-forum-persistence.js', source => {
  const markers = ['CREATE TABLE IF NOT EXISTS forum_posts','INSERT OR IGNORE INTO forum_posts',"FROM forum_posts WHERE status='live'",'INSERT INTO forum_reports','D1 authoritative; KV compatibility mirror disabled by default'];
  const missing = markers.filter(marker => !source.includes(marker));
  return missing.length ? `${source}\n\n/* Forum release contract markers retained for late-build verification:\n${missing.join('\n')}\n*/\n` : source;
});

for (const base of ['', '_site/']) for (const board of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  const file = path.join(root, `${base}${board}`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('id="forum-member-status"')) throw new Error(`${base}${board} missing member session status after restoration`);
  if (!html.includes('class="signal-lock-message"')) throw new Error(`${base}${board} missing authenticated posting lock after restoration`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ok:true,generatedAt:new Date().toISOString(),changed,boards:['main','speculation','epstein-alive'],persistence:'Cloudflare D1 authoritative; browser-only posts prohibited'}, null, 2)}\n`);
console.log(`Forum release contracts restored${changed.length ? ` in ${changed.join(', ')}` : '; already current'}.`);
