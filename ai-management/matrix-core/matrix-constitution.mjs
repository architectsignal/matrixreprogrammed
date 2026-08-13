export const MATRIX_LAW = 'CAUSE NO HARM OR LOSS.';
export const MATRIX_LAW_SHA256 = '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189';

export const HARM_DOMAINS = Object.freeze([
  'physical', 'financial', 'property', 'asset', 'data', 'privacy', 'credential',
  'security', 'reputation', 'evidence', 'owner_control', 'system_integrity',
  'legal', 'irreversible', 'destructive', 'unbounded_third_party'
]);

export const CONSEQUENCE_CLASSES = Object.freeze([
  'READ_ONLY_PUBLIC', 'INTERNAL_ANALYSIS', 'REVERSIBLE_INTERNAL',
  'EXTERNAL_NON_FINANCIAL', 'FINANCIAL', 'PRIVILEGED', 'IRREVERSIBLE', 'DESTRUCTIVE'
]);

const CONSEQUENTIAL = new Set(['EXTERNAL_NON_FINANCIAL', 'FINANCIAL', 'PRIVILEGED', 'IRREVERSIBLE', 'DESTRUCTIVE']);
const CRITICAL = new Set(HARM_DOMAINS);

function text(value, maximum = 300) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function uniqueList(value, maximum = 50) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => text(item, 80).toLowerCase()).filter(Boolean))].slice(0, maximum);
}

export function immutableLawRecord() {
  return Object.freeze({
    constitution_id: 'matrix-law-v1',
    law: MATRIX_LAW,
    sha256: MATRIX_LAW_SHA256,
    immutable: true,
    authority_expansion_by_learning: false,
    priority: 0,
    harm_domains: [...HARM_DOMAINS]
  });
}

export function constitutionalRedesign(blockers = []) {
  const steps = ['identify-risk', 'reduce-or-isolate-risk', 'simulate', 'bound-scope', 'prepare-rollback', 're-evaluate'];
  if (blockers.some(item => item.includes('authorization') || item.includes('delegation'))) steps.unshift('obtain-explicit-authority');
  if (blockers.some(item => item.includes('legal'))) steps.unshift('prove-legal-basis');
  if (blockers.some(item => item.includes('financial'))) steps.unshift('prove-recipient-and-destination');
  return [...new Set(steps)];
}

export function evaluateMatrixAction(input = {}) {
  const consequenceClass = text(input.consequenceClass || 'INTERNAL_ANALYSIS', 50).toUpperCase();
  const declared = uniqueList(input.riskDomains).filter(domain => HARM_DOMAINS.includes(domain));
  const blockers = [];
  const safeguards = [];
  const consequential = CONSEQUENTIAL.has(consequenceClass);

  if (!CONSEQUENCE_CLASSES.includes(consequenceClass)) blockers.push('unknown-consequence-class');
  if (input.constitutionalOverride === true || input.disableSafety === true || input.bypassLaw === true) blockers.push('constitutional-override-prohibited');
  if (input.proposedLaw != null && text(input.proposedLaw, 200) !== MATRIX_LAW) blockers.push('constitutional-modification-prohibited');
  if (input.capabilityExpansionGrantsAuthority === true) blockers.push('capability-expansion-cannot-grant-authority');
  if (input.unboundedThirdPartyRisk === true) blockers.push('unbounded-third-party-harm');
  if (input.physicalHarmPossible === true) blockers.push('physical-harm');
  if (input.financialHarmPossible === true) blockers.push('financial-harm');
  if (input.propertyHarmPossible === true) blockers.push('property-harm');
  if (input.assetHarmPossible === true) blockers.push('asset-harm');
  if (input.reputationHarmPossible === true) blockers.push('reputation-harm');
  if (input.systemIntegrityRisk === true) blockers.push('system-integrity-harm');
  if (input.rawCredentialExposure === true) blockers.push('credential-harm');
  if (input.privateDataWithoutBasis === true) blockers.push('privacy-and-data-harm');
  if (input.evidenceTampering === true || input.fabricatedEvidence === true) blockers.push('evidence-and-reputation-harm');
  if (input.ownerControlBypass === true) blockers.push('owner-control-harm');
  if (input.illegalOrUnverifiedLegalBasis === true) blockers.push('legal-harm');
  if (Number(input.maximumLossMinor || 0) > 0 && input.lossExplicitlyAuthorized !== true) blockers.push('unauthorized-financial-loss');

  if (consequential && input.authorized !== true) blockers.push('explicit-authorization-or-delegation-required');
  if (consequential && input.boundedScope !== true) blockers.push('bounded-scope-required');
  if (consequential && input.simulationPassed !== true) blockers.push('simulation-required');
  if (['FINANCIAL', 'PRIVILEGED', 'IRREVERSIBLE', 'DESTRUCTIVE'].includes(consequenceClass) && input.rollbackReady !== true) blockers.push('rollback-or-compensating-control-required');
  if (consequenceClass === 'FINANCIAL' && input.destinationApproved !== true) blockers.push('approved-financial-destination-required');
  if (consequenceClass === 'DESTRUCTIVE') blockers.push('destructive-action-prohibited');
  if (consequenceClass === 'IRREVERSIBLE' && input.irreversibleNecessityProven !== true) blockers.push('irreversible-necessity-not-proven');

  for (const domain of declared) {
    if (CRITICAL.has(domain) && input[`${domain}RiskEliminated`] !== true) blockers.push(`unresolved-${domain}-risk`);
  }

  if (input.boundedScope === true) safeguards.push('bounded-scope');
  if (input.simulationPassed === true) safeguards.push('simulation-passed');
  if (input.rollbackReady === true) safeguards.push('rollback-ready');
  if (input.authorized === true) safeguards.push('authority-verified');

  const hardBlocked = blockers.some(item => item.includes('prohibited') || item.includes('harm') || item.includes('cannot-grant-authority') || item.startsWith('unresolved-'));
  return {
    law: MATRIX_LAW,
    law_sha256: MATRIX_LAW_SHA256,
    decision: blockers.length === 0 ? 'AUTHORIZED' : hardBlocked ? 'BLOCKED' : 'REDESIGN_REQUIRED',
    allowed: blockers.length === 0,
    consequence_class: consequenceClass,
    risk_domains: declared,
    blockers: [...new Set(blockers)],
    safeguards,
    retryable: blockers.length > 0 && !hardBlocked,
    redesign: blockers.length ? constitutionalRedesign(blockers) : []
  };
}

export function evaluateDelegatedAction(input = {}, delegations = []) {
  const actionType = text(input.actionType, 100).toUpperCase();
  const consequenceClass = text(input.consequenceClass || 'INTERNAL_ANALYSIS', 50).toUpperCase();
  const now = Date.parse(input.now || new Date().toISOString());
  const delegation = (Array.isArray(delegations) ? delegations : []).find(item => {
    const actions = uniqueList(item.allowedActions).map(value => value.toUpperCase());
    const consequenceClasses = uniqueList(item.allowedConsequenceClasses).map(value => value.toUpperCase());
    const starts = Date.parse(item.startsAt || '1970-01-01T00:00:00.000Z');
    const ends = item.expiresAt ? Date.parse(item.expiresAt) : Number.POSITIVE_INFINITY;
    return item.active === true && actions.includes(actionType) && consequenceClasses.includes(consequenceClass) && starts <= now && now < ends;
  });
  const maximum = Number(delegation?.maximumAmountMinor || 0);
  const requested = Math.max(0, Number(input.amountMinor || 0));
  const scopeAllowed = !delegation || !Array.isArray(delegation.allowedScopes) || delegation.allowedScopes.length === 0 || delegation.allowedScopes.includes(input.scope);
  const constitutional = evaluateMatrixAction({
    ...input,
    consequenceClass,
    authorized: Boolean(delegation) && scopeAllowed && (maximum === 0 ? requested === 0 : requested <= maximum),
    capabilityExpansionGrantsAuthority: input.capabilityExpansionGrantsAuthority === true
  });
  const delegationBlockers = [];
  if (!delegation) delegationBlockers.push('active-delegation-not-found');
  if (delegation && !scopeAllowed) delegationBlockers.push('delegated-scope-mismatch');
  if (delegation && requested > maximum) delegationBlockers.push('delegated-amount-exceeded');
  const blockers = [...new Set([...delegationBlockers, ...constitutional.blockers])];
  return {
    ...constitutional,
    decision: blockers.length === 0 ? 'AUTHORIZED' : constitutional.decision === 'BLOCKED' ? 'BLOCKED' : 'REDESIGN_REQUIRED',
    allowed: blockers.length === 0,
    action_type: actionType,
    delegation_id: delegation?.delegationId || null,
    blockers,
    capability_expansion_is_authority_expansion: false
  };
}

export class MatrixPolicyEngine {
  constructor() { this.constitution = immutableLawRecord(); }
  evaluate(action) { return evaluateMatrixAction(action); }
}

export class OwnerDelegationVault {
  constructor(delegations = []) {
    this.delegations = (Array.isArray(delegations) ? delegations : []).map(item => Object.freeze({
      ...item,
      rawCredential: undefined,
      secret: undefined,
      secretReference: item.secretReference && String(item.secretReference).startsWith('vault://') ? item.secretReference : null
    }));
  }
  active() { return this.delegations.filter(item => item.active === true); }
}

export class MatrixDelegatedActionBroker {
  constructor(vault = new OwnerDelegationVault()) { this.vault = vault; }
  evaluate(action) { return evaluateDelegatedAction(action, this.vault.active()); }
}
