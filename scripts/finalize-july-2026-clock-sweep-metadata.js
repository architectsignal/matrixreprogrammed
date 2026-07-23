'use strict';

const fs = require('fs');
const path = require('path');
const practical = require('./public-usefulness-clocks.js');
const speculative = require('./speculation-clocks.js');
const definitions = [...practical, ...speculative];
const root = process.cwd();
const sourcePath = path.join(root, 'data', 'global-risk-clocks.json');
const wallPath = path.join(root, 'data', 'clock-wall.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const wall = JSON.parse(fs.readFileSync(wallPath, 'utf8'));
const lookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));
const finalClocks = definitions.map(definition => lookup.get(definition.slug)).filter(Boolean);
const gaps = finalClocks.filter(clock => clock.todayStatus === 'current-evidence-gap' || !clock.july2026Sweep);
wall.currentEvidenceGapCount = gaps.length;
wall.currentPrimaryCoverageCount = practical.filter(definition => Number(lookup.get(definition.slug)?.currentOfficialEvidenceCount || 0) > 0).length;
wall.currentMultiJurisdictionCount = finalClocks.filter(clock => Array.isArray(clock.jurisdictionCoverage) && clock.jurisdictionCoverage.length >= 2).length;
wall.publicUsefulnessClockCount = practical.length;
wall.speculativeClockCount = speculative.length;
wall.readerClockRegistryCount = definitions.length;
wall.currentEvidenceAsOf = '2026-07-23T14:30:00.000Z';
wall.july2026FinalCoverage = {
  ok: gaps.length === 0,
  referenceDate: '2026-07-23',
  practicalCount: practical.length,
  speculativeCount: speculative.length,
  totalCount: definitions.length,
  evidenceGapCount: gaps.length,
  gapSlugs: gaps.map(clock => clock.slug)
};
source.currentEvidenceGapCount = gaps.length;
source.currentEvidenceAsOf = wall.currentEvidenceAsOf;
source.july2026FinalCoverage = wall.july2026FinalCoverage;
fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
fs.writeFileSync(wallPath, JSON.stringify(wall, null, 2));
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'july-2026-clock-coverage.json'), JSON.stringify(wall.july2026FinalCoverage, null, 2));
if (gaps.length) {
  console.error(`JULY 2026 CLOCK COVERAGE FAILED: ${gaps.length} gap(s): ${gaps.map(clock => clock.slug).join(', ')}`);
  process.exit(1);
}
console.log(`July 2026 clock coverage finalised: ${definitions.length} clocks, zero unclassified evidence gaps.`);
