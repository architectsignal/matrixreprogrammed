'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'build-exposure-integrity-engine.js');
const runtimeDir = path.join(root, '.generated');
const runtimePath = path.join(runtimeDir, 'build-exposure-integrity-engine.runtime.js');

if (!fs.existsSync(sourcePath)) throw new Error('Missing scripts/build-exposure-integrity-engine.js');
let source = fs.readFileSync(sourcePath, 'utf8');
const original = source;

source = source
  .replace('...entity.notes, ...entity.aliases, powerMechanismFor(entity)', '...array(entity.notes), ...array(entity.aliases), powerMechanismFor(entity)')
  .replace('entity.powerRoles.length || entity.nodeScore >= 60', 'array(entity.powerRoles).length || entity.nodeScore >= 60');

if (source === original) {
  if (!source.includes('...array(entity.notes), ...array(entity.aliases)')) {
    throw new Error('Exposure engine optional-array hardening target was not found');
  }
}
if (/\.\.\.entity\.(?:notes|aliases)\b/.test(source)) throw new Error('Unsafe optional entity-array spread remains in Exposure Integrity Engine');

fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(runtimePath, source);
try {
  require(runtimePath);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
console.log('Exposure Integrity runtime wrapper completed with optional entity arrays normalized.');
