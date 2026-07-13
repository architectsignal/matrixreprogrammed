const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = process.env.PHASE3_LOCK_SIM_OUTPUT_DIR
  ? path.resolve(process.env.PHASE3_LOCK_SIM_OUTPUT_DIR)
  : path.join(root, 'downloads', 'phase3-locked-section-simulation');
const policyPath = path.join(root, 'data', 'phase3-locked-section-policy.json');
const tierPolicyPath = path.join(root, 'data', 'phase3-tier-matrix-policy.json');
const matrixPath = path.join(root, 'downloads', 'phase3-tier-matrix', 'tier-matrix.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
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

function runTierMatrix() {
  const result = spawnSync(process.execPath, ['scripts/build-phase3-tier-matrix.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Phase 3 tier matrix failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}

function effectiveTier(context, policy) {
  if (!context || context.status === 'unknown') return null;
  if (context.status === 'active' || context.status === 'none') return context.tier;
  return context.fallbackTier || 'registered';
}

function rank(tier, policy) {
  return policy.membershipOrder.indexOf(tier);
}

function hasRole(context, role) {
  return Array.isArray(context.roles) && context.roles.includes(role);
}

function fullEntitlement(item, context, policy) {
  if (item.targetAccessClass === 'internal_only') return hasRole(context, 'operations_reviewer');
  if (item.targetAccessClass === 'restricted_sensitive') return hasRole(context, 'sensitive_content_reviewer');
  if (item.targetAccessClass === 'separate_product') return context.product === 'matching';
  if (item.targetAccessClass === 'public_core') return true;
  const tier = effectiveTier(context, policy);
  if (!tier || !item.minimumTier) return false;
  return rank(tier, policy) >= rank(item.minimumTier, policy);
}

function publicProjection(item) {
  return {
    state: item.views.public.state,
    sections: item.views.public.sections,
    tools: item.views.public.tools,
    downloads: item.views.public.downloads,
    delivery: item.views.public.delivery
  };
}

function entitledProjection(item, context, policy) {
  const tier = effectiveTier(context, policy);
  if (!tier || !item.views[tier]) return publicProjection(item);
  return {
    state: item.views[tier].state,
    sections: item.views[tier].sections,
    tools: item.views[tier].tools,
    downloads: item.views[tier].downloads,
    delivery: item.views[tier].delivery
  };
}

function inactiveContext(context) {
  return context.status === 'expired' || context.status === 'cancelled';
}

function decision(state, projection, reason, extra = {}) {
  return {
    state,
    projection,
    reason,
    exposedSections: extra.exposedSections || [],
    exposedDownloads: extra.exposedDownloads || [],
    entitlementTier: extra.entitlementTier ?? null,
    requiredTier: extra.requiredTier ?? null,
    productEntitlement: extra.productEntitlement ?? null
  };
}

function metadataSections(item) {
  return unique(['title', 'access_explanation', ...item.neverPaywallSections]);
}

function accessDecision(item, contextName, context, channel, policy) {
  const publicView = publicProjection(item);
  const full = fullEntitlement(item, context, policy);
  const effective = effectiveTier(context, policy);
  const fullView = entitledProjection(item, context, policy);
  const inactive = inactiveContext(context);
  const publicOnlyChannel = ['public_search', 'source_markup', 'embedded_data'].includes(channel);

  if (contextName === 'unknown') return decision('deny_unknown', 'none', 'Unknown access context fails closed.');

  if (item.targetAccessClass === 'internal_only') {
    if (!hasRole(context, 'operations_reviewer')) return decision('deny_operations', 'none', 'Operations-review role required.');
    if (publicOnlyChannel) return decision('deny_operations', 'none', 'Operations content is excluded from public projections.');
    return decision('allow_operations', 'operations', 'Operations-review role accepted.', { exposedSections: item.views.research_pro_9.sections });
  }

  if (item.targetAccessClass === 'restricted_sensitive') {
    if (!hasRole(context, 'sensitive_content_reviewer')) return decision('deny_sensitive', 'none', 'Sensitive-content review role required.');
    if (publicOnlyChannel) return decision('deny_sensitive', 'none', 'Sensitive material is excluded from public projections.');
    return decision('allow_sensitive_review', 'restricted', 'Sensitive-content review role accepted.', { exposedSections: item.views.research_pro_9.sections });
  }

  if (item.targetAccessClass === 'separate_product') {
    if (channel === 'download') {
      if (context.product === 'matching') return decision('allow_product_file', 'product_file', 'Matching product entitlement accepted.', { productEntitlement: `product:${item.canonicalId}` });
      return decision('deny_purchase', 'commercial_landing', 'Matching product purchase required.', { productEntitlement: `product:${item.canonicalId}` });
    }
    if (['page', 'public_search', 'source_markup', 'embedded_data', 'feed'].includes(channel)) {
      return decision('allow_product_page', 'commercial_landing', 'Product page remains public; product files are separate.', { exposedSections: item.views.public.sections });
    }
    return decision('deny_channel', 'none', 'This product page is not delivered through the requested channel.');
  }

  if (publicOnlyChannel) {
    const state = item.targetAccessClass === 'public_core' ? 'allow_full' : item.publicPreviewRequired ? 'allow_public_preview' : 'allow_metadata';
    const sections = item.targetAccessClass === 'public_core' ? publicView.sections : item.publicPreviewRequired ? publicView.sections : metadataSections(item);
    return decision(state, state === 'allow_full' ? 'public_full' : state === 'allow_public_preview' ? 'public_preview' : 'metadata', 'Public-only channel receives the public projection.', { exposedSections: sections, requiredTier: item.minimumTier });
  }

  if (channel === 'page') {
    if (full) return decision('allow_full', 'full', 'Access context meets the item requirement.', { exposedSections: fullView.sections, entitlementTier: effective, requiredTier: item.minimumTier });
    if (item.publicPreviewRequired) return decision('allow_public_preview', 'public_preview', inactive ? 'Inactive membership falls back to the public preview.' : 'Public preview shown until the required tier is present.', { exposedSections: publicView.sections, entitlementTier: effective, requiredTier: item.minimumTier });
    if (item.minimumTier === 'registered') return decision('allow_metadata', 'metadata', 'Login is required for the registered section.', { exposedSections: metadataSections(item), requiredTier: item.minimumTier });
    return decision('deny_upgrade', 'none', 'Required access is not present.', { entitlementTier: effective, requiredTier: item.minimumTier });
  }

  if (channel === 'section') {
    if (full) return decision('allow_full', 'full', 'Access context meets the section requirement.', { exposedSections: fullView.sections, entitlementTier: effective, requiredTier: item.minimumTier });
    if (inactive) return decision('deny_inactive', 'none', 'Inactive membership cannot open protected sections.', { entitlementTier: effective, requiredTier: item.minimumTier });
    if (item.minimumTier === 'registered' && !context.account) return decision('deny_login', 'none', 'Account login required.', { requiredTier: item.minimumTier });
    return decision('deny_upgrade', 'none', 'Required tier not present.', { entitlementTier: effective, requiredTier: item.minimumTier });
  }

  if (channel === 'feed') {
    if (item.targetAccessClass === 'public_core') return decision('allow_full', 'public_full', 'Public item may appear in the public feed.', { exposedSections: publicView.sections });
    if (full && fullView.delivery.web) return decision('allow_full', 'full', 'Entitled feed projection.', { exposedSections: fullView.sections, entitlementTier: effective });
    if (item.publicPreviewRequired) return decision('allow_public_preview', 'public_preview', 'Feed falls back to the public preview.', { exposedSections: publicView.sections, requiredTier: item.minimumTier });
    return decision('deny_channel', 'none', 'No feed projection is available.');
  }

  if (channel === 'email' || channel === 'dashboard') {
    const permission = channel === 'email' ? fullView.delivery.email : fullView.delivery.dashboard;
    if (!context.account) return decision('deny_login', 'none', `${channel} requires an account.`);
    if (inactive) return decision('deny_inactive', 'none', `Inactive membership cannot receive protected ${channel} content.`, { entitlementTier: effective, requiredTier: item.minimumTier });
    if (full && permission) return decision('allow_full', 'full', `Entitled ${channel} projection.`, { exposedSections: fullView.sections, entitlementTier: effective, requiredTier: item.minimumTier });
    return decision('deny_channel', 'none', `${channel} permission is not available for this context.`, { entitlementTier: effective, requiredTier: item.minimumTier });
  }

  if (channel === 'download') {
    if (!full) return decision(inactive ? 'deny_inactive' : 'deny_upgrade', 'none', 'Full access is required for protected downloads.', { entitlementTier: effective, requiredTier: item.minimumTier });
    if (!fullView.downloads.length) return decision('deny_channel', 'none', 'No download is declared for this item and tier.');
    return decision('allow_full', 'download', 'Full access and a declared download are present.', { exposedDownloads: fullView.downloads, entitlementTier: effective, requiredTier: item.minimumTier });
  }

  if (channel === 'api') {
    if (!full) return decision(inactive ? 'deny_inactive' : 'deny_upgrade', 'none', 'Full access is required for the protected API projection.', { entitlementTier: effective, requiredTier: item.minimumTier });
    if (!fullView.delivery.api) return decision('deny_channel', 'none', 'API access is not enabled for this tier.');
    return decision('allow_full', 'api', 'Full access and API permission are present.', { exposedSections: fullView.sections, entitlementTier: effective, requiredTier: item.minimumTier });
  }

  return decision('deny_channel', 'none', 'No rule exists for this channel.');
}

runTierMatrix();
const policy = readJson(policyPath);
const tierPolicy = readJson(tierPolicyPath);
const matrix = readJson(matrixPath);
if (policy.mode !== 'simulation-only' || tierPolicy.mode !== 'report-only' || matrix.mode !== 'report-only') throw new Error('Locked-section simulation requires non-enforcing inputs.');
if (!matrix.ok) throw new Error('Tier matrix is not healthy.');

fs.rmSync(outputDir, { recursive: true, force: true });
const rows = [];
const leakageFailures = [];
const decisionCounts = [];
for (const item of matrix.rows) {
  const contexts = {};
  for (const [contextName, context] of Object.entries(policy.accessContexts)) {
    const channels = {};
    for (const channel of policy.channels) {
      const result = accessDecision(item, contextName, context, channel, policy);
      channels[channel] = result;
      decisionCounts.push({ state: result.state, channel, context: contextName, accessClass: item.targetAccessClass });
      if (['public_search', 'source_markup', 'embedded_data'].includes(channel)) {
        const publicSections = new Set(item.views.public.sections);
        const leaked = result.exposedSections.filter(section => !publicSections.has(section));
        if (leaked.length) leakageFailures.push({ canonicalId: item.canonicalId, sourcePath: item.sourcePath, context: contextName, channel, leakedSections: leaked });
      }
      if (!fullEntitlement(item, context, policy) && result.state === 'allow_full' && item.targetAccessClass !== 'public_core') {
        leakageFailures.push({ canonicalId: item.canonicalId, sourcePath: item.sourcePath, context: contextName, channel, reason: 'Full access granted without entitlement.' });
      }
      if (item.targetAccessClass === 'internal_only' && !hasRole(context, 'operations_reviewer') && result.state === 'allow_operations') {
        leakageFailures.push({ canonicalId: item.canonicalId, sourcePath: item.sourcePath, context: contextName, channel, reason: 'Operations access granted without role.' });
      }
      if (item.targetAccessClass === 'restricted_sensitive' && !hasRole(context, 'sensitive_content_reviewer') && result.state === 'allow_sensitive_review') {
        leakageFailures.push({ canonicalId: item.canonicalId, sourcePath: item.sourcePath, context: contextName, channel, reason: 'Sensitive review access granted without role.' });
      }
    }
    contexts[contextName] = channels;
  }

  const tierAdditions = {};
  let previousSections = [];
  for (const tier of tierPolicy.tierOrder) {
    const sections = item.views[tier].sections;
    tierAdditions[tier] = sections.filter(section => !previousSections.includes(section));
    previousSections = unique([...previousSections, ...sections]);
  }

  rows.push({
    canonicalId: item.canonicalId,
    sourcePath: item.sourcePath,
    currentRoute: item.currentRoute,
    proposedCanonicalRoute: item.proposedCanonicalRoute,
    title: item.title,
    targetAccessClass: item.targetAccessClass,
    minimumTier: item.minimumTier,
    factualStatusInvariant: item.factualStatusInvariant,
    publicSections: item.views.public.sections,
    tierAdditions,
    productEntitlement: item.targetAccessClass === 'separate_product' ? `product:${item.canonicalId}` : null,
    contexts,
    enforcementState: 'simulation_only',
    protectedActions: {
      enforced: false,
      authenticationActivated: false,
      entitlementActivated: false,
      emailDeliveryActivated: false,
      paymentActivated: false,
      routeMoved: false,
      searchMutated: false,
      contentMutated: false
    }
  });
}

const summary = {
  totalItems: rows.length,
  accessContexts: Object.keys(policy.accessContexts).length,
  channels: policy.channels.length,
  totalDecisions: decisionCounts.length,
  byDecision: countBy(decisionCounts, item => item.state),
  byChannel: countBy(decisionCounts, item => item.channel),
  byContext: countBy(decisionCounts, item => item.context),
  leakageFailures: leakageFailures.length,
  publicPreviewItems: matrix.rows.filter(row => row.publicPreviewRequired).length,
  internalItems: matrix.rows.filter(row => row.targetAccessClass === 'internal_only').length,
  restrictedItems: matrix.rows.filter(row => row.targetAccessClass === 'restricted_sensitive').length,
  separateProducts: matrix.rows.filter(row => row.targetAccessClass === 'separate_product').length
};
const report = {
  ok: rows.length === matrix.rows.length && leakageFailures.length === 0,
  mode: 'simulation-only',
  version: policy.version,
  generatedAt: matrix.generatedAt,
  enforcement: false,
  authentication: false,
  entitlements: false,
  emailDelivery: false,
  payment: false,
  routeMovement: false,
  searchMutation: false,
  contentMutation: false,
  boundary: 'This package simulates decisions only. It does not enforce locks, authenticate users, grant entitlements, deliver email, activate payment, move routes or mutate content.',
  summary,
  rows
};

writeJson('locked-section-decisions.json', report);
writeJson('leakage-report.json', { ok: leakageFailures.length === 0, mode: 'simulation-only', generatedAt: report.generatedAt, failureCount: leakageFailures.length, failures: leakageFailures });
writeJson('decision-summary.json', { ok: true, mode: 'simulation-only', generatedAt: report.generatedAt, summary });
writeJson('principal-channel-matrix.json', {
  ok: true,
  mode: 'simulation-only',
  generatedAt: report.generatedAt,
  contexts: policy.accessContexts,
  channels: policy.channels,
  recordCount: rows.length,
  records: rows.map(row => ({ canonicalId: row.canonicalId, sourcePath: row.sourcePath, targetAccessClass: row.targetAccessClass, minimumTier: row.minimumTier, contexts: row.contexts }))
});
const lines = [
  '# Phase 3 Locked-Section Simulation',
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
  `- Access contexts: ${summary.accessContexts}`,
  `- Channels: ${summary.channels}`,
  `- Decisions: ${summary.totalDecisions}`,
  `- Leakage failures: ${summary.leakageFailures}`,
  `- Public-preview items: ${summary.publicPreviewItems}`,
  `- Internal items: ${summary.internalItems}`,
  `- Restricted items: ${summary.restrictedItems}`,
  `- Separate products: ${summary.separateProducts}`,
  '',
  '## Decision states',
  '',
  ...Object.entries(summary.byDecision).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Exit condition',
  '',
  policy.exitCondition
];
writeText('summary.md', lines.join('\n') + '\n');

console.log(`PHASE 3 LOCK SIMULATION: ${summary.totalDecisions} decisions; ${summary.leakageFailures} leakage failures.`);
console.log(`Output: ${outputDir}`);
if (!report.ok) process.exit(1);
