'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pages = ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html'];
const changed = [];
const checks = [];

function cleanForumPage(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Required forum page is missing: ${relative}`);
  }

  const before = fs.readFileSync(file, 'utf8');
  let html = before;

  // Retire the paid-sounding name while preserving the old lowercase anchor for
  // bookmarks. Posting is unlocked by a verified free member session, not a pass.
  html = html
    .replace(/small Signal Pass anti-spam gate for posting\./gi, 'public reading and verified free member posting.')
    .replace(/Get Signal Pass/gi, 'Member Posting')
    .replace(/\bSignal Pass\b/g, 'Member Posting');

  // An earlier reader-copy pass accidentally converted placeholder attributes into
  // invalid boolean/field attributes. Restore valid, accessible placeholders.
  html = html.replace(/\sreader\s+field=(['"])(.*?)\1/gi, (_match, quote, value) => ` placeholder=${quote}${value}${quote}`);

  // This compatibility payload made retired local forum-export filenames visible to
  // search crawlers even though the live board is authoritative Cloudflare D1 data.
  html = html.replace(/<script\b[^>]*id=(['"])compatibility-marker-vault\1[^>]*>[\s\S]*?<\/script>/gi, '');

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(relative);
  }

  const pageChecks = {
    relative,
    noPaidPassWording: !/\bSignal Pass\b/i.test(html),
    noRawForumExportMarker: !/downloads\/forum-posts\.(?:json|md)/i.test(html),
    validPlaceholders: !/\sreader\s+field=/i.test(html),
    publicReadingPromise: /reading is public|reading stays public|free to read|board is free to read/i.test(html),
    verifiedFreePosting: /verified free member account|verified Free Member account/i.test(html)
  };
  checks.push(pageChecks);
  for (const [name, ok] of Object.entries(pageChecks)) {
    if (name !== 'relative' && !ok) throw new Error(`${relative} failed forum public-surface check: ${name}`);
  }
}

for (const relative of pages) cleanForumPage(relative);

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-public-surfaces-finalize.json'), `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  checks,
  boundary: 'Public forum pages expose verified free-member posting and the authoritative D1 board without paid-pass wording, malformed fields or retired local-export filenames.'
}, null, 2)}\n`);

console.log(`Forum public surfaces finalized: ${changed.length ? changed.join(', ') : 'already current'}.`);
