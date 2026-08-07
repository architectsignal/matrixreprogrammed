#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const markerRelative = path.join('.github', 'production-release.freeze');
const markerPath = path.join(root, markerRelative);
const frozen = fs.existsSync(markerPath) && fs.statSync(markerPath).isFile();
const marker = frozen ? fs.readFileSync(markerPath, 'utf8') : '';
const valid = !frozen || /^MATRIX REPROGRAMMED PRODUCTION RELEASE FREEZE\s*$/m.test(marker);

if (frozen && !valid) {
  console.error(`Invalid release-freeze marker: ${markerRelative}`);
  process.exit(2);
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `frozen=${frozen ? 'true' : 'false'}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `marker=${markerRelative.split(path.sep).join('/')}\n`);
}

if (process.argv.includes('--is-frozen')) {
  process.exit(frozen ? 0 : 1);
}
if (process.argv.includes('--require-frozen')) {
  if (!frozen) {
    console.error('Controlled production release freeze is required but not active.');
    process.exit(1);
  }
  console.log('Controlled production release freeze is active.');
  process.exit(0);
}

console.log(frozen
  ? `Controlled production release freeze ACTIVE: ${markerRelative}. Automated commit, push and direct deploy steps must skip.`
  : 'Controlled production release freeze is not active.');
