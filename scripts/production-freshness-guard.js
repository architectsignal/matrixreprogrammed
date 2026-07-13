const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const policyPath = path.join(root, 'data', 'production-freshness-policy.json');
if (!fs.existsSync(policyPath)) throw new Error('Missing production freshness policy.');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const now = Date.now();
const hard = [];
const checks = [];
const pullRequestAudit = String(process.env.GITHUB_EVENT_NAME || '').toLowerCase() === 'pull_request';

function readJson(base, rel) {
  const file = path.join(base, rel);
  if (!fs.existsSync(file)) return { error: 'missing' };
  try { return { value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (error) { return { error: error.message }; }
}
function getField(object, field) { return String(field).split('.').reduce((value, key) => value && value[key], object); }
function checkBase(base, label) {
  for (const item of policy.datasets || []) {
    const loaded = readJson(base, item.file);
    if (loaded.error) { hard.push(`${label}/${item.file}: ${loaded.error}`); continue; }
    const data = loaded.value;
    const raw = (item.timestampFields || []).map(field => getField(data, field)).find(Boolean);
    const time = Date.parse(raw || '');
    if (!Number.isFinite(time)) { hard.push(`${label}/${item.file}: no valid timestamp in ${item.timestampFields.join(', ')}`); continue; }
    const ageHours = (now - time) / 3600000;
    const futureMinutes = (time - now) / 60000;
    const minArray = item.minimumArray ? getField(data, item.minimumArray) : null;
    const count = Array.isArray(minArray) ? minArray.length : null;
    const ok = ageHours <= Number(item.maxAgeHours) && futureMinutes <= Number(policy.defaultMaxFutureMinutes || 15) && (count === null || count >= Number(item.minimumCount || 0));
    checks.push({ scope: label, id: item.id, file: item.file, timestamp: raw, ageHours: Number(ageHours.toFixed(2)), maxAgeHours: item.maxAgeHours, count, minimumCount: item.minimumCount, ok });
    if (!ok) hard.push(`${label}/${item.file}: age ${ageHours.toFixed(2)}h (limit ${item.maxAgeHours}h), count ${count}`);
  }
}
checkBase(root, 'source');
if (fs.existsSync(site)) checkBase(site, 'built');
const blocking = hard.length > 0 && !pullRequestAudit;
const report = {
  ok: !blocking,
  generatedAt: new Date().toISOString(),
  eventName: process.env.GITHUB_EVENT_NAME || 'local',
  advisoryOnly: pullRequestAudit && hard.length > 0,
  checks,
  hardIssues: blocking ? hard : [],
  advisoryIssues: pullRequestAudit ? hard : []
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-freshness-guard.json'), JSON.stringify(report, null, 2));
if (blocking) {
  console.error('PRODUCTION FRESHNESS GUARD FAILED');
  hard.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
if (hard.length) {
  console.warn('PRODUCTION FRESHNESS GUARD ADVISORY: stale datasets must be refreshed before a main/production deployment.');
  hard.forEach(issue => console.warn(`- ${issue}`));
} else {
  console.log(`Production freshness guard passed: ${checks.length} checks.`);
}
