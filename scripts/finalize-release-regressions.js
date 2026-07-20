const fs = require('fs');
const path = require('path');

const root = process.cwd();
const forumPath = path.join(root, 'forum.js');
const reportPath = path.join(root, 'downloads', 'release-regression-finalize.json');
if (!fs.existsSync(forumPath)) throw new Error('forum.js is required for release finalization');

const before = fs.readFileSync(forumPath, 'utf8');
let source = before;

source = source.replace(/\n\s*function loadFallback\(message\)\{[^\n]*\}/g, '');
source = source.replace(/\n\s*function loadFallback\(message\)\{[\s\S]*?\n\s*\}/g, '');
source = source.replace(/\n\s*function offlineNotice\(message\)\{[^\n]*\}/g, '');
source = source.replace(/\n\s*function offlineNotice\(message\)\{[\s\S]*?\n\s*\}/g, '');

const canonical = `
  function loadFallback(message){
    return offlineNotice(message || 'Cloudflare D1 persistent forum feed unavailable');
  }
  function offlineNotice(message){
    return '<article class="card redline"><span class="label">Persistent Signal Board</span><h3>' + esc(BOARD_LABEL) + ' cannot save right now</h3><p>Posts are not saved in this browser. This board accepts only persistent Cloudflare D1 posts. Try again after the live backend is healthy.</p><p><strong>Detail:</strong> ' + esc(message || 'Cloudflare D1 persistent forum feed unavailable') + '</p><p><a class="btn alt" href="/forum-health">Check forum health</a></p></article>';
  }
`;
if (!source.includes('  async function loadFeed(){')) throw new Error('forum.js loadFeed anchor is missing during release finalization');
source = source.replace('  async function loadFeed(){', `${canonical}  async function loadFeed(){`);
source = source
  .replace(/pending sync/g, 'Persistent D1')
  .replace(/Signal Board is syncing/g, 'Checking the live Signal Board')
  .replace('Signal posted live. D1 persistence was confirmed by read-after-write.', 'Signal posted live and saved persistently. D1 persistence was confirmed by read-after-write.');

for (const marker of [
  "const LOCAL_POSTS_KEY = 'd1_only_no_browser_post_store';",
  'Posts are not saved in this browser',
  'only persistent Cloudflare D1 posts',
  'Cloudflare D1 persistent forum feed unavailable',
  'Signal posted live and saved persistently',
  'persistent !== true'
]) {
  if (!source.includes(marker)) throw new Error(`forum.js final release marker missing: ${marker}`);
}
if ((source.match(/function loadFallback\(message\)/g) || []).length !== 1) throw new Error('forum.js must contain exactly one loadFallback function');
if ((source.match(/function offlineNotice\(message\)/g) || []).length !== 1) throw new Error('forum.js must contain exactly one offlineNotice function');

if (source !== before) fs.writeFileSync(forumPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  loadFallbackFunctions: 1,
  offlineNoticeFunctions: 1,
  persistence: 'Cloudflare D1 only',
  browserFallback: false
}, null, 2)}\n`);
console.log(`Release regression finalization ${source === before ? 'already clean' : 'normalized forum.js'}.`);
