const fs = require('fs');
const path = require('path');

const root = process.cwd();
const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const namespaceId = process.env.FORUM_POSTS_KV_ID || '99996d87016d4285a833707cbda5232f';
const reportPath = path.join(root, 'forum-test-post-cleanup-report.json');

const testPatterns = [
  /\btest\b/i,
  /\bdemo\b/i,
  /\bsample\b/i,
  /\bplaceholder\b/i,
  /\bdummy\b/i,
  /\bexample\b/i,
  /\blorem\b/i,
  /\bhello\s+world\b/i,
  /\bseed\s+post\b/i,
  /\btesting\b/i,
  /\bdelete\s+me\b/i
];

const report = {
  ok: false,
  checkedAt: new Date().toISOString(),
  namespaceId,
  scannedKeys: 0,
  scannedPosts: 0,
  removedPosts: [],
  keptPosts: 0,
  rebuiltIndex: false,
  errors: []
};
function save() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
function headers() { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
async function cf(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body.success === false) {
    const err = new Error(`Cloudflare API ${options.method || 'GET'} ${pathname} failed: HTTP ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}
function cleanText(value = '') { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeBoard(value = '') {
  const raw = cleanText(value).toLowerCase().replace(/_/g, '-');
  if (['speculation', 'dark-speculation', 'dark-speculation-board', 'dark-lab'].includes(raw)) return 'speculation';
  if (['epstein-alive', 'epstein-sighting', 'epstein-sightings', 'sighting-watch', 'epstein-alive-board'].includes(raw)) return 'epstein-alive';
  return 'main';
}
function isTestPost(post = {}) {
  const hay = [post.id, post.title, post.body || post.message, post.category, post.name, post.sourceUrl || post.source, post.status].map(cleanText).join(' ');
  if (!hay) return false;
  if (/matrix\s+reprogrammed|epstein|source|record|court|intel|evidence|corruption|policy/i.test(hay) && !/\btest\b|\bdemo\b|\bsample\b|\bplaceholder\b|\bdummy\b/i.test(hay)) return false;
  return testPatterns.some(pattern => pattern.test(hay));
}
function safePost(post) {
  if (!post || typeof post !== 'object') return null;
  const id = cleanText(post.id || '');
  const title = cleanText(post.title || '');
  const body = cleanText(post.body || post.message || '');
  if (!id || !title || !body) return null;
  const board = normalizeBoard(post.board || 'main');
  return {
    ...post,
    id,
    board,
    title,
    body,
    category: cleanText(post.category || 'Signal'),
    name: cleanText(post.name || 'Anonymous'),
    sourceUrl: /^https?:\/\//i.test(String(post.sourceUrl || '')) ? cleanText(post.sourceUrl) : '',
    createdAt: post.createdAt || post.approvedAt || new Date().toISOString(),
    approvedAt: post.approvedAt || post.createdAt || new Date().toISOString(),
    status: cleanText(post.status || 'live')
  };
}
async function listKeys(prefix) {
  const keys = [];
  let cursor = '';
  do {
    const qs = new URLSearchParams({ prefix, limit: '1000' });
    if (cursor) qs.set('cursor', cursor);
    const body = await cf(`/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?${qs}`);
    keys.push(...(body.result || []));
    cursor = body.result_info && body.result_info.cursor || '';
    if (!(body.result_info && body.result_info.cursor)) break;
  } while (cursor);
  return keys;
}
async function getValue(key) {
  const res = await fetch(`${API}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`KV get ${key} failed: HTTP ${res.status}`);
  return res.text();
}
async function putValue(key, value, metadata = {}) {
  const form = new FormData();
  form.append('value', value);
  form.append('metadata', JSON.stringify(metadata));
  const res = await fetch(`${API}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`KV put ${key} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
}
async function deleteKey(key) {
  await cf(`/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
async function main() {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN missing');
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID missing');
  if (typeof fetch !== 'function' || typeof FormData !== 'function') throw new Error('Node 18+ fetch/FormData required');
  try {
    const durableKeys = await listKeys('post:');
    report.scannedKeys += durableKeys.length;
    const kept = [];
    for (const key of durableKeys) {
      try {
        const raw = await getValue(key.name);
        const post = safePost(JSON.parse(raw || 'null'));
        if (!post) continue;
        report.scannedPosts++;
        if (isTestPost(post)) {
          await deleteKey(key.name);
          report.removedPosts.push({ key: key.name, id: post.id, board: post.board, title: post.title, reason: 'matched test/demo/sample cleanup pattern' });
        } else {
          kept.push(post);
        }
      } catch (err) {
        report.errors.push({ key: key.name, error: err.message });
      }
    }
    const indexRaw = await getValue('posts:index');
    const indexPosts = (() => { try { return JSON.parse(indexRaw || '[]'); } catch { return []; } })();
    for (const post of indexPosts.map(safePost).filter(Boolean)) {
      if (!isTestPost(post) && !kept.some(p => p.id === post.id)) kept.push(post);
      if (isTestPost(post) && !report.removedPosts.some(p => p.id === post.id)) report.removedPosts.push({ key: 'posts:index', id: post.id, board: post.board, title: post.title, reason: 'removed from public index' });
    }
    const deduped = [...new Map(kept.map(post => [post.id, post])).values()].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 100);
    await putValue('posts:index', JSON.stringify(deduped), { updatedAt: new Date().toISOString(), count: deduped.length, testPostsHidden: true });
    report.keptPosts = deduped.length;
    report.rebuiltIndex = true;
    report.ok = report.errors.length === 0;
    save();
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } catch (err) {
    report.errors.push({ error: err.message, body: err.body || null });
    save();
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}
main();
