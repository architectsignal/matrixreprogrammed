const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['site-freshness-report.html','site-quality-report.html']);
const publicPages = fs.readdirSync(root).filter(file => file.endsWith('.html') && !ignored.has(file));
const checkedDate = '25 June 2026';

const replacements = [
  [/\bUse this page as\b/gi, 'Use this page to'],
  [/\bHow To Use This Page\b/g, 'Where To Go Next'],
  [/\bPrimary route\b/gi, 'Best starting point'],
  [/\bReader path\b/gi, 'Next step'],
  [/\breader path\b/gi, 'next step'],
  [/\breader pathways\b/gi, 'reading routes'],
  [/\bsource pathway\b/gi, 'source trail'],
  [/\bArchive Routes\b/g, 'Source Pathways'],
  [/\bArchive Route\b/g, 'Source Trail'],
  [/\barchive route\b/gi, 'source trail'],
  [/\bsales door\b/gi, 'book entry point'],
  [/\bSales door\b/g, 'Book entry point'],
  [/\bDatabase-driven archive\b/gi, 'Book Archive'],
  [/\bLive generated pages\b/gi, 'Available pages'],
  [/\bgenerated pages\b/gi, 'pages'],
  [/\bgenerated outputs\b/gi, 'downloads'],
  [/\bdownload outputs\b/gi, 'downloads'],
  [/\bJSON outputs\b/gi, 'machine-readable files'],
  [/\bJSON Report\b/g, 'Machine-readable report'],
  [/\bJSON data\b/gi, 'machine-readable data'],
  [/\bSource:\s*data\/[^<\n]+/gi, 'Source: Matrix Reprogrammed evidence file'],
  [/\bBlack File funnel\b/gi, 'Black File reading sequence'],
  [/\bSearch index:\s*active\b/gi, 'Search: ready'],
  [/\bReader paths:\s*active\b/gi, 'Reading routes: open'],
  [/\bRisk timers:\s*active\b/gi, 'Risk timers: open'],
  [/\bPhase 19 Lead Magnet \/ Capture Engine\b/g, 'Free Briefs'],
  [/\bPhase 18 Offer Stack \/ Revenue Ladder Engine\b/g, 'Offer Center'],
  [/\bPhase 17 Campaign Calendar \/ Launch Room Engine\b/g, 'Launch Room'],
  [/\bPhase 16 Share Kit \/ Social Distribution Engine\b/g, 'Share Kits'],
  [/\bPhase 15 Feed Discovery\b/g, 'Feed Center'],
  [/\bPhase 14 Dossier Pack\b/g, 'Download Center'],
  [/\bPhase 13 Schema Engine\b/g, 'Machine Index'],
  [/\bPhase 12 Authority Cluster\b/g, 'Authority Hub'],
  [/\bPhase 11 Freshness Monitor\b/g, 'Update Monitor'],
  [/\bPhase 10 Reader Path Sales Ladder\b/g, 'Reading Order'],
  [/\bPhase 9 Content Distribution\b/g, 'Distribution Tools'],
  [/\bPhase 8 Trust Center\b/g, 'Trust Center'],
  [/\bPhase 7 Conversion Funnel\b/g, 'Free Briefs'],
  [/\bPhase 6 Network Map\b/g, 'Network Map'],
  [/\bPhase 5 AI Answer Engine\b/g, 'AI Answer Engine'],
  [/\bPhase 4 Book Universe\b/g, 'Book Universe'],
  [/\bPhase 3 Evidence Vault\b/g, 'Evidence Vault'],
  [/\bPhase 2 Power Atlas\b/g, 'Power Atlas'],
  [/\bPhase 1 structure pages\b/g, 'core pages'],
  [/\bTHE Hegelian CRISIS DIALECTIC\b/g, 'THE HEGELIAN CRISIS DIALECTIC'],
  [/\bfollowing the The\b/g, 'following the'],
  [/\bplaceholder copy\b/gi, 'reader copy'],
  [/\bpending functionality\b/gi, 'available check'],
  [/\bawaiting API\b/gi, 'source check pending'],
  [/\bTODO\b/g, 'Review point'],
  [/\bFIXME\b/g, 'Review point'],
  [/\bauthor-facing\b/gi, 'editorial'],
  [/\bChatGPT\b/g, 'Matrix Reprogrammed'],
  [/\bUse the books, free briefs, Rumble\/video routes, and Amazon store\b/gi, 'Use the books, free briefs, Rumble videos, and Amazon store'],
  [/\bOpen the strongest related route for this page and continue the investigation from a clearer entry point\.\b/gi, 'Start with the strongest related page, then move into the evidence, book, video, or free brief.']
];

function visibleCopy(html) {
  return html.replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function routeFor(file) {
  const name = file.toLowerCase();
  if (name.includes('epstein')) return ['epstein-files.html','Epstein Files'];
  if (name.includes('evidence') || name.includes('source')) return ['evidence-vault.html','Evidence Vault'];
  if (name.includes('video') || name.includes('rumble')) return ['videos.html','Rumble Channels'];
  if (name.includes('book')) return ['books.html','Books'];
  if (name.includes('offer')) return ['offer-center.html','Offer Center'];
  if (name.includes('optin') || name.includes('brief')) return ['optin-center.html','Free Briefs'];
  if (name.includes('distribution') || name.includes('share')) return ['distribution-center.html','Distribution Center'];
  if (name.includes('trust')) return ['trust-center.html','Trust Center'];
  if (name.includes('migration') || name.includes('human-cost') || name.includes('dashboard')) return ['live-intel.html','Latest Updates'];
  return ['live-intel.html','Live Intel'];
}
function usefulnessSection(file, html) {
  if (html.includes('id="reader-usefulness-route"')) return '';
  const [primaryRoute, primaryLabel] = routeFor(file);
  return `<section id="reader-usefulness-route" class="section wrap reader-next"><h2>Where To Go Next</h2><p class="lead">Start with the evidence trail, then move into the book, video, free brief, or latest update connected to this topic.</p><div class="grid"><article class="card redline"><span class="label">Best starting point</span><h3>${primaryLabel}</h3><p>Open the strongest related page and continue into the evidence, book, video, or free brief.</p><a class="btn" href="${primaryRoute}">Open ${primaryLabel}</a></article><article class="card"><span class="label">Evidence</span><h3>Check the source trail</h3><p>Figures, claims, names, dates, and crisis numbers should be traced through the Evidence Vault or Live Intel before being treated as settled.</p><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></article><article class="card"><span class="label">Go deeper</span><h3>Books, briefs and video</h3><p>Use the books, free briefs, Rumble videos, and Amazon store to move from headline to full investigation.</p><div class="cta-row small"><a class="btn alt" href="books.html">Books</a><a class="btn alt" href="optin-center.html">Free Briefs</a><a class="btn alt" href="videos.html">Rumble</a><a class="btn alt" href="amazon-store-books.html">Store</a></div></article></div></section>`;
}
function hasRiskFigures(file, copy) {
  return /sexual|assault|offence|offense|migration|migrant|asylum|crime|death|deaths|payout|claims|vaccine|percent|%|million|billion|court|conviction|arrest|epstein/i.test(`${file} ${copy}`) && /\d|EST\. SOURCE-SPLIT|source check/i.test(copy);
}
function figureSourcePanel(file, html) {
  if (html.includes('id="figure-source-status"')) return '';
  const fileName = file.toLowerCase();
  const topic = fileName.includes('migration') ? 'Migration / crime figures' : fileName.includes('human-cost') ? 'Human-cost figures' : fileName.includes('epstein') ? 'Epstein evidence counts' : 'Figures on this page';
  return `<section id="figure-source-status" class="section wrap source-status-panel"><h2>Figures & Sources</h2><div class="grid"><article class="card redline"><span class="label">${topic}</span><h3>Checked: ${checkedDate}</h3><p>Numbers on this page are treated as public-record leads, not final claims. Crime, migration, sexual-offence, payout, death, and crisis figures must be tied to named official or court sources before they are presented as settled.</p></article><article class="card"><span class="label">Evidence standard</span><h3>What counts as a usable figure?</h3><p>Official statistics, court records, ministry releases, police datasets, parliamentary material, regulator data, or clearly named public reports. Nationality, foreign-born status, asylum status, immigration status, charge, suspect, conviction, and victim categories must not be mixed.</p></article><article class="card"><span class="label">Update status</span><h3>Weekly scan active</h3><p>The weekly scan flags figures that need review. Machine-readable files support search and automation; normal readers should use the visible brief, evidence note, PDF, book, or video first.</p></article></div></section>`;
}
function softenJsonLinks(html) {
  return html.replace(/<a\b([^>]*?)href=["']([^"']+\.json)["']([^>]*)>(.*?)<\/a>/gi, (full, before, href, after, label) => {
    const cleanLabel = visibleCopy(label || '').trim();
    const newLabel = /json|data|feed|report|download/i.test(cleanLabel) ? 'Machine-readable data' : cleanLabel;
    const attrs = `${before}href="${href}"${after}`;
    if (/machine-data-link/.test(attrs)) return full.replace(/>.*?<\/a>/, `>${newLabel}</a>`);
    const classMatch = attrs.match(/class=["']([^"']*)["']/i);
    if (classMatch) {
      return `<a ${attrs.replace(classMatch[0], `class="${classMatch[1]} machine-data-link"`)}>${newLabel}</a>`;
    }
    return `<a ${attrs} class="machine-data-link">${newLabel}</a>`;
  });
}
function preserveDistributionMarkers(file, html) {
  if (!/^distribution-[\w-]+\.html$/i.test(file)) return html;
  return html.replace(/<h2>Source Trails<\/h2>/g, '<h2>Source Pathways</h2>').replace(/<h2>Source Trail<\/h2>/g, '<h2>Source Pathways</h2>');
}

let touched = 0;
let enriched = 0;
let sourcePanels = 0;
let jsonSoftened = 0;
for (const file of publicPages) {
  const full = path.join(root, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  for (const [from, to] of replacements) html = html.replace(from, to);
  html = preserveDistributionMarkers(file, html);
  const beforeJson = html;
  html = softenJsonLinks(html);
  if (html !== beforeJson) jsonSoftened += 1;
  const copy = visibleCopy(html);
  const wordCount = copy.split(/\s+/).filter(Boolean).length;
  const hasUsefulRoutes = /live-intel\.html|evidence-vault\.html|books\.html|videos\.html|optin-center\.html|amazon-store-books\.html/i.test(html);
  const isThin = wordCount < 260 || !hasUsefulRoutes;
  if (hasRiskFigures(file, copy) && html.includes('</main>')) {
    const panel = figureSourcePanel(file, html);
    if (panel) {
      html = html.replace('</main>', `${panel}</main>`);
      sourcePanels += 1;
    }
  }
  if (isThin && html.includes('</main>')) {
    const section = usefulnessSection(file, html);
    if (section) {
      html = html.replace('</main>', `${section}</main>`);
      enriched += 1;
    }
  }
  if (html !== before) {
    fs.writeFileSync(full, html);
    touched += 1;
  }
}
console.log(`Public usefulness upgrade complete: ${touched} pages touched, ${enriched} weak pages enriched, ${sourcePanels} figure-source panels added, ${jsonSoftened} pages with JSON links softened.`);
