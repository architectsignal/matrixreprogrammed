'use strict';

// This is the first authoritative site build command. Repair source-state and
// active-ledger integrity here so every later dossier, brief, graph, clock,
// search index and conclusion consumes the same bounded evidence set.
require('./repair-investigation-data-integrity.js');

const { execFileSync } = require('child_process');
const path = require('path');

const root = process.cwd();
const scripts = [
  'merge-public-usefulness-clocks.js',
  'build-clock-wall.js',
  'enrich-public-usefulness-clock-evidence.js',
  'inject-current-clock-evidence.js',
  'update-public-usefulness-clock-scores.js',
  'build-clock-wall.js',
  'enrich-public-usefulness-clock-evidence.js',
  'inject-current-clock-evidence.js',
  'run-current-clock-intelligence.js',
  'run-july-2026-full-clock-sweep.js',
  'finalize-july-2026-clock-sweep-metadata.js',
  'render-public-usefulness-clock-wall.js',
  'render-current-clock-intelligence-ui.js',
  'run-current-clock-intelligence-test.js',
  'july-2026-all-clock-sweep-test.js'
];

for (const script of scripts) {
  execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
}

console.log('Mission Timer system built from July 2026 evidence: 20 practical and 49 speculative clocks scored, rendered, separated and release-gated.');
