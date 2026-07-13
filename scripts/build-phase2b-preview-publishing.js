const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'phase2-publishing-preview');
const siteDir = path.join(outputDir, 'site', '__preview', 'canonical');
const tierOrder = ['public', 'registered', 'supporter_3', 'intelligence_6', 'research_pro_9'];
const invariantPaths = [
  'id',
  'recordType',
  'title',
  'summary',
  'status',
  'recordStatus',
  'solidConclusion.text',
  'solidConclusion.scope',
  'solidConclusion.confidence',
  'solidConclusion.boundary',
  'missionAssessment.outcome',
  'missionAssessment.boundary',
  'evidence.grade',
  'evidence.claimClass',
  'evidence.associationBoundary',
  'freshness.updatedAt',
  'freshness.lastReviewedAt',
  'freshness.reviewStatus',
  'counterAnalysis.contradictoryEvidence',
  'freshness.supersedes',
  'freshness.supersededBy'
];
const forbiddenHtmlMarkers = [
  '<form',
  'paypal',
  'createsubscription',
  'checkout-intent',
  '/api/',
  'fetch(',
  'xmlhttprequest',
  'websocket',
  'member-login',
  'request-link',
  'magic link'
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeRel(rel, content) {
  const target = path.join(outputDir, rel);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function normalize(rel) {
  return rel.split(path.sep).join('/');
}

function getPath(source, dottedPath) {
  const segments = String(dottedPath).split('.');
  let value = source;
  for (const segment of segments) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    value = value[segment];
  }
  return value;
}

function hasPath(source, dottedPath) {
  const segments = String(dottedPath).split('.');
  let value = source;
  for (const segment of segments) {
    if (value === null || value === undefined || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, segment)) return false;
    value = value[segment];
  }
  return true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function embeddedJson(value) {
  return JSON.stringify(value).replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');
}

function safeSegment(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'record';
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function compactText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(compactText).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${compactText(item)}`)
      .filter(item => !item.endsWith(': '))
      .join(' · ');
  }
  return String(value);
}

function renderList(items, emptyText = 'No additional projected detail at this tier.') {
  const values = asArray(items).filter(item => item !== undefined && item !== null && compactText(item).trim());
  if (!values.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${values.map(item => `<li>${escapeHtml(compactText(item))}</li>`).join('')}</ul>`;
}

function renderSources(sources) {
  const values = asArray(sources).filter(Boolean);
  if (!values.length) return '<p class="muted">Source detail is not projected at this tier.</p>';
  return `<ol class="sources">${values.map(source => {
    const title = source.title || source.publisher || source.id || 'Source';
    const publisher = source.publisher && source.publisher !== title ? `<span>${escapeHtml(source.publisher)}</span>` : '';
    const authority = source.authority ? `<span>Authority: ${escapeHtml(source.authority)}</span>` : '';
    const href = typeof source.url === 'string' && /^https?:\/\//i.test(source.url)
      ? `<a href="${escapeHtml(source.url)}" rel="noreferrer noopener">${escapeHtml(title)}</a>`
      : `<strong>${escapeHtml(title)}</strong>`;
    return `<li>${href}${publisher}${authority}</li>`;
  }).join('')}</ol>`;
}

function section(title, body, className = '') {
  if (!body) return '';
  return `<section class="panel ${escapeHtml(className)}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function factItems(record) {
  return asArray(record.establishedFacts).map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.text || item.fact || compactText(item);
    return compactText(item);
  }).filter(Boolean);
}

function detailRows(record) {
  const rows = [
    ['Record type', record.recordType],
    ['Status', record.status],
    ['Record status', compactText(record.recordStatus)],
    ['Claim class', record.evidence?.claimClass],
    ['Evidence grade', record.evidence?.grade],
    ['Conclusion confidence', record.solidConclusion?.confidence],
    ['Mission outcome', record.missionAssessment?.outcome],
    ['Review status', record.freshness?.reviewStatus],
    ['Updated', record.freshness?.updatedAt]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
  return `<dl>${rows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

function pageShell({ title, eyebrow, body, canonicalRoute, tierLabel, embeddedRecord = null }) {
  const recordData = embeddedRecord === null ? '' : `<script type="application/json" id="record-data">${embeddedJson(embeddedRecord)}</script>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="googlebot" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Matrix Reprogrammed Preview</title>
<style>
:root{color-scheme:dark;--bg:#090c11;--panel:#111722;--panel2:#171f2c;--line:#2b3545;--text:#eef3fb;--muted:#aeb9c9;--gold:#d7aa50;--blue:#8ac6ff;--red:#ff9d9d;--green:#9fe0bd}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#172033 0,#090c11 42%);color:var(--text);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}a{color:var(--blue)}header,main,footer{width:min(1180px,calc(100% - 32px));margin:auto}header{padding:38px 0 20px}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.03;margin:.2rem 0 1rem}h2{font-size:1.05rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin:0 0 12px}.eyebrow{color:var(--gold);letter-spacing:.16em;text-transform:uppercase;font-size:.76rem}.boundary{border-left:4px solid var(--gold);background:#141923;padding:14px 16px;color:#dce4ef}.tier{display:inline-flex;border:1px solid var(--line);background:#101722;border-radius:999px;padding:6px 10px;color:var(--muted);font-size:.82rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.panel{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0;overflow-wrap:anywhere}.panel.speculation{border-color:#73504d}.panel.counter{border-color:#40546b}.muted{color:var(--muted)}ul,ol{padding-left:1.25rem}li+li{margin-top:.45rem}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}dl div{border:1px solid var(--line);border-radius:10px;padding:10px;background:#0e131c}dt{font-size:.72rem;text-transform:uppercase;color:var(--muted)}dd{margin:4px 0 0}.sources li{display:grid;gap:2px}.sources span{color:var(--muted);font-size:.86rem}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.card{display:block;text-decoration:none;color:inherit;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:18px}.card:hover{border-color:var(--gold)}.card h3{margin:.25rem 0 .5rem}.meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:.78rem}.badge{border:1px solid var(--line);border-radius:999px;padding:3px 7px}.nav{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.nav a{border:1px solid var(--line);border-radius:999px;padding:7px 11px;text-decoration:none}.stat{font-size:2rem;font-weight:700}.warning{color:var(--red)}.good{color:var(--green)}footer{padding:32px 0 60px;color:var(--muted);font-size:.85rem}code{overflow-wrap:anywhere}
</style>
</head>
<body data-preview-route="${escapeHtml(canonicalRoute)}" data-tier="${escapeHtml(tierLabel)}">
<header><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><span class="tier">${escapeHtml(tierLabel)}</span><p class="boundary">Preview only. No live route, account, entitlement, email or payment behaviour is active.</p></header>
<main>${body}</main>
<footer>Matrix Reprogrammed canonical publishing preview · isolated under <code>__preview/canonical</code> · noindex</footer>
${recordData}
</body>
</html>`;
}

function recordPage(record, tier, tierInfo, route) {
  const facts = factItems(record);
  const mechanism = record.mechanismOfPower ? section('Mechanism of power', `<p>${escapeHtml(compactText(record.mechanismOfPower.description || record.mechanismOfPower))}</p>${record.mechanismOfPower.authorityHolder ? `<p><strong>Authority holder:</strong> ${escapeHtml(compactText(record.mechanismOfPower.authorityHolder))}</p>` : ''}${record.mechanismOfPower.implementationRoute ? `<p><strong>Implementation route:</strong> ${escapeHtml(compactText(record.mechanismOfPower.implementationRoute))}</p>` : ''}`) : '';
  const mission = record.missionAssessment ? section('Mission assessment', `<p><strong>Outcome:</strong> ${escapeHtml(record.missionAssessment.outcome || '')}</p>${record.missionAssessment.missionRelevance ? `<p>${escapeHtml(compactText(record.missionAssessment.missionRelevance))}</p>` : ''}${record.missionAssessment.eliteControlRelevance ? `<p><strong>Elite-control relevance:</strong> ${escapeHtml(compactText(record.missionAssessment.eliteControlRelevance))}</p>` : ''}<p class="boundary">${escapeHtml(record.missionAssessment.boundary || '')}</p>`) : '';
  const speculation = record.speculativeConclusion ? section('Speculative conclusion', `<p><strong>${escapeHtml(record.speculativeConclusion.label || 'speculative')}</strong> · confidence ${escapeHtml(record.speculativeConclusion.confidence || 'not stated')}</p><p>${escapeHtml(compactText(record.speculativeConclusion.text || ''))}</p><h3>Conditions</h3>${renderList(record.speculativeConclusion.conditions)}<h3>Falsifiers</h3>${renderList(record.speculativeConclusion.falsifiers)}<p class="boundary">${escapeHtml(record.speculativeConclusion.boundary || '')}</p>`, 'speculation') : '';
  const counter = record.counterAnalysis ? section('Counter-analysis', `${record.counterAnalysis.assessment ? `<p>${escapeHtml(compactText(record.counterAnalysis.assessment))}</p>` : ''}<h3>Alternative explanations</h3>${renderList(record.counterAnalysis.alternativeExplanations)}<h3>Contradictory evidence</h3>${renderList(record.counterAnalysis.contradictoryEvidence, 'No contradictory evidence is currently projected for this record.')}`, 'counter') : '';
  const body = `
<div class="nav"><a href="../../dashboard/${escapeHtml(tier)}.html">← ${escapeHtml(tierInfo.label)} dashboard</a><a href="../../index.html">Preview index</a></div>
<div class="grid">${section('Record details', detailRows(record))}${section('Evidence status', `<p><strong>Claim class:</strong> ${escapeHtml(record.evidence?.claimClass || '')}</p><p><strong>Grade:</strong> ${escapeHtml(record.evidence?.grade || '')}</p><p class="boundary">${escapeHtml(record.evidence?.associationBoundary || '')}</p>`)}</div>
${section('Summary', `<p>${escapeHtml(record.summary || '')}</p>`)}
${section('Established facts', renderList(facts, 'No established-fact list is projected at this tier.'))}
${mechanism}
${section('Solid conclusion', `<p>${escapeHtml(record.solidConclusion?.text || '')}</p>${record.solidConclusion?.scope ? `<p><strong>Scope:</strong> ${escapeHtml(compactText(record.solidConclusion.scope))}</p>` : ''}<p class="boundary">${escapeHtml(record.solidConclusion?.boundary || '')}</p>`)}
${mission}
${speculation}
${counter}
${record.moneyAndAuthority ? section('Money and authority', `<p>${escapeHtml(compactText(record.moneyAndAuthority))}</p>`) : ''}
${record.entities ? section('Entities', renderList(record.entities)) : ''}
${record.missingEvidence ? section('Missing evidence', renderList(record.missingEvidence)) : ''}
${record.watchNext ? section('Watch next', renderList(record.watchNext)) : ''}
${record.sources ? section('Sources', renderSources(record.sources)) : ''}
`;
  return pageShell({
    title: record.title,
    eyebrow: `${tierInfo.label} record preview`,
    body,
    canonicalRoute: route,
    tierLabel: tierInfo.label,
    embeddedRecord: record
  });
}

function dashboardCard(record, route) {
  return `<a class="card" href="${escapeHtml(route)}"><div class="meta"><span class="badge">${escapeHtml(record.recordType || 'record')}</span><span class="badge">${escapeHtml(record.evidence?.claimClass || 'unclassified')}</span><span class="badge">${escapeHtml(record.freshness?.reviewStatus || 'review')}</span></div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.summary || '')}</p><p class="muted">Conclusion: ${escapeHtml(record.solidConclusion?.confidence || 'not stated')} · mission: ${escapeHtml(record.missionAssessment?.outcome || 'not stated')}</p></a>`;
}

function countBy(records, getter) {
  const counts = {};
  for (const record of records) {
    const key = String(getter(record) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function feedCard(record, route) {
  return {
    id: record.id,
    route,
    title: record.title,
    summary: record.summary,
    recordType: record.recordType,
    status: record.status,
    recordStatus: record.recordStatus,
    claimClass: record.evidence?.claimClass ?? null,
    evidenceGrade: record.evidence?.grade ?? null,
    conclusionConfidence: record.solidConclusion?.confidence ?? null,
    conclusionBoundary: record.solidConclusion?.boundary ?? null,
    missionOutcome: record.missionAssessment?.outcome ?? null,
    missionBoundary: record.missionAssessment?.boundary ?? null,
    associationBoundary: record.evidence?.associationBoundary ?? null,
    reviewStatus: record.freshness?.reviewStatus ?? null,
    updatedAt: record.freshness?.updatedAt ?? null,
    speculationAvailable: Boolean(record.speculativeConclusion),
    sourceCount: Array.isArray(record.sources) ? record.sources.length : 0,
    delivery: record.delivery ?? null
  };
}

function runPhase2() {
  const result = spawnSync(process.execPath, ['scripts/build-phase2-tier-projections.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Phase 2 projection build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}

runPhase2();
const policy = readJson('data/access-tier-policy.json');
const projectionManifest = readJson('downloads/phase2-tier-projections/projection-manifest.json');
if (!projectionManifest.ok) throw new Error('Phase 2 projection manifest is not healthy.');
if (policy.paymentStatus !== 'deferred' || policy.enforcementMode !== 'report-only') throw new Error('Preview publishing requires deferred payments and report-only enforcement.');

fs.rmSync(outputDir, { recursive: true, force: true });
ensureDir(siteDir);

const packages = Object.fromEntries(tierOrder.map(tier => [tier, readJson(`downloads/phase2-tier-projections/${tier}.json`)]));
const expectedCount = projectionManifest.canonicalRecordCount;
const errors = [];
const routes = [];
const recordFiles = new Set();
const tierResults = {};

for (const tier of tierOrder) {
  const tierPackage = packages[tier];
  const tierInfo = policy.tiers[tier];
  if (tierPackage.recordCount !== expectedCount || tierPackage.records.length !== expectedCount) errors.push(`${tier}: expected ${expectedCount} records`);
  const byId = new Map(tierPackage.records.map(record => [record.id, record]));
  if (byId.size !== expectedCount) errors.push(`${tier}: duplicate or missing record IDs`);

  const cards = [];
  for (const record of tierPackage.records) {
    for (const publicPath of policy.mandatoryPublicSafetyFields || []) {
      if (!hasPath(record, publicPath)) errors.push(`${tier}/${record.id}: missing public safety path ${publicPath}`);
    }
    if (!hasPath(record, 'counterAnalysis.contradictoryEvidence')) errors.push(`${tier}/${record.id}: contradictory evidence field absent`);
    if (record.speculativeConclusion && record.speculativeConclusion.label !== 'speculative') errors.push(`${tier}/${record.id}: speculation label changed`);
    const segment = safeSegment(record.id);
    const outputRel = `site/__preview/canonical/records/${tier}/${segment}.html`;
    const route = `/__preview/canonical/records/${tier}/${segment}.html`;
    if (recordFiles.has(outputRel)) errors.push(`${tier}/${record.id}: output route collision`);
    recordFiles.add(outputRel);
    const html = recordPage(record, tier, tierInfo, route);
    writeRel(outputRel, html);
    routes.push({ type: 'record', tier, recordId: record.id, route, outputFile: outputRel });
    cards.push(feedCard(record, `../records/${tier}/${segment}.html`));
  }

  cards.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.title).localeCompare(String(b.title)));
  const counts = {
    byRecordType: countBy(tierPackage.records, record => record.recordType),
    byClaimClass: countBy(tierPackage.records, record => record.evidence?.claimClass),
    byMissionOutcome: countBy(tierPackage.records, record => record.missionAssessment?.outcome),
    byReviewStatus: countBy(tierPackage.records, record => record.freshness?.reviewStatus)
  };
  const feed = {
    ok: true,
    mode: 'preview-only',
    version: '1.0.0',
    generatedAt: projectionManifest.generatedAt,
    tier,
    label: tierInfo.label,
    priceEurMonthly: tierInfo.priceEurMonthly,
    requiresAccount: tierInfo.requiresAccount,
    paymentStatus: policy.paymentStatus,
    enforcementMode: policy.enforcementMode,
    recordCount: cards.length,
    counts,
    boundary: 'Static dashboard feed preview only. No authentication, entitlement, email or payment behaviour is active.',
    cards
  };
  const feedRel = `site/__preview/canonical/feeds/${tier}.json`;
  writeRel(feedRel, stableJson(feed));
  routes.push({ type: 'feed', tier, route: `/__preview/canonical/feeds/${tier}.json`, outputFile: feedRel });

  const dashboardBody = `
<div class="nav"><a href="../index.html">← Preview index</a></div>
<div class="grid"><section class="panel"><h2>Records</h2><div class="stat">${cards.length}</div></section><section class="panel"><h2>Projection</h2><p>${escapeHtml(tierInfo.content.join(' · '))}</p></section><section class="panel"><h2>Boundary</h2><p>No login or entitlement is active. This page displays the deterministic ${escapeHtml(tierInfo.label)} projection only.</p></section></div>
<section class="panel"><h2>Record mix</h2>${renderList(Object.entries(counts.byRecordType).map(([key, value]) => `${key}: ${value}`))}</section>
<div class="cards">${cards.map(card => {
    const record = byId.get(card.id);
    return dashboardCard(record, card.route);
  }).join('')}</div>`;
  const dashboardRel = `site/__preview/canonical/dashboard/${tier}.html`;
  const dashboardRoute = `/__preview/canonical/dashboard/${tier}.html`;
  writeRel(dashboardRel, pageShell({ title: `${tierInfo.label} dashboard`, eyebrow: 'Canonical dashboard preview', body: dashboardBody, canonicalRoute: dashboardRoute, tierLabel: tierInfo.label }));
  routes.push({ type: 'dashboard', tier, route: dashboardRoute, outputFile: dashboardRel });
  tierResults[tier] = { recordCount: cards.length, feedRel, dashboardRel, counts };
}

const publicRecords = new Map(packages.public.records.map(record => [record.id, record]));
for (const tier of tierOrder.slice(1)) {
  const tierRecords = new Map(packages[tier].records.map(record => [record.id, record]));
  for (const [id, publicRecord] of publicRecords) {
    const higher = tierRecords.get(id);
    if (!higher) {
      errors.push(`${tier}/${id}: missing record for invariant comparison`);
      continue;
    }
    for (const fieldPath of invariantPaths) {
      if (hasPath(publicRecord, fieldPath) && JSON.stringify(getPath(publicRecord, fieldPath)) !== JSON.stringify(getPath(higher, fieldPath))) {
        errors.push(`${tier}/${id}: factual invariant changed at ${fieldPath}`);
      }
    }
  }
}

const indexCards = tierOrder.map(tier => {
  const info = policy.tiers[tier];
  const result = tierResults[tier];
  return `<a class="card" href="dashboard/${escapeHtml(tier)}.html"><span class="tier">${escapeHtml(info.label)}</span><h3>${result.recordCount} records</h3><p>${escapeHtml(info.content.slice(0, 4).join(' · '))}</p><p class="muted">€${info.priceEurMonthly}/month planned · payment deferred</p></a>`;
}).join('');
const indexBody = `<section class="panel"><h2>Publishing checkpoint</h2><p><strong>${expectedCount}</strong> canonical records projected into five cumulative static dashboards and feeds.</p><p class="boundary">The preview namespace is isolated, noindexed and contains no forms, authentication calls, entitlement checks, email capture or payment code.</p></section><div class="cards">${indexCards}</div>`;
const indexRel = 'site/__preview/canonical/index.html';
writeRel(indexRel, pageShell({ title: 'Canonical publishing preview', eyebrow: 'Phase 2B', body: indexBody, canonicalRoute: '/__preview/canonical/index.html', tierLabel: 'Preview only' }));
routes.push({ type: 'index', tier: null, route: '/__preview/canonical/index.html', outputFile: indexRel });

const htmlFiles = routes.filter(item => item.outputFile.endsWith('.html'));
for (const item of htmlFiles) {
  const content = fs.readFileSync(path.join(outputDir, item.outputFile), 'utf8');
  const lower = content.toLowerCase();
  if (!lower.includes('noindex,nofollow,noarchive')) errors.push(`${item.outputFile}: noindex boundary missing`);
  if (!lower.includes('data-preview-route="/__preview/canonical/')) errors.push(`${item.outputFile}: preview namespace marker missing`);
  if (/<script(?![^>]*type=["']application\/json["'])/i.test(content)) errors.push(`${item.outputFile}: executable script detected`);
  for (const marker of forbiddenHtmlMarkers) {
    if (lower.includes(marker)) errors.push(`${item.outputFile}: forbidden marker ${marker}`);
  }
}

routes.sort((a, b) => a.route.localeCompare(b.route));
writeRel('route-manifest.json', stableJson({
  ok: errors.length === 0,
  mode: 'preview-only',
  generatedAt: projectionManifest.generatedAt,
  namespace: '/__preview/canonical/',
  routeCount: routes.length,
  routes
}));

const artifactHashes = {};
function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(target));
    else out.push(target);
  }
  return out;
}
for (const file of collectFiles(path.join(outputDir, 'site')).sort()) {
  const rel = normalize(path.relative(outputDir, file));
  artifactHashes[rel] = sha256(fs.readFileSync(file));
}
artifactHashes['route-manifest.json'] = sha256(fs.readFileSync(path.join(outputDir, 'route-manifest.json')));

const manifest = {
  ok: errors.length === 0,
  mode: 'preview-only',
  version: '1.0.0',
  generatedAt: projectionManifest.generatedAt,
  namespace: '/__preview/canonical/',
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  canonicalRecordCount: expectedCount,
  tierCount: tierOrder.length,
  dashboardCount: tierOrder.length,
  feedCount: tierOrder.length,
  recordPageCount: recordFiles.size,
  htmlPageCount: htmlFiles.length,
  routeCount: routes.length,
  tierResults,
  artifactHashes,
  errors,
  boundary: 'Static preview artifacts only. Existing routes, Workers, databases, accounts, email systems, entitlements and payments remain unchanged.'
};
writeRel('publishing-manifest.json', stableJson(manifest));
writeRel('README.md', `# Phase 2B Publishing Preview\n\nGenerated: ${manifest.generatedAt}\n\n- Canonical records: ${manifest.canonicalRecordCount}\n- Tier dashboards: ${manifest.dashboardCount}\n- Tier feeds: ${manifest.feedCount}\n- Tier-specific record pages: ${manifest.recordPageCount}\n- Namespace: ${manifest.namespace}\n- Payments: ${manifest.paymentStatus}\n- Enforcement: ${manifest.enforcementMode}\n\n${manifest.boundary}\n`);

console.log(`PHASE 2B PUBLISHING PREVIEW: ${manifest.recordPageCount} record pages, ${manifest.dashboardCount} dashboards and ${manifest.feedCount} feeds.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
if (errors.length) {
  console.error(errors.slice(0, 200).join('\n'));
  process.exit(1);
}
