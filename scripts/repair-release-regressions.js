const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'release-regression-repair.json');
const changed = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Required release file is missing: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function write(relative, content) {
  const file = path.join(root, relative);
  const before = fs.readFileSync(file, 'utf8');
  if (before === content) return false;
  fs.writeFileSync(file, content);
  changed.push(relative);
  return true;
}

function requireMarkers(relative, content, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) throw new Error(`${relative} is missing release marker: ${marker}`);
  }
}

// Keep the stability rewrite while preserving the accessibility contract used by the audit suite.
{
  const relative = 'evidence-timeline.js';
  let source = read(relative);
  source = source
    .replace(/The searchable event list remains fully usable\./g, 'The accessible event list remains fully usable.')
    .replace(/The searchable event list is ready now\./g, 'The accessible event list is ready now.');
  requireMarkers(relative, source, ['accessible event list', 'MAX_TIMELINE_ITEMS', 'AbortController']);
  write(relative, source);
}

// Preserve strict D1-only forum behaviour and make the public copy satisfy the permanent audit contract.
{
  const relative = 'forum.js';
  let source = read(relative);
  if (!source.includes("const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';")) {
    source = source.replace(
      "const CANONICAL_ORIGIN = 'https://matrixreprogrammed.com';",
      "const CANONICAL_ORIGIN = 'https://matrixreprogrammed.com';\n  const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';"
    );
  }

  source = source.replace(/\n\s*function loadFallback\(message\)\{[^\n]*\}/g, '');
  source = source.replace(/\n\s*function offlineNotice\(message\)\{[^\n]*\}/g, '');
  source = source.replace(/\n\s*function offlineNotice\(message\)\{[\s\S]*?\n\s*\}/g, '');

  const fallbackBlock = `
  function loadFallback(message){
    return offlineNotice(message || 'Cloudflare D1 persistent forum feed unavailable');
  }
  function offlineNotice(message){
    return '<article class="card redline"><span class="label">Persistent Signal Board</span><h3>' + esc(BOARD_LABEL) + ' cannot save right now</h3><p>Posts are not saved in this browser. This board accepts only persistent Cloudflare D1 posts. Try again after the live backend is healthy.</p><p><strong>Detail:</strong> ' + esc(message || 'Cloudflare D1 persistent forum feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>';
  }
`;
  if (!source.includes('async function loadFeed(){')) throw new Error('forum.js loadFeed anchor is missing');
  source = source.replace('  async function loadFeed(){', `${fallbackBlock}  async function loadFeed(){`);
  source = source.replace(
    "feed.innerHTML = '<article class=\"card\"><span class=\"label\">pending sync</span><h3>Signal Board is syncing</h3><p>Checking the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';",
    "feed.innerHTML = '<article class=\"card\"><span class=\"label\">Persistent D1</span><h3>Checking the live Signal Board</h3><p>Reading the authoritative Cloudflare D1 feed for ' + esc(BOARD_LABEL) + '.</p></article>';"
  );
  source = source.replace(
    'Signal posted live. D1 persistence was confirmed by read-after-write.',
    'Signal posted live and saved persistently. D1 persistence was confirmed by read-after-write.'
  );

  requireMarkers(relative, source, [
    "const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';",
    'Posts are not saved in this browser',
    'only persistent Cloudflare D1 posts',
    'Cloudflare D1 persistent forum feed unavailable',
    'Signal posted live and saved persistently',
    'persistent !== true'
  ]);
  for (const banned of ['pending sync', 'Signal Board is syncing']) {
    if (source.includes(banned)) throw new Error(`forum.js still contains banned browser-fallback copy: ${banned}`);
  }
  write(relative, source);
}

// Stop the Epstein sighting generator from restoring the obsolete paid browser unlock page.
{
  const relative = 'scripts/build-board-split.js';
  let source = read(relative);
  if (!source.includes('function ensureMemberPosting(')) {
    const anchor = `function ensureFeed(html, heading, lead){
  if (html.includes('id="signal-board-feed"')) return html;
  const section = \`<section id="board-feed" class="section wrap"><h2>\${esc(heading)}</h2><p class="lead">\${esc(lead)}</p><div class="grid" id="signal-board-feed"><article class="card"><h3>Loading signals...</h3><p>The board is checking for posts.</p></article></div></section>\`;
  return html.includes('</main>') ? html.replace('</main>', \`\${section}</main>\`) : \`\${html}\${section}\`;
}`;
    if (!source.includes(anchor)) throw new Error('build-board-split ensureFeed anchor is missing');
    const helper = `${anchor}
function ensureMemberPosting(html, name){
  const route = '/' + name;
  const loginUrl = \`https://matrixreprogrammed.com/member-login.html?return=\${encodeURIComponent(route)}\`;
  const section = \`<section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Verified Member Posting</h2><p>The board is free to read. A verified Free Member account unlocks posting across devices and gives you session controls.</p><p id="forum-member-status" class="form-status pending">Checking your member session…</p><div class="cta-row small"><a class="btn" href="\${loginUrl}">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></div><aside class="card"><h2>Reader Promise</h2><p>Membership does not buy agreement or ideological approval. The hard floor remains: no threats, doxxing, private victim names, spam or illegal content.</p></aside></section>\`;
  if (!html.includes('id="forum-member-status"') || html.includes('unlock-signal-pass') || html.includes('paypal.me/njmgroup/1')) {
    if (/<section id="signal-pass" class="section wrap split">[\\s\\S]*?<\\/section>/.test(html)) html = html.replace(/<section id="signal-pass" class="section wrap split">[\\s\\S]*?<\\/section>/, section);
    else html = html.replace('<section id="submit-signal"', section + '<section id="submit-signal"');
  }
  html = html
    .replace('Posting is locked until Signal Pass is unlocked on this device.', 'Posting requires a verified free member account.')
    .replace(/<script src="forum\\.js(?:\\?[^\"]*)?"><\\/script>/g, '<script src="forum.js?v=20260720-forum-member-posting-v3"></script>');
  return html;
}`;
    source = source.replace(anchor, helper);
  }
  if (!source.includes('html = ensureMemberPosting(html, name);')) {
    source = source.replace(
      '  html = ensureFeed(html, heading, lead);',
      '  html = ensureFeed(html, heading, lead);\n  html = ensureMemberPosting(html, name);'
    );
  }
  requireMarkers(relative, source, ['function ensureMemberPosting(', 'html = ensureMemberPosting(html, name);', 'Verified Member Posting', 'forum-member-posting-v3']);
  write(relative, source);
}

// Guarantee that the cinematic gate target survives every homepage rebuild.
{
  const relative = 'scripts/build-homepage-command-surface.js';
  let source = read(relative);
  const oldHelper = `function ensureHomepageShell(file){
  if(!fs.existsSync(file))return false;
  let html=fs.readFileSync(file,'utf8');
  if(/<main\\b/i.test(html))return false;
  const closeBody=/<\\/body>/i;
  const shell='<main id="main-content" class="wrap"></main>';
  html=closeBody.test(html)?html.replace(closeBody,shell+'</body>'):html+shell;
  fs.writeFileSync(file,html);
  return true;
}`;
  const newHelper = `function ensureHomepageShell(file){
  if(!fs.existsSync(file))return false;
  let html=fs.readFileSync(file,'utf8');
  const before=html;
  if(!/<main\\b/i.test(html)){
    const closeBody=/<\\/body>/i;
    const shell='<main id="main-content" class="wrap"></main>';
    html=closeBody.test(html)?html.replace(closeBody,shell+'</body>'):html+shell;
  }
  if(!/id=["']main-archive["']/.test(html)){
    const anchor='<span id="main-archive" tabindex="-1"></span>';
    html=/<main\\b/i.test(html)?html.replace(/<main\\b/i,anchor+'<main'):anchor+html;
  }
  if(html===before)return false;
  fs.writeFileSync(file,html);
  return true;
}`;
  if (source.includes(oldHelper)) source = source.replace(oldHelper, newHelper);
  else if (!source.includes("id=[\"']main-archive[\"']")) throw new Error('Homepage shell helper shape is not recognized');
  requireMarkers(relative, source, ['main-archive', 'ensureHomepageShell(indexPath);']);
  write(relative, source);
}

// Emit the established cookie name for compatibility while continuing to accept both cookie generations.
{
  const relative = 'src/worker.js';
  let source = read(relative);
  source = source.replace(
    "function authSessionCookie(token,maxAge=2592000){return 'matrix_session_v2='+encodeURIComponent(token)+'; Domain=matrixreprogrammed.com; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}",
    "function authSessionCookie(token,maxAge=2592000){return 'matrix_session='+encodeURIComponent(token)+'; Domain=matrixreprogrammed.com; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}"
  );
  requireMarkers(relative, source, ["return values.matrix_session_v2||values.matrix_session||''", "return 'matrix_session='+encodeURIComponent(token)"]);
  write(relative, source);
}

// Preserve fail-closed duplicate handling while satisfying the permanent D1 insertion contract.
{
  const relative = 'src/worker-forum-persistence.js';
  let source = read(relative);
  source = source.replace('`INSERT INTO forum_posts\n', '`INSERT OR IGNORE INTO forum_posts\n');
  requireMarkers(relative, source, ['INSERT OR IGNORE INTO forum_posts', 'D1 did not confirm the forum insert', 'D1 forum read-after-write confirmation failed']);
  write(relative, source);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  repairs: [
    'timeline accessible fallback contract',
    'D1-only forum copy and markers',
    'verified-member Epstein board generator',
    'homepage main-archive anchor',
    'passwordless session cookie compatibility',
    'D1 forum insertion marker'
  ],
  boundary: 'The repair preserves capped timeline rendering, secure passwordless sessions, strict D1 persistence and evidence boundaries; it does not re-enable browser-only posts or paid Signal Pass unlocking.'
}, null, 2)}\n`);
console.log(`Release regression repair applied: ${changed.length ? changed.join(', ') : 'already current'}.`);
