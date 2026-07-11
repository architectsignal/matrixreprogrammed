const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push({ name, detail });
}
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-source-hardening-'));
for (const dir of ['data/source-snapshots/test','downloads']) fs.mkdirSync(path.join(fixture, dir), { recursive: true });
writeJson(path.join(fixture, 'data/source-snapshot-index.json'), { updated: '2026-07-11T12:00:00Z', sources: { test: { sourceId: 'test', label: 'Test Source', url: 'https://example.test/source?api_key=SECRET123', lane: 'oversight-audit', authority: 'primary-official', lastAttempt: '2026-07-11T12:00:00Z', lastSuccess: '2026-07-10T12:00:00Z', availability: 'unavailable', consecutiveFailures: 2, statusCode: 503, lastErrorCategory: 'retrieval-failure' } } });
writeJson(path.join(fixture, 'data/source-change-ledger.json'), { updated: '2026-07-11T12:00:00Z', changes: [{ id: 'abc', sourceId: 'test', sourceLabel: 'Test Source', sourceUrl: 'https://example.test/source?api_key=SECRET123', finalUrl: 'https://example.test/source?token=SECRET456', lane: 'oversight-audit', authority: 'primary-official', detectedAt: '2026-07-11T12:00:00Z', changeType: 'records-removed', previousHash: 'a'.repeat(64), currentHash: 'b'.repeat(64), removals: ['Old record'], additions: [], removalCount: 1, additionCount: 0, established: 'One passage disappeared.', notEstablished: 'This is not proof of wrongdoing.', evidenceGrade: 'B', status: 'missing-or-altered-record' }] });
writeJson(path.join(fixture, 'data/source-change-public.json'), { updated: '2026-07-11T12:00:00Z', summary: {}, changes: [] });
writeJson(path.join(fixture, 'data/source-snapshots/test/hash.json'), { sourceId: 'test', sourceUrl: 'https://example.test/source?api_key=SECRET123', finalUrl: 'https://example.test/source?token=SECRET456', retrievedAt: '2026-07-11T12:00:00Z', rawHash: 'a'.repeat(64), normalizedHash: 'b'.repeat(64), normalizedText: 'Public record' });
writeJson(path.join(fixture, 'data/daily-investigation-conclusions.json'), { summary: {}, strongestFindings: [] });
writeJson(path.join(fixture, 'data/weekly-investigation-conclusions.json'), { summary: {}, strongestFindings: [] });
writeJson(path.join(fixture, 'data/investigation-ledger.json'), { findings: [] });

const result = spawnSync(process.execPath, [path.join(__dirname, 'harden-source-change-preservation.js'), 'daily'], { cwd: fixture, env: { ...process.env, SOURCE_DOCUMENTS_PER_RUN: '0' }, encoding: 'utf8' });
check('hardener executes', result.status === 0, result.stderr || result.stdout);
const publicData = JSON.parse(fs.readFileSync(path.join(fixture, 'data/source-change-public.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(fixture, 'data/source-snapshots/test/hash.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'evidence-archive/manifest.json'), 'utf8'));
const daily = JSON.parse(fs.readFileSync(path.join(fixture, 'data/daily-investigation-conclusions.json'), 'utf8'));
const page = fs.readFileSync(path.join(fixture, 'source-changes.html'), 'utf8');
const all = JSON.stringify({ publicData, snapshot, manifest, daily });
const change = publicData.changes[0] || {};
check('credentials redacted', !all.includes('SECRET123') && !all.includes('SECRET456'));
check('public evidence fields complete', ['title','sourceUrl','retrievalDate','evidenceGrade','factualStatus','established','notEstablished','mechanism','implication','alternativeExplanation','nextRecordRequired','correctionRoute'].every(key => change[key] !== undefined && change[key] !== null));
check('failure history retained', manifest.sources?.test?.failureHistory?.length === 1);
check('snapshot provenance retained', manifest.snapshots?.length === 1 && /^[a-f0-9]{64}$/.test(manifest.snapshots[0].fileHash || ''));
check('daily conclusions connected', daily.summary?.meaningfulSourceChanges === 1 && daily.strongestFindings?.some(item => String(item.id).startsWith('source-change-')));
check('public page shows limits and next record', page.includes('What is not established') && page.includes('Next record required') && page.includes('Alternative explanation'));
check('public feed excludes diagnostics', !publicData.changes.some(item => Object.prototype.hasOwnProperty.call(item, 'error') || Object.prototype.hasOwnProperty.call(item, 'failureHistory')));
const build = fs.existsSync(path.join(root, 'scripts/build-cloudflare-output.js')) ? fs.readFileSync(path.join(root, 'scripts/build-cloudflare-output.js'), 'utf8') : '';
check('Cloudflare blocks evidence archive', build.includes("'evidence-archive'") && build.includes('private evidence archive'));
check('Cloudflare blocks snapshot diagnostics', build.includes("'source-snapshots'") && build.includes('source-snapshot-index.json') && build.includes('source-change-ledger.json'));

fs.rmSync(fixture, { recursive: true, force: true });
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads/source-change-preservation-hardening-test.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
