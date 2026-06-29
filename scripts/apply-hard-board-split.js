const fs = require('fs');
const path = require('path');
const root = process.cwd();
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, text){ fs.writeFileSync(file(name), text); }
let changed = [];

const requiredRoutes = [
  '/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive',
  '/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post',
  '/report-main-post','/report-speculation-post','/report-epstein-alive-post'
];

function patchForumJs(){
  if (!exists('forum.js')) return;
  let s = read('forum.js');
  const before = s;
  s = s.replace(/\bconst LOCAL_POSTS_KEY[\s\S]*?;\n/g, '');
  s = s.replace(/\bconst LOCAL_REPORTS_KEY[\s\S]*?;\n/g, '');
  s = s.replace(/function localPosts\(\)[\s\S]*?\n  \}/g, '');
  s = s.replace(/function saveLocalPosts\([\s\S]*?\n  \}/g, '');
  s = s.replace(/function clearLocalPost\([\s\S]*?\n  \}/g, '');
  s = s.replace(/function saveLocalReport\([\s\S]*?\n  \}/g, '');
  s = s.replace(/async function syncPendingLocalPosts\([\s\S]*?\n  \}/g, '');
  s = s.replace(/localOnly/g, 'persistentOnly');
  s = s.replace(/not live yet/g, 'persistent only');
  s = s.replace(/Saved only on this device[\s\S]*?reachable\./g, 'Not saved. Persistent backend unavailable.');
  if (s !== before) { write('forum.js', s); changed.push('forum.js'); }
}

function patchWorker(){
  if (!exists('src/worker.js')) return;
  let s = read('src/worker.js');
  const before = s;
  if (!s.includes('hardBoardRouteMap')) {
    console.warn('hardBoardRouteMap missing; Worker should be repaired by source edit.');
  }
  if (!s.includes('persistent: true')) {
    console.warn('persistent marker missing from Worker; Worker should be repaired by source edit.');
  }
  if (s !== before) { write('src/worker.js', s); changed.push('src/worker.js'); }
}

function patchSeed(){
  if (!exists('data/forum-seed.json')) return;
  const text = JSON.stringify({ updated: new Date().toISOString().slice(0,10), mode: 'public-signal-seed', notice: 'Public Signal Board starter post. Live posting requires Cloudflare KV persistence.', posts: [{ id: 'seed-forum-public-source-drop', board: 'main', category: 'Source Drop', name: 'Matrix Reprogrammed', title: 'Post a source, not a rumour', body: 'Drop public links, documents, court records, archive pages, official releases, useful questions, or reader notes. Keep claims tied to sources and separate evidence from speculation.', sourceUrl: 'evidence-vault.html', createdAt: '2026-06-28T00:00:00Z' }]}, null, 2);
  if (read('data/forum-seed.json') !== text) { write('data/forum-seed.json', text); changed.push('data/forum-seed.json'); }
}

patchForumJs();
patchWorker();
patchSeed();
console.log(`Hard board split persistence guard applied: ${changed.length ? changed.join(', ') : 'already persistent'}`);
