'use strict';

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
  'render-public-usefulness-clock-wall.js',
  'run-current-clock-intelligence.js',
  'render-current-clock-intelligence-ui.js',
  'current-clock-intelligence-test.js'
];

for (const script of scripts) {
  execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
}

console.log('Public usefulness clock system built from current evidence, scored, current-status classified, fact/speculation separated and release-gated.');