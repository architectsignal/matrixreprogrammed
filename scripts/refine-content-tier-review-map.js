const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads');
const rulesPath = path.join(root, 'data', 'content-tier-family-review-rules.json');
const baseReportPath = path.join(outputDir, 'phase0-content-tier-classification.json');

function runBaseClassifier() {
  const result = spawnSync(process.execPath, ['scripts/classify-content-tiers.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Base classifier failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function checksFor(rule, fileLower) {
  const checks = [];
  if (Array.isArray(rule.fileEqualsAny)) checks.push(rule.fileEqualsAny.some(value => fileLower === String(value).toLowerCase()));
  if (Array.isArray(rule.fileStartsWithAny)) checks.push(rule.fileStartsWithAny.some(value => fileLower.startsWith(String(value).toLowerCase())));
  if (Array.isArray(rule.fileContainsAny)) checks.push(rule.fileContainsAny.some(value => fileLower.includes(String(value).toLowerCase())));
  if (Array.isArray(rule.fileEndsWithAny)) checks.push(rule.fileEndsWithAny.some(value => fileLower.endsWith(String(value).toLowerCase())));
  return checks;
}

function ruleMatches(rule, fileLower) {
  const checks = checksFor(rule, fileLower);
  if (!checks.length) return false;
  return rule.requireAllChecks ? checks.every(Boolean) : checks.some(Boolean);
}

function paidTier(tier) {
  return ['supporter_3', 'intelligence_6', 'research_pro_9'].includes(tier);
}

runBaseClassifier();

const familyPolicy = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const base = JSON.parse(fs.readFileSync(baseReportPath, 'utf8'));
if (familyPolicy.paymentStatus !== 'deferred' || familyPolicy.enforcementMode !== 'report-only') {
  throw new Error('Family review requires deferred payments and report-only enforcement.');
}
if (!base.ok || base.mode !== 'report-only') throw new Error('Base classification report is not healthy.');

const rules = [...familyPolicy.rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
const refinedRows = [];
const conflicts = [];
const familyApplications = [];

for (const row of base.rows) {
  if (row.category !== 'uncategorized') {
    refinedRows.push({ ...row, reviewStage: 'base_taxonomy', familyRule: null });
    continue;
  }

  const fileLower = row.file.toLowerCase();
  const matches = rules.filter(rule => ruleMatches(rule, fileLower));
  const topPriority = matches.length ? Number(matches[0].priority || 0) : null;
  const topMatches = matches.filter(rule => Number(rule.priority || 0) === topPriority);
  const decisions = new Set(topMatches.map(rule => `${rule.category}|${rule.subcategory}|${rule.tier}`));
  if (decisions.size > 1) {
    conflicts.push({
      file: row.file,
      priority: topPriority,
      rules: topMatches.map(rule => ({ id: rule.id, category: rule.category, subcategory: rule.subcategory, tier: rule.tier }))
    });
  }

  const selected = matches[0] || familyPolicy.fallback;
  const reviewFlags = row.reviewFlags.filter(flag => flag !== 'editorial-owner-required');
  if (selected.category === 'uncategorized') reviewFlags.push('editorial-owner-required');
  if (selected.tier === 'internal_only') reviewFlags.push('internal-candidate-review-before-route-change');
  if (selected.tier === 'separate_product') reviewFlags.push('separate-product-boundary-review');
  if (paidTier(selected.tier)) {
    reviewFlags.push('public-preview-required-before-tier-enforcement');
    if (!row.safetyBoundaryPresent) reviewFlags.push('public-safety-boundary-required');
  }
  if (matches.length > 1) reviewFlags.push('multiple-family-rules-matched');
  if (decisions.size > 1) reviewFlags.push('same-priority-family-conflict');

  const refined = {
    ...row,
    category: selected.category,
    subcategory: selected.subcategory,
    recommendedTier: selected.tier,
    confidence: selected.confidence,
    selectedRule: selected.id || 'family-fallback',
    rationale: selected.rationale,
    allMatchedRules: [...row.allMatchedRules, ...matches.map(rule => rule.id)],
    publicPreviewRequired: paidTier(selected.tier),
    reviewFlags: [...new Set(reviewFlags)],
    status: 'review_recommendation_only',
    reviewStage: matches.length ? 'family_refinement' : 'manual_editorial_review',
    familyRule: matches[0]?.id || null,
    baseDecision: {
      category: row.category,
      subcategory: row.subcategory,
      recommendedTier: row.recommendedTier,
      selectedRule: row.selectedRule
    }
  };
  refinedRows.push(refined);
  if (matches.length) familyApplications.push({ file: row.file, rule: matches[0].id, category: refined.category, tier: refined.recommendedTier });
}

const summary = {
  totalRows: refinedRows.length,
  baseUncategorized: base.summary.uncategorized,
  refinedByFamilyRules: familyApplications.length,
  unresolvedAfterFamilyReview: refinedRows.filter(row => row.category === 'uncategorized').length,
  internalCandidates: refinedRows.filter(row => row.recommendedTier === 'internal_only').length,
  paidPreviewCandidates: refinedRows.filter(row => paidTier(row.recommendedTier)).length,
  separateProducts: refinedRows.filter(row => row.recommendedTier === 'separate_product').length,
  routesNeedingReview: refinedRows.filter(row => row.reviewFlags.length).length,
  samePriorityConflicts: conflicts.length,
  byTier: countBy(refinedRows, row => row.recommendedTier),
  byCategory: countBy(refinedRows, row => row.category),
  bySubcategory: countBy(refinedRows, row => row.subcategory),
  byConfidence: countBy(refinedRows, row => row.confidence),
  byFamilyRule: countBy(familyApplications, item => item.rule)
};

const report = {
  ok: conflicts.length === 0,
  mode: 'report-only',
  generatedAt: new Date().toISOString(),
  paymentStatus: familyPolicy.paymentStatus,
  enforcementMode: familyPolicy.enforcementMode,
  boundary: 'This refined map recommends route families and tiers only. It does not move, rename, hide, delete, redirect, paywall, authenticate, publish or change any current route.',
  summary,
  conflicts,
  rows: refinedRows
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'phase2a-route-family-review-map.json'), JSON.stringify(report, null, 2));
const unresolved = refinedRows.filter(row => row.category === 'uncategorized');
const lines = [
  '# Phase 2A Route Family Review Map',
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
  '## Progress',
  '',
  `- Total routes and files: ${summary.totalRows}`,
  `- Uncategorized before family review: ${summary.baseUncategorized}`,
  `- Resolved into route families: ${summary.refinedByFamilyRules}`,
  `- Still requiring an editorial owner: ${summary.unresolvedAfterFamilyReview}`,
  `- Same-priority conflicts: ${summary.samePriorityConflicts}`,
  '',
  '## Recommended tiers',
  '',
  ...Object.entries(summary.byTier).map(([tier, count]) => `- ${tier}: ${count}`),
  '',
  '## Mission categories',
  '',
  ...Object.entries(summary.byCategory).map(([category, count]) => `- ${category}: ${count}`),
  '',
  '## Family rules applied',
  '',
  ...Object.entries(summary.byFamilyRule).map(([rule, count]) => `- ${rule}: ${count}`),
  '',
  '## Remaining editorial-owner queue',
  '',
  ...unresolved.slice(0, 300).map(row => `- ${row.file}: ${row.title}; currently public until reviewed`),
  '',
  '## Activation boundary',
  '',
  'No recommendation is enforced. Public previews, route ownership, redirects, authentication, entitlement checks, email delivery and payment lifecycle remain separate later phases.'
];
fs.writeFileSync(path.join(outputDir, 'phase2a-route-family-review-map.md'), lines.join('\n'));

console.log(`PHASE 2A ROUTE FAMILY REVIEW: ${summary.refinedByFamilyRules} resolved; ${summary.unresolvedAfterFamilyReview} still need editorial ownership.`);
if (conflicts.length) process.exitCode = 1;
