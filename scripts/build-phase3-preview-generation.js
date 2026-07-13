const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = process.env.PHASE3_PREVIEW_OUTPUT_DIR
  ? path.resolve(process.env.PHASE3_PREVIEW_OUTPUT_DIR)
  : path.join(root, 'downloads', 'phase3-preview-generation');
const siteRoot = path.join(outputDir, 'site', '__preview', 'phase3');
const policyPath = path.join(root, 'data', 'phase3-preview-generation-policy.json');
const taxonomyPath = path.join(root, 'data', 'phase3-canonical-taxonomy.json');
const tierPolicyPath = path.join(root, 'data', 'phase3-tier-matrix-policy.json');
const tierMatrixPath = path.join(root, 'downloads', 'phase3-tier-matrix', 'tier-matrix.json');
const classificationPath = path.join(root, 'downloads', 'phase3-public-private-classification', 'classification.json');
const lockPath = path.join(root, 'downloads', 'phase3-locked-section-simulation', 'locked-section-decisions.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value), null, 2) + '\n';
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeFile(relativePath, content) {
  const target = path.join(outputDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function writeJson(relativePath, value) {
  writeFile(relativePath, stableJson(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'item';
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function runLockedSimulation() {
  const result = spawnSync(process.execPath, ['scripts/build-phase3-locked-section-simulation.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`Phase 3 locked-section simulation failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout || '');
}

function list(items, emptyText = 'None declared.') {
  const values = unique((items || []).map(value => typeof value === 'string' ? value : JSON.stringify(value)));
  if (!values.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${values.map(value => `<li>${escapeHtml(titleCase(value))}</li>`).join('')}</ul>`;
}

function badges(values) {
  return `<div class="badges">${values.filter(Boolean).map(value => `<span class="badge">${escapeHtml(titleCase(value))}</span>`).join('')}</div>`;
}

function card(title, body, className = '') {
  return `<section class="card ${escapeHtml(className)}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function page({ title, eyebrow, body, route }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="googlebot" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)} · Phase 3 Preview</title><style>
:root{color-scheme:dark;--bg:#080b11;--panel:#111824;--panel2:#182131;--line:#2e3a4d;--text:#eef4fb;--muted:#aeb8c7;--gold:#d8ad58;--blue:#8bc9ff;--green:#8be0b2;--red:#ff9d9d;--amber:#f3cd7c}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#1b2740 0,#080b11 45%);color:var(--text);font:15px/1.58 system-ui,-apple-system,Segoe UI,sans-serif}a{color:var(--blue)}header,main,footer{width:min(1380px,calc(100% - 28px));margin:auto}header{padding:34px 0 17px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.72rem;color:var(--gold)}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.03;margin:.3rem 0 1rem}h2{font-size:.9rem;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin:0 0 12px}h3{margin:.4rem 0}.boundary{border-left:4px solid var(--gold);background:#141b27;padding:13px 15px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:15px}.card{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:17px;margin:15px 0;overflow-wrap:anywhere}.card.public{border-color:#385c6d}.card.private{border-color:#6d5c37}.card.internal{border-color:#674052}.card.review{border-color:#6f573b}.badges{display:flex;gap:7px;flex-wrap:wrap}.badge{border:1px solid var(--line);border-radius:999px;padding:4px 8px;font-size:.74rem}.muted{color:var(--muted)}.nav{display:flex;gap:9px;flex-wrap:wrap;margin:10px 0 18px}.nav a{border:1px solid var(--line);border-radius:999px;padding:6px 10px;text-decoration:none}.item-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.item{display:block;text-decoration:none;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.item:hover{border-color:var(--gold)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--gold)}code{overflow-wrap:anywhere}footer{padding:32px 0 58px;color:var(--muted)}
</style></head><body data-phase3-preview-route="${escapeHtml(route)}"><header><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><p class="boundary">Isolated Phase 3 preview only. No route has moved, no section is locked, no authentication or entitlement is active, and no payment is taken.</p></header><main>${body}</main><footer>Matrix Reprogrammed · Phase 3 structural preview · isolated beneath <code>/__preview/phase3/</code></footer></body></html>`;
}

function routeToOutput(route) {
  const clean = route.replace(/^\//, '');
  return `site/${clean}`;
}

function addRoute(routes, inbound, route, type, id, sourcePath, title) {
  if (routes.some(item => item.route === route)) throw new Error(`Duplicate preview route: ${route}`);
  routes.push({ route, outputFile: routeToOutput(route), type, canonicalId: id || null, sourcePath: sourcePath || null, title });
  if (!inbound.has(route)) inbound.set(route, 0);
}

function link(inbound, route, label, className = '') {
  inbound.set(route, (inbound.get(route) || 0) + 1);
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(route)}">${escapeHtml(label)}</a>`;
}

function publicRoute(row) {
  return `/__preview/phase3/items/public/${safeSegment(row.canonicalId)}.html`;
}

function targetRoute(row) {
  return `/__preview/phase3/items/target/${safeSegment(row.targetAccessClass)}/${safeSegment(row.canonicalId)}.html`;
}

function categoryRoute(category) {
  return `/__preview/phase3/categories/${safeSegment(category)}/index.html`;
}

function accessRoute(accessClass) {
  return `/__preview/phase3/access/${safeSegment(accessClass)}/index.html`;
}

function publicItemPage(row, classification, lockRow, inbound) {
  const target = targetRoute(row);
  const category = categoryRoute(row.primaryCategory);
  const access = accessRoute(row.targetAccessClass);
  const publicView = row.views.public;
  const targetLabel = row.minimumTier || row.targetAccessClass;
  const body = `<div class="nav">${link(inbound, '/__preview/phase3/index.html', 'Programme index')}${link(inbound, category, titleCase(row.primaryCategory))}${link(inbound, access, titleCase(row.targetAccessClass))}${link(inbound, target, 'Target-access review')}</div>
${badges([row.contentType,row.primaryCategory,row.primarySubcategory,row.targetAccessClass,row.minimumTier])}
<div class="grid">
${card('Route identity', `<p><strong>Current:</strong> <code>${escapeHtml(row.currentRoute)}</code></p><p><strong>Proposed:</strong> <code>${escapeHtml(row.proposedCanonicalRoute)}</code></p><p><strong>Canonical ID:</strong> <code>${escapeHtml(row.canonicalId)}</code></p><p><strong>Owner:</strong> ${escapeHtml(row.editorialOwner)}</p>`, 'public')}
${card('Public access decision', `<p><strong>State:</strong> ${escapeHtml(titleCase(publicView.state))}</p><p><strong>Target:</strong> ${escapeHtml(titleCase(targetLabel))}</p><p><strong>Public preview required:</strong> ${row.publicPreviewRequired ? 'Yes' : 'No'}</p><p><strong>Interpretive rule:</strong> ${escapeHtml(titleCase(row.interpretiveBoundaryRule))}</p>`, 'public')}
</div>
<div class="grid">
${card('Publicly visible sections', list(publicView.sections), 'public')}
${card('Never-paywall safety sections', list(row.neverPaywallSections), 'public')}
</div>
<div class="grid">
${card('Public tools', list(publicView.tools), 'public')}
${card('Public downloads', list(publicView.downloads), 'public')}
</div>
${card('Factual-status invariant', `<p>Access tier cannot change these fields:</p>${list(row.factualStatusInvariant.fields)}<p><strong>Invariant key:</strong> <code>${escapeHtml(row.factualStatusInvariant.invariantKey)}</code></p>`, 'public')}
${card('Simulated anonymous decision', `<p><strong>Page:</strong> ${escapeHtml(titleCase(lockRow.contexts.anonymous.page.state))}</p><p><strong>Protected section:</strong> ${escapeHtml(titleCase(lockRow.contexts.anonymous.section.state))}</p><p><strong>Public search:</strong> ${escapeHtml(titleCase(lockRow.contexts.anonymous.public_search.state))}</p>`, 'review')}
${classification.reviewFlags?.length ? card('Migration review flags', list(classification.reviewFlags), 'review') : ''}`;
  return page({ title: row.title, eyebrow: 'Public structural preview', body, route: publicRoute(row) });
}

function targetItemPage(row, classification, lockRow, tierPolicy, inbound) {
  const category = categoryRoute(row.primaryCategory);
  const access = accessRoute(row.targetAccessClass);
  const publicExists = !['internal_only','restricted_sensitive'].includes(row.targetAccessClass);
  const publicLink = publicExists ? link(inbound, publicRoute(row), 'Public preview') : '';
  let targetView;
  if (row.targetAccessClass === 'internal_only' || row.targetAccessClass === 'restricted_sensitive') targetView = row.views.research_pro_9;
  else if (row.targetAccessClass === 'separate_product') targetView = row.views.public;
  else targetView = row.views[row.minimumTier || 'public'];
  const accessContext = row.targetAccessClass === 'internal_only'
    ? 'operations_reviewer'
    : row.targetAccessClass === 'restricted_sensitive'
      ? 'sensitive_content_reviewer'
      : row.targetAccessClass === 'separate_product'
        ? 'matching_product_purchase'
        : row.minimumTier === 'research_pro_9'
          ? 'research_pro'
          : row.minimumTier === 'intelligence_6'
            ? 'intelligence_member'
            : row.minimumTier === 'supporter_3'
              ? 'supporter'
              : 'registered';
  const simulated = lockRow.contexts[accessContext];
  const body = `<div class="nav">${link(inbound, '/__preview/phase3/index.html', 'Programme index')}${link(inbound, category, titleCase(row.primaryCategory))}${link(inbound, access, titleCase(row.targetAccessClass))}${publicLink}</div>
${badges([row.contentType,row.primaryCategory,row.primarySubcategory,row.targetAccessClass,row.minimumTier])}
<div class="grid">
${card('Target access', `<p><strong>Access class:</strong> ${escapeHtml(titleCase(row.targetAccessClass))}</p><p><strong>Minimum tier:</strong> ${escapeHtml(titleCase(row.minimumTier || 'special access'))}</p><p><strong>Review context:</strong> ${escapeHtml(titleCase(accessContext))}</p><p><strong>Simulated page decision:</strong> ${escapeHtml(titleCase(simulated.page.state))}</p><p><strong>Enforcement:</strong> Disabled</p>`, 'private')}
${card('Route identity', `<p><strong>Current:</strong> <code>${escapeHtml(row.currentRoute)}</code></p><p><strong>Proposed:</strong> <code>${escapeHtml(row.proposedCanonicalRoute)}</code></p><p><strong>Owner:</strong> ${escapeHtml(row.editorialOwner)}</p>`, 'private')}
</div>
<div class="grid">
${card('Sections visible at target', list(targetView.sections), 'private')}
${card('Tools visible at target', list(targetView.tools), 'private')}
${card('Downloads visible at target', list(targetView.downloads), 'private')}
</div>
${card('Delivery rights', `<table><thead><tr><th>Channel</th><th>Enabled</th></tr></thead><tbody>${Object.entries(targetView.delivery).map(([channel,enabled]) => `<tr><td>${escapeHtml(titleCase(channel))}</td><td>${enabled ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table>`, 'private')}
${card('Tier additions', `<div class="grid">${tierPolicy.tierOrder.map(tier => `<div><h3>${escapeHtml(titleCase(tier))}</h3>${list(lockRow.tierAdditions[tier])}</div>`).join('')}</div>`, 'private')}
${card('Factual and interpretive boundaries', `<p><strong>Tier-mutable factual status:</strong> No</p><p><strong>Interpretive rule:</strong> ${escapeHtml(titleCase(row.interpretiveBoundaryRule))}</p>${list(row.neverPaywallSections)}`, 'public')}
${classification.reviewFlags?.length ? card('Migration review flags', list(classification.reviewFlags), 'review') : ''}`;
  return page({ title: row.title, eyebrow: 'Target-access structural review', body, route: targetRoute(row) });
}

runLockedSimulation();
const policy = readJson(policyPath);
const taxonomy = readJson(taxonomyPath);
const tierPolicy = readJson(tierPolicyPath);
const matrix = readJson(tierMatrixPath);
const classification = readJson(classificationPath);
const locks = readJson(lockPath);
if (policy.mode !== 'preview-only' || taxonomy.mode !== 'report-only' || tierPolicy.mode !== 'report-only' || matrix.mode !== 'report-only' || classification.mode !== 'report-only' || locks.mode !== 'simulation-only') {
  throw new Error('Phase 3 preview requires preview-only/report-only/simulation-only inputs.');
}
if (!matrix.ok || !classification.ok || !locks.ok) throw new Error('One or more Phase 3 upstream packages are not healthy.');
if (matrix.rows.length !== classification.rows.length || matrix.rows.length !== locks.rows.length) throw new Error('Phase 3 upstream coverage differs.');

fs.rmSync(outputDir, { recursive: true, force: true });
const classById = new Map(classification.rows.map(row => [row.canonicalId,row]));
const lockById = new Map(locks.rows.map(row => [row.canonicalId,row]));
const routes = [];
const inbound = new Map();
const catalogue = [];

const indexRoute = '/__preview/phase3/index.html';
addRoute(routes, inbound, indexRoute, 'programme_index', null, null, 'Phase 3 Content Migration Preview');

const categories = unique(matrix.rows.map(row => row.primaryCategory)).sort();
const accessClasses = unique(matrix.rows.map(row => row.targetAccessClass)).sort();
for (const category of categories) addRoute(routes, inbound, categoryRoute(category), 'category_hub', null, null, titleCase(category));
for (const accessClass of accessClasses) addRoute(routes, inbound, accessRoute(accessClass), 'access_hub', null, null, titleCase(accessClass));

for (const row of matrix.rows) {
  const classificationRow = classById.get(row.canonicalId);
  const lockRow = lockById.get(row.canonicalId);
  if (!classificationRow || !lockRow) throw new Error(`${row.canonicalId}: upstream row missing`);
  const target = targetRoute(row);
  addRoute(routes, inbound, target, 'target_item_preview', row.canonicalId, row.sourcePath, row.title);
  writeFile(routeToOutput(target), targetItemPage(row, classificationRow, lockRow, tierPolicy, inbound));
  let publicPreviewRoute = null;
  if (!['internal_only','restricted_sensitive'].includes(row.targetAccessClass)) {
    publicPreviewRoute = publicRoute(row);
    addRoute(routes, inbound, publicPreviewRoute, 'public_item_preview', row.canonicalId, row.sourcePath, row.title);
    writeFile(routeToOutput(publicPreviewRoute), publicItemPage(row, classificationRow, lockRow, inbound));
  }
  catalogue.push({
    canonicalId: row.canonicalId,
    sourcePath: row.sourcePath,
    currentRoute: row.currentRoute,
    proposedCanonicalRoute: row.proposedCanonicalRoute,
    title: row.title,
    contentType: row.contentType,
    primaryCategory: row.primaryCategory,
    primarySubcategory: row.primarySubcategory,
    editorialOwner: row.editorialOwner,
    targetAccessClass: row.targetAccessClass,
    minimumTier: row.minimumTier,
    publicPreviewRoute,
    targetPreviewRoute: target,
    reviewFlags: classificationRow.reviewFlags,
    migrationState: 'preview_generated'
  });
}

for (const category of categories) {
  const items = catalogue.filter(item => item.primaryCategory === category).sort((left,right) => left.title.localeCompare(right.title));
  const body = `<div class="nav">${link(inbound, indexRoute, 'Programme index')}</div>${badges([category, `${items.length} items`])}<div class="item-list">${items.map(item => {
    const route = item.publicPreviewRoute || item.targetPreviewRoute;
    return link(inbound, route, `<strong>${item.title}</strong><br><span class="muted">${titleCase(item.primarySubcategory)} · ${titleCase(item.targetAccessClass)}</span>`, 'item');
  }).join('')}</div>`;
  writeFile(routeToOutput(categoryRoute(category)), page({ title: titleCase(category), eyebrow: 'Canonical category hub', body, route: categoryRoute(category) }));
}

for (const accessClass of accessClasses) {
  const items = catalogue.filter(item => item.targetAccessClass === accessClass).sort((left,right) => left.title.localeCompare(right.title));
  const body = `<div class="nav">${link(inbound, indexRoute, 'Programme index')}</div>${badges([accessClass, `${items.length} items`])}<div class="item-list">${items.map(item => link(inbound, item.targetPreviewRoute, `<strong>${item.title}</strong><br><span class="muted">${titleCase(item.primaryCategory)} · ${titleCase(item.minimumTier || 'special access')}</span>`, 'item')).join('')}</div>`;
  writeFile(routeToOutput(accessRoute(accessClass)), page({ title: titleCase(accessClass), eyebrow: 'Target access hub', body, route: accessRoute(accessClass) }));
}

const reviewItems = catalogue.filter(item => item.reviewFlags?.length).sort((left,right) => right.reviewFlags.length - left.reviewFlags.length || left.title.localeCompare(right.title));
const reviewRoute = '/__preview/phase3/review/index.html';
addRoute(routes, inbound, reviewRoute, 'migration_review_hub', null, null, 'Migration Review Queue');
const reviewBody = `<div class="nav">${link(inbound, indexRoute, 'Programme index')}</div>${badges([`${reviewItems.length} review items`])}<div class="item-list">${reviewItems.map(item => link(inbound, item.targetPreviewRoute, `<strong>${item.title}</strong><br><span class="muted">${item.reviewFlags.map(titleCase).join(' · ')}</span>`, 'item')).join('')}</div>`;
writeFile(routeToOutput(reviewRoute), page({ title: 'Migration Review Queue', eyebrow: 'Phase 3 editorial review', body: reviewBody, route: reviewRoute }));

const indexBody = `<div class="grid">
${card('Coverage', `<p><strong>${catalogue.length}</strong> important items</p><p><strong>${catalogue.filter(item => item.publicPreviewRoute).length}</strong> public structural previews</p><p><strong>${catalogue.length}</strong> target-access reviews</p><p><strong>${reviewItems.length}</strong> review-queue items</p>`, 'public')}
${card('Safety boundary', `<p>All pages are static, noindexed and structural. They contain no forms, executable scripts, private body content, access enforcement or payment code.</p>`, 'public')}
</div>
${card('Canonical categories', `<div class="item-list">${categories.map(category => link(inbound, categoryRoute(category), `<strong>${titleCase(category)}</strong><br><span class="muted">${catalogue.filter(item => item.primaryCategory === category).length} items</span>`, 'item')).join('')}</div>`, 'public')}
${card('Target access classes', `<div class="item-list">${accessClasses.map(accessClass => link(inbound, accessRoute(accessClass), `<strong>${titleCase(accessClass)}</strong><br><span class="muted">${catalogue.filter(item => item.targetAccessClass === accessClass).length} items</span>`, 'item')).join('')}</div>`, 'private')}
${card('Editorial migration review', `<p>${link(inbound, reviewRoute, `Open ${reviewItems.length}-item review queue`)}</p>`, 'review')}`;
writeFile(routeToOutput(indexRoute), page({ title: 'Phase 3 Content Migration Preview', eyebrow: 'Categorisation, access and route review', body: indexBody, route: indexRoute }));

const orphanRoutes = routes.filter(route => route.route !== indexRoute && (inbound.get(route.route) || 0) === 0).map(route => route.route);
const htmlRoutes = routes.filter(route => route.outputFile.endsWith('.html'));
const safetyErrors = [];
for (const route of htmlRoutes) {
  const html = fs.readFileSync(path.join(outputDir, route.outputFile), 'utf8');
  if (!html.includes('noindex,nofollow,noarchive')) safetyErrors.push(`${route.route}: noindex missing`);
  if (!html.includes('data-phase3-preview-route=')) safetyErrors.push(`${route.route}: preview marker missing`);
  if (/<script|<form/i.test(html)) safetyErrors.push(`${route.route}: executable script or form detected`);
  if (/createSubscription|checkout-intent|paypal\.buttons|fetch\s*\(|XMLHttpRequest|\/api\//i.test(html)) safetyErrors.push(`${route.route}: active service marker detected`);
}
if (orphanRoutes.length) safetyErrors.push(...orphanRoutes.map(route => `${route}: orphan preview route`));

writeJson('catalogue.json', { ok: true, mode: 'preview-only', generatedAt: matrix.generatedAt, recordCount: catalogue.length, records: catalogue });
writeJson('route-manifest.json', { ok: safetyErrors.length === 0, mode: 'preview-only', generatedAt: matrix.generatedAt, namespace: policy.namespace, routeCount: routes.length, routes });
writeJson('navigation-report.json', { ok: orphanRoutes.length === 0, mode: 'preview-only', generatedAt: matrix.generatedAt, routeCount: routes.length, orphanCount: orphanRoutes.length, orphanRoutes, inboundCounts: Object.fromEntries([...inbound.entries()].sort()) });

const artifactHashes = {};
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else out.push(target);
  }
  return out;
}
for (const file of walk(outputDir).sort()) {
  const relative = path.relative(outputDir, file).split(path.sep).join('/');
  if (relative !== 'manifest.json') artifactHashes[relative] = sha256(fs.readFileSync(file));
}
const summary = {
  importantItems: catalogue.length,
  publicItemPreviews: catalogue.filter(item => item.publicPreviewRoute).length,
  targetItemPreviews: catalogue.length,
  categoryHubs: categories.length,
  accessHubs: accessClasses.length,
  reviewQueueItems: reviewItems.length,
  htmlPages: htmlRoutes.length,
  totalRoutes: routes.length,
  orphanRoutes: orphanRoutes.length,
  safetyErrors: safetyErrors.length,
  byCategory: countBy(catalogue, item => item.primaryCategory),
  byAccessClass: countBy(catalogue, item => item.targetAccessClass)
};
const manifest = {
  ok: safetyErrors.length === 0,
  mode: 'preview-only',
  version: policy.version,
  generatedAt: matrix.generatedAt,
  namespace: policy.namespace,
  routeMovement: false,
  redirectActivation: false,
  searchMutation: false,
  navigationMutation: false,
  lockedSectionEnforcement: false,
  authenticationActivation: false,
  entitlementActivation: false,
  emailDeliveryActivation: false,
  paymentActivation: false,
  contentMutation: false,
  summary,
  safetyErrors,
  artifactHashes,
  boundary: 'Static isolated previews only. No live route, search index, navigation, access system, email system or payment system is changed.'
};
writeJson('manifest.json', manifest);
writeFile('README.md', `# Phase 3 Preview Generation\n\n- Important items: ${summary.importantItems}\n- Public previews: ${summary.publicItemPreviews}\n- Target previews: ${summary.targetItemPreviews}\n- HTML pages: ${summary.htmlPages}\n- Orphans: ${summary.orphanRoutes}\n- Safety errors: ${summary.safetyErrors}\n\n${manifest.boundary}\n`);

console.log(`PHASE 3 PREVIEW: ${summary.htmlPages} static pages; ${summary.orphanRoutes} orphans; ${summary.safetyErrors} safety errors.`);
console.log(`Output: ${outputDir}`);
if (!manifest.ok) process.exit(1);
