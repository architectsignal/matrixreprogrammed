const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const failures = [];
const checks = [];
function check(name, condition, detail = '') { checks.push({ name, ok: Boolean(condition), detail }); if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'); }

const required = [
  'data/evidence-archive-policy.json',
  'data/evidence-archive-manifest.json',
  'data/evidence-integrity-manifest.json',
  'data/evidence-citations.json',
  'evidence-archive.html',
  'evidence-archive.js',
  'evidence-citation.js',
  'source-change-diff.js',
  'replay/sw.js',
  'scripts/prepare-browsertrix-crawl.js',
  'scripts/build-evidence-archive.js',
  'scripts/patch-phase8-evidence-archive.js'
];
for (const file of required) check(`required:${file}`, exists(file));

const policy = json('data/evidence-archive-policy.json');
check('policy-enabled', policy.enabled === true);
check('policy-approved-sources', Array.isArray(policy.approvedSourceIds) && policy.approvedSourceIds.length > 0 && policy.approvedSourceIds.length <= policy.maxSourcesPerRun);
check('policy-public-only', policy.legalScope?.publicOnly === true && policy.legalScope?.noAuthentication === true && policy.legalScope?.noCircumvention === true);
check('policy-cloudflare-safe-size', Number(policy.maxArchiveBytes) > 0 && Number(policy.maxArchiveBytes) < 25 * 1024 * 1024);
check('policy-pinned-browsertrix', /^\d+\.\d+\.\d+$/.test(policy.browsertrixVersion));
check('policy-pinned-replay', /^\d+\.\d+\.\d+$/.test(policy.replayWebPageVersion));

const html = read('evidence-archive.html');
check('replay-component', html.includes('replaywebpage@2.4.6/ui.js') && html.includes('EVIDENCE ARCHIVE & VERIFICATION'));
check('public-boundary', /Evidence boundary:/i.test(html) && /does not authenticate every statement/i.test(html));
check('integrity-controls', html.includes('Verify archive hash') && html.includes('Copy Cosign verification command'));
check('diff-controls', html.includes('SOURCE CHANGE DIFF') && html.includes('diff-mode'));
check('citation-controls', html.includes('CITATION EXPORT') && html.includes('citation-style'));
check('service-worker-pin', read('replay/sw.js').includes('replaywebpage@2.4.6/sw.js'));
check('jsdiff-pin', read('source-change-diff.js').includes('diff@8.0.2'));
check('citation-pin', read('evidence-citation.js').includes('citation-js@0.7.21'));

const manifest = json('data/evidence-archive-manifest.json');
check('manifest-engine', manifest.engine === 'Browsertrix Crawler' && manifest.replayEngine === 'ReplayWeb.page');
check('manifest-boundary', Boolean(manifest.legalScope?.boundary));
for (const archive of manifest.archives || []) {
  check(`archive-approved:${archive.id}`, policy.approvedSourceIds.includes(archive.sourceId));
  check(`archive-size:${archive.id}`, Number(archive.bytes) > 0 && Number(archive.bytes) <= Number(policy.maxArchiveBytes));
  check(`archive-file:${archive.id}`, exists(archive.replayUrl));
  if (exists(archive.replayUrl)) check(`archive-hash:${archive.id}`, sha(archive.replayUrl) === archive.sha256);
  check(`archive-boundary:${archive.id}`, Boolean(archive.established) && Boolean(archive.notEstablished));
}

const integrity = json('data/evidence-integrity-manifest.json');
check('integrity-algorithm', integrity.algorithm === 'SHA-256');
check('integrity-signing', integrity.signing?.system === 'Sigstore Cosign' && integrity.signing?.mode === 'keyless GitHub OIDC');
check('integrity-boundary', /does not establish the truth/i.test(integrity.evidenceBoundary || ''));
for (const file of integrity.files || []) {
  check(`integrity-file:${file.path}`, exists(file.path));
  if (exists(file.path)) check(`integrity-hash:${file.path}`, sha(file.path) === file.sha256);
}

if (process.env.REQUIRE_SIGSTORE_BUNDLE === '1') {
  check('sigstore-bundle-present', exists('data/evidence-integrity-manifest.sigstore.json'));
  if (exists('data/evidence-integrity-manifest.sigstore.json')) {
    const bundle = json('data/evidence-integrity-manifest.sigstore.json');
    check('sigstore-bundle-shape', Boolean(bundle.mediaType || bundle.verificationMaterial || bundle.dsseEnvelope || bundle.messageSignature));
  }
}

const cloudflare = read('scripts/build-cloudflare-output.js');
check('cloudflare-phase8-build', cloudflare.includes('build-evidence-archive.js'));
check('cloudflare-phase8-test', cloudflare.includes('evidence-archive-verification-test.js'));
check('cloudflare-wacz-extension', cloudflare.includes("'.wacz'"));
check('cloudflare-required-route', cloudflare.includes("'evidence-archive.html'") && cloudflare.includes("'data/evidence-integrity-manifest.json'"));

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'phase8-evidence-archive-test.json'), JSON.stringify({ ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures, archives: manifest.archives?.length || 0, protectedFiles: integrity.files?.length || 0 }, null, 2));
if (failures.length) {
  console.error(`Phase 8 verification failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Phase 8 verification passed: ${checks.length} checks, ${manifest.archives?.length || 0} archive(s).`);
