'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const issues = [];
const sourceClaims = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dark-speculation-claims.json'), 'utf8'));
const definitions = require('./speculation-clocks.js');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data', 'global-risk-clocks.json'), 'utf8'));
const wall = JSON.parse(fs.readFileSync(path.join(root, 'data', 'clock-wall.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'timers.html'), 'utf8');
const sourceLookup = new Map((source.clocks || []).map(clock => [clock.slug, clock]));
const wallLookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));
const claimLookup = new Map((sourceClaims.claims || []).map(claim => [claim.slug, claim]));
const disabledClasses = new Set(['internet mythology', 'paranormal claim', 'unsupported extreme allegation']);

function need(condition, message) {
  if (!condition) issues.push(message);
}
function routeExists(route = '') {
  const clean = String(route).split('#')[0].split('?')[0].replace(/^\//, '');
  if (!clean || /^https?:\/\//i.test(clean)) return true;
  return fs.existsSync(path.join(root, clean));
}
function includesRoute(routes, route) {
  return Array.isArray(routes) && routes.some(value => String(value || '').split('#')[0].split('?')[0] === route);
}

need(Array.isArray(sourceClaims.claims) && sourceClaims.claims.length >= 49, `canonical speculation dataset must contain at least 49 claims; found ${(sourceClaims.claims || []).length}`);
need(definitions.length === (sourceClaims.claims || []).length, `speculation registry count ${definitions.length} does not match canonical claim count ${(sourceClaims.claims || []).length}`);
need(Number(wall.speculativeClockCount) === definitions.length, `clock wall speculative count must equal ${definitions.length}`);
need(Number(wall.readerClockRegistryCount) === Number(wall.publicUsefulnessClockCount || 0) + definitions.length, 'clock wall reader registry count does not equal practical plus speculative clocks');
need(Number(source.speculativeReaderClockCount) === definitions.length, `canonical source speculative count must equal ${definitions.length}`);
need(html.includes('Classified claims, not confirmed events'), 'timers page missing the speculation hard boundary');
need(html.includes('do not measure truth, guilt or probability'), 'timers page does not clearly separate evidence pressure from truth or probability');
need(html.includes('cannot rise automatically from mentions'), 'timers page missing automatic-increase prohibition');
need(html.includes('dark-speculation-lab.html'), 'timers page missing Dark Speculation Lab route');
need(html.includes('claim-classifier.html'), 'timers page missing Claim Classifier route');
need(html.includes('dark-speculation-forum.html'), 'timers page missing counter-source route');

const sections = [...new Set(definitions.map(definition => definition.speculationSection))];
for (const section of sections) need(html.includes(`>${section}<`), `timers page missing speculation section ${section}`);

for (const definition of definitions) {
  const original = claimLookup.get(definition.sourceClaimSlug);
  const sourceClock = sourceLookup.get(definition.slug);
  const wallClock = wallLookup.get(definition.slug);
  need(Boolean(original), `${definition.slug} does not map to a canonical Dark Speculation claim`);
  need(Boolean(sourceClock), `canonical source missing ${definition.slug}`);
  need(Boolean(wallClock), `clock wall missing ${definition.slug}`);
  need(html.includes(`id="${definition.slug}"`), `timers page missing ${definition.slug}`);
  if (!sourceClock || !wallClock) continue;

  need(sourceClock.speculationOnly === true, `${definition.slug} not marked speculationOnly`);
  need(sourceClock.homepageEligible === false, `${definition.slug} must be excluded from homepage alarm rankings`);
  need(sourceClock.automaticUpdate === true, `${definition.slug} automatic update disabled`);
  need(Boolean(sourceClock.evidenceFingerprint), `${definition.slug} missing evidence fingerprint`);
  need(Boolean(sourceClock.automaticUpdateStatus), `${definition.slug} missing automatic update status`);
  need(Boolean(sourceClock.automaticUpdateReason), `${definition.slug} missing automatic update reason`);
  need(Boolean(sourceClock.automaticEvidenceGate), `${definition.slug} missing automatic evidence gate`);
  need(sourceClock.automaticEvidenceGate?.mode === definition.automaticRaiseMode, `${definition.slug} automatic evidence gate mode mismatch`);
  need(Number(sourceClock.score) >= Number(sourceClock.scoreFloor) && Number(sourceClock.score) <= Number(sourceClock.scoreCeiling), `${definition.slug} score outside claim-class bounds`);
  need(Number(sourceClock.maxMovementPerBuild) >= 1 && Number(sourceClock.maxMovementPerBuild) <= 2, `${definition.slug} movement cap must remain one or two points`);
  need(routeExists(sourceClock.nextRoute), `${definition.slug} next route target missing: ${sourceClock.nextRoute}`);

  need(wallClock.speculationOnly === true, `${definition.slug} wall marker missing`);
  need(wallClock.category === 'Speculative Watch', `${definition.slug} category must remain Speculative Watch`);
  need(wallClock.claimClass === original.label, `${definition.slug} claim class does not match source dataset`);
  need(wallClock.speculationGroup === original.category, `${definition.slug} source lane does not match source dataset`);
  need(Boolean(wallClock.speculationSection), `${definition.slug} broad speculation section missing`);
  need(Boolean(wallClock.evidenceGate), `${definition.slug} evidence gate missing`);
  need(Boolean(wallClock.supportStandard), `${definition.slug} support standard missing`);
  need(Boolean(wallClock.falsificationTest), `${definition.slug} falsification test missing`);
  need(Boolean(wallClock.riskRating), `${definition.slug} risk rating missing`);
  need(Array.isArray(wallClock.evidenceInputs), `${definition.slug} evidence inputs missing`);
  need(includesRoute(wallClock.sourceRoutes, 'dark-speculation-lab.html'), `${definition.slug} missing Dark Speculation Lab source route`);
  need(includesRoute(wallClock.sourceRoutes, 'claim-classifier.html'), `${definition.slug} missing Claim Classifier route`);
  need(includesRoute(wallClock.sourceRoutes, 'dark-speculation-forum.html'), `${definition.slug} missing counter-source route`);
  need(/not confirmation|not truth|not a truth|not.*probability|not confirmation, probability/i.test(`${wallClock.scoreDefinition} ${wallClock.boundary}`), `${definition.slug} lacks explicit truth/probability boundary`);
  need(/repetition alone cannot raise/i.test(wallClock.calculationBasis || ''), `${definition.slug} does not reject repetition inflation`);

  if (disabledClasses.has(definition.claimClass)) {
    need(definition.automaticRaiseMode === 'automatic-increase-disabled', `${definition.slug} high-risk claim class must disable automatic increases`);
    need(Number(sourceClock.scoreCeiling) <= (definition.claimClass === 'unsupported extreme allegation' ? 18 : definition.claimClass === 'paranormal claim' ? 24 : 30), `${definition.slug} high-risk score ceiling is too high`);
  }
}

const speculativeHomepageClocks = ((JSON.parse(fs.readFileSync(path.join(root, 'data', 'homepage-command-surface.json'), 'utf8')).criticalClocks) || [])
  .filter(clock => String(clock.slug || '').startsWith('spec-'));
need(speculativeHomepageClocks.length === 0, 'speculation clocks leaked into homepage critical-clock rankings');

if (issues.length) {
  console.error('SPECULATION CLOCKS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`SPECULATION CLOCKS TEST PASSED: ${definitions.length} canonical claims are classified, evidence-gated, counter-source-wired and excluded from homepage alarm rankings.`);
