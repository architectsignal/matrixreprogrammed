'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceFile = path.join(root, 'data', 'latest-public-drops.json');
if (!fs.existsSync(sourceFile)) throw new Error('data/latest-public-drops.json is required');
const originalText = fs.readFileSync(sourceFile, 'utf8');
const original = JSON.parse(originalText);
const drops = Array.isArray(original.drops) ? original.drops : [];

const actionPattern = /\b(?:announce(?:d|s|ment)?|approve(?:d|s|al)?|adopt(?:ed|s|ion)?|appoint(?:ed|s|ment)?|authorize(?:d|s|ation)?|award(?:ed|s)?|ban(?:ned|s)?|block(?:ed|s)?|charge(?:d|s)?|convict(?:ed|s|ion)?|demand(?:ed|s)?|deploy(?:ed|s|ment)?|file(?:d|s)?|fast[- ]track(?:ed|s|ing)?|fund(?:ed|s|ing)?|halt(?:ed|s)?|investigat(?:e|es|ed|ion)|issue(?:d|s)?|launch(?:ed|es)?|meet(?:s|ing)?|met|order(?:ed|s)?|pass(?:ed|es)?|propos(?:e|es|ed|al)|push(?:ed|es|ing)?|reject(?:ed|s)?|release(?:d|s)?|rule(?:d|s|ing)?|sanction(?:ed|s)?|sentence(?:d|s)?|sign(?:ed|s)?|strike(?:s|d)?|vote(?:d|s)?|warn(?:ed|s)?|withdraw(?:s|n|al)?|expand(?:ed|s|ing)?|reduce(?:d|s|ing)?|increase(?:d|s|ing)?)\b/i;
const authorityPattern = /\b(?:court|parliament|congress|government|ministry|minister|president|prime minister|council|commission|agency|regulator|prosecutor|police|military|company|bank|foundation|united nations|security council|senate|house|judge|official|authority)\b/i;
const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 10);

const eligible = drops.filter(drop => {
  const title = String(drop && drop.title || '');
  const summary = String(drop && drop.summary || '');
  return actionPattern.test(title) || (authorityPattern.test(title) && actionPattern.test(summary));
});

// Upstream feeds can repeat the same source or reuse an ID for distinct source
// records. Public Consequence Contracts require one stable, unique ID per source.
// Remove exact source duplicates and deterministically suffix genuine collisions.
const seenSources = new Set();
const usedIds = new Map();
const selected = [];
let duplicateSourcesRemoved = 0;
let idCollisionsResolved = 0;

for (const drop of eligible) {
  const title = clean(drop && drop.title);
  const url = clean(drop && drop.url);
  const published = clean(drop && drop.published);
  const lane = clean(drop && drop.lane) || 'public-accountability';
  const sourceIdentity = url || `${title}\u0000${published}\u0000${clean(drop && drop.sourceLabel)}`;
  if (seenSources.has(sourceIdentity)) {
    duplicateSourcesRemoved += 1;
    continue;
  }
  seenSources.add(sourceIdentity);

  const suppliedId = clean(drop && drop.id);
  const datePart = /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : 'undated';
  const baseId = suppliedId || `${lane}-${datePart}-${digest(sourceIdentity)}`;
  let resolvedId = baseId;
  let attempt = 0;
  while (usedIds.has(resolvedId) && usedIds.get(resolvedId) !== sourceIdentity) {
    attempt += 1;
    resolvedId = `${baseId}-${digest(`${sourceIdentity}\u0000${attempt}`)}`;
  }
  if (resolvedId !== baseId) idCollisionsResolved += 1;
  usedIds.set(resolvedId, sourceIdentity);
  selected.push({ ...drop, id: resolvedId });
}

if (selected.length < 3) throw new Error(`Only ${selected.length} unique current public-source item(s) met the consequential-action standard; at least 3 are required`);

const temporary = {
  ...original,
  purpose: 'Filtered consequential-action input for Public Consequence Contracts. Generic news topics remain outside the contract ledger.',
  consequenceSelection: {
    generatedAt: new Date().toISOString(),
    sourceCount: drops.length,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    duplicateSourcesRemoved,
    idCollisionsResolved,
    standard: 'A title must contain a detectable exercise of authority or action, or pair a named authority in the title with an action in the summary. Exact source duplicates are removed and colliding IDs are resolved deterministically.'
  },
  drops: selected
};

try {
  fs.writeFileSync(sourceFile, `${JSON.stringify(temporary, null, 2)}\n`);
  delete require.cache[require.resolve('./build-public-consequence-contracts.js')];
  require('./build-public-consequence-contracts.js');
} finally {
  fs.writeFileSync(sourceFile, originalText);
}

const outputRoots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const selectionReport = {
  ok: true,
  generatedAt: temporary.consequenceSelection.generatedAt,
  sourceCount: drops.length,
  eligibleCount: eligible.length,
  selectedCount: selected.length,
  rejectedGenericTopics: drops.length - eligible.length,
  duplicateSourcesRemoved,
  idCollisionsResolved,
  standard: temporary.consequenceSelection.standard,
  selected: selected.map(drop => ({ id: drop.id, title: drop.title, published: drop.published, sourceLabel: drop.sourceLabel }))
};
for (const base of outputRoots) {
  const reportFile = path.join(base, 'downloads', 'public-consequence-selection-report.json');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(selectionReport, null, 2)}\n`);
}

require('./public-consequence-contracts-pressure-test.js');
console.log(`Public Consequence Contract selection passed: ${selected.length}/${drops.length} unique current items contained a consequential action; ${duplicateSourcesRemoved} duplicate source(s) removed and ${idCollisionsResolved} ID collision(s) resolved.`);
