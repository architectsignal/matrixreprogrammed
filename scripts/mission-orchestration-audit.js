'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const read = value => exists(value) ? fs.readFileSync(at(value), 'utf8') : '';
const readJson = (value, fallback = {}) => { try { return JSON.parse(read(value)); } catch { return fallback; } };
const clean = (value, max = 3000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];

const standard = readJson('data/mission-orchestration-standard.json', {});
const watch = readJson('data/daily-watch.json', {});
const graph = readJson('data/evidence-weighted-relationship-graph.json', { edges: [] });
const wall = readJson('data/clock-wall.json', { clocks: [] });
const publication = readJson('downloads/daily-watch-publication-report.json', {});
const checks = [];
const add = (id, ok, detail, fix = '') => checks.push({ id, ok: Boolean(ok), detail, fix });

add('authoritative-standard', standard.status === 'authoritative-build-contract', `Standard status: ${standard.status || 'missing'}.`, 'Restore data/mission-orchestration-standard.json and keep it in the authoritative build path.');
add('required-pipeline', array(standard.requiredPipeline).length >= 10, `${array(standard.requiredPipeline).length} orchestration stages declared.`, 'Require capture, verification, contradiction search, conclusion, propagation, review and versioning.');
add('required-conclusion-fields', array(standard.requiredConclusionFields).length >= 12, `${array(standard.requiredConclusionFields).length} conclusion fields declared.`, 'Restore the complete plain-language conclusion contract.');
add('daily-watch-data', watch.ok && watch.person && watch.institution && watch.family, `Daily watch ${watch.ok ? 'exists' : 'is missing or failed'}.`, 'Run scripts/build-daily-watch.js.');

const required = array(standard.requiredConclusionFields);
for (const slot of ['person','institution','family']) {
  const item = watch[slot] || {};
  const missing = required.filter(field => {
    const value = item[field];
    return Array.isArray(value) ? value.length === 0 : !clean(value, 5000);
  });
  add(`watch-${slot}-fields`, missing.length === 0, `${slot} watch: ${item.name || 'missing name'}; missing fields: ${missing.join(', ') || 'none'}.`, `Populate every required conclusion field for the ${slot} watch.`);
  add(`watch-${slot}-sources`, array(item.sourceRoutes).length > 0, `${array(item.sourceRoutes).length} source route(s) attached to ${slot} watch.`, 'Attach a direct evidence route or an explicit missing-record route.');
  add(`watch-${slot}-boundary`, clean(item.whatItDoesNotProve, 1000).length > 40, `${slot} watch ${clean(item.whatItDoesNotProve, 1000).length > 40 ? 'contains' : 'lacks'} an explicit limitation.`, 'State what the selection does not prove.');
}
add('distinct-watch-entities', watch.person?.name !== watch.institution?.name, `Person: ${watch.person?.name || 'missing'}; institution: ${watch.institution?.name || 'missing'}.`, 'Do not publish the same unresolved entity in both slots.');
add('family-selection-boundary', /structural watch|direct/i.test(watch.family?.selectionBasis || ''), `Family selection basis: ${clean(watch.family?.selectionBasis, 320) || 'missing'}.`, 'State whether the family is elevated by direct current evidence or structural lane overlap.');
add('publication-surfaces', publication.ok && array(publication.pages).length >= 3, `${array(publication.pages).length} public daily-watch surfaces patched.`, 'Publish the watch to the homepage, Daily Brief and Live Intel at minimum.');

for (const page of ['index.html','daily-command-brief.html','live-intel.html']) {
  add(`surface-${page}`, /<!-- daily-mission-watch:start -->/.test(read(page)), `${page} ${/<!-- daily-mission-watch:start -->/.test(read(page)) ? 'contains' : 'does not contain'} the daily watch.`, `Run scripts/inject-daily-watch-surfaces.js after all legacy generators for ${page}.`);
}

const edges = array(graph.edges);
const badEdges = edges.filter(edge => !clean(edge.relationshipType || edge.type || edge.predicate, 200) || !clean(edge.evidenceGrade || edge.grade || edge.status, 200) || !clean(edge.evidenceBoundary || edge.boundary, 800) || (!array(edge.sourceRoutes).length && !clean(edge.sourceRoute || edge.evidenceRoute || edge.route || edge.missingSourceReason, 800)));
add('relationship-contracts', edges.length > 0 && badEdges.length === 0, `${edges.length} edges checked; ${badEdges.length} violate relationship evidence contracts.`, 'Run scripts/enforce-mission-data-contracts.js and restore missing provenance.');

const clocks = array(wall.clocks);
const badClocks = clocks.filter(clock => !clean(clock.lastMovement, 1000) || !clean(clock.controlSystemMeaning, 1400) || !clean(clock.boundary || clock.evidenceBoundary || clock.claimBoundary, 900) || (!array(clock.evidenceInputs).length && !(clean(clock.noMovementReason, 900) && clock.scoreChanged === false)));
add('clock-meaning-contracts', clocks.length > 0 && badClocks.length === 0, `${clocks.length} clocks checked; ${badClocks.length} lack evidence inputs or an explicit no-movement state, mission meaning or boundary.`, 'Run scripts/enforce-mission-data-contracts.js after the clock wall is generated.');

const sensitiveText = ['person','institution','family'].map(slot => JSON.stringify(watch[slot] || {})).join(' ').toLowerCase();
const mentionsChildCrime = /child sexual|child abuse|child exploitation|child trafficking|minor offence|minor offense/.test(sensitiveText);
const safeguardingComplete = !mentionsChildCrime || (/legal status|convict|charg|court|official/.test(sensitiveText) && /does not prove|not prove/.test(sensitiveText));
add('sensitive-claim-safeguard', safeguardingComplete, mentionsChildCrime ? 'Child-crime language is present and was checked for legal-status and limitation wording.' : 'No child-crime assertion appears in today’s watch.', 'Do not publish a child-crime flag without exact legal status, source provenance, limitation and editorial review.');

const failures = checks.filter(check => !check.ok);
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  overall: failures.length ? 'blocked' : 'ready',
  summary: { total: checks.length, passed: checks.length - failures.length, failed: failures.length },
  watch: { date: watch.date, person: watch.person?.name, institution: watch.institution?.name, family: watch.family?.name },
  dataDepth: { relationshipEdges: edges.length, clocks: clocks.length, badEdges: badEdges.length, badClocks: badClocks.length },
  checks,
  failures,
  nextPriorities: [
    'Propagate every approved legal-status change to the subject dossier, case page, wrongdoing index, timeline, graph, reports and alerts.',
    'Index daily-watch.html and its JSON after publication.',
    'Add user follow controls for the three daily entities and notify only on material evidence changes.',
    'Generate a weekly delta showing which watch selections were strengthened, weakened, corrected or disproven.'
  ]
};

fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/mission-orchestration-audit.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(at('downloads/mission-orchestration-audit.md'), ['# Mission Orchestration Audit','',`Generated: ${report.generatedAt}`,`Overall: ${report.overall}`,`Passed: ${report.summary.passed}/${report.summary.total}`,'','## Daily Watch','',`- Person: ${report.watch.person || 'missing'}`,`- Institution: ${report.watch.institution || 'missing'}`,`- Family: ${report.watch.family || 'missing'}`,'','## Checks','',...checks.map(check => `- **${check.ok ? 'PASS' : 'FAIL'} · ${check.id}:** ${check.detail}${check.ok || !check.fix ? '' : ` Fix: ${check.fix}`}`),'','## Next Priorities','',...report.nextPriorities.map(item => `- ${item}`)].join('\n'));

if (failures.length) {
  console.error(`MISSION ORCHESTRATION AUDIT FAILED: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure.id}: ${failure.detail}`);
  process.exit(1);
}
console.log(`Mission orchestration audit passed: ${checks.length} checks; ${edges.length} edges; ${clocks.length} clocks.`);
