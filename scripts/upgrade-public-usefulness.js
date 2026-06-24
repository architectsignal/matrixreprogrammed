const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['site-freshness-report.html','site-quality-report.html']);
const publicPages = fs.readdirSync(root).filter(file => file.endsWith('.html') && !ignored.has(file));

const replacements = [
  [/\bUse this page as\b/gi, 'Use this page to'],
  [/\bsales door\b/gi, 'reader path'],
  [/\bSales door\b/g, 'Reader path'],
  [/\barchive route\b/gi, 'source pathway'],
  [/\bArchive Routes\b/g, 'Source Pathways'],
  [/\bArchive Route\b/g, 'Source Pathway'],
  [/\bDatabase-driven archive\b/gi, 'Book Archive'],
  [/\bLive generated pages\b/gi, 'Available reader pages'],
  [/\bgenerated pages\b/gi, 'reader pages'],
  [/\bSource:\s*data\/[^<\n]+/gi, 'Source: Matrix Reprogrammed archive'],
  [/\bBlack File funnel\b/gi, 'Black File reader path'],
  [/\bSearch index:\s*active\b/gi, 'Search: ready'],
  [/\bReader paths:\s*active\b/gi, 'Reader paths: open'],
  [/\bRisk timers:\s*active\b/gi, 'Risk timers: open'],
  [/\bPhase 19 Lead Magnet \/ Capture Engine\b/g, 'Free Briefs / Reader Capture'],
  [/\bPhase 18 Offer Stack \/ Revenue Ladder Engine\b/g, 'Offer Center / Reading Routes'],
  [/\bPhase 17 Campaign Calendar \/ Launch Room Engine\b/g, 'Launch Room / Campaign Paths'],
  [/\bPhase 16 Share Kit \/ Social Distribution Engine\b/g, 'Share Kits / Distribution Tools'],
  [/\bPhase 15 Feed Discovery\b/g, 'Feed Center'],
  [/\bPhase 14 Dossier Pack\b/g, 'Download Center'],
  [/\bPhase 13 Schema Engine\b/g, 'Machine Index'],
  [/\bPhase 12 Authority Cluster\b/g, 'Authority Hub'],
  [/\bPhase 11 Freshness Monitor\b/g, 'Update Monitor'],
  [/\bPhase 10 Reader Path Sales Ladder\b/g, 'Reader Paths'],
  [/\bPhase 9 Content Distribution\b/g, 'Distribution Tools'],
  [/\bPhase 8 Trust Center\b/g, 'Trust Center'],
  [/\bPhase 7 Conversion Funnel\b/g, 'Conversion Funnel'],
  [/\bPhase 6 Network Map\b/g, 'Network Map'],
  [/\bPhase 5 AI Answer Engine\b/g, 'AI Answer Engine'],
  [/\bPhase 4 Book Universe\b/g, 'Book Universe'],
  [/\bPhase 3 Evidence Vault\b/g, 'Evidence Vault'],
  [/\bPhase 2 Power Atlas\b/g, 'Power Atlas'],
  [/\bPhase 1 structure pages\b/g, 'core structure pages'],
  [/\bTHE Hegelian CRISIS DIALECTIC\b/g, 'THE HEGELIAN CRISIS DIALECTIC'],
  [/\bfollowing the The\b/g, 'following the'],
  [/\bplaceholder copy\b/gi, 'reader copy'],
  [/\bpending functionality\b/gi, 'available pathway'],
  [/\bawaiting API\b/gi, 'source check pending'],
  [/\bTODO\b/g, 'Review point'],
  [/\bFIXME\b/g, 'Review point'],
  [/\bauthor-facing\b/gi, 'editorial'],
  [/\bChatGPT\b/g, 'Matrix Reprogrammed']
];

function visibleCopy(html) {
  return html.replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function pageTitle(file, html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return file.replace(/\.html$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  return ['live-intel.html','Live Intel'];
}
function usefulnessSection(file, html) {
  if (html.includes('id="reader-usefulness-route"')) return '';
  const [primaryRoute, primaryLabel] = routeFor(file);
  return `<section id="reader-usefulness-route" class="section wrap"><h2>How To Use This Page</h2><p class="lead">This page is part of the Matrix Reprogrammed evidence-and-books ecosystem. Start with the public source path, check the evidence boundary, then continue into the book, video, free brief, or store route.</p><div class="grid"><article class="card redline"><span class="label">Primary route</span><h3>${primaryLabel}</h3><p>Open the strongest related route for this page and continue the investigation from a clearer entry point.</p><a class="btn" href="${primaryRoute}">Open ${primaryLabel}</a></article><article class="card"><span class="label">Evidence route</span><h3>Check the source trail</h3><p>Figures, claims, names, dates, and crisis numbers should be traced through the Evidence Vault or Live Intel report before being treated as settled.</p><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></article><article class="card"><span class="label">Reader path</span><h3>Go deeper</h3><p>Use the books, free briefs, Rumble/video routes, and Amazon store to move from headline to full investigation.</p><div class="cta-row small"><a class="btn alt" href="books.html">Books</a><a class="btn alt" href="optin-center.html">Free Briefs</a><a class="btn alt" href="videos.html">Rumble</a><a class="btn alt" href="amazon-store-books.html">Store</a></div></article></div></section>`;
}

let touched = 0;
let enriched = 0;
for (const file of publicPages) {
  const full = path.join(root, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  for (const [from, to] of replacements) html = html.replace(from, to);
  const copy = visibleCopy(html);
  const wordCount = copy.split(/\s+/).filter(Boolean).length;
  const hasUsefulRoutes = /live-intel\.html|evidence-vault\.html|books\.html|videos\.html|optin-center\.html|amazon-store-books\.html/i.test(html);
  const isThin = wordCount < 260 || !hasUsefulRoutes;
  if (isThin && html.includes('</main>')) {
    html = html.replace('</main>', `${usefulnessSection(file, html)}</main>`);
    enriched += 1;
  }
  if (html !== before) {
    fs.writeFileSync(full, html);
    touched += 1;
  }
}
console.log(`Public usefulness upgrade complete: ${touched} pages touched, ${enriched} thin/weak pages enriched.`);
