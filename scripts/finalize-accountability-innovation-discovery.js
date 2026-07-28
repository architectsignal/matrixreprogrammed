'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const START = '<!-- accountability-innovation-discovery:start -->';
const END = '<!-- accountability-innovation-discovery:end -->';
const touched = [];

const systems = [
  ['reverse-accountability-search.html', 'Reverse Accountability Search', 'Start with a consequence and trace backwards.'],
  ['power-supply-chain.html', 'Power Supply Chain', 'Separate proposal, authority, money and implementation.'],
  ['evidence-half-life.html', 'Evidence Half-Life', 'See when current applicability needs re-verification.'],
  ['power-diff.html', 'Power Diff', 'See what was added, changed, ended, disputed or corrected.'],
  ['red-team-mirror.html', 'Red-Team Mirror', 'Test the strongest support, challenges and falsifiers.'],
  ['public-answer-clock.html', 'Public Answer Clock', 'Keep verified questions, delivery and responses attached.'],
  ['missing-record-missions.html', 'Missing Record Missions', 'Turn evidence gaps into lawful research tasks.'],
  ['lived-consequence-receipts.html', 'Lived Consequence Receipts', 'Submit privacy-protected evidence of real-world effects.']
];

const block = `${START}<section class="accountability-system-depth wrap accountability-innovation-discovery" aria-labelledby="accountability-innovation-title"><details><summary><span id="accountability-innovation-title">Explore the accountability innovation system</span><small>The homepage stays simple. The eight connected evidence layers remain underneath.</small></summary><div class="accountability-system-grid">${systems.map(([href, title, description]) => `<a href="${href}"><strong>${title}</strong><span>${description}</span></a>`).join('')}</div></details></section>${END}`;

function replaceBlock(html) {
  const pattern = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
  let next = html.replace(pattern, '');
  if (next.includes('</main>')) return next.replace('</main>', `${block}</main>`);
  return `${next}${block}`;
}

for (const base of roots) {
  const file = path.join(base, 'index.html');
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = replaceBlock(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

for (const base of roots) {
  const file = path.join(base, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(START) || !html.includes('<details>')) throw new Error(`${path.relative(root, file)} lacks the collapsed accountability discovery layer`);
  for (const [href] of systems) if (!html.includes(`href="${href}"`)) throw new Error(`${path.relative(root, file)} lacks ${href}`);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'accountability-innovation-discovery.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  touched: [...new Set(touched)],
  homepageRemainsCollapsed: true,
  systems: systems.map(([href, title]) => ({ href, title }))
}, null, 2) + '\n');
console.log(`Accountability innovation discovery finalized across ${[...new Set(touched)].length} homepage file(s).`);
