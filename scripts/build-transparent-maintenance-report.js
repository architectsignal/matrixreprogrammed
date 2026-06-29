const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function daysOld(dateText) {
  const date = Date.parse(dateText || '');
  if (!Number.isFinite(date)) return null;
  return Math.floor((Date.now() - date) / 86400000);
}

const policy = readJson('data/transparent-maintenance-policy.json', {});
const brain = readJson('data/site-intelligence-core.json', {});
const policyTracker = readJson('data/policy-convergence-tracker.json', { lanes: [] });
const timerMap = readJson('data/policy-convergence-timer-map.json', { mappings: [] });
const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
const dark = readJson('data/dark-speculation-claims.json', { claims: [] });
const darkDeep = readJson('data/dark-speculation-expansion.json', { dossiers: [] });
const epstein = readJson('data/epstein-network-deep-dive.json', { peopleToAddOrDeepen: [], networkLanes: [], locations: [] });

const required = [
  'index.html',
  'search.html',
  'control-system-tracker.html',
  'timers.html',
  'epstein-files.html',
  'dark-speculation-lab.html',
  'data/site-intelligence-core.json',
  'data/public-interest-anti-corruption-charter.json',
  'data/transparent-maintenance-policy.json',
  'data/policy-convergence-tracker.json',
  'data/policy-convergence-timer-map.json',
  'data/dark-speculation-expansion.json',
  'downloads/policy-convergence-tracker.json',
  'downloads/policy-convergence-timer-map.json',
  'downloads/dark-speculation-deep-dossiers.json'
];

const missing = required.filter(file => !exists(file));
const stale = [];
for (const [name, data] of Object.entries({ brain, policyTracker, timerMap, clocks, dark, darkDeep, epstein })) {
  const age = daysOld(data.updated);
  if (age !== null && age > 14) stale.push({ name, updated: data.updated, ageDays: age });
}

const routeChecks = [];
for (const route of ['control-system-tracker.html', 'timers.html', 'epstein-files.html', 'dark-speculation-lab.html']) {
  if (!exists(route)) continue;
  const text = read(route);
  routeChecks.push({
    route,
    hasBoundary: /Boundary|boundary|warning/i.test(text),
    hasEvidenceLanguage: /evidence|source|record|speculation|hypothesis|debunk/i.test(text),
    hasTrackerLinks: /tracker|timer|intel|source|vault/i.test(text)
  });
}

const recommendations = [];
if (missing.length) recommendations.push('Create or regenerate missing required tracker outputs.');
if (stale.length) recommendations.push('Refresh stale tracker data or mark why it has not changed.');
if ((policyTracker.lanes || []).length < 9) recommendations.push('Expand policy convergence tracker lanes.');
if ((timerMap.mappings || []).length < 8) recommendations.push('Expand timer map coverage.');
if ((darkDeep.dossiers || []).length < 5) recommendations.push('Expand dark speculation deep dossiers.');
if ((epstein.peopleToAddOrDeepen || []).length < 8) recommendations.push('Expand Epstein people/entity research targets.');
for (const check of routeChecks) {
  if (!check.hasBoundary) recommendations.push(`${check.route}: add visible boundary language.`);
  if (!check.hasEvidenceLanguage) recommendations.push(`${check.route}: add evidence/source classification language.`);
  if (!check.hasTrackerLinks) recommendations.push(`${check.route}: add route links into tracker graph.`);
}
if (!recommendations.length) recommendations.push('No critical maintenance gaps found. Continue source expansion and live verification.');

const report = {
  updated: new Date().toISOString(),
  mission: brain.publicMissionLine || policy.mission || 'Expose wrongdoing. Help humanity. Follow the documents.',
  visibilityRule: policy.visibilityRule || '',
  counts: {
    policyLanes: (policyTracker.lanes || []).length,
    timerMappings: (timerMap.mappings || []).length,
    riskClocks: (clocks.clocks || []).length,
    darkClaims: (dark.claims || []).length,
    deepDossiers: (darkDeep.dossiers || []).length,
    epsteinTargets: (epstein.peopleToAddOrDeepen || []).length,
    missingFiles: missing.length,
    staleTrackers: stale.length
  },
  missing,
  stale,
  routeChecks,
  recommendations,
  boundaries: {
    speculation: policy.speculationRule || '',
    maintenance: policy.visibilityRule || '',
    evidence: brain.boundary || ''
  }
};

fs.writeFileSync(path.join(downloads, 'transparent-maintenance-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloads, 'transparent-maintenance-report.md'), [
  '# Transparent Maintenance Report',
  '',
  `Updated: ${report.updated}`,
  '',
  `Mission: ${report.mission}`,
  '',
  '## Counts',
  ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Missing Files',
  ...(missing.length ? missing.map(file => `- ${file}`) : ['- None']),
  '',
  '## Stale Trackers',
  ...(stale.length ? stale.map(item => `- ${item.name}: ${item.updated} (${item.ageDays} days old)`) : ['- None']),
  '',
  '## Recommendations',
  ...recommendations.map(item => `- ${item}`),
  '',
  '## Boundary',
  report.boundaries.evidence || ''
].join('\n'));

console.log(`Transparent maintenance report complete: ${missing.length} missing file(s), ${stale.length} stale tracker(s), ${recommendations.length} recommendation(s).`);
