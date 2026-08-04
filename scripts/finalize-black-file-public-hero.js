'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const sourceFile = path.join(root, 'black-file.html');
const reportPath = path.join(root, 'downloads', 'black-file-public-hero-finalization.json');
const markerComment = /<!--\s*black-file-public-hero:(?:start|end)\s*-->\s*/gi;
const canonicalHero = '<!-- black-file-public-hero:start --><section class="hero wrap" data-black-file-public-hero="canonical"><div class="eyebrow">Free reader-initiation file</div><h1>THE BLACK FILE</h1><p class="lead" id="black-file-public-lead">The world does not run on headlines. It runs on systems. Download the expanded Black File and enter the Matrix Reprogrammed archive through hidden structures behind symbols, intelligence, crime, war, media, money, psychology, Epstein files, human cost, migration, and control.</p><div class="cta-row"><a class="btn" href="#request">Request Access</a><a class="btn alt" href="downloads/the-black-file-matrix-reprogrammed.pdf" download>Download The PDF</a><a class="btn alt" href="black-file-thank-you.html">Access Page</a><a class="btn alt" href="books.html">Enter Archive</a></div></section><!-- black-file-public-hero:end -->';

function slash(value) {
  return String(value || '').split(path.sep).join('/');
}
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function classTokensFromTag(tag) {
  const match = String(tag || '').match(/\bclass\s*=\s*(["'])([^"']*)\1/i);
  return match ? match[2].trim().split(/\s+/).filter(Boolean) : [];
}
function hasExactClass(tag, className) {
  return classTokensFromTag(tag).includes(className);
}
function staticMarkup(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}
function countStaticH1(html) {
  return (staticMarkup(html).match(/<h1\b/gi) || []).length;
}
function findBalancedSections(html, predicate) {
  const source = String(html || '');
  const expression = /<\/?section\b[^>]*>/gi;
  const stack = [];
  const sections = [];
  let match;
  while ((match = expression.exec(source))) {
    const tag = match[0];
    if (!/^<\s*\/section\b/i.test(tag)) {
      const node = {
        start: match.index,
        end: expression.lastIndex,
        openTag: tag,
        selected: Boolean(predicate(tag))
      };
      if (/\/\s*>$/.test(tag)) {
        if (node.selected) sections.push(node);
      } else {
        stack.push(node);
      }
      continue;
    }
    if (!stack.length) continue;
    const node = stack.pop();
    node.end = expression.lastIndex;
    if (node.selected) sections.push(node);
  }
  return sections.sort((a, b) => a.start - b.start || a.end - b.end);
}
function mergeRanges(ranges) {
  const sorted = ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .map(range => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}
function removeRanges(source, ranges) {
  let output = String(source || '');
  for (const range of mergeRanges(ranges).sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, range.start)}${output.slice(range.end)}`;
  }
  return output;
}
function countExactHeroSections(html) {
  return findBalancedSections(html, tag => hasExactClass(tag, 'hero')).length;
}
function finalizeHtml(input) {
  const before = String(input || '');
  if (!/<!doctype\s+html|<html\b/i.test(before)) throw new Error('Black File source is not an HTML document.');
  if (!/<main\b[^>]*>/i.test(before)) throw new Error('Black File source has no stable <main> insertion boundary.');

  let html = before.replace(markerComment, '');
  const heroSections = findBalancedSections(html, tag => hasExactClass(tag, 'hero'));
  html = removeRanges(html, heroSections);
  html = html.replace(/(<main\b[^>]*>)\s*/i, `$1\n${canonicalHero}\n`);

  const heroCount = countExactHeroSections(html);
  const h1Count = countStaticH1(html);
  const markerStarts = (html.match(/<!--\s*black-file-public-hero:start\s*-->/gi) || []).length;
  const markerEnds = (html.match(/<!--\s*black-file-public-hero:end\s*-->/gi) || []).length;
  const leadCount = (staticMarkup(html).match(/\bid=["']black-file-public-lead["']/gi) || []).length;
  if (heroCount !== 1) throw new Error(`Black File hero finalization found ${heroCount} exact hero sections.`);
  if (h1Count !== 1) throw new Error(`Black File hero finalization found ${h1Count} visible static H1 elements.`);
  if (markerStarts !== 1 || markerEnds !== 1) throw new Error(`Black File hero marker pair is ${markerStarts}/${markerEnds}.`);
  if (leadCount !== 1) throw new Error(`Black File canonical lead count is ${leadCount}.`);
  if (!/<h1>THE BLACK FILE<\/h1>/i.test(staticMarkup(html))) throw new Error('Black File canonical H1 text is missing.');
  if (!/href=["']#request["']/i.test(canonicalHero) || !/\bid=["']request["']/i.test(staticMarkup(html))) {
    throw new Error('Black File request CTA does not resolve to the page request target.');
  }

  return {
    html,
    changed: html !== before,
    removedHeroSections: heroSections.length,
    h1Count,
    heroCount,
    markerStarts,
    markerEnds,
    leadCount
  };
}

if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
  throw new Error('Required canonical Black File source is missing: black-file.html');
}

const sourceBefore = fs.readFileSync(sourceFile, 'utf8');
const sourceResult = finalizeHtml(sourceBefore);
if (sourceResult.changed) fs.writeFileSync(sourceFile, sourceResult.html);

const surfaces = [{
  file: 'black-file.html',
  changed: sourceResult.changed,
  removedHeroSections: sourceResult.removedHeroSections,
  sha256: digest(sourceResult.html)
}];

if (fs.existsSync(site) && fs.statSync(site).isDirectory()) {
  const siteHtml = path.join(site, 'black-file.html');
  const siteAlias = path.join(site, 'black-file');
  fs.mkdirSync(path.dirname(siteHtml), { recursive: true });
  const siteBefore = fs.existsSync(siteHtml) && fs.statSync(siteHtml).isFile()
    ? fs.readFileSync(siteHtml, 'utf8')
    : '';
  fs.writeFileSync(siteHtml, sourceResult.html);
  surfaces.push({
    file: '_site/black-file.html',
    changed: siteBefore !== sourceResult.html,
    removedHeroSections: siteBefore ? findBalancedSections(siteBefore, tag => hasExactClass(tag, 'hero')).length : 0,
    sha256: digest(sourceResult.html)
  });

  if (fs.existsSync(siteAlias) && fs.statSync(siteAlias).isDirectory()) {
    throw new Error('_site/black-file is unexpectedly a directory; refusing to overwrite a namespace.');
  }
  const aliasBefore = fs.existsSync(siteAlias) && fs.statSync(siteAlias).isFile()
    ? fs.readFileSync(siteAlias, 'utf8')
    : '';
  fs.writeFileSync(siteAlias, sourceResult.html);
  surfaces.push({
    file: '_site/black-file',
    changed: aliasBefore !== sourceResult.html,
    removedHeroSections: aliasBefore ? findBalancedSections(aliasBefore, tag => hasExactClass(tag, 'hero')).length : 0,
    sha256: digest(sourceResult.html)
  });
}

for (const surface of surfaces) {
  const file = path.join(root, surface.file);
  const html = fs.readFileSync(file, 'utf8');
  if (digest(html) !== digest(sourceResult.html)) throw new Error(`${surface.file} drifted from the canonical Black File source.`);
  if (countStaticH1(html) !== 1) throw new Error(`${surface.file} does not contain exactly one visible static H1.`);
  if (countExactHeroSections(html) !== 1) throw new Error(`${surface.file} does not contain exactly one hero section.`);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  canonicalH1: 'THE BLACK FILE',
  canonicalLeadId: 'black-file-public-lead',
  surfaces,
  sourceSha256: digest(sourceResult.html),
  boundary: 'The Black File public hero is a narrow canonical surface owner. It restores one visible H1 and one hero across source and deployable aliases without changing downstream archive, evidence, pathway, form or dossier content.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Black File public hero finalized across ${surfaces.length} surface(s); ${surfaces.filter(surface => surface.changed).length} changed.`);

module.exports = {
  canonicalHero,
  finalizeHtml,
  countStaticH1,
  countExactHeroSections,
  findBalancedSections,
  hasExactClass
};
