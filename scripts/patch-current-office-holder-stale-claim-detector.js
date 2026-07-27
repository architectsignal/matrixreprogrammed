'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-current-office-holder-intelligence.js');
if (!fs.existsSync(target)) throw new Error('Missing build-current-office-holder-intelligence.js');

const before = fs.readFileSync(target, 'utf8');
const oldBlock = `for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walkPublic(base)) {
    if (base === root && file.startsWith(site + path.sep)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.htm', '.json', '.md', '.js'].includes(ext)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const holder of registry.holders) {
      for (const alias of holder.staleCurrentAliases || []) {
        const escaped = alias.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        const office = rolePattern(holder);
        const stalePattern = new RegExp(\`(?:\\\\bcurrent(?:ly)?\\\\b|\\\\bincumbent\\\\b)[^.\\\\n]{0,120}(?:\${office})[^.\\\\n]{0,80}\\\\b\${escaped}\\\\b|\\\\b\${escaped}\\\\b[^.\\\\n]{0,80}(?:\\\\bcurrent(?:ly)?\\\\b|\\\\bincumbent\\\\b)[^.\\\\n]{0,120}(?:\${office})\`, 'i');
        if (stalePattern.test(source) && !/\\bformer\\b|\\bthen-current\\b|\\bat the time\\b|\\bhistorical\\b/i.test(source.match(stalePattern)?.[0] || '')) {
          unresolved.push({ file: display(file), office: holder.office, staleAlias: alias, currentHolder: holder.name, excerpt: stripHtml(source.match(stalePattern)?.[0] || '').slice(0, 300) });
        }
      }
    }
  }
}`;

const newBlock = `const staleAuditExcluded = new Set([
  'data/current-office-holders.json',
  'data/current-office-holder-transitions.json',
  'data/current-office-holder-conclusions.json',
  'data/current-office-holder-timeline.json',
  'data/current-office-holder-relationship-edges.json',
  'data/current-office-holder-clock-reassessment.json'
]);

function explicitStaleCurrentClaim(source, holder, alias) {
  const searchable = stripHtml(source);
  const escaped = alias.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  const office = rolePattern(holder);
  const patterns = [
    new RegExp(\`\\\\bcurrent(?:ly)?\\\\s+(?:the\\\\s+)?\${office}\\\\s+(?:is\\\\s+)?\${escaped}\\\\b\`, 'i'),
    new RegExp(\`\\\\bincumbent\\\\s+\${office}\\\\s+(?:is\\\\s+)?\${escaped}\\\\b\`, 'i'),
    new RegExp(\`\\\\b\${escaped}\\\\b\\\\s+(?:is|remains|serves\\\\s+as)\\\\s+(?:the\\\\s+)?current(?:ly)?\\\\s+\${office}\\\\b\`, 'i'),
    new RegExp(\`\\\\b\${escaped}\\\\b\\\\s*,?\\\\s+current\\\\s+\${office}\\\\b\`, 'i')
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(searchable);
    if (!match) continue;
    const start = Math.max(0, match.index - 120);
    const end = Math.min(searchable.length, match.index + match[0].length + 160);
    const context = searchable.slice(start, end);
    if (/\\b(?:former|then-current|at the time|historical|predecessor|replaced|succeeded|ended|no longer|not current|stale|outdated|incorrect|calling|described as)\\b/i.test(context)) continue;
    return { match: match[0], context };
  }
  return null;
}

for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walkPublic(base)) {
    if (base === root && file.startsWith(site + path.sep)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.htm', '.json', '.md', '.js'].includes(ext)) continue;
    const relative = path.relative(base, file).replace(/\\\\/g, '/');
    if (staleAuditExcluded.has(relative)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const holder of registry.holders) {
      for (const alias of holder.staleCurrentAliases || []) {
        const claim = explicitStaleCurrentClaim(source, holder, alias);
        if (!claim) continue;
        unresolved.push({
          file: display(file), office: holder.office, staleAlias: alias,
          currentHolder: holder.name, excerpt: claim.context.slice(0, 300)
        });
      }
    }
  }
}`;

if (!before.includes(oldBlock)) {
  if (before.includes('function explicitStaleCurrentClaim(source, holder, alias)')) {
    console.log('Current office-holder stale-claim detector already uses explicit assertions.');
    process.exit(0);
  }
  throw new Error('Stale-claim detector replacement anchor not found');
}

const after = before.replace(oldBlock, newBlock);
fs.writeFileSync(target, after);
console.log('Current office-holder stale-claim detector narrowed to explicit present-tense office assertions with historical and self-feed exclusions.');
