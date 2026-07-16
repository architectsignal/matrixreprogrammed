'use strict';

const fs = require('fs');
const path = require('path');
const definitions = require('./public-usefulness-clocks.js');
const root = process.cwd();
const issues = [];
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const source = read('data/global-risk-clocks.json');
const wall = read('data/clock-wall.json');
const html = fs.readFileSync(path.join(root, 'timers.html'), 'utf8');
const sourceLookup = new Map((source.clocks || []).map(clock => [clock.slug, clock]));
const wallLookup = new Map((wall.clocks || []).map(clock => [clock.slug, clock]));

if (definitions.length !== 20) issues.push(`expected 20 reader-facing definitions, found ${definitions.length}`);
for (const category of ['Your Freedom', 'Your Money', 'Your Essential Services', 'Your Government']) {
  if (!html.includes(`>${category}<`)) issues.push(`timers page missing ${category} group`);
}
for (const definition of definitions) {
  const sourceClock = sourceLookup.get(definition.slug);
  const wallClock = wallLookup.get(definition.slug);
  if (!sourceClock) { issues.push(`canonical source missing ${definition.slug}`); continue; }
  if (!wallClock) { issues.push(`clock wall missing ${definition.slug}`); continue; }
  if (!html.includes(`id="${definition.slug}"`)) issues.push(`timers page missing card ${definition.slug}`);
  if (sourceClock.automaticUpdate !== true) issues.push(`${definition.slug} automaticUpdate is not true`);
  if (!sourceClock.evidenceFingerprint) issues.push(`${definition.slug} missing evidence fingerprint`);
  if (!sourceClock.automaticUpdateStatus) issues.push(`${definition.slug} missing update status`);
  if (!sourceClock.automaticUpdateReason) issues.push(`${definition.slug} missing update reason`);
  if (!Number.isFinite(Number(sourceClock.maxMovementPerBuild)) || Number(sourceClock.maxMovementPerBuild) > 5) issues.push(`${definition.slug} invalid movement cap`);
  if (Number(sourceClock.score) < Number(sourceClock.scoreFloor) || Number(sourceClock.score) > Number(sourceClock.scoreCeiling)) issues.push(`${definition.slug} score outside bounds`);
  if (!Array.isArray(wallClock.evidenceInputs)) issues.push(`${definition.slug} evidenceInputs missing`);
  if (!Array.isArray(wallClock.sourceRoutes) || !wallClock.sourceRoutes.length) issues.push(`${definition.slug} source routes missing`);
  if (!Array.isArray(wallClock.whatRaises) || !wallClock.whatRaises.length) issues.push(`${definition.slug} raise rules missing`);
  if (!Array.isArray(wallClock.whatLowers) || !wallClock.whatLowers.length) issues.push(`${definition.slug} lower rules missing`);
  if (wallClock.category !== definition.category) issues.push(`${definition.slug} category mismatch`);
  if (wallClock.automaticUpdateEnabled !== true) issues.push(`${definition.slug} wall automatic update marker missing`);
  if (!/repetition alone/i.test(wallClock.calculationBasis || '')) issues.push(`${definition.slug} calculation does not reject repetition inflation`);
}
if (!/evidence fingerprints/i.test(source.automaticUpdatePolicy || '')) issues.push('canonical automatic update policy missing evidence fingerprint rule');
if (Number(wall.publicUsefulnessClockCount) !== 20) issues.push('clock wall public usefulness count must be 20');
if (issues.length) {
  console.error('PUBLIC USEFULNESS CLOCKS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`PUBLIC USEFULNESS CLOCKS TEST PASSED: ${definitions.length} clocks grouped and evidence-wired.`);
