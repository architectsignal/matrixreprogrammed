'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'dark-speculation-claims.json');
const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const labelPolicy = {
  'public-record fact lane': {
    score: 48, floor: 12, ceiling: 88, movement: 2, window: '0–3 years',
    evidenceGate: 'At least one named official, court, regulator, inspection, sanctions or audited record is required before an automatic increase.',
    automaticRaiseMode: 'primary-record-gated'
  },
  'public-record-adjacent': {
    score: 38, floor: 8, ceiling: 76, movement: 2, window: '0–5 years',
    evidenceGate: 'At least one primary-or-official record tied to the claimed mechanism is required before an automatic increase.',
    automaticRaiseMode: 'primary-mechanism-gated'
  },
  'case-specific evidence required': {
    score: 22, floor: 4, ceiling: 64, movement: 1, window: 'Case-dependent',
    evidenceGate: 'A named court file, official report, authenticated exhibit, physical record or multiple independent case sources is required before an automatic increase.',
    automaticRaiseMode: 'case-record-gated'
  },
  'control-system hypothesis': {
    score: 30, floor: 6, ceiling: 72, movement: 1, window: '0–7 years',
    evidenceGate: 'Two independent primary-or-official records plus a documented implementation or enforcement link are required before an automatic increase.',
    automaticRaiseMode: 'multi-primary-implementation-gated'
  },
  'symbolic/occult speculation': {
    score: 16, floor: 2, ceiling: 48, movement: 1, window: 'Open evidence watch',
    evidenceGate: 'Symbolism, resemblance and association cannot raise the score. Authenticated records establishing a concrete mechanism are required.',
    automaticRaiseMode: 'authenticated-mechanism-only'
  },
  'internet mythology': {
    score: 9, floor: 1, ceiling: 30, movement: 1, window: 'Open evidence watch',
    evidenceGate: 'Mentions, reposts, screenshots and recycled images cannot raise the score. Automated increases are disabled pending authenticated physical or primary evidence.',
    automaticRaiseMode: 'automatic-increase-disabled'
  },
  'paranormal claim': {
    score: 7, floor: 1, ceiling: 24, movement: 1, window: 'Open evidence watch',
    evidenceGate: 'Public-record mentions cannot verify a metaphysical claim. Automated increases are disabled pending repeatable evidence or authenticated records.',
    automaticRaiseMode: 'automatic-increase-disabled'
  },
  'unsupported extreme allegation': {
    score: 5, floor: 0, ceiling: 18, movement: 1, window: 'Evidence quarantine',
    evidenceGate: 'Rumour, symbol, social proximity and anonymous claims cannot raise the score. Automated increases are disabled; only case-specific primary evidence may trigger human review.',
    automaticRaiseMode: 'automatic-increase-disabled'
  }
};

function researchBrief(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('control system')) return 'Map public mechanisms: policy papers, funding, legal mandates, enforcement tools, public-private partnerships, identity layers, financial rails and practical opt-out limits.';
  if (cat.includes('modern slavery')) return 'Use case-level court, police, labour-inspection, sanctions, company and victim-protection records.';
  if (cat.includes('elite') || cat.includes('occult')) return 'Separate symbolism, rumour, satire, folklore, public association and case records. Do not convert symbols or proximity into crime claims.';
  if (cat.includes('alien') || cat.includes('false reality') || cat.includes('hidden earth')) return 'Track official statements, declassified records, scientific evidence, photographs, metadata, witness claims and debunks separately.';
  if (cat.includes('mind') || cat.includes('psyops') || cat.includes('tech')) return 'Separate known programmes, patents, platform incentives, academic research and marketing psychology from claims of deployed covert systems.';
  if (cat.includes('medical') || cat.includes('bio')) return 'Use court records, regulator files, official datasets, peer-reviewed material, contracts and whistleblower records; avoid medical certainty without evidence.';
  if (cat.includes('hidden history')) return 'Use primary documents, archaeology, provenance, dating methods and expert disagreement; screenshots are not enough.';
  return 'Build the claim from source type, date, actor, mechanism, evidence strength, counter-source and a falsification test.';
}

function supportStandard(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('paranormal')) return 'Repeatable evidence, authenticated records, reliable witness chains, physical evidence or a clear admission from a responsible actor.';
  if (value.includes('internet mythology')) return 'Original documents, verified image or video metadata, official records, named witnesses or physical evidence that survives debunking.';
  if (value.includes('case-specific')) return 'A court file, official report, dated record, authenticated exhibit, physical evidence or multiple independent case sources.';
  if (value.includes('public-record fact')) return 'Official datasets, court records, regulator material, inspections, sanctions or named public investigations.';
  if (value.includes('unsupported extreme')) return 'Case-specific primary evidence with chain of custody and independent corroboration; anonymous or symbolic material is insufficient.';
  return 'Records identifying mechanism, actor, date, funding, implementation, enforcement and a direct line from claim to action.';
}

function riskRating(label, category) {
  const value = String(label || '').toLowerCase();
  const cat = String(category || '').toLowerCase();
  if (value.includes('unsupported extreme')) return 'Evidence quarantine: claim-history and counter-source lane only.';
  if (value.includes('paranormal') || value.includes('internet mythology')) return 'Mythic/speculative: never attach to a real person as fact.';
  if (value.includes('case-specific')) return 'Case-specific: requires a named record or credible investigation.';
  if (value.includes('public-record fact')) return 'Documentable: official, court, regulator or reputable records required.';
  if (cat.includes('control system') || value.includes('public-record-adjacent')) return 'Convergence watch: track mechanisms, enforcement, money, technology and opt-out limits.';
  return 'Open research: classify before belief.';
}

function sectionFor(category) {
  const cat = String(category || '');
  if (cat.startsWith('Control System /')) return 'Control System Convergence';
  if (/^(Elite|Occult Power)/.test(cat)) return 'Elite, Blackmail and Ritual Claims';
  if (/^(Demons|Simulation)/.test(cat)) return 'Metaphysics and Soul-Prison Claims';
  if (/^(Aliens|Hidden Earth|False Reality)/.test(cat)) return 'Aliens, UAP and Hidden Bases';
  if (/^(Mind Control|Media \/ Psyops|Tech \/ Psyops)/.test(cat)) return 'Mind Control, Media and Psyops';
  if (cat === 'Modern Slavery') return 'Documentable Exploitation and Trafficking';
  if (cat === 'Medical / Bio') return 'Medical and Bio Allegations';
  if (/^Tech \/(Religion|Control)/.test(cat)) return 'Technology, Religion and Smart Cities';
  if (cat === 'Hidden History') return 'Hidden History and Cataclysm Claims';
  return 'Other Classified Claims';
}

function missionThemes(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('money')) return ['money-currency-access', 'identity-surveillance', 'global-governance-convergence'];
  if (cat.includes('identity')) return ['identity-surveillance', 'money-currency-access', 'global-governance-convergence'];
  if (cat.includes('health') || cat.includes('medical') || cat.includes('bio')) return ['health-biosecurity', 'identity-surveillance', 'global-governance-convergence'];
  if (cat.includes('war')) return ['security-emergency-power', 'corporate-state-convergence', 'information-narrative'];
  if (cat.includes('climate') || cat.includes('food') || cat.includes('control system')) return ['global-governance-convergence', 'corporate-state-convergence', 'identity-surveillance'];
  if (cat.includes('modern slavery') || cat.includes('elite') || cat.includes('blackmail')) return ['disclosure-record-control', 'corporate-state-convergence'];
  if (cat.includes('mind') || cat.includes('psyops') || cat.includes('media') || cat.includes('tech')) return ['information-narrative', 'identity-surveillance', 'corporate-state-convergence'];
  return ['disclosure-record-control', 'information-narrative'];
}

function trackerLane(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('global governance')) return 'agenda-2030-and-global-standards';
  if (cat.includes('money')) return 'programmable-money';
  if (cat.includes('identity')) return 'digital-id';
  if (cat.includes('climate')) return 'climate-energy-and-carbon';
  if (cat.includes('war')) return 'security-and-war-powers';
  if (cat.includes('health')) return 'health-and-biosecurity';
  if (cat.includes('food')) return 'food-water-land-and-supply-chains';
  return '';
}

function raiseRule(claim, policy) {
  return `Raise only when ${policy.evidenceGate} The evidence must directly address the classified claim “${claim.title}”, not merely repeat its keywords.`;
}

function lowerRule(claim) {
  return `Lower when the claim is corrected, debunked, contradicted by stronger primary evidence, based on a false date or identity, lacks chain of custody, is rejected by a court or investigation, or has a stronger innocent explanation.`;
}

const definitions = (data.claims || []).map(claim => {
  const policy = labelPolicy[claim.label] || labelPolicy['symbolic/occult speculation'];
  const encoded = encodeURIComponent(claim.title);
  return {
    slug: `spec-${claim.slug}`,
    category: 'Speculative Watch',
    speculationSection: sectionFor(claim.category),
    speculationGroup: claim.category,
    claimClass: claim.label,
    sourceClaimSlug: claim.slug,
    sourceDataset: 'data/dark-speculation-claims.json',
    weeklyScanOutput: 'downloads/dark-speculation-scan.json',
    title: `${claim.title} Clock`,
    score: policy.score,
    window: policy.window,
    signals: `Tracks source-linked evidence, counter-sources and falsifiers around the classified claim “${claim.title}”. The score measures evidential pressure around the claim, not truth, guilt or event probability.`,
    readerQuestion: `What verifiable evidence would support or falsify the classified claim “${claim.title}”?`,
    nextRoute: `dark-speculation-lab.html#${claim.slug}`,
    secondaryRoute: `search.html?q=${encoded}`,
    claimClassifierRoute: 'claim-classifier.html',
    sourceVaultRoute: 'source-document-vault.html',
    counterSourceRoute: 'dark-speculation-forum.html',
    keywords: [...new Set([claim.title, ...(claim.keywords || [])])],
    missionThemeIds: missionThemes(claim.category),
    trackerLane: trackerLane(claim.category),
    raiseRule: raiseRule(claim, policy),
    lowerRule: lowerRule(claim),
    baselineScore: policy.score,
    scoreFloor: policy.floor,
    scoreCeiling: policy.ceiling,
    maxMovementPerBuild: policy.movement,
    evidenceWindowDays: claim.label === 'public-record fact lane' ? 365 : 730,
    latestDrops: [],
    homepageEligible: false,
    automaticUpdate: true,
    speculationOnly: true,
    automaticRaiseMode: policy.automaticRaiseMode,
    evidenceGate: policy.evidenceGate,
    researchBrief: researchBrief(claim.category),
    supportStandard: supportStandard(claim.label),
    falsificationTest: 'Wrong date, misidentified person or symbol, fake document, missing chain of custody, innocent explanation, official correction, court rejection or a stronger counter-source.',
    riskRating: riskRating(claim.label, claim.category),
    boundary: `${claim.boundary} This clock is a classified evidence-pressure watch. It is not confirmation, probability, accusation or proof about any person.`,
    sourcePageBoundary: data.boundary
  };
});

module.exports = definitions;
