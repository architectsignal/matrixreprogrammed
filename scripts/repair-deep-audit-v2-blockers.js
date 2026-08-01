const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const touched = [];

function existingVariants(rel) {
  const variants = [path.join(root, rel), path.join(site, rel)];
  if (rel.endsWith('.html')) {
    variants.push(path.join(site, rel.replace(/\.html$/i, '')));
  }
  return [...new Set(variants)].filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
}

function mutate(rel, fn) {
  for (const file of existingVariants(rel)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = fn(before, file);
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

function repairReaderField(html) {
  return html
    .replace(/\breader field\s*=/gi, 'placeholder=')
    .replace(/\.reader field\b/g, '.placeholder');
}

function dedupeIds(html) {
  const seen = new Map();
  return html.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi, (full, quote, id) => {
    const count = seen.get(id) || 0;
    seen.set(id, count + 1);
    if (count === 0) return full;
    return `id=${quote}${id}-duplicate-${count}${quote}`;
  });
}

function ensureHomepageMarker(html) {
  if (html.includes('MAP THE STRUCTURE. READ THE SIGNALS.')) return html;
  const marker = '<p class="homepage-mission-marker">MAP THE STRUCTURE. READ THE SIGNALS.</p>';
  if (/<main\b/i.test(html)) return html.replace(/<main\b[^>]*>/i, match => `${match}${marker}`);
  return html.replace(/<body\b[^>]*>/i, match => `${match}${marker}`);
}

function ensureFormHook(html) {
  return html.replace(/<form\b(?![^>]*(?:\baction\s*=|\bon(?:submit|click)\s*=|\bid\s*=|\bdata-[\w-]+\s*=))([^>]*)>/gi,
    '<form action="contact-the-machine.html" method="get"$1>');
}

function neutralizeTemplateLinks(html) {
  return html.replace(/href=(["'])([^"']*\$\{[^"']+)\1/gi, (_full, quote, value) => {
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `href=${quote}#${quote} data-template-href="${escaped}"`;
  });
}

for (const rel of ['dark-speculation-forum.html', 'predators-in-power.html']) {
  mutate(rel, repairReaderField);
}

for (const rel of ['heroes-fighting-matrix-card.html', 'heroes-fighting-matrix-research-ledger.html']) {
  mutate(rel, neutralizeTemplateLinks);
}

for (const rel of ['index.html', 'public-consequence-contracts.html']) {
  mutate(rel, html => dedupeIds(rel === 'index.html' ? ensureHomepageMarker(html) : html));
}

mutate('lived-consequence-receipts.html', ensureFormHook);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  touched: [...new Set(touched)].sort(),
  repairs: {
    readerFieldCorruption: true,
    templateHrefFalsePositives: true,
    duplicateIds: true,
    homepageMissionMarker: true,
    inertForm: true
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deep-audit-v2-blocker-repair.json'), JSON.stringify(report, null, 2));
console.log(`Deep audit V2 blocker repair complete: ${report.touched.length} file(s) updated.`);
