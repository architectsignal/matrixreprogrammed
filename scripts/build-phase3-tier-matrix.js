const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = process.env.PHASE3_TIER_MATRIX_OUTPUT_DIR
  ? path.resolve(process.env.PHASE3_TIER_MATRIX_OUTPUT_DIR)
  : path.join(root, 'downloads', 'phase3-tier-matrix');
const policyPath = path.join(root, 'data', 'phase3-tier-matrix-policy.json');
const taxonomyPath = path.join(root, 'data', 'phase3-canonical-taxonomy.json');
const classificationPath = path.join(root, 'downloads', 'phase3-public-private-classification', 'classification.json');

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

function runClassification() {
  const result = spawnSync(process.execPath, ['scripts/build-phase3-public-private-classification.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Phase 3 classification failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cumulativeBundle(policy, tier) {
  const index = policy.tierOrder.indexOf(tier);
  if (index < 0) return { sections: [], tools: [], downloads: [], delivery: {} };
  const tiers = policy.tierOrder.slice(0, index + 1);
  const sections = unique(tiers.flatMap(name => policy.tierBundles[name].sections));
  const tools = unique(tiers.flatMap(name => policy.tierBundles[name].tools));
  const downloads = unique(tiers.flatMap(name => policy.tierBundles[name].downloads));
  const delivery = {};
  for (const name of tiers) {
    for (const [channel, enabled] of Object.entries(policy.tierBundles[name].delivery)) {
      delivery[channel] = Boolean(delivery[channel] || enabled);
    }
  }
  return { sections, tools, downloads, delivery };
}

function minimumTierFor(item, policy) {
  if (item.targetAccessClass === 'internal_only' || item.targetAccessClass === 'restricted_sensitive' || item.targetAccessClass === 'separate_product') return null;
  const override = policy.contentTypeOverrides[item.contentType];
  if (override?.minimumTier && item.targetAccessClass !== 'internal_only' && item.targetAccessClass !== 'restricted_sensitive') return override.minimumTier;
  return policy.accessClassMinimumTier[item.targetAccessClass] || null;
}

function tierIndex(policy, tier) {
  return tier === null ? -1 : policy.tierOrder.indexOf(tier);
}

function viewStateFor(item, tier, minimumTier, policy) {
  if (item.targetAccessClass === 'internal_only') return 'internal_only';
  if (item.targetAccessClass === 'restricted_sensitive') return 'restricted_review';
  if (item.targetAccessClass === 'separate_product') return 'commercial_landing';
  if (item.targetAccessClass === 'public_core') return 'full';
  const currentIndex = tierIndex(policy, tier);
  const minimumIndex = tierIndex(policy, minimumTier);
  if (currentIndex >= minimumIndex && minimumIndex >= 0) return 'full';
  if (tier === 'public' && item.publicPreview.required) return 'preview';
  if (tier === 'public') return 'metadata_only';
  return item.publicPreview.required ? 'preview' : 'metadata_only';
}

function requiredInterpretiveBoundary(item) {
  const pathLower = item.sourcePath.toLowerCase();
  if (item.primaryCategory === 'interpretation') return 'interpretive_label_required';
  if (item.contentType === 'map_or_graph' || /relationship|graph|network/.test(pathLower)) return 'association_boundary_required';
  if (/scenario|outcome|prediction/.test(pathLower)) return 'scenario_boundary_required';
  return 'preserve_source_claim_class';
}

function viewPayload(item, tier, minimumTier, state, policy) {
  const publicBundle = cumulativeBundle(policy, 'public');
  if (state === 'internal_only') {
    return {
      state,
      sections: [],
      tools: [],
      downloads: [],
      delivery: { web: false, search: false, email: false, dashboard: false, api: false },
      accessReason: 'Internal role required; membership tiers do not grant access.'
    };
  }
  if (state === 'restricted_review') {
    return {
      state,
      sections: ['restricted_notice_when_legally_required'],
      tools: [],
      downloads: [],
      delivery: { web: false, search: false, email: false, dashboard: false, api: false },
      accessReason: 'Restricted reviewer role required; membership tiers do not grant access.'
    };
  }
  if (state === 'commercial_landing') {
    return {
      state,
      sections: ['product_title', 'product_description', 'price_or_external_purchase_route', 'purchase_terms'],
      tools: [],
      downloads: [],
      delivery: { web: true, search: true, email: false, dashboard: false, api: false },
      accessReason: 'Public product page; purchased files require a separate product entitlement.'
    };
  }
  if (state === 'preview') {
    return {
      state,
      sections: policy.publicSafetySections,
      tools: publicBundle.tools,
      downloads: publicBundle.downloads,
      delivery: { web: true, search: true, email: false, dashboard: false, api: false },
      accessReason: `Public evidence-bounded preview; full depth begins at ${minimumTier}.`
    };
  }
  if (state === 'metadata_only') {
    return {
      state,
      sections: ['title', 'access_explanation', 'login_or_registration_route', ...policy.neverPaywallSections],
      tools: ['public_section_navigation'],
      downloads: [],
      delivery: { web: true, search: false, email: false, dashboard: false, api: false },
      accessReason: `Account access begins at ${minimumTier}.`
    };
  }
  const bundle = cumulativeBundle(policy, tier);
  return {
    state,
    sections: unique([...policy.publicSafetySections, ...bundle.sections]),
    tools: bundle.tools,
    downloads: bundle.downloads,
    delivery: bundle.delivery,
    accessReason: tier === minimumTier ? `Full access begins at ${minimumTier}.` : `Cumulative access inherited through ${tier}.`
  };
}

function invariantKey(item) {
  return sha256(JSON.stringify({
    canonicalId: item.canonicalId,
    sourcePath: item.sourcePath,
    contentType: item.contentType,
    category: item.primaryCategory,
    subcategory: item.primarySubcategory,
    classificationRule: item.selectedTaxonomyRule,
    safetyBoundaryPresent: item.safetyBoundaryPresent
  }));
}

runClassification();
const policy = readJson(policyPath);
const taxonomy = readJson(taxonomyPath);
const classification = readJson(classificationPath);
if (policy.mode !== 'report-only' || taxonomy.mode !== 'report-only' || classification.mode !== 'report-only') throw new Error('Tier matrix requires report-only inputs.');
if (!classification.ok) throw new Error('Public/private classification is not healthy.');

fs.rmSync(outputDir, { recursive: true, force: true });
const rows = [];
const reviewQueue = [];
for (const item of classification.rows) {
  const minimumTier = minimumTierFor(item, policy);
  const views = {};
  for (const tier of policy.tierOrder) {
    const state = viewStateFor(item, tier, minimumTier, policy);
    views[tier] = viewPayload(item, tier, minimumTier, state, policy);
  }
  const reviewFlags = [];
  if (item.primaryCategory === 'migration_review') reviewFlags.push('taxonomy_owner_required_before_tier_approval');
  if (item.publicPreview.required && !item.safetyBoundaryPresent) reviewFlags.push('public_preview_safety_boundary_required');
  if (item.targetAccessClass === 'restricted_sensitive') reviewFlags.push('restricted_reviewer_required');
  if (item.targetAccessClass === 'internal_only' && item.fileType === 'html_route') reviewFlags.push('public_replacement_required_before_internalisation');
  if (item.targetAccessClass === 'separate_product') reviewFlags.push('product_entitlement_separate_from_membership');
  const expectedMinimum = policy.accessClassMinimumTier[item.targetAccessClass] || null;
  const override = policy.contentTypeOverrides[item.contentType];
  if (override?.minimumTier && expectedMinimum && override.minimumTier !== expectedMinimum && item.targetAccessClass !== 'public_core') {
    reviewFlags.push('content_type_override_and_access_class_conflict');
  }
  const fullTiers = policy.tierOrder.filter(tier => views[tier].state === 'full');
  const previewTiers = policy.tierOrder.filter(tier => views[tier].state === 'preview');
  const row = {
    canonicalId: item.canonicalId,
    sourcePath: item.sourcePath,
    currentRoute: item.currentRoute,
    proposedCanonicalRoute: item.proposedCanonicalRoute,
    title: item.title,
    contentType: item.contentType,
    primaryCategory: item.primaryCategory,
    primarySubcategory: item.primarySubcategory,
    editorialOwner: item.editorialOwner,
    targetAccessClass: item.targetAccessClass,
    minimumTier,
    publicPreviewRequired: item.publicPreview.required,
    publicPreviewStatus: item.publicPreview.status,
    requiredPublicSafetySections: item.publicPreview.required || item.targetAccessClass === 'public_core' ? policy.publicSafetySections : policy.neverPaywallSections,
    neverPaywallSections: policy.neverPaywallSections,
    interpretiveBoundaryRule: requiredInterpretiveBoundary(item),
    factualStatusInvariant: {
      mutableByTier: false,
      invariantKey: invariantKey(item),
      fields: [
        'record_status',
        'claim_class',
        'evidence_grade',
        'factual_conclusion_scope',
        'association_boundary',
        'interpretive_label',
        'correction_withdrawal_or_supersession_state'
      ]
    },
    views,
    fullTiers,
    previewTiers,
    reviewFlags,
    migrationState: 'tier_assigned',
    enforcementState: 'matrix_only',
    protectedActions: {
      lockedSectionEnforced: false,
      authenticationActivated: false,
      entitlementActivated: false,
      emailDeliveryActivated: false,
      paymentActivated: false,
      routeMoved: false,
      searchRemoved: false,
      contentMutated: false
    }
  };
  rows.push(row);
  if (reviewFlags.length) reviewQueue.push(row);
}

const tierDefinitions = policy.tierOrder.map(tier => ({
  tier,
  ...policy.tierBundles[tier],
  cumulative: cumulativeBundle(policy, tier)
}));
const summary = {
  totalItems: rows.length,
  byMinimumTier: countBy(rows, row => row.minimumTier || row.targetAccessClass),
  byAccessClass: countBy(rows, row => row.targetAccessClass),
  byInterpretiveBoundary: countBy(rows, row => row.interpretiveBoundaryRule),
  publicPreviewRequired: rows.filter(row => row.publicPreviewRequired).length,
  reviewQueue: reviewQueue.length,
  invariantFailures: rows.filter(row => !row.factualStatusInvariant.invariantKey).length,
  byPublicViewState: countBy(rows, row => row.views.public.state),
  byRegisteredViewState: countBy(rows, row => row.views.registered.state),
  bySupporterViewState: countBy(rows, row => row.views.supporter_3.state),
  byIntelligenceViewState: countBy(rows, row => row.views.intelligence_6.state),
  byResearchProViewState: countBy(rows, row => row.views.research_pro_9.state)
};
const report = {
  ok: rows.length === classification.rows.length && summary.invariantFailures === 0,
  mode: 'report-only',
  version: policy.version,
  generatedAt: classification.generatedAt,
  tierOrder: policy.tierOrder,
  lockedSectionEnforcement: false,
  authenticationActivation: false,
  entitlementActivation: false,
  emailDeliveryActivation: false,
  paymentActivation: false,
  routeMovement: false,
  searchRemoval: false,
  contentMutation: false,
  boundary: 'This matrix defines cumulative views only. It does not lock sections, authenticate users, grant entitlements, send email, activate payment, move routes or mutate content.',
  summary,
  tierDefinitions,
  rows
};

writeJson('tier-matrix.json', report);
writeJson('tier-definitions.json', { ok: true, mode: 'report-only', generatedAt: report.generatedAt, tiers: tierDefinitions });
writeJson('public-safety-matrix.json', {
  ok: true,
  mode: 'report-only',
  generatedAt: report.generatedAt,
  requiredSections: policy.publicSafetySections,
  neverPaywallSections: policy.neverPaywallSections,
  recordCount: rows.filter(row => row.publicPreviewRequired || row.targetAccessClass === 'public_core').length,
  records: rows.filter(row => row.publicPreviewRequired || row.targetAccessClass === 'public_core').map(row => ({
    canonicalId: row.canonicalId,
    sourcePath: row.sourcePath,
    targetAccessClass: row.targetAccessClass,
    requiredPublicSafetySections: row.requiredPublicSafetySections,
    interpretiveBoundaryRule: row.interpretiveBoundaryRule,
    invariantKey: row.factualStatusInvariant.invariantKey
  }))
});
writeJson('delivery-download-matrix.json', {
  ok: true,
  mode: 'report-only',
  generatedAt: report.generatedAt,
  recordCount: rows.length,
  records: rows.map(row => ({
    canonicalId: row.canonicalId,
    sourcePath: row.sourcePath,
    minimumTier: row.minimumTier,
    targetAccessClass: row.targetAccessClass,
    tiers: Object.fromEntries(policy.tierOrder.map(tier => [tier, {
      state: row.views[tier].state,
      delivery: row.views[tier].delivery,
      downloads: row.views[tier].downloads,
      tools: row.views[tier].tools
    }]))
  }))
});
writeJson('review-queue.json', { ok: true, mode: 'report-only', generatedAt: report.generatedAt, recordCount: reviewQueue.length, records: reviewQueue });
const lines = [
  '# Phase 3 Tier Matrix',
  '',
  `Generated: ${report.generatedAt}`,
  `Mode: ${report.mode}`,
  '',
  '## Safety boundary',
  '',
  report.boundary,
  '',
  '## Coverage',
  '',
  `- Items: ${summary.totalItems}`,
  `- Public previews required: ${summary.publicPreviewRequired}`,
  `- Review queue: ${summary.reviewQueue}`,
  `- Factual-status invariant failures: ${summary.invariantFailures}`,
  '',
  '## Minimum tiers and special access classes',
  '',
  ...Object.entries(summary.byMinimumTier).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Public view states',
  '',
  ...Object.entries(summary.byPublicViewState).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Exit condition',
  '',
  policy.exitCondition
];
writeText('summary.md', lines.join('\n') + '\n');

console.log(`PHASE 3 TIER MATRIX: ${rows.length} items; ${summary.publicPreviewRequired} previews; ${summary.reviewQueue} require review.`);
console.log(`Output: ${outputDir}`);
if (!report.ok) process.exit(1);
