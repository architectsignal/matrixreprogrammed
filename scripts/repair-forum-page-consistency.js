const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'forum-page-consistency-repair.json');
const changed = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Required forum page is missing: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function write(relative, content) {
  const file = path.join(root, relative);
  const before = fs.readFileSync(file, 'utf8');
  if (before === content) return;
  fs.writeFileSync(file, content);
  changed.push(relative);
}

const canonicalLogin = route => `https://matrixreprogrammed.com/member-login.html?return=${encodeURIComponent(route)}`;

{
  const relative = 'dark-speculation-forum.html';
  let html = read(relative);
  const loginUrl = canonicalLogin('/dark-speculation-forum.html');
  const memberPanel = `<aside class="card redline"><h2>Verified Member Posting</h2><p>Reading is public. Posting uses the free passwordless member account so the server can enforce session controls and persistent D1 storage.</p><div class="cta-row small"><a class="btn" href="${loginUrl}">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></aside>`;
  const memberSection = `<section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Verified Member Posting</h2><p>The board is free to read. A verified Free Member account unlocks posting across devices and gives you session controls.</p><p id="forum-member-status" class="form-status pending">Checking your member session…</p><div class="cta-row small"><a class="btn" href="${loginUrl}">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></div><aside class="card"><h2>Best Dark Leads</h2><p>Best posts include a source link, exact claim, evidence type, counter-source if available, and whether it is public record, symbolism, folklore, or speculation.</p></aside></section>`;

  html = html.replace(/<aside class="card redline"><h2>Signal Pass<\/h2>.*?<\/aside>/, memberPanel);
  html = html.replace(/<section id="signal-pass" class="section wrap split">.*?<\/section>/, memberSection);
  html = html.replace('Posting is locked until Signal Pass is unlocked on this device.', 'Posting requires a verified free member account.');
  html = html.replace('Posts appear publicly by default after Signal Pass unlock.', 'Posts appear publicly after verified member sign-in.');
  html = html.replace(/<script src="forum\.js(?:\?[^\"]*)?"><\/script>/g, '<script src="forum.js?v=20260720-forum-member-posting-v3"></script>');

  if (html.includes('paypal.me/njmgroup/1')) throw new Error('Dark speculation page still contains the obsolete paid posting link');
  if (html.includes('unlock-signal-pass')) throw new Error('Dark speculation page still contains the obsolete browser unlock control');
  if (!html.includes('id="forum-member-status"')) throw new Error('Dark speculation page has no member-session status surface');
  if (!html.includes('Posting requires a verified free member account.')) throw new Error('Dark speculation page has no verified-member lock message');
  write(relative, html);
}

for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  let html = read(relative);
  html = html.replace(/<script src="forum\.js(?:\?[^"]*)?"><\/script>/g, '<script src="forum.js?v=20260720-forum-member-posting-v3"></script>');
  if (!html.includes('forum.js?v=20260720-forum-member-posting-v3')) html = html.replace('</body>', '<script src="forum.js?v=20260720-forum-member-posting-v3"></script></body>');
  write(relative, html);
  if (!html.includes('forum.js?v=20260720-forum-member-posting-v3')) throw new Error(`${relative} does not load the repaired forum client`);
  if (!html.includes('id="forum-member-status"')) throw new Error(`${relative} does not expose member-session status`);
  if (!html.includes('id="signal-board-form"')) throw new Error(`${relative} has no posting form`);
  if (!html.includes('class="signal-lock-message"')) throw new Error(`${relative} has no authenticated posting lock`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  boards: ['main', 'speculation', 'epstein-alive'],
  postingAccess: 'verified free member session',
  obsoletePaidSignalPassRemoved: true,
  versionedForumClient: '20260720-forum-member-posting-v3',
  boundary: 'All three public boards use the same passwordless verified-member session and Cloudflare D1 persistence contract.'
}, null, 2)}\n`);
console.log(`Forum page consistency repair passed: ${changed.length ? changed.join(', ') : 'already current'}.`);
