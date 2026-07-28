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
  .replace(/\.\.\.entity\.notes\b/g, '...array(entity.notes)')
  .replace(/\.\.\.entity\.aliases\b/g, '...array(entity.aliases)')
  .replace(/entity\.powerRoles\.length\b/g, 'array(entity.powerRoles).length');

if (source === original && !source.includes('...array(entity.notes)') && !source.includes('...array(entity.aliases)')) {
  throw new Error('Exposure engine optional-array hardening target was not found');
}
if (/\.\.\.entity\.(?:notes|aliases)\b/.test(source)) throw new Error('Unsafe optional entity-array spread remains in Exposure Integrity Engine');
if (/entity\.powerRoles\.length\b/.test(source)) throw new Error('Unsafe optional power-role length access remains in Exposure Integrity Engine');

fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(runtimePath, source);
try {
  require(runtimePath);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
console.log('Exposure Integrity runtime wrapper completed with all optional entity arrays normalized.');
