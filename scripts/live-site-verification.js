const fs = require('fs');
const path = require('path');

const root = process.cwd();
const base = process.env.SITE_URL || 'https://matrixreprogrammed.com';
const expectedSha = process.env.EXPECTED_BUILD_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || '';
const required = [
  { path: '/deploy-status', marker: 'DEPLOY STATUS.' },
  { path: '/deploy-status.json', json: true, marker: 'aliases' },
  { path: '/epstein', marker: 'THE EPSTEIN FILES COMMAND CENTER' },
  { path: '/optin-center', marker: 'Last 7 Days Intelligence Window' },
  { path: '/optin-black-file-brief.html', marker: 'Last 7 Days Intelligence Window' },
  { path: '/source-cards.html', marker: 'SOURCE CARDS.' },
  { path: '/trust-corrections.html', marker: 'Corrections' },
  { path: '/forum-health', json: true, marker: 'forumPostsBinding' }
];
function ok(status){ return status >= 200 && status < 400; }
async function check(item) {
  const url = new URL(item.path, base).href;
  const res = await fetch(url, { headers: { 'User-Agent': 'MatrixReprogrammedLiveVerifier/1.0' } });
  const text = await res.text();
  const result = { path: item.path, url, status: res.status, ok: ok(res.status), marker: item.marker, markerPresent: text.includes(item.marker) };
  if (item.json) {
    try { result.json = JSON.parse(text); } catch (err) { result.jsonError = err.message; }
  }
  if (!result.ok) result.error = `HTTP ${res.status}`;
  if (!result.markerPresent) result.error = `${result.error ? result.error + '; ' : ''}missing marker ${item.marker}`;
  return result;
}
async function main(){
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable; use Node 18+');
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const item of required) {
    try { results.push(await check(item)); }
    catch (err) { results.push({ path: item.path, ok: false, error: err.message, marker: item.marker }); }
  }
  const statusJson = results.find(r => r.path === '/deploy-status.json' && r.json);
  const liveSha = statusJson && (statusJson.json.buildSha || statusJson.json.buildShortSha || '');
  const shaMatches = expectedSha ? String(liveSha || '').startsWith(String(expectedSha).slice(0, 12)) || String(expectedSha).startsWith(String(liveSha || '').slice(0, 12)) : null;
  const report = {
    ok: results.every(r => r.ok && r.markerPresent) && (shaMatches !== false),
    checkedAt,
    base,
    expectedSha: expectedSha || null,
    liveSha: liveSha || null,
    shaMatches,
    results
  };
  fs.writeFileSync(path.join(root, 'live-site-verification-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
main().catch(err => {
  console.error(`LIVE SITE VERIFICATION FAILED: ${err.message}`);
  process.exit(1);
});
