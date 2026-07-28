'use strict';

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

const selected = drops.filter(drop => {
  const title = String(drop && drop.title || '');
  const summary = String(drop && drop.summary || '');
  return actionPattern.test(title) || (authorityPattern.test(title) && actionPattern.test(summary));
});

if (selected.length < 3) throw new Error(`Only ${selected.length} current public-source item(s) met the consequential-action standard; at least 3 are required`);

const temporary = {
  ...original,
  purpose: 'Filtered consequential-action input for Public Consequence Contracts. Generic news topics remain outside the contract ledger.',
  consequenceSelection: {
    generatedAt: new Date().toISOString(),
    sourceCount: drops.length,
    selectedCount: selected.length,
    standard: 'A title must contain a detectable exercise of authority or action, or pair a named authority in the title with an action in the summary.'
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
  selectedCount: selected.length,
  rejectedGenericTopics: drops.length - selected.length,
  standard: temporary.consequenceSelection.standard,
  selected: selected.map(drop => ({ id: drop.id, title: drop.title, published: drop.published, sourceLabel: drop.sourceLabel }))
};
for (const base of outputRoots) {
  const reportFile = path.join(base, 'downloads', 'public-consequence-selection-report.json');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(selectionReport, null, 2)}\n`);
}

require('./public-consequence-contracts-pressure-test.js');
console.log(`Public Consequence Contract selection passed: ${selected.length}/${drops.length} current items contained a consequential action.`);
