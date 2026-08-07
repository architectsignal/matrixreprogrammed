#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceRelative = 'black-file.html';
const sourcePath = path.join(root, sourceRelative);
const genericTitleId = 'matrix-pathways-title';
const canonicalTitleId = 'matrix-pathways-title-black-file';
const reportPath = path.join(root, 'downloads', 'black-file-postbuild-finalization.json');
const surfaceRelatives = [
  'black-file.html',
  'black-file',
  path.join('_site', 'black-file.html'),
  path.join('_site', 'black-file'),
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function count(value, expression) {
  return (String(value || '').match(expression) || []).length;
}
function hasExactClass(openTag, className) {
  const match = String(openTag || '').match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!match) return false;
  return match[2].split(/\s+/).filter(Boolean).includes(className);
}
function findBalancedSections(html, predicate) {
  const tokenPattern = /<section\b[^>]*>|<\/section\s*>/gi;
  const stack = [];
  const sections = [];
  let match;
  while ((match = tokenPattern.exec(html))) {
    const token = match[0];
    if (/^<section\b/i.test(token)) {
      stack.push({ start: match.index, openEnd: tokenPattern.lastIndex, openTag: token });
      continue;
    }
    const open = stack.pop();
    if (!open) continue;
    const section = {
      ...open,
      end: tokenPattern.lastIndex,
      closeStart: match.index,
      html: html.slice(open.start, tokenPattern.lastIndex),
    };
    if (predicate(section.openTag, section)) sections.push(section);
  }
  return sections.sort((a, b) => a.start - b.start);
}
function stripTargetIds(html) {
  return String(html || '')
    .replace(/\s+id\s*=\s*(["'])(?:matrix-pathways-title|matrix-pathways-title-black-file)\1/gi, '')
    .replace(/\s+aria-labelledby\s*=\s*(["'])([\s\S]*?)\1/gi, (whole, quote, value) => {
      const tokens = String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter(token => token !== genericTitleId && token !== canonicalTitleId);
      return tokens.length ? ` aria-labelledby=${quote}${tokens.join(' ')}${quote}` : '';
    });
}
function setAttribute(openTag, name, value) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const without = String(openTag || '').replace(
    new RegExp(`\\s+${escaped}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'gi'),
    '',
  );
  const closing = /\/\>\s*$/.test(without) ? '/>' : '>';
  return without.replace(/\s*\/?\>\s*$/, ` ${name}="${value}"${closing}`);
}
function countExactId(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return count(html, new RegExp(`\\bid\\s*=\\s*(["'])${escaped}\\1`, 'gi'));
}
function countAriaToken(html, id) {
  let total = 0;
  String(html || '').replace(/\baria-labelledby\s*=\s*(["'])([\s\S]*?)\1/gi, (_whole, _quote, value) => {
    total += String(value || '').split(/\s+/).filter(Boolean).filter(token => token === id).length;
    return _whole;
  });
  return total;
}
function normalizePathwayTitle(html) {
  let next = stripTargetIds(html);
  const sections = findBalancedSections(next, openTag => hasExactClass(openTag, 'matrix-pathways'));
  if (!sections.length) {
    throw new Error('Black File postbuild finalizer found no exact matrix-pathways section.');
  }
  const canonical = sections[0];
  let sectionHtml = next.slice(canonical.start, canonical.end);
  sectionHtml = sectionHtml.replace(canonical.openTag, setAttribute(canonical.openTag, 'aria-labelledby', canonicalTitleId));

  const headingMatch = sectionHtml.match(/<h([1-6])\b[^>]*>/i);
  if (!headingMatch) {
    throw new Error('Black File postbuild finalizer found no heading inside the canonical matrix-pathways section.');
  }
  sectionHtml = sectionHtml.replace(headingMatch[0], setAttribute(headingMatch[0], 'id', canonicalTitleId));
  next = `${next.slice(0, canonical.start)}${sectionHtml}${next.slice(canonical.end)}`;

  const checks = {
    genericIdCount: countExactId(next, genericTitleId),
    genericAriaCount: countAriaToken(next, genericTitleId),
    canonicalIdCount: countExactId(next, canonicalTitleId),
    canonicalAriaCount: countAriaToken(next, canonicalTitleId),
    exactPathwaySectionCount: findBalancedSections(next, openTag => hasExactClass(openTag, 'matrix-pathways')).length,
  };
  if (checks.genericIdCount !== 0 || checks.genericAriaCount !== 0) {
    throw new Error(`Black File generic pathway IDs survived finalization: ${JSON.stringify(checks)}`);
  }
  if (checks.canonicalIdCount !== 1 || checks.canonicalAriaCount !== 1) {
    throw new Error(`Black File page-specific pathway ID is not unique: ${JSON.stringify(checks)}`);
  }
  return { html: next, checks };
}
function assertPublicContract(relative, html, expectedHash) {
  const checks = {
    oneH1: count(html, /<h1\b/gi) === 1,
    canonicalH1: /<h1>THE BLACK FILE<\/h1>/i.test(html),
    oneCanonicalHero: count(html, /data-black-file-public-hero\s*=\s*(["'])canonical\1/gi) === 1,
    requestTarget: count(html, /\bid\s*=\s*(["'])request\1/gi) === 1,
    genericIdCount: countExactId(html, genericTitleId),
    genericAriaCount: countAriaToken(html, genericTitleId),
    canonicalIdCount: countExactId(html, canonicalTitleId),
    canonicalAriaCount: countAriaToken(html, canonicalTitleId),
    byteIdentical: sha256(html) === expectedHash,
  };
  const ok = checks.oneH1
    && checks.canonicalH1
    && checks.oneCanonicalHero
    && checks.requestTarget
    && checks.genericIdCount === 0
    && checks.genericAriaCount === 0
    && checks.canonicalIdCount === 1
    && checks.canonicalAriaCount === 1
    && checks.byteIdentical;
  if (!ok) throw new Error(`${relative} failed the final Black File contract: ${JSON.stringify(checks)}`);
  return checks;
}

if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
  throw new Error('Black File source is missing: black-file.html');
}

// Reuse the existing canonical hero owner first, then take final ownership of
// pathway IDs and all source/deploy aliases after every ordinary page mutator.
const heroReport = require(path.join(__dirname, 'finalize-black-file-public-hero.js'));
if (!heroReport || heroReport.ok !== true) {
  throw new Error('Existing Black File hero owner did not complete successfully.');
}

const before = fs.readFileSync(sourcePath, 'utf8');
const normalized = normalizePathwayTitle(before);
const canonicalHtml = normalized.html;
const canonicalHash = sha256(canonicalHtml);
const surfaces = [];

for (const relative of surfaceRelatives) {
  const file = path.join(root, relative);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    throw new Error(`Black File alias is unexpectedly a directory: ${relative}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (previous !== canonicalHtml) fs.writeFileSync(file, canonicalHtml);
  const finalHtml = fs.readFileSync(file, 'utf8');
  surfaces.push({
    relative: relative.split(path.sep).join('/'),
    changed: previous !== canonicalHtml,
    sha256: sha256(finalHtml),
    checks: assertPublicContract(relative, finalHtml, canonicalHash),
  });
}

const report = {
  ok: surfaces.length === 4 && surfaces.every(surface => surface.sha256 === canonicalHash),
  generatedAt: new Date().toISOString(),
  source: sourceRelative,
  sourceSha256: canonicalHash,
  genericTitleId,
  canonicalTitleId,
  pathwayChecks: normalized.checks,
  surfaces,
  boundary: 'This local deterministic finalizer runs after the last ordinary page mutator, removes every exact generic matrix-pathways-title reference, creates exactly one matrix-pathways-title-black-file target and synchronizes source, extensionless and _site aliases byte-for-byte. It performs no network, D1 or Cloudflare mutation.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Black File postbuild finalization did not complete all four surfaces.');
console.log(`BLACK FILE POSTBUILD FINALIZATION PASSED: ${surfaces.length} byte-identical surfaces; generic pathway ID removed; ${canonicalTitleId} unique.`);

module.exports = report;
