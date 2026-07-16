'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const root = process.cwd();
const scripts = [
  'merge-public-usefulness-clocks.js',
  'build-clock-wall.js',
  'enrich-public-usefulness-clock-evidence.js',
  'update-public-usefulness-clock-scores.js',
  'build-clock-wall.js',
  'enrich-public-usefulness-clock-evidence.js',
  'group-clock-wall-page.js'
];

for (const script of scripts) {
  execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
}

console.log('Public usefulness clock system built and grouped.');
