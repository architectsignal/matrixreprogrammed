const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const outputDir = path.join(root, 'downloads');
const policyPath = 'data/content-tier-taxonomy-policy.json';
const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const supportedDocumentExtensions = new Set(['.pdf', '.csv', '.zip', '.docx']);
const generatedOutputPrefixes = [
  'downloads/phase0-',
  'downloads/phase1-',
  'downloads/phase2-',
  'downloads/phase2a-',
  'downloads/phase2b-',
  'downloads/phase3-',
  'downloads/canonical-preview-bundle/',
  'downloads/canonical-tier-projections/',
  'downloads/conclusion-review-preview/',
  'downloads/conclusion-engine-preview/',
  'downloads/evidence-delta-preview/'
];
const generatedOutputNames = new Set([
  'non-mutation-report.json',
  'source-hashes-before.json',
  'source-hashes-after.json',
  'route-manifest.json',
  'navigation-report.json',
  'decision-summary.json',
  'principal-channel-matrix.json',
  'competition-report.json',
  'coverage-report.json',
  'zero-count-report.json',
  'protected-boundary-report.json',
  'readiness.json'
]);

function full(rel) { return path.join(root, rel); }
function read(rel) { return fs.readFileSync(full(rel), 'utf8'); }
function readJson(rel) { return JSON.parse(read(rel)); }
function normalize(rel) { return rel.split(path.sep).join('/'); }
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else out.push(normalize(path.relative(root, target)));
  }
  return out;
}
function isGeneratedOutput(file) {
  const lower = file.toLowerCase();
  if (generatedOutputPrefixes.some(prefix => lower.startsWith(prefix))) return true;
  return generatedOutputNames.has(path.basename(lower));
}
function hashFile(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(full(rel))).digest('hex').slice(0, 16);
}
function titleFromHtml(html, fallback) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || fallback;
  return String(title)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function termMatchesPath(fileLower, termRaw) {
  const term = String(termRaw).toLowerCase();
  if (term === 'test') return /(^|[/_.-])test([/_.-]|$)/.test(fileLower);
  return fileLower.includes(term);
}
function ruleMatches(rule, fileLower, contentLower) {
  const checks = [];
  if (Array.isArray(rule.pathEqualsAny)) checks.push(rule.pathEqualsAny.some(value => fileLower === String(value).toLowerCase()));
  if (Array.isArray(rule.pathStartsWithAny)) checks.push(rule.pathStartsWithAny.some(value => fileLower.startsWith(String(value).toLowerCase())));
  if (Array.isArray(rule.pathContainsAny)) checks.push(rule.pathContainsAny.some(value => termMatchesPath(fileLower, value)));
  if (Array.isArray(rule.contentContainsAny)) checks.push(rule.contentContainsAny.some(value => contentLower.includes(String(value).toLowerCase())));
  return checks.some(Boolean);
}
function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}
function paidTier(tier) {
  return ['supporter_3', 'intelligence_6', 'research_pro_9'].includes(tier);
}

const policy = readJson(policyPath);
if (policy.paymentStatus !== 'deferred') throw new Error('Content classification requires deferred payments.');
if (policy.enforcementMode !== 'report-only') throw new Error('Content classification requires report-only enforcement.');

const walkedFiles = walk(root);
const files = walkedFiles.filter(file => {
  if (isGeneratedOutput(file)) return false;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return true;
  if (supportedDocumentExtensions.has(ext)) return true;
  return ext === '.json' && file.startsWith('downloads/');
});
const rules = [...policy.rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
const rows = [];
const conflicts = [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const isHtml = ext === '.html';
  const content = isHtml ? read(file).slice(0, 500000) : '';
  const fileLower = file.toLowerCase();
  const contentLower = content.toLowerCase();
  const matches = rules.filter(rule => ruleMatches(rule, fileLower, contentLower));
  const topPriority = matches.length ? Number(matches[0].priority || 0) : null;
  const topMatches = matches.filter(rule => Number(rule.priority || 0) === topPriority);
  const selected = matches[0] || policy.fallback;
  const distinctTopDecisions = new Set(topMatches.map(rule => `${rule.category}|${rule.subcategory}|${rule.tier}`));
  if (distinctTopDecisions.size > 1) {
    conflicts.push({
      file,
      priority: topPriority,
      rules: topMatches.map(rule => ({ id: rule.id, category: rule.category, subcategory: rule.subcategory, tier: rule.tier }))
    });
  }

  const activePaymentMarkers = isHtml
    ? ['actions.subscription.create', '/api/paypal/checkout-intent', 'paypal.buttons', 'createSubscription'].filter(marker => contentLower.includes(marker.toLowerCase()))
    : [];
  const hasSafetyBoundary = !isHtml || /association is not guilt|evidence boundary|does not prove|not proof|what this does not establish|counter-evidence|correction/i.test(content);
  const reviewFlags = [];
  if (selected.tier === 'internal_only') reviewFlags.push('internal-candidate-review-before-route-change');
  if (paidTier(selected.tier) && !hasSafetyBoundary) reviewFlags.push('public-preview-and-safety-boundary-design-required');
  if (activePaymentMarkers.length) reviewFlags.push('active-payment-marker-review');
  if (selected.category === 'uncategorized') reviewFlags.push('editorial-owner-required');
  if (matches.length > 1) reviewFlags.push('multiple-taxonomy-rules-matched');
  if (distinctTopDecisions.size > 1) reviewFlags.push('same-priority-classification-conflict');

  rows.push({
    file,
    route: isHtml ? `/${file === 'index.html' ? '' : file}` : null,
    fileType: isHtml ? 'html_route' : 'download_or_document',
    title: isHtml ? titleFromHtml(content, path.basename(file, ext)) : path.basename(file),
    sizeBytes: fs.statSync(full(file)).size,
    hash: hashFile(file),
    category: selected.category,
    subcategory: selected.subcategory,
    recommendedTier: selected.tier,
    confidence: selected.confidence,
    selectedRule: selected.id || 'fallback',
    rationale: selected.rationale,
    allMatchedRules: matches.map(rule => rule.id),
    publicPreviewRequired: paidTier(selected.tier),
    safetyBoundaryPresent: hasSafetyBoundary,
    currentSignals: {
      accountOrAuthMarker: isHtml && /member-login|passwordless|request-link|auth\/|magic link/i.test(content),
      membershipMarker: isHtml && /membership|member dashboard|supporter|research pro|intelligence member/i.test(content),
      newsletterMarker: isHtml && /newsletter|subscribe|email capture|marketing consent/i.test(content),
      entitlementMarker: isHtml && /entitlement|minimumtier|data-tier|member-only|paywall/i.test(content),
      activePaymentMarkers
    },
    reviewFlags,
    status: 'recommendation_only'
  });
}

const ignoredGeneratedOutputs = walkedFiles.filter(file => isGeneratedOutput(file));
const summary = {
  totalClassified: rows.length,
  htmlRoutes: rows.filter(row => row.fileType === 'html_route').length,
  documentsAndDownloads: rows.filter(row => row.fileType === 'download_or_document').length,
  ignoredGeneratedOutputs: ignoredGeneratedOutputs.length,
  ignoredGeneratedHtmlOutputs: ignoredGeneratedOutputs.filter(file => path.extname(file).toLowerCase() === '.html').length,
  ignoredGeneratedJsonOutputs: ignoredGeneratedOutputs.filter(file => path.extname(file).toLowerCase() === '.json').length,
  byTier: countBy(rows, row => row.recommendedTier),
  byCategory: countBy(rows, row => row.category),
  bySubcategory: countBy(rows, row => row.subcategory),
  byConfidence: countBy(rows, row => row.confidence),
  uncategorized: rows.filter(row => row.category === 'uncategorized').length,
  internalCandidates: rows.filter(row => row.recommendedTier === 'internal_only').length,
  paidPreviewCandidates: rows.filter(row => paidTier(row.recommendedTier)).length,
  separateProducts: rows.filter(row => row.recommendedTier === 'separate_product').length,
  activePaymentMarkerRoutes: rows.filter(row => row.currentSignals.activePaymentMarkers.length).length,
  samePriorityConflicts: conflicts.length,
  routesNeedingReview: rows.filter(row => row.reviewFlags.length).length
};

const report = {
  ok: conflicts.length === 0,
  mode: 'report-only',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  inventoryBoundary: 'Generated report, audit, preview and simulation outputs are excluded from classification regardless of file type, so chained builds cannot recursively ingest their own HTML or JSON artifacts.',
  boundary: 'This classifier recommends categories and access tiers only. It does not move, rename, hide, delete, redirect, paywall, publish, authenticate or change any route.',
  summary,
  conflicts,
  rows
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'phase0-content-tier-classification.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Phase 0 Content Category And Tier Classification',
  '',
  `Generated: ${report.generatedAt}`,
  `Mode: ${report.mode}`,
  `Payments: ${report.paymentStatus}`,
  `Tier enforcement: ${report.enforcementMode}`,
  '',
  '## Safety boundary',
  '',
  report.boundary,
  '',
  report.inventoryBoundary,
  '',
  '## Summary',
  '',
  `- Files classified: ${summary.totalClassified}`,
  `- HTML routes: ${summary.htmlRoutes}`,
  `- Documents and downloads: ${summary.documentsAndDownloads}`,
  `- Generated outputs excluded: ${summary.ignoredGeneratedOutputs}`,
  `- Generated HTML outputs excluded: ${summary.ignoredGeneratedHtmlOutputs}`,
  `- Generated JSON outputs excluded: ${summary.ignoredGeneratedJsonOutputs}`,
  `- Uncategorized: ${summary.uncategorized}`,
  `- Internal candidates: ${summary.internalCandidates}`,
  `- Paid-preview candidates: ${summary.paidPreviewCandidates}`,
  `- Separate products: ${summary.separateProducts}`,
  `- Same-priority conflicts: ${summary.samePriorityConflicts}`,
  `- Routes needing review: ${summary.routesNeedingReview}`,
  '',
  '## Recommended tiers',
  '',
  ...Object.entries(summary.byTier).map(([tier, count]) => `- ${tier}: ${count}`),
  '',
  '## Mission categories',
  '',
  ...Object.entries(summary.byCategory).map(([category, count]) => `- ${category}: ${count}`),
  '',
  '## Review queue',
  '',
  ...rows.filter(row => row.reviewFlags.length).slice(0, 200).map(row => `- ${row.file}: ${row.reviewFlags.join(', ')}; recommended ${row.recommendedTier} / ${row.category}.${row.subcategory}`),
  '',
  '## Activation boundary',
  '',
  'Nothing is enforced by this report. Route ownership, public previews, authentication, entitlements, redirects and payment lifecycle must be implemented and tested separately.'
];
fs.writeFileSync(path.join(outputDir, 'phase0-content-tier-classification.md'), lines.join('\n'));

console.log(`PHASE 0 CONTENT CLASSIFICATION: ${summary.totalClassified} files; ${summary.uncategorized} uncategorized; ${summary.samePriorityConflicts} same-priority conflicts; ${summary.ignoredGeneratedOutputs} generated outputs ignored.`);
console.log('Reports: downloads/phase0-content-tier-classification.json and downloads/phase0-content-tier-classification.md');
if (conflicts.length) process.exitCode = 1;
