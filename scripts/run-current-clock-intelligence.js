'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'upgrade-current-clock-intelligence.js');
const tempPath = path.join(root, 'scripts', '.upgrade-current-clock-intelligence.runtime.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const broken = '    currentEvidenceWindowDays,\n';
const fixed = '    currentEvidenceWindowDays: currentWindowDays,\n';
if (!source.includes(broken) && !source.includes(fixed)) {
  throw new Error('Current-clock upgrade field could not be located for validation.');
}
const runtime = source.includes(broken) ? source.replace(broken, fixed) : source;
fs.writeFileSync(tempPath, runtime);
try {
  require(tempPath);
} finally {
  try { fs.unlinkSync(tempPath); } catch (_) {}
}
