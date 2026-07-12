const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const archiveDir = path.join(root, 'web-archives');
const downloadsDir = path.join(root, 'downloads');
const policyPath = path.join(dataDir, 'evidence-archive-policy.json');
const registryPath = path.join(dataDir, 'investigation-source-registry.json');
const sourceChangesPath = path.join(dataDir, 'source-change-public.json');
const readerManifestPath = path.join(dataDir, 'evidence-reader-manifest.json');
const timelinePath = path.join(dataDir, 'evidence-timeline.json');
const relationshipPath = path.join(dataDir, 'relationship-registry.json');
const archiveManifestPath = path.join(dataDir, 'evidence-archive-manifest.json');
const integrityManifestPath = path.join(dataDir, 'evidence-integrity-manifest.json');
const citationPath = path.join(dataDir, 'evidence-citations.json');

fs.mkdirSync(archiveDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function hashBuffer(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hashFile(file) { return hashBuffer(fs.readFileSync(file)); }
function safeUrl(value = '') { try { const url = new URL(value); url.username = ''; url.password = ''; return url.href; } catch { return ''; } }
function safeId(value = '') { return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'archive'; }

const policy = readJson(policyPath, {});
const registry = readJson(registryPath, { sources: [] });
const sourceMap = new Map((registry.sources || []).map(source => [source.id, source]));
const prior = readJson(archiveManifestPath, { archives: [] });
const maxBytes = Math.min(Number(policy.maxArchiveBytes || 23000000), 24000000);
const now = new Date().toISOString();
const rejected = [];
const archives = [];

for (const name of fs.readdirSync(archiveDir).filter(name => name.endsWith('.wacz')).sort()) {
  const file = path.join(archiveDir, name);
  const bytes = fs.statSync(file).size;
  const sidecarPath = `${file}.metadata.json`;
  const sidecar = readJson(sidecarPath, {});
  const sourceId = sidecar.sourceId || name.replace(/-\d{4}-\d{2}-\d{2}(?:t[^.]*)?\.wacz$/i, '').replace(/\.wacz$/i, '');
  const source = sourceMap.get(sourceId) || {};
  if (bytes <= 0 || bytes > maxBytes) {
    rejected.push({ file: `web-archives/${name}`, sourceId, bytes, reason: bytes > maxBytes ? 'archive-exceeds-public-size-limit' : 'empty-archive' });
    continue;
  }
  if (!(policy.approvedSourceIds || []).includes(sourceId)) {
    rejected.push({ file: `web-archives/${name}`, sourceId, bytes, reason: 'source-not-currently-approved' });
    continue;
  }
  const sourceUrl = safeUrl(sidecar.sourceUrl || source.url || '');
  if (!sourceUrl) {
    rejected.push({ file: `web-archives/${name}`, sourceId, bytes, reason: 'missing-public-source-url' });
    continue;
  }
  const sha256 = hashFile(file);
  const capturedAt = sidecar.capturedAt || fs.statSync(file).mtime.toISOString();
  const id = sidecar.id || `wacz-${safeId(sourceId)}-${sha256.slice(0, 12)}`;
  archives.push({
    id,
    sourceId,
    title: sidecar.title || source.label || sourceId,
    sourceUrl,
    replayUrl: `web-archives/${name}`,
    filename: name,
    capturedAt,
    bytes,
    sha256,
    engine: 'Browsertrix Crawler',
    engineVersion: policy.browsertrixVersion,
    format: 'WACZ',
    authority: source.authority || sidecar.authority || null,
    lane: source.lane || sidecar.lane || null,
    pageLimit: Number(sidecar.pageLimit || policy.maxPagesPerSource || 3),
    factualStatus: 'preserved-public-web-capture',
    established: 'The archive hash, capture time, original public URL and replayable WACZ bytes are preserved for this capture.',
    notEstablished: policy.legalScope?.boundary || 'The capture does not authenticate every statement, establish intent or convert allegations into proven wrongdoing.',
    legalScope: policy.legalScope,
    citation: {
      type: 'webpage',
      title: sidecar.title || source.label || sourceId,
      URL: sourceUrl,
      accessed: { 'date-parts': [[Number(capturedAt.slice(0, 4)), Number(capturedAt.slice(5, 7)), Number(capturedAt.slice(8, 10))]] },
      note: `Matrix Reprogrammed preserved WACZ ${sha256}; ${capturedAt}`
    }
  });
}

const combined = [...archives, ...(prior.archives || [])]
  .filter((item, index, list) => item.sha256 && list.findIndex(other => other.sha256 === item.sha256) === index)
  .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
  .slice(0, 250);

const manifest = {
  ok: rejected.length === 0,
  version: 1,
  generatedAt: now,
  engine: 'Browsertrix Crawler',
  engineVersion: policy.browsertrixVersion,
  replayEngine: 'ReplayWeb.page',
  replayEngineVersion: policy.replayWebPageVersion,
  format: 'WACZ',
  legalScope: policy.legalScope,
  limits: {
    maxSourcesPerRun: policy.maxSourcesPerRun,
    maxPagesPerSource: policy.maxPagesPerSource,
    maxArchiveBytes: maxBytes,
    maxTotalArchiveBytes: policy.maxTotalArchiveBytes
  },
  archives: combined,
  rejected
};
writeJson(archiveManifestPath, manifest);

const protectedFiles = [
  archiveManifestPath,
  sourceChangesPath,
  readerManifestPath,
  timelinePath,
  relationshipPath,
  ...combined.map(item => path.join(root, item.replayUrl))
].filter(file => fs.existsSync(file));

const integrity = {
  ok: true,
  version: 1,
  generatedAt: now,
  algorithm: 'SHA-256',
  signing: {
    system: 'Sigstore Cosign',
    mode: 'keyless GitHub OIDC',
    bundleUrl: 'data/evidence-integrity-manifest.sigstore.json',
    certificateIdentityRegexp: '^https://github.com/architectsignal/matrixreprogrammed/.github/workflows/evidence-archive-verification.yml@refs/heads/main$',
    certificateOidcIssuer: 'https://token.actions.githubusercontent.com',
    status: fs.existsSync(path.join(dataDir, 'evidence-integrity-manifest.sigstore.json')) ? 'bundle-present' : 'awaiting-workflow-signature'
  },
  evidenceBoundary: 'Integrity verification establishes that the published bytes match the signed manifest. It does not establish the truth of every statement inside a source or archive.',
  files: protectedFiles.map(file => ({
    path: path.relative(root, file).replace(/\\/g, '/'),
    bytes: fs.statSync(file).size,
    sha256: hashFile(file)
  }))
};
writeJson(integrityManifestPath, integrity);
writeJson(citationPath, {
  generatedAt: now,
  engine: 'Citation.js',
  engineVersion: policy.citationJsVersion,
  items: combined.map(item => ({ id: item.id, evidenceId: item.id, sha256: item.sha256, archiveUrl: item.replayUrl, ...item.citation }))
});
writeJson(path.join(downloadsDir, 'phase8-evidence-archive-build.json'), {
  ok: rejected.length === 0,
  generatedAt: now,
  archives: combined.length,
  newArchives: archives.length,
  rejected,
  protectedFiles: integrity.files.length,
  totalPublicArchiveBytes: combined.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
  evidenceBoundary: integrity.evidenceBoundary
});
console.log(`Phase 8 archive manifests ready: ${combined.length} archive(s), ${integrity.files.length} integrity record(s), ${rejected.length} rejected.`);
if (rejected.length) process.exitCode = 1;
