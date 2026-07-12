const fs = require('fs');
const path = require('path');

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'evidence-archive-policy.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'investigation-source-registry.json'), 'utf8'));
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

function safeId(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'source';
}

function isPrivateHost(hostname = '') {
  const host = String(hostname).toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return (policy.blockedHostSuffixes || []).some(suffix => host.endsWith(String(suffix).toLowerCase()));
}

function validateSource(source) {
  const reasons = [];
  let url;
  try { url = new URL(source.url); } catch { reasons.push('invalid-url'); }
  if (!url) return { ok: false, reasons };
  if (!(policy.allowedSchemes || ['https:']).includes(url.protocol)) reasons.push('scheme-not-approved');
  if (url.username || url.password) reasons.push('embedded-credentials');
  if (isPrivateHost(url.hostname)) reasons.push('private-or-local-host');
  if ((policy.blockedPathPatterns || []).some(pattern => url.pathname.toLowerCase().includes(String(pattern).toLowerCase()))) reasons.push('blocked-path');
  if (!['html', 'rss'].includes(String(source.type || '').toLowerCase())) reasons.push('unsupported-source-type');
  if (source.payload || String(source.type || '').includes('post')) reasons.push('non-public-get-request');
  return { ok: reasons.length === 0, reasons, url };
}

const approved = new Set(policy.approvedSourceIds || []);
const candidates = (registry.sources || []).filter(source => approved.has(source.id));
const sources = [];
const rejected = [];
for (const source of candidates) {
  const validation = validateSource(source);
  if (!validation.ok) {
    rejected.push({ id: source.id, label: source.label, url: source.url, reasons: validation.reasons });
    continue;
  }
  sources.push({
    id: source.id,
    crawlId: safeId(source.id),
    label: source.label,
    url: validation.url.href,
    lane: source.lane || null,
    authority: source.authority || null,
    pageLimit: Math.max(1, Math.min(Number(policy.maxPagesPerSource || 3), 10)),
    sizeLimit: Math.max(1000000, Math.min(Number(policy.maxArchiveBytes || 23000000), 24000000)),
    timeLimit: Math.max(60, Math.min(Number(policy.maxSecondsPerSource || 420), 900)),
    scopeType: 'page',
    legalScope: policy.legalScope
  });
  if (sources.length >= Math.max(0, Number(policy.maxSourcesPerRun || 3))) break;
}

const generatedAt = new Date().toISOString();
const plan = {
  ok: rejected.length === 0,
  generatedAt,
  enabled: policy.enabled !== false,
  engine: 'Browsertrix Crawler',
  engineVersion: policy.browsertrixVersion,
  archiveFormat: 'WACZ',
  policyVersion: policy.version,
  sources: policy.enabled === false ? [] : sources,
  rejected,
  legalScope: policy.legalScope,
  evidenceBoundary: policy.legalScope?.boundary
};

fs.writeFileSync(path.join(downloads, 'browsertrix-crawl-plan.json'), JSON.stringify(plan, null, 2));
fs.writeFileSync(path.join(downloads, 'browsertrix-seeds.txt'), plan.sources.map(source => source.url).join('\n') + (plan.sources.length ? '\n' : ''));
console.log(`Browsertrix crawl plan ready: ${plan.sources.length} approved source(s), ${rejected.length} rejected.`);
if (rejected.length) process.exitCode = 1;
