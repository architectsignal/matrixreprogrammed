'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const mission = 'Matrix Reprogrammed is a public accountability system where anyone can search a consequence, trace it backwards through decisions, authority and money, follow the unanswered questions, and return to see what actually happened.';
const touched = [];

for (const base of roots) {
  const file = path.join(base, 'welcome-gate.js');
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  after = after.replace('  mountHomepageCommandRail();', "  if (!document.body.classList.contains('accountability-home')) mountHomepageCommandRail();");
  if (!after.includes(mission)) throw new Error(`Approved mission is missing from ${path.relative(root, file)}`);
  if (!after.includes("matrix-reprogrammed-signal-gate-entered-accountability-v1")) throw new Error(`Mission intro storage version is missing from ${path.relative(root, file)}`);
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'accountability-mission-intro-report.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  mission,
  voiceRoute: '/intro-voice',
  browserFallback: true,
  simpleHomepageProtected: true,
  touched
}, null, 2) + '\n');
console.log('Voiced accountability mission intro finalized without restoring the legacy command rail on the simple homepage.');
