'use strict';

const BASELINES = {
  'public-record fact lane': 45,
  'public-record-adjacent': 35,
  'case-specific evidence required': 25,
  'control-system hypothesis': 22,
  'symbolic/occult speculation': 14,
  'internet mythology': 8,
  'paranormal claim': 6,
  'unsupported extreme allegation': 5
};
const WINDOWS = {
  'public-record fact lane': '0–3 years',
  'public-record-adjacent': '0–7 years',
  'case-specific evidence required': 'Open case watch',
  'control-system hypothesis': '0–10 years',
  'symbolic/occult speculation': 'Open-ended',
  'internet mythology': 'Open-ended',
  'paranormal claim': 'Open-ended',
  'unsupported extreme allegation': 'Evidence-threshold watch'
};
function slugify(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 82);
}
function make(spec) {
  const evidenceClass = spec.evidenceClass;
  const baseline = BASELINES[evidenceClass] ?? 10;
  const publicAdjacent = evidenceClass === 'public-record fact lane' || evidenceClass === 'public-record-adjacent';
  return {
    slug: `speculation-${slugify(spec.title)}`,
    category: 'Speculative Watch',
    speculationGroup: spec.group,
    evidenceClass,
    title: spec.title.endsWith('Clock') || spec.title.endsWith('Monitor') ? spec.title : `${spec.title} Claim Monitor`,
    score: baseline,
    window: WINDOWS[evidenceClass] || 'Open-ended',
    signals: spec.brief,
    readerQuestion: spec.question || 'What verified evidence supports, weakens or falsifies this claim?',
    nextRoute: 'dark-speculation-forum.html',
    secondaryRoute: 'evidence-vault.html',
    keywords: spec.keywords,
    missionThemeIds: spec.themes || ['disclosure-record-control'],
    trackerLane: spec.trackerLane || '',
    raiseRule: spec.support,
    lowerRule: spec.falsifiers,
    baselineScore: baseline,
    scoreFloor: publicAdjacent ? 5 : 1,
    scoreCeiling: publicAdjacent ? 85 : 60,
    maxMovementPerBuild: publicAdjacent ? 2 : 1,
    evidenceWindowDays: publicAdjacent ? 730 : 3650,
    latestDrops: [],
    homepageEligible: false,
    automaticUpdate: true,
    claimBoundary: spec.boundary,
    riskInterpretation: spec.risk
  };
}
module.exports = { make };
