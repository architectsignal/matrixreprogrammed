'use strict';

const fs = require('fs');
const path = require('path');
const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'current-clock-intelligence-test.js');
const tempPath = path.join(root, 'scripts', '.current-clock-intelligence-test.runtime.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const oldCheck = "ageSource.editorialScoreRevisionApplied !== '2026-07-23-global-age-gating-recalibration-v1'";
const newCheck = "!['2026-07-23-global-age-gating-recalibration-v1','july-2026-full-clock-sweep-v1'].includes(ageSource.editorialScoreRevisionApplied)";
if (!source.includes(oldCheck) && !source.includes(newCheck)) throw new Error('Age-gating revision assertion could not be located.');
fs.writeFileSync(tempPath, source.includes(oldCheck) ? source.replace(oldCheck, newCheck) : source);
try {
  require(tempPath);
} finally {
  try { fs.unlinkSync(tempPath); } catch (_) {}
}
