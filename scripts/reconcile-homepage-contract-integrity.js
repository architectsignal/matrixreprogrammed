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
const protectedBlockPattern = /<!--[\s\S]*?-->|<(script|style|template|textarea)\b[\s\S]*?<\/\1\s*>/gi;
const protectedTokenPattern = /\u0000MR_PROTECTED_(\d+)\u0000/g;
const realIdPattern = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/i;
const consequenceIdPattern = /(?:^|\s)id\s*=\s*(["'])(consequence-[^"']+)\1/i;

function maskProtectedBlocks(html) {
  const blocks = [];
  const markup = html.replace(protectedBlockPattern, block => {
    const index = blocks.push(block) - 1;
    return `\u0000MR_PROTECTED_${index}\u0000`;
  });
  return {
    markup,
    restore(value) {
      return value.replace(protectedTokenPattern, (_, index) => blocks[Number(index)] || '');
    }
  };
}

function convertIdToDataAttribute(tag, id) {
  let next = tag.replace(/\s+id\s*=\s*(["'])(consequence-[^"']+)\1/i, '');
  if (!/\bdata-contract-id\s*=/.test(next)) {
    next = next.replace(/^<([a-z][\w:-]*)\b/i, `<$1 data-contract-id="${id}"`);
  }
  return next;
}

function openingTags(markup) {
  return [...markup.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)].map(match => match[0]);
}

function reconcile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = fs.readFileSync(file, 'utf8');
  const masked = maskProtectedBlocks(before);
  const seenConsequenceIds = new Set();

  let liveMarkup = masked.markup.replace(/<article\b[^>]*>/gi, tag => {
    const isCompactContract = /\bclass\s*=\s*["'][^"']*\bconsequence-contract-card\b[^"']*\bcompact\b[^"']*["']/i.test(tag);
    if (!isCompactContract) return tag;
    const idMatch = tag.match(consequenceIdPattern);
    return idMatch ? convertIdToDataAttribute(tag, idMatch[2]) : tag;
  });

  liveMarkup = liveMarkup.replace(/<([a-z][\w:-]*)\b[^>]*>/gi, tag => {
    const idMatch = tag.match(consequenceIdPattern);
    if (!idMatch) return tag;
    const id = idMatch[2];
    if (!seenConsequenceIds.has(id)) {
      seenConsequenceIds.add(id);
      return tag;
    }
    convertedDuplicateAnchors.push({ file: path.relative(root, file), id });
    return convertIdToDataAttribute(tag, id);
  });

  const after = masked.restore(liveMarkup);
  if (after !== before) {
    fs.writeFileSync(file, after);
    repaired.push(path.relative(root, file));
  }

  const verification = maskProtectedBlocks(after).markup;
  const tags = openingTags(verification);
  const ids = tags
    .map(tag => tag.match(realIdPattern))
    .filter(Boolean)
    .map(match => match[2]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) {
    const contexts = duplicates.map(id => ({
      id,
      tags: tags.filter(tag => new RegExp(`(?:^|\\s)id\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(tag)).slice(0, 4)
    }));
    throw new Error(`${path.relative(root, file)} still contains duplicate DOM IDs: ${duplicates.join(', ')}; contexts=${JSON.stringify(contexts)}`);
  }

  const compactAnchors = tags
    .filter(tag => /\bclass\s*=\s*["'][^"']*\bconsequence-contract-card\b[^"']*\bcompact\b[^"']*["']/i.test(tag))
    .filter(tag => realIdPattern.test(tag));
  if (compactAnchors.length) throw new Error(`${path.relative(root, file)} still gives compact consequence previews DOM anchor IDs`);

  if (!after.includes('href="live-intel.html"') || !after.includes('live-intel-machine-route')) {
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
  rule: 'Each consequence anchor ID has one owner in a single masked pass across live document markup. Compact previews and later duplicate DOM occurrences use data-contract-id. Real id attributes are matched only when the attribute name is exactly id, never when it appears inside data-contract-id. HTML comments and script, style, template and textarea blocks are temporarily masked, then restored byte-for-byte. The canonical Live Intel route remains required.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot)) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'homepage-contract-integrity.json'), path.join(outputRoot, 'downloads', 'homepage-contract-integrity.json'));
}
console.log(`Homepage contract integrity reconciled: ${repaired.length} file(s) repaired, ${convertedDuplicateAnchors.length} duplicate consequence DOM anchor(s) converted; Live Intel route preserved.`);
