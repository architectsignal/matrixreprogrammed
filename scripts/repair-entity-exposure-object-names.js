const fs = require('fs');
const path = require('path');

const root = process.cwd();
const generatorPath = path.join(root, 'scripts', 'build-entity-exposure-index.js');
if (!fs.existsSync(generatorPath)) throw new Error('build-entity-exposure-index.js is missing');

const source = fs.readFileSync(generatorPath, 'utf8');
const requiredMarkers = [
  'function scalarText(value, depth = 0)',
  "const briefName = clean(brief.name);",
  'const from = clean(relationship.from);',
  'const to = clean(relationship.to);',
  "if (/\\[object Object\\]|\\bobject Object\\b/.test(generatedText))"
];
const missing = requiredMarkers.filter(marker => !source.includes(marker));
if (missing.length) throw new Error(`Entity exposure generator is missing safety markers: ${missing.join(', ')}`);
if (/function clean\([^)]*\)\s*\{\s*return String\(/.test(source)) {
  throw new Error('Entity exposure generator still stringifies object-valued labels directly');
}
console.log('Entity exposure object-name safety guard passed.');
