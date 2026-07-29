'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const owner = path.join(root, 'scripts', 'reconcile-release-homepage-order.js');

if (!fs.existsSync(owner)) throw new Error('Canonical release homepage reconciler is missing');
const result = spawnSync(process.execPath, [owner], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 50 * 1024 * 1024
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error('Canonical release homepage reconciliation failed');

const repaired = [];
const checked = [];
const convertedDuplicateAnchors = [];

function convertIdToDataAttribute(tag, id) {
  let next = tag.replace(/\s*\bid\s*=\s*(["'])(consequence-[^"']+)\1/i, '');
  if (!/\bdata-contract-id\s*=/.test(next)) {
    next = next.replace(/^<([a-z][\w:-]*)\b/i, `<$1 data-contract-id="${id}"`);
  }
  return next;
}

function reconcile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = fs.readFileSync(file, 'utf8');

  const compactNormalized = before.replace(/<article\b[^>]*>/gi, tag => {
    const isCompactContract = /\bclass\s*=\s*["'][^"']*\bconsequence-contract-card\b[^"']*\bcompact\b[^"']*["']/i.test(tag);
    if (!isCompactContract) return tag;
    const idMatch = tag.match(/\bid\s*=\s*(["'])(consequence-[^"']+)\1/i);
    return idMatch ? convertIdToDataAttribute(tag, idMatch[2]) : tag;
  });

  const seenConsequenceIds = new Set();
  const after = compactNormalized.replace(/<([a-z][\w:-]*)\b[^>]*>/gi, tag => {
    const idMatch = tag.match(/\bid\s*=\s*(["'])(consequence-[^"']+)\1/i);
    if (!idMatch) return tag;
    const id = idMatch[2];
    if (!seenConsequenceIds.has(id)) {
      seenConsequenceIds.add(id);
      return tag;
    }
    convertedDuplicateAnchors.push({ file: path.relative(root, file), id });
    return convertIdToDataAttribute(tag, id);
  });

  if (after !== before) {
    fs.writeFileSync(file, after);
    repaired.push(path.relative(root, file));
  }

  const text = after;
  const ids = [...text.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) throw new Error(`${path.relative(root, file)} still contains duplicate IDs: ${duplicates.join(', ')}`);

  const compactAnchors = [...text.matchAll(/<article\b[^>]*\bclass\s*=\s*["'][^"']*\bconsequence-contract-card\b[^"']*\bcompact\b[^"']*["'][^>]*>/gi)]
    .filter(match => /\bid\s*=/.test(match[0]));
  if (compactAnchors.length) throw new Error(`${path.relative(root, file)} still gives compact consequence previews anchor IDs`);

  if (!text.includes('href="live-intel.html"') || !text.includes('live-intel-machine-route')) {
    throw new Error(`${path.relative(root, file)} is missing the canonical Live Intel route contract`);
  }
  checked.push(path.relative(root, file));
}

reconcile(path.join(root, 'index.html'));
reconcile(path.join(outputRoot, 'index.html'));
reconcile(path.join(outputRoot, 'index'));

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  checked,
  repaired,
  convertedDuplicateAnchors,
  rule: 'Each consequence anchor ID has one owner per homepage document. Compact previews and every later duplicate occurrence use data-contract-id regardless of element type, CSS class or attribute order. The canonical Live Intel route is restored after every late release mutator.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot)) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), path.join(outputRoot, 'downloads', 'homepage-contract-integrity.json'));
}
console.log(`Homepage contract integrity reconciled: ${repaired.length} file(s) repaired, ${convertedDuplicateAnchors.length} duplicate consequence anchor(s) converted; Live Intel route preserved.`);
