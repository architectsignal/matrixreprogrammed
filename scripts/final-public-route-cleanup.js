const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const internalPages = [
  'review-dashboard.html', 'deploy-status.html', 'deploy-health.html',
  'card-system-health.html', 'site-brain-router.html',
  'card-artwork-automation.html', 'card-artwork-queue.html',
  'card-artwork-batches.html', 'conclusion-engine.html',
  'information-gathering-system.html', 'source-intake.html',
  'update-monitor.html', 'distribution-center.html', 'launch-room.html',
  'offer-center.html', 'sales-ladder.html', 'schema-index.html',
  'machine-index.html', 'campaign-calendar.html', 'card-art-studio.html',
  'funnel-book-path.html', 'monetisation-dashboard.html',
  'site-population-audit.html', 'speculative-conclusion-review-queue.html',
  'thank-you-book-path.html'
];

function read(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function write(file, content) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.readFileSync(full, 'utf8') === content) return false;
  fs.writeFileSync(full, content);
  return true;
}

function addHiddenClass(tag) {
  if (/\bclass\s*=/.test(tag)) {
    return tag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (match, quote, classes) => {
      const set = new Set(String(classes).split(/\s+/).filter(Boolean));
      set.add('internal-only');
      return `class=${quote}${[...set].join(' ')}${quote}`;
    });
  }
  return tag.replace(/>$/, ' class="internal-only" data-internal-only="true">');
}

function ensureNoIndex(html) {
  if (/name=["']robots["']/i.test(html)) {
    return html.replace(/<meta\b[^>]*name=["']robots["'][^>]*>/i, '<meta name="robots" content="noindex,nofollow,noarchive"/>');
  }
  return html.includes('</head>')
    ? html.replace('</head>', '<meta name="robots" content="noindex,nofollow,noarchive"/></head>')
    : html;
}

function hideInternalLinks(html) {
  return html.replace(/<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi, (tag, quote, href) => {
    const clean = String(href).split(/[?#]/)[0].replace(/^\.\//, '').replace(/^\//, '');
    if (!internalPages.some(file => clean === file || clean === file.replace(/\.html$/, ''))) return tag;
    return /\binternal-only\b/.test(tag) ? tag : addHiddenClass(tag);
  });
}

function removeBlock(html, id) {
  return html.replace(new RegExp(`\\s*<section\\b[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`, 'i'), '');
}

function insertBeforeMainEnd(html, block) {
  return html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : html;
}

const readerAssessment = `<section id="reader-current-assessment" class="section">
  <div class="eyebrow">Current Synthesis · ${today}</div>
  <h2>HOW TO TURN A POWER MAP INTO A DEFENSIBLE CONCLUSION.</h2>
  <div class="grid">
    <article class="card redline">
      <h3>Start with the implementation chain</h3>
      <p><strong>Mechanism:</strong> trace a claim from legal authority to standard, funding, contract, software or administrative decision. A network diagram becomes meaningful only when a dated record connects one stage to the next.</p>
      <p><strong>Why it matters:</strong> this separates influence that is operational from influence that is merely social, symbolic or assumed.</p>
      <p><strong>Next record:</strong> legal text, procurement award, board vote, filing, meeting record or implementation guidance.</p>
    </article>
    <article class="card redline">
      <h3>Measure access and constraint together</h3>
      <p><strong>Documented question:</strong> who controls entry, identity, payment, data, licensing, distribution or appeal within the system?</p>
      <p><strong>Counterpoint:</strong> large institutions face courts, competitors, regulators, budgets and conflicting mandates. Centrality is not the same as unlimited control.</p>
      <p><strong>Implication:</strong> a useful conclusion identifies both the source of leverage and the forces capable of limiting it.</p>
    </article>
    <article class="card redline">
      <h3>State what would change the conclusion</h3>
      <p><strong>Evidence boundary:</strong> association, scale and missing records do not prove guilt, shared intent or conspiracy.</p>
      <p><strong>Falsification test:</strong> name the record or event that would upgrade, narrow or disprove the claim.</p>
      <p><strong>Watch next:</strong> amendments, enforcement, contract changes, court findings, restored files and reliable counter-evidence.</p>
    </article>
  </div>
  <div class="cta-row">
    <a class="btn" href="https://www.sec.gov/edgar/search/" rel="noopener">SEC Filings</a>
    <a class="btn alt" href="https://www.usaspending.gov/" rel="noopener">US Public Awards</a>
    <a class="btn alt" href="https://www.fec.gov/data/" rel="noopener">FEC Records</a>
    <a class="btn alt" href="evidence-vault.html">Evidence Vault</a>
  </div>
</section>`;

const refreshPages = new Set([
  'reader-conclusions.html', 'daily-command-brief.html',
  'daily-power-conclusions.html', 'power-conclusions.html',
  'conclusions-engine.html', 'epstein-conclusions.html',
  'speculative-conclusions.html'
]);

const changes = [];

for (const file of internalPages) {
  const html = read(file);
  if (html && write(file, ensureNoIndex(html))) changes.push(`${file}:noindex`);
}

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  let html = read(file);
  if (!html) continue;
  const before = html;
  html = hideInternalLinks(html);

  if (file === 'live-intel.html') {
    html = html
      .replace(/href=(["'])#\1>Evidence Route<\/a>/gi, 'href="evidence-vault.html">Evidence Route</a>')
      .replace(/href=(["'])#\1/gi, 'href="evidence-vault.html"');
  }

  if (file === 'reader-conclusions.html') {
    html = removeBlock(html, 'reader-current-assessment');
    html = html
      .replace('What the machine must hunt next', 'What to verify next')
      .replace('Attach every major person card to institutions, roles, filings and source records.', 'Check each major person against institutions, roles, filings and primary source records.')
      .replace('Attach every policy card to legal text, consultation records, implementation dates and affected clocks.', 'Check each policy against legal text, consultations, implementation dates and measurable effects.')
      .replace('Attach every think tank card to funders, reports, citations and policy outcomes.', 'Check think tanks against funders, reports, citations and documented policy outcomes.')
      .replace('Attach every jurisdiction card to registries, laws, courts, treaty roles and money routes.', 'Check jurisdictions against registries, laws, courts, treaty roles and money routes.')
      .replace('Remove internal production notes and convert them into reader-safe method notes or operator-only reports.', 'Keep method notes public only when they help readers evaluate evidence and uncertainty.');
    html = insertBeforeMainEnd(html, readerAssessment);
  }

  if (refreshPages.has(file) && !html.includes(`Public review date: ${today}`)) {
    html = html.replace(/(<main\b[^>]*>)/i, `$1<p class="figure-caption public-review-date">Public review date: ${today}</p>`);
  }

  if (html !== before && write(file, html)) changes.push(`${file}:public-cleanup`);
}

let sitemap = read('sitemap.xml');
if (sitemap) {
  const before = sitemap;
  for (const file of internalPages) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sitemap = sitemap.replace(new RegExp(`\\s*<url>\\s*<loc>[^<]*${escaped}<\\/loc>[\\s\\S]*?<\\/url>`, 'gi'), '');
  }
  if (sitemap !== before && write('sitemap.xml', sitemap)) changes.push('sitemap.xml:internal-routes-removed');
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  internalPages,
  changes,
  repairedPlaceholders: 'live-intel Evidence Route links',
  deepenedPage: 'reader-conclusions.html',
  reviewDatePages: [...refreshPages]
};
fs.writeFileSync(path.join(reportDir, 'final-public-route-cleanup.json'), JSON.stringify(report, null, 2));
console.log(`Final public route cleanup complete: ${changes.length} change(s), ${internalPages.length} internal routes excluded.`);
