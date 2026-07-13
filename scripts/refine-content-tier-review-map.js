const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads');
const rulesPath = path.join(root, 'data', 'content-tier-family-review-rules.json');
const editorialPolicyPath = path.join(root, 'data', 'phase3-editorial-resolution-policy.json');
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

function sourceCheckpoint() {
  const result = spawnSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '1970-01-01T00:00:00.000Z';
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
  return rule.requireAllChecks || rule.requireAllGroups ? checks.every(Boolean) : checks.some(Boolean);
}

function paidTier(tier) {
  return ['supporter_3', 'intelligence_6', 'research_pro_9'].includes(tier);
}

function basicContentType(row) {
  const file = String(row.file || '').toLowerCase();
  if (row.fileType === 'download_or_document') return 'download_bundle';
  if (/map|graph/.test(file)) return 'map_or_graph';
  if (/tracker|watchlist/.test(file)) return 'tracker';
  if (/timeline/.test(file)) return 'timeline';
  if (/card/.test(file)) return 'card';
  if (/brief/.test(file)) return 'brief';
  if (/hub|index/.test(file) || file === 'index.html') return 'hub';
  return 'landing_page';
}

function editorialResolution(row, policy) {
  const fileLower = row.file.toLowerCase();
  const rules = [...policy.rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const matches = rules.filter(rule => ruleMatches(rule, fileLower));
  const topPriority = matches.length ? Number(matches[0].priority || 0) : null;
  const topMatches = matches.filter(rule => Number(rule.priority || 0) === topPriority);
  const decisions = new Set(topMatches.map(rule => `${rule.category}|${rule.subcategory}|${rule.recommendedTier}`));
  if (decisions.size > 1) {
    return {
      conflict: {
        file: row.file,
        stage: 'editorial_resolution',
        priority: topPriority,
        rules: topMatches.map(rule => ({ id: rule.id, category: rule.category, subcategory: rule.subcategory, tier: rule.recommendedTier }))
      }
    };
  }
  if (matches.length) {
    const selected = matches[0];
    return {
      selected: {
        ...selected,
        tier: selected.recommendedTier,
        rationale: selected.rationale || `Resolved by Phase 3 editorial rule ${selected.id}.`,
        resolutionStage: 'editorial_resolution',
        fallbackUsed: false
      },
      matches
    };
  }
  const contentType = basicContentType(row);
  const fallback = policy.fallbackByContentType[contentType] || policy.fallbackByContentType.landing_page;
  return {
    selected: {
      ...fallback,
      id: `editorial-fallback-${contentType}`,
      tier: fallback.recommendedTier,
      rationale: `Resolved by safe content-type fallback for ${contentType}; editorial review remains required.`,
      resolutionStage: 'editorial_fallback',
      fallbackUsed: true
    },
    matches: []
  };
}

runBaseClassifier();

const familyPolicy = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const editorialPolicy = JSON.parse(fs.readFileSync(editorialPolicyPath, 'utf8'));
const base = JSON.parse(fs.readFileSync(baseReportPath, 'utf8'));
if (familyPolicy.paymentStatus !== 'deferred' || familyPolicy.enforcementMode !== 'report-only') {
  throw new Error('Family review requires deferred payments and report-only enforcement.');
}
if (editorialPolicy.mode !== 'report-only') throw new Error('Editorial resolution requires report-only mode.');
if (!base.ok || base.mode !== 'report-only') throw new Error('Base classification report is not healthy.');

const familyRules = [...familyPolicy.rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
const refinedRows = [];
const conflicts = [];
const familyApplications = [];
const editorialApplications = [];
const fallbackApplications = [];

for (const row of base.rows) {
  if (row.category !== 'uncategorized') {
    refinedRows.push({ ...row, reviewStage: 'base_taxonomy', familyRule: null, editorialResolutionRule: null, editorialOwnerOverride: null });
    continue;
  }

  const fileLower = row.file.toLowerCase();
  const familyMatches = familyRules.filter(rule => ruleMatches(rule, fileLower));
  const familyTopPriority = familyMatches.length ? Number(familyMatches[0].priority || 0) : null;
  const familyTopMatches = familyMatches.filter(rule => Number(rule.priority || 0) === familyTopPriority);
  const familyDecisions = new Set(familyTopMatches.map(rule => `${rule.category}|${rule.subcategory}|${rule.tier}`));
  if (familyDecisions.size > 1) {
    conflicts.push({
      file: row.file,
      stage: 'family_refinement',
      priority: familyTopPriority,
      rules: familyTopMatches.map(rule => ({ id: rule.id, category: rule.category, subcategory: rule.subcategory, tier: rule.tier }))
    });
  }

  let selected = familyMatches[0] || familyPolicy.fallback;
  let reviewStage = familyMatches.length ? 'family_refinement' : 'manual_editorial_review';
  let editorialMatches = [];
  let editorialRule = null;
  let editorialOwnerOverride = null;
  let fallbackUsed = false;

  if (selected.category === 'uncategorized') {
    const resolution = editorialResolution(row, editorialPolicy);
    if (resolution.conflict) conflicts.push(resolution.conflict);
    selected = resolution.selected || selected;
    editorialMatches = resolution.matches || [];
    editorialRule = selected.id || null;
    editorialOwnerOverride = selected.editorialOwner || null;
    reviewStage = selected.resolutionStage || 'editorial_resolution';
    fallbackUsed = Boolean(selected.fallbackUsed);
  }

  const selectedTier = selected.tier || selected.recommendedTier;
  const reviewFlags = row.reviewFlags.filter(flag => !['editorial-owner-required', 'phase3-editorial-owner-required'].includes(flag));
  if (selected.category === 'uncategorized') reviewFlags.push('editorial-owner-required');
  if (selectedTier === 'internal_only') reviewFlags.push('internal-candidate-review-before-route-change');
  if (selectedTier === 'separate_product') reviewFlags.push('separate-product-boundary-review');
  if (paidTier(selectedTier)) {
    reviewFlags.push('public-preview-required-before-tier-enforcement');
    if (!row.safetyBoundaryPresent) reviewFlags.push('public-safety-boundary-required');
  }
  if (familyMatches.length > 1) reviewFlags.push('multiple-family-rules-matched');
  if (familyDecisions.size > 1) reviewFlags.push('same-priority-family-conflict');
  if (editorialMatches.length > 1) reviewFlags.push('multiple-editorial-resolution-rules-matched');
  if (selected.confidence === 'low') reviewFlags.push(editorialPolicy.reviewFlags.lowConfidence);
  if (fallbackUsed) reviewFlags.push(editorialPolicy.reviewFlags.fallbackUsed);

  const refined = {
    ...row,
    category: selected.category,
    subcategory: selected.subcategory,
    recommendedTier: selectedTier,
    confidence: selected.confidence,
    selectedRule: selected.id || 'editorial-fallback',
    rationale: selected.rationale,
    allMatchedRules: [...row.allMatchedRules, ...familyMatches.map(rule => rule.id), ...editorialMatches.map(rule => rule.id)],
    publicPreviewRequired: paidTier(selectedTier),
    reviewFlags: [...new Set(reviewFlags)],
    status: 'review_recommendation_only',
    reviewStage,
    familyRule: familyMatches[0]?.id || null,
    editorialResolutionRule: editorialRule,
    editorialOwnerOverride,
    editorialFallbackUsed: fallbackUsed,
    baseDecision: {
      category: row.category,
      subcategory: row.subcategory,
      recommendedTier: row.recommendedTier,
      selectedRule: row.selectedRule
    }
  };
  refinedRows.push(refined);
  if (familyMatches.length && familyMatches[0].category !== 'uncategorized') {
    familyApplications.push({ file: row.file, rule: familyMatches[0].id, category: refined.category, tier: refined.recommendedTier });
  } else if (fallbackUsed) {
    fallbackApplications.push({ file: row.file, rule: editorialRule, category: refined.category, tier: refined.recommendedTier });
  } else {
    editorialApplications.push({ file: row.file, rule: editorialRule, category: refined.category, tier: refined.recommendedTier });
  }
}

const unresolved = refinedRows.filter(row => row.category === 'uncategorized');
const summary = {
  totalRows: refinedRows.length,
  baseUncategorized: base.summary.uncategorized,
  refinedByFamilyRules: familyApplications.length,
  resolvedByEditorialRules: editorialApplications.length,
  resolvedByContentFallback: fallbackApplications.length,
  unresolvedAfterFamilyReview: unresolved.length,
  internalCandidates: refinedRows.filter(row => row.recommendedTier === 'internal_only').length,
  paidPreviewCandidates: refinedRows.filter(row => paidTier(row.recommendedTier)).length,
  separateProducts: refinedRows.filter(row => row.recommendedTier === 'separate_product').length,
  routesNeedingReview: refinedRows.filter(row => row.reviewFlags.length).length,
  samePriorityConflicts: conflicts.length,
  byTier: countBy(refinedRows, row => row.recommendedTier),
  byCategory: countBy(refinedRows, row => row.category),
  bySubcategory: countBy(refinedRows, row => row.subcategory),
  byConfidence: countBy(refinedRows, row => row.confidence),
  byFamilyRule: countBy(familyApplications, item => item.rule),
  byEditorialRule: countBy(editorialApplications, item => item.rule),
  byFallbackRule: countBy(fallbackApplications, item => item.rule)
};

const report = {
  ok: conflicts.length === 0 && unresolved.length === 0,
  mode: 'report-only',
  generatedAt: sourceCheckpoint(),
  paymentStatus: familyPolicy.paymentStatus,
  enforcementMode: familyPolicy.enforcementMode,
  editorialResolutionVersion: editorialPolicy.version,
  boundary: 'This refined map recommends route families, editorial ownership and tiers only. It does not move, rename, hide, delete, redirect, paywall, authenticate, publish or change any current route.',
  summary,
  conflicts,
  rows: refinedRows
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'phase2a-route-family-review-map.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Phase 2A Route Family And Editorial Ownership Map',
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
  `- Uncategorized before refinement: ${summary.baseUncategorized}`,
  `- Resolved by family rules: ${summary.refinedByFamilyRules}`,
  `- Resolved by editorial rules: ${summary.resolvedByEditorialRules}`,
  `- Resolved by safe content fallback: ${summary.resolvedByContentFallback}`,
  `- Still uncategorized: ${summary.unresolvedAfterFamilyReview}`,
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
  '## Remaining uncategorized queue',
  '',
  ...(unresolved.length ? unresolved.slice(0, 300).map(row => `- ${row.file}: ${row.title}`) : ['- None']),
  '',
  '## Activation boundary',
  '',
  'No recommendation is enforced. Public previews, route ownership, redirects, authentication, entitlement checks, email delivery and payment lifecycle remain separately tested phases.'
];
fs.writeFileSync(path.join(outputDir, 'phase2a-route-family-review-map.md'), lines.join('\n'));

console.log(`PHASE 2A ROUTE REVIEW: ${summary.refinedByFamilyRules} family; ${summary.resolvedByEditorialRules} editorial; ${summary.resolvedByContentFallback} fallback; ${summary.unresolvedAfterFamilyReview} uncategorized.`);
if (!report.ok) process.exitCode = 1;
