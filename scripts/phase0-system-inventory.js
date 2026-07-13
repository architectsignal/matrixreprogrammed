const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const now = new Date().toISOString();

function full(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(full(rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(full(rel), 'utf8') : ''; }
function rel(file) { return path.relative(root, file).split(path.sep).join('/'); }
function hashFile(relPath) {
  if (!exists(relPath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(full(relPath))).digest('hex').slice(0, 16);
}
function safeJson(relPath) {
  try { return JSON.parse(read(relPath)); }
  catch { return null; }
}
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else out.push(rel(target));
  }
  return out;
}
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
function markerState(file, markers = []) {
  const text = read(file);
  return {
    exists: exists(file),
    hash: hashFile(file),
    markers: markers.map(marker => ({ marker, present: text.includes(marker) })),
    allMarkersPresent: exists(file) && markers.every(marker => text.includes(marker))
  };
}
function statusFromState(state, protectedComponent = false) {
  if (!state.exists) return 'missing';
  if (state.markers.length && !state.allMarkersPresent) return protectedComponent ? 'unsafe_to_modify_without_migration' : 'partial';
  return protectedComponent ? 'protected' : 'working';
}
function categoryFor(file) {
  if (file.startsWith('.github/workflows/')) return 'workflow';
  if (file.startsWith('migrations/')) return 'database_migration';
  if (file.startsWith('src/worker')) return 'worker';
  if (file.startsWith('scripts/')) return 'script';
  if (file.startsWith('data/')) return 'data';
  if (file.startsWith('downloads/')) return 'generated_report_or_download';
  if (file.endsWith('.html')) return 'public_or_generated_page';
  if (file.endsWith('.json')) return 'root_data_or_manifest';
  if (file.endsWith('.js')) return 'runtime';
  if (file.endsWith('.css')) return 'style';
  if (/\.(pdf|csv|zip|docx)$/i.test(file)) return 'download_or_document';
  return 'other';
}
function systemTags(file, text = '') {
  const hay = `${file}\n${text}`.toLowerCase();
  const tags = [];
  const tests = {
    membership: /membership|member-dashboard|entitlement/,
    authentication: /passwordless|auth\/|magic.link|request-link|session/,
    newsletter: /newsletter|subscribe|brevo|email capture|marketingconsent/,
    payments: /paypal|checkout|subscription|billing|webhook/,
    dashboard: /dashboard|command.center|tracker.operating/,
    daily_drop: /daily.drop|daily-investigation|daily.brain/,
    weekly_report: /weekly|newsletter/,
    evidence: /evidence|source.ledger|claim.classifier|archive/,
    search: /search-index|search.html|ask.matrix|search.js/,
    entity_graph: /entity|relationship|network.map|power.atlas/,
    speculation: /speculation|scenario|probability/,
    deployment: /deploy|production|cloudflare|wrangler/,
    persistence: /d1|database|migration|forum.posts|kv/,
    books_and_products: /book|amazon|card.deck|dossier.pack/,
    mission_analysis: /mission|control.structure|convergence|one.world|elite.control/
  };
  for (const [tag, expression] of Object.entries(tests)) if (expression.test(hay)) tags.push(tag);
  return tags;
}

const files = walk(root);
const fileRows = files.map(file => {
  const text = /\.(js|json|html|md|yml|yaml|toml)$/i.test(file) ? read(file).slice(0, 300000) : '';
  return {
    file,
    category: categoryFor(file),
    sizeBytes: fs.statSync(full(file)).size,
    hash: hashFile(file),
    tags: systemTags(file, text)
  };
});

const protectionRules = [
  {
    id: 'strict-production-worker',
    label: 'Strict Cloudflare production Worker',
    file: 'src/worker-production.js',
    markers: ['non-authoritative-forum-response-blocked', 'members-db-binding-unavailable'],
    reason: 'Fail-closed boundary prevents legacy or unhealthy forum responses from reporting success.'
  },
  {
    id: 'd1-forum-worker',
    label: 'D1-authoritative forum persistence Worker',
    file: 'src/worker-forum-persistence.js',
    markers: ['Cloudflare D1 MEMBERS_DB.forum_posts', 'd1Connected: true'],
    reason: 'Cloudflare D1 is the authoritative forum store.'
  },
  {
    id: 'worker-config',
    label: 'Cloudflare Worker configuration and D1 binding',
    file: 'wrangler.toml',
    markers: ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"'],
    reason: 'Defines the production entrypoint and authoritative D1 binding.'
  },
  {
    id: 'final-reconciliation',
    label: 'Final production reconciliation',
    file: 'scripts/final-production-reconcile.js',
    markers: ['patch-conclusion-integrity-cards.js', 'build-production-health.js'],
    reason: 'Restores canonical output after legacy generators.'
  },
  {
    id: 'production-freshness',
    label: 'Production freshness guard',
    file: 'scripts/production-freshness-guard.js',
    markers: [],
    reason: 'Prevents stale intelligence data from silently publishing.'
  },
  {
    id: 'production-sync',
    label: 'Production synchronization test',
    file: 'scripts/production-sync-test.js',
    markers: [],
    reason: 'Checks repository output and deployment synchronization.'
  },
  {
    id: 'production-deploy-guard',
    label: 'Production deployment guard',
    file: 'scripts/production-deploy-guard.js',
    markers: [],
    reason: 'Blocks deployment when critical production boundaries fail.'
  },
  {
    id: 'conclusion-integrity',
    label: 'Conclusion integrity cards',
    file: 'scripts/patch-conclusion-integrity-cards.js',
    markers: ['Evidence And Confidence Layer', 'Counter-evidence status'],
    reason: 'Separates conclusions from evidence status and limitations.'
  },
  {
    id: 'source-registry',
    label: 'Investigation source registry',
    file: 'data/investigation-source-registry.json',
    markers: [],
    reason: 'Defines monitored source routes and evidence intake.'
  },
  {
    id: 'membership-page',
    label: 'Visible membership tiers with payments deferred',
    file: 'membership.html',
    markers: ['€3', '€6', '€9', 'Coming soon — no payment taken'],
    reason: 'Preserves honest pricing display while checkout remains disabled.'
  },
  {
    id: 'canonical-schema',
    label: 'Canonical intelligence-record schema',
    file: 'data/intelligence-record.schema.json',
    markers: ['solidConclusion', 'missionAssessment', 'speculativeConclusion'],
    reason: 'Phase 1 additive schema; report-only until migration is proven.'
  },
  {
    id: 'tier-policy',
    label: 'Cumulative access-tier policy',
    file: 'data/access-tier-policy.json',
    markers: ['supporter_3', 'intelligence_6', 'research_pro_9'],
    reason: 'Defines field and feature routing without altering evidential status.'
  }
];

const protectedComponents = protectionRules.map(rule => {
  const state = markerState(rule.file, rule.markers);
  return {
    ...rule,
    ...state,
    status: statusFromState(state, true),
    changePolicy: 'Do not remove or replace. Add compatibility adapters and prove regression safety first.'
  };
});

const architecture = {
  build: {
    packageExists: exists('package.json'),
    buildScriptLength: String(safeJson('package.json')?.scripts?.build || '').length,
    scriptCount: fileRows.filter(row => row.category === 'script').length,
    workflows: fileRows.filter(row => row.category === 'workflow').map(row => row.file)
  },
  deployment: {
    wrangler: markerState('wrangler.toml', ['main = "src/worker-production.js"', 'binding = "MEMBERS_DB"']),
    productionWorker: markerState('src/worker-production.js', ['non-authoritative-forum-response-blocked']),
    forumWorker: markerState('src/worker-forum-persistence.js', ['Cloudflare D1 MEMBERS_DB.forum_posts']),
    deploymentWorkflows: fileRows.filter(row => row.category === 'workflow' && row.tags.includes('deployment')).map(row => row.file)
  },
  membership: {
    page: markerState('membership.html', ['€3', '€6', '€9']),
    deferredPaymentMarker: read('membership.html').includes('Coming soon — no payment taken'),
    activeCheckoutMarkers: [
      'actions.subscription.create',
      '/api/paypal/checkout-intent'
    ].filter(marker => read('membership.html').includes(marker)),
    taggedFiles: fileRows.filter(row => row.tags.includes('membership')).map(row => row.file)
  },
  newsletter: {
    taggedFiles: fileRows.filter(row => row.tags.includes('newsletter')).map(row => row.file),
    newsletterRuntime: markerState('newsletter.js', ['newsletter']),
    workerRoutesMentioned: /newsletter|membership\/signup|subscribe/i.test(read('src/worker.js'))
  },
  intelligence: {
    canonicalSchema: markerState('data/intelligence-record.schema.json', ['missionAssessment', 'speculativeConclusion']),
    sourceManifest: markerState('data/intelligence-source-manifest.json', ['daily-investigation', 'outcome-briefings']),
    conclusionOutputs: [
      'data/daily-investigation-conclusions.json',
      'data/weekly-investigation-conclusions.json',
      'data/daily-power-conclusions.json',
      'data/daily-brain-brief.json',
      'data/outcome-briefings.json',
      'data/live-intel.json'
    ].map(file => ({ file, exists: exists(file), hash: hashFile(file) }))
  }
};

const baseNames = new Map();
for (const row of fileRows) {
  const key = path.basename(row.file).toLowerCase();
  if (!baseNames.has(key)) baseNames.set(key, []);
  baseNames.get(key).push(row.file);
}
const duplicateBasenames = [...baseNames.entries()]
  .filter(([, matches]) => matches.length > 1)
  .map(([basename, matches]) => ({ basename, matches }))
  .sort((a, b) => b.matches.length - a.matches.length || a.basename.localeCompare(b.basename));

const htmlRows = fileRows.filter(row => row.file.endsWith('.html'));
const htmlByHash = new Map();
for (const row of htmlRows) {
  if (!htmlByHash.has(row.hash)) htmlByHash.set(row.hash, []);
  htmlByHash.get(row.hash).push(row.file);
}
const exactDuplicateHtml = [...htmlByHash.entries()]
  .filter(([, matches]) => matches.length > 1)
  .map(([hash, matches]) => ({ hash, matches }))
  .sort((a, b) => b.matches.length - a.matches.length);

const tagSummary = {};
for (const row of fileRows) for (const tag of row.tags) tagSummary[tag] = (tagSummary[tag] || 0) + 1;

const risks = [];
if (!architecture.membership.deferredPaymentMarker) risks.push({ severity: 'critical', issue: 'Membership page lacks the payment-deferred marker.' });
if (architecture.membership.activeCheckoutMarkers.length) risks.push({ severity: 'critical', issue: `Active checkout markers found in membership.html: ${architecture.membership.activeCheckoutMarkers.join(', ')}` });
if (!architecture.deployment.wrangler.allMarkersPresent) risks.push({ severity: 'critical', issue: 'Wrangler production entrypoint or MEMBERS_DB binding is missing.' });
if (!architecture.deployment.productionWorker.allMarkersPresent) risks.push({ severity: 'critical', issue: 'Strict production Worker fail-closed marker is missing.' });
if (!architecture.deployment.forumWorker.allMarkersPresent) risks.push({ severity: 'critical', issue: 'D1 forum persistence marker is missing.' });
if (!architecture.intelligence.canonicalSchema.allMarkersPresent) risks.push({ severity: 'high', issue: 'Canonical Phase 1 intelligence schema is incomplete or unavailable.' });
if (duplicateBasenames.length) risks.push({ severity: 'advisory', issue: `${duplicateBasenames.length} repeated basenames require ownership review before cleanup.` });
if (exactDuplicateHtml.length) risks.push({ severity: 'advisory', issue: `${exactDuplicateHtml.length} exact HTML duplicate groups require route review; do not delete automatically.` });

const classificationCounts = fileRows.reduce((acc, row) => {
  acc[row.category] = (acc[row.category] || 0) + 1;
  return acc;
}, {});

const report = {
  ok: !risks.some(risk => risk.severity === 'critical'),
  mode: 'report-only',
  generatedAt: now,
  root: path.basename(root),
  boundary: 'This inventory inspects the repository and writes reports only. It does not edit production pages, data, routes, Workers, databases, membership state or payment state.',
  summary: {
    totalFiles: fileRows.length,
    htmlPages: htmlRows.length,
    dataFiles: fileRows.filter(row => row.category === 'data').length,
    scripts: fileRows.filter(row => row.category === 'script').length,
    workflows: fileRows.filter(row => row.category === 'workflow').length,
    workers: fileRows.filter(row => row.category === 'worker').length,
    migrations: fileRows.filter(row => row.category === 'database_migration').length,
    protectedComponents: protectedComponents.length,
    protectedHealthy: protectedComponents.filter(item => item.status === 'protected').length,
    criticalRisks: risks.filter(risk => risk.severity === 'critical').length,
    highRisks: risks.filter(risk => risk.severity === 'high').length,
    advisoryRisks: risks.filter(risk => risk.severity === 'advisory').length
  },
  classificationCounts,
  tagSummary,
  architecture,
  protectedComponents,
  risks,
  duplicateCandidates: {
    repeatedBasenames: duplicateBasenames,
    exactDuplicateHtml
  },
  files: fileRows
};

fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, 'phase0-system-inventory.json'), JSON.stringify(report, null, 2));

const lines = [
  '# Phase 0 System Inventory',
  '',
  `Generated: ${report.generatedAt}`,
  `Mode: ${report.mode}`,
  `Status: ${report.ok ? 'PASS WITH REVIEW ITEMS' : 'BLOCKED'}`,
  '',
  '## Safety boundary',
  '',
  report.boundary,
  '',
  '## Summary',
  '',
  `- Total files: ${report.summary.totalFiles}`,
  `- HTML pages: ${report.summary.htmlPages}`,
  `- Data files: ${report.summary.dataFiles}`,
  `- Scripts: ${report.summary.scripts}`,
  `- Workflows: ${report.summary.workflows}`,
  `- Workers: ${report.summary.workers}`,
  `- Database migrations: ${report.summary.migrations}`,
  `- Protected components: ${report.summary.protectedComponents}`,
  `- Protected components healthy: ${report.summary.protectedHealthy}`,
  `- Critical risks: ${report.summary.criticalRisks}`,
  `- High risks: ${report.summary.highRisks}`,
  `- Advisory risks: ${report.summary.advisoryRisks}`,
  '',
  '## Protected components',
  '',
  ...protectedComponents.map(item => `- ${item.status.toUpperCase()} — ${item.label} — \`${item.file}\` — ${item.reason}`),
  '',
  '## Risks and review items',
  '',
  ...(risks.length ? risks.map(item => `- ${item.severity.toUpperCase()} — ${item.issue}`) : ['- None']),
  '',
  '## System tags',
  '',
  ...Object.entries(tagSummary).sort((a, b) => b[1] - a[1]).map(([tag, count]) => `- ${tag}: ${count} files`),
  '',
  '## Duplicate candidates',
  '',
  `- Repeated basenames: ${duplicateBasenames.length}`,
  `- Exact duplicate HTML groups: ${exactDuplicateHtml.length}`,
  '',
  'No duplicate candidate should be deleted automatically. Ownership and generator order must be established first.'
];
fs.writeFileSync(path.join(downloads, 'phase0-system-inventory.md'), lines.join('\n'));

console.log(`PHASE 0 SYSTEM INVENTORY ${report.ok ? 'COMPLETED' : 'BLOCKED'}`);
console.log(`Files: ${report.summary.totalFiles}; protected: ${report.summary.protectedHealthy}/${report.summary.protectedComponents}; critical risks: ${report.summary.criticalRisks}.`);
console.log('Reports: downloads/phase0-system-inventory.json and downloads/phase0-system-inventory.md');
if (!report.ok && process.argv.includes('--strict')) process.exit(1);
