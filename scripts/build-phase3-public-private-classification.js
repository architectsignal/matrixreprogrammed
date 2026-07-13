const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = process.env.PHASE3_CLASSIFICATION_OUTPUT_DIR
  ? path.resolve(process.env.PHASE3_CLASSIFICATION_OUTPUT_DIR)
  : path.join(root, 'downloads', 'phase3-public-private-classification');
const taxonomyPath = path.join(root, 'data', 'phase3-canonical-taxonomy.json');
const policyPath = path.join(root, 'data', 'phase3-public-private-policy.json');
const refinedReportPath = path.join(root, 'downloads', 'phase2a-route-family-review-map.json');

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

function writeJson(name, value) {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, name), stableJson(value));
}

function writeText(name, value) {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, name), value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function runRefinedClassifier() {
  const result = spawnSync(process.execPath, ['scripts/refine-content-tier-review-map.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Refined route classifier failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}

function sourceCheckpoint() {
  const result = spawnSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '1970-01-01T00:00:00.000Z';
}

function normalizePath(value) {
  return String(value || '').split(path.sep).join('/');
}

function safeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'item';
}

function canonicalId(file) {
  return `content:${sha256(normalizePath(file)).slice(0, 20)}`;
}

function contentText(file, maxBytes = 500000) {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || path.extname(file).toLowerCase() !== '.html') return '';
  return fs.readFileSync(target, 'utf8').slice(0, maxBytes);
}

function markerMatches(file, content, markers) {
  const fileLower = file.toLowerCase();
  const contentLower = content.toLowerCase();
  return markers.filter(marker => fileLower.includes(String(marker).toLowerCase()) || contentLower.includes(String(marker).toLowerCase()));
}

function mapCategory(row, taxonomy) {
  if (row.category === 'uncategorized') return { category: 'migration_review', subcategory: 'needs_editorial_owner' };
  const category = taxonomy.primaryCategories[row.category];
  if (!category) return { category: 'migration_review', subcategory: 'route_conflict' };
  if (!Object.prototype.hasOwnProperty.call(category.subcategories, row.subcategory)) {
    return { category: 'migration_review', subcategory: 'route_conflict' };
  }
  return { category: row.category, subcategory: row.subcategory };
}

function inferContentType(row, category, subcategory, policy, taxonomy) {
  const extension = path.extname(row.file).toLowerCase();
  for (const rule of policy.contentTypeRules) {
    if (rule.whenCategory && rule.whenCategory !== category) continue;
    if (rule.whenSubcategory && rule.whenSubcategory !== subcategory) continue;
    if (rule.whenSubcategoryAny && !rule.whenSubcategoryAny.includes(subcategory)) continue;
    if (rule.whenSubcategoryContains && !subcategory.includes(rule.whenSubcategoryContains)) continue;
    if (rule.whenExtensionAny && !rule.whenExtensionAny.includes(extension)) continue;
    if (taxonomy.canonicalContentTypes[rule.contentType]) return rule.contentType;
  }
  if (row.fileType === 'download_or_document') return 'download_bundle';
  if (/hub|index/i.test(row.file) || row.file === 'index.html') return 'hub';
  if (/map|graph/i.test(row.file)) return 'map_or_graph';
  if (/timeline/i.test(row.file)) return 'timeline';
  if (/tracker|watchlist/i.test(row.file)) return 'tracker';
  if (/card/i.test(row.file)) return 'card';
  if (/brief/i.test(row.file)) return 'brief';
  return 'landing_page';
}

function proposedCanonicalRoute(row, category, subcategory, contentType, taxonomy) {
  const currentRoute = row.route || `/${normalizePath(row.file)}`;
  if (category === 'internal' || category === 'restricted') return currentRoute;
  if (contentType === 'book_or_product' || category === 'commercial') return currentRoute;
  if (contentType === 'legal_or_trust_page' || category === 'trust_and_legal') return currentRoute;
  const base = path.basename(row.file, path.extname(row.file));
  const slug = safeSegment(base === 'index' ? row.title : base);
  const categorySlug = category.replaceAll('_', '-');
  const subcategorySlug = subcategory.replaceAll('_', '-');
  return `/${categorySlug}/${subcategorySlug}/${slug}/`;
}

function targetAccessClass(row, mapped, content, policy) {
  const restrictedMarkers = markerMatches(row.file, content, [...policy.restrictedPathMarkers, ...policy.restrictedContentMarkers]);
  if (restrictedMarkers.length) return { accessClass: 'restricted_sensitive', restrictedMarkers, reason: 'Explicit restricted-content marker matched.' };
  const internalMarkers = markerMatches(row.file, '', policy.internalPathMarkers);
  if (mapped.category === 'internal' || row.recommendedTier === 'internal_only') {
    return { accessClass: 'internal_only', restrictedMarkers: [], internalMarkers, reason: 'Classified as internal operations.' };
  }
  if (policy.publicEntryRoutes.includes(row.file)) {
    return { accessClass: 'public_core', restrictedMarkers: [], internalMarkers, reason: 'Public account, membership or discovery entry route.' };
  }
  if (policy.publicCoreCategories.includes(mapped.category) || policy.publicCoreSubcategories.includes(mapped.subcategory)) {
    return { accessClass: 'public_core', restrictedMarkers: [], internalMarkers, reason: 'Trust, legal, evidence or correction content must remain public.' };
  }
  const configured = policy.tierToAccessClass[row.recommendedTier] || 'public_core';
  return { accessClass: configured, restrictedMarkers: [], internalMarkers, reason: `Mapped from recommended tier ${row.recommendedTier}.` };
}

function currentVisibility(row) {
  if (row.fileType === 'html_route') return 'existing_route_unenforced';
  return 'existing_asset_unenforced';
}

function previewDecision(accessClass, row, policy) {
  const paid = policy.paidAccessClasses.includes(accessClass);
  if (!paid) return { required: false, accessClass: null, status: 'not_required' };
  const boundaryReady = Boolean(row.safetyBoundaryPresent);
  return {
    required: true,
    accessClass: 'public_preview',
    status: boundaryReady ? 'required_not_generated_boundary_detected' : 'required_not_generated_boundary_missing'
  };
}

function currentRouteAccessClass(accessClass, preview, row, policy) {
  if (preview.required && policy.currentRouteRules.paidTargetRemainsPublicPreviewUntilEnforcement) return 'public_preview';
  if (accessClass === 'registered_private' && policy.currentRouteRules.registeredAccountPagesMayRemainPublicEntryButPrivateAfterAuthentication && /login|register|confirm|unsubscribe/i.test(row.file)) return 'public_core';
  return accessClass;
}

function editorialOwner(category, taxonomy) {
  return taxonomy.primaryCategories[category]?.defaultEditorialOwner || taxonomy.primaryCategories.migration_review.defaultEditorialOwner;
}

runRefinedClassifier();
const taxonomy = readJson(taxonomyPath);
const policy = readJson(policyPath);
const refined = readJson(refinedReportPath);
if (taxonomy.mode !== 'report-only' || policy.mode !== 'report-only' || refined.mode !== 'report-only') throw new Error('Phase 3 classification requires report-only inputs.');
if (!refined.ok) throw new Error('Refined route map is not healthy.');

const generatedAt = sourceCheckpoint();
const rows = [];
const conflicts = [];
for (const row of refined.rows) {
  const content = contentText(row.file);
  const mapped = mapCategory(row, taxonomy);
  const contentType = inferContentType(row, mapped.category, mapped.subcategory, policy, taxonomy);
  const target = targetAccessClass(row, mapped, content, policy);
  const preview = previewDecision(target.accessClass, row, policy);
  const currentAccess = currentRouteAccessClass(target.accessClass, preview, row, policy);
  const accessDefinition = taxonomy.accessClasses[target.accessClass];
  const currentAccessDefinition = taxonomy.accessClasses[currentAccess];
  if (!accessDefinition || !currentAccessDefinition) {
    conflicts.push({ file: row.file, type: 'unknown_access_class', targetAccessClass: target.accessClass, currentAccessClass: currentAccess });
  }
  const proposedRoute = proposedCanonicalRoute(row, mapped.category, mapped.subcategory, contentType, taxonomy);
  const reviewFlags = [...row.reviewFlags];
  if (mapped.category === 'migration_review') reviewFlags.push(policy.reviewFlags.uncategorized);
  if (preview.required) reviewFlags.push(policy.reviewFlags.paidWithoutPublicPreview);
  if (preview.required && !row.safetyBoundaryPresent) reviewFlags.push(policy.reviewFlags.paidWithoutSafetyBoundary);
  if (target.accessClass === 'restricted_sensitive') reviewFlags.push(policy.reviewFlags.restrictedCandidate);
  if (target.accessClass === 'internal_only' && row.fileType === 'html_route') reviewFlags.push(policy.reviewFlags.internalPublicRoute);
  if (row.currentSignals?.activePaymentMarkers?.length) reviewFlags.push(policy.reviewFlags.activePaymentMarker);
  if (target.accessClass === 'public_core' && row.currentSignals?.accountOrAuthMarker && !policy.publicEntryRoutes.includes(row.file)) reviewFlags.push(policy.reviewFlags.authMarkerOnPublicCore);
  if (target.internalMarkers?.length && mapped.category !== 'internal') reviewFlags.push(policy.reviewFlags.classificationConflict);

  rows.push({
    canonicalId: canonicalId(row.file),
    sourcePath: row.file,
    currentRoute: row.route || `/${normalizePath(row.file)}`,
    proposedCanonicalRoute: proposedRoute,
    title: row.title,
    important: true,
    fileType: row.fileType,
    contentType,
    primaryCategory: mapped.category,
    primarySubcategory: mapped.subcategory,
    originalCategory: row.category,
    originalSubcategory: row.subcategory,
    editorialOwner: editorialOwner(mapped.category, taxonomy),
    currentVisibility: currentVisibility(row),
    currentAccessClass: currentAccess,
    targetAccessClass: target.accessClass,
    targetVisibility: accessDefinition?.visibility || 'unknown',
    targetMinimumTier: accessDefinition?.minimumTier || row.recommendedTier || null,
    publicPreview: preview,
    recommendedTier: row.recommendedTier,
    searchDecision: policy.searchDecisions[target.accessClass],
    publicCompanionSearchDecision: preview.required ? policy.searchDecisions.public_preview : null,
    navigationDecision: policy.navigationDecisions[target.accessClass],
    publicCompanionNavigationDecision: preview.required ? policy.navigationDecisions.public_preview : null,
    safetyBoundaryPresent: row.safetyBoundaryPresent,
    activePaymentMarkers: row.currentSignals?.activePaymentMarkers || [],
    restrictedMarkers: target.restrictedMarkers || [],
    internalMarkers: target.internalMarkers || [],
    classificationReason: target.reason,
    selectedTaxonomyRule: row.selectedRule,
    classificationConfidence: row.confidence,
    exactContentHash: row.hash,
    reviewFlags: [...new Set(reviewFlags)],
    migrationState: 'privacy_classified',
    enforcementState: 'recommendation_only',
    protectedActions: {
      visibilityChanged: false,
      routeMoved: false,
      redirectActivated: false,
      searchRemoved: false,
      navigationRemoved: false,
      authenticationActivated: false,
      entitlementActivated: false,
      paymentActivated: false
    }
  });
}

const hashGroups = new Map();
for (const row of rows) {
  if (!hashGroups.has(row.exactContentHash)) hashGroups.set(row.exactContentHash, []);
  hashGroups.get(row.exactContentHash).push(row.canonicalId);
}
for (const row of rows) {
  const group = hashGroups.get(row.exactContentHash) || [];
  row.exactHashDuplicateCandidates = group.length > 1 ? group.filter(id => id !== row.canonicalId) : [];
  if (row.exactHashDuplicateCandidates.length) row.reviewFlags.push('phase3-exact-hash-duplicate-review');
}

const summary = {
  totalItems: rows.length,
  importantItems: rows.filter(row => row.important).length,
  byTargetAccessClass: countBy(rows, row => row.targetAccessClass),
  byCurrentAccessClass: countBy(rows, row => row.currentAccessClass),
  byCategory: countBy(rows, row => row.primaryCategory),
  bySubcategory: countBy(rows, row => row.primarySubcategory),
  byContentType: countBy(rows, row => row.contentType),
  bySearchDecision: countBy(rows, row => row.searchDecision),
  byNavigationDecision: countBy(rows, row => row.navigationDecision),
  publicCore: rows.filter(row => row.targetAccessClass === 'public_core').length,
  publicPreviewCompanionsRequired: rows.filter(row => row.publicPreview.required).length,
  registeredPrivate: rows.filter(row => row.targetAccessClass === 'registered_private').length,
  paidPrivate: rows.filter(row => policy.paidAccessClasses.includes(row.targetAccessClass)).length,
  separateProducts: rows.filter(row => row.targetAccessClass === 'separate_product').length,
  internalOnly: rows.filter(row => row.targetAccessClass === 'internal_only').length,
  restrictedSensitive: rows.filter(row => row.targetAccessClass === 'restricted_sensitive').length,
  unresolvedTaxonomy: rows.filter(row => row.primaryCategory === 'migration_review').length,
  exactHashDuplicateCandidates: rows.filter(row => row.exactHashDuplicateCandidates.length).length,
  routesNeedingReview: rows.filter(row => row.reviewFlags.length).length,
  conflicts: conflicts.length
};
const report = {
  ok: conflicts.length === 0 && rows.length === refined.rows.length,
  mode: 'report-only',
  version: policy.version,
  generatedAt,
  taxonomyVersion: taxonomy.version,
  paymentActivation: false,
  visibilityEnforcement: false,
  routeMovement: false,
  redirectActivation: false,
  searchRemoval: false,
  navigationRemoval: false,
  authenticationActivation: false,
  entitlementActivation: false,
  boundary: 'This report classifies public and private targets only. It does not move, hide, lock, redirect, deindex, authenticate, grant entitlements or activate payment.',
  summary,
  conflicts,
  rows
};

writeJson('classification.json', report);
writeJson('public-items.json', {
  ok: true,
  mode: 'report-only',
  generatedAt,
  recordCount: rows.filter(row => ['public_core', 'public_preview', 'separate_product'].includes(row.currentAccessClass)).length,
  records: rows.filter(row => ['public_core', 'public_preview', 'separate_product'].includes(row.currentAccessClass))
});
writeJson('private-items.json', {
  ok: true,
  mode: 'report-only',
  generatedAt,
  recordCount: rows.filter(row => ['registered_private', 'supporter_private', 'intelligence_private', 'research_pro_private'].includes(row.targetAccessClass)).length,
  records: rows.filter(row => ['registered_private', 'supporter_private', 'intelligence_private', 'research_pro_private'].includes(row.targetAccessClass))
});
writeJson('internal-and-restricted-items.json', {
  ok: true,
  mode: 'report-only',
  generatedAt,
  recordCount: rows.filter(row => ['internal_only', 'restricted_sensitive'].includes(row.targetAccessClass)).length,
  records: rows.filter(row => ['internal_only', 'restricted_sensitive'].includes(row.targetAccessClass))
});
writeJson('review-queue.json', {
  ok: true,
  mode: 'report-only',
  generatedAt,
  recordCount: rows.filter(row => row.reviewFlags.length).length,
  records: rows.filter(row => row.reviewFlags.length).sort((left, right) => right.reviewFlags.length - left.reviewFlags.length || left.sourcePath.localeCompare(right.sourcePath))
});
const lines = [
  '# Phase 3 Public And Private Classification',
  '',
  `Generated: ${generatedAt}`,
  `Mode: ${report.mode}`,
  '',
  '## Safety boundary',
  '',
  report.boundary,
  '',
  '## Coverage',
  '',
  `- Items classified: ${summary.totalItems}`,
  `- Public core: ${summary.publicCore}`,
  `- Public-preview companions required: ${summary.publicPreviewCompanionsRequired}`,
  `- Registered private: ${summary.registeredPrivate}`,
  `- Paid private: ${summary.paidPrivate}`,
  `- Separate products: ${summary.separateProducts}`,
  `- Internal only: ${summary.internalOnly}`,
  `- Restricted-sensitive candidates: ${summary.restrictedSensitive}`,
  `- Unresolved taxonomy: ${summary.unresolvedTaxonomy}`,
  `- Exact-hash duplicate candidates: ${summary.exactHashDuplicateCandidates}`,
  `- Review queue: ${summary.routesNeedingReview}`,
  '',
  '## Target access classes',
  '',
  ...Object.entries(summary.byTargetAccessClass).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Primary categories',
  '',
  ...Object.entries(summary.byCategory).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Activation boundary',
  '',
  'No classification is enforced. Locked-section logic, previews, redirects, search changes and navigation changes require later Phase 3 packages.'
];
writeText('summary.md', lines.join('\n') + '\n');

console.log(`PHASE 3 PUBLIC/PRIVATE CLASSIFICATION: ${summary.totalItems} items; ${summary.unresolvedTaxonomy} unresolved; ${summary.publicPreviewCompanionsRequired} public previews required.`);
console.log(`Output: ${outputDir}`);
if (!report.ok) process.exit(1);
