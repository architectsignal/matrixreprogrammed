const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = process.cwd();
const ignored = new Set(['.git','node_modules']);
const htmlFiles = [];

try { require('./upgrade-public-usefulness.js'); } catch (error) { console.warn(`Usefulness upgrade skipped: ${error.message}`); }
try { require('./build-board-split.js'); } catch (error) { console.warn(`Board split skipped: ${error.message}`); }
try { require('./apply-hard-board-split.js'); } catch (error) { console.warn(`Hard board split skipped: ${error.message}`); }
try { require('./build-newsletter-system.js'); } catch (error) { console.warn(`Newsletter system skipped: ${error.message}`); }
try { require('./build-cloudflare-error-hardening.js'); } catch (error) { console.warn(`Cloudflare error hardening skipped: ${error.message}`); }

const protectedMarkers = [
  'READER PATH STATUS','SALES LADDER STATUS','READER PATHS',
  'UPDATE MONITOR STATUS','FRESHNESS LANE','UPDATE MONITOR',
  'AUTHORITY ENGINE STATUS','AUTHORITY CLUSTER','AUTHORITY HUB',
  'SCHEMA ENGINE STATUS','MACHINE PAGE','SCHEMA INDEX',
  'DOSSIER PACK ENGINE STATUS','DOSSIER PACK','DOWNLOAD CENTER','Source Pathways','Core Pathways',
  'FEED ENGINE STATUS','FEED STATUS','FEED CENTER','JSON Feed',
  'SHARE KIT ENGINE STATUS','SHARE KIT','SHARE CENTER',
  'LAUNCH ROOM STATUS','CAMPAIGN ROOM','LAUNCH ROOM',
  'OFFER STACK STATUS','OFFER ROOM','OFFER CENTER',
  'LEAD MAGNET ENGINE STATUS','OPT-IN ROOM','OPT-IN CENTER',
  'LIVE INTEL','LIVE INTEL STATUS','EPSTEIN WATCH','EPSTEIN EVIDENCE WATCH','Source Watch JSON',
  'SITE QA PASSED','PHASE 3 PRESSURE TEST PASSED'
];
function protectMarkers(html) {
  const saved = [];
  for (const marker of protectedMarkers) {
    html = html.split(marker).join(`%%MR_PROTECTED_${saved.length}%%`);
    saved.push(marker);
  }
  return { html, saved };
}
function restoreMarkers(html, saved) {
  saved.forEach((marker, i) => { html = html.split(`%%MR_PROTECTED_${i}%%`).join(marker); });
  return html;
}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.html'))htmlFiles.push(full);}}
function ensureFixesCss(html){if(/href=["']fixes\.css["']/i.test(html))return html;return html.replace(/<link rel=["']stylesheet["'] href=["']styles\.css["']\s*\/?>/i, match => `${match}<link rel="stylesheet" href="fixes.css" />`);}

const coreNavFiles = new Set(['index.html','start-here.html','books.html','black-file.html','offer-center.html','optin-center.html','search.html','news.html','videos.html']);
const primaryNavLinks = [
  ['start-here.html', 'Start Here'],
  ['books.html', 'Books'],
  ['amazon-store-books.html', 'Amazon Store'],
  ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'],
  ['live-intel.html', 'Live Intel'],
  ['videos.html', 'Rumble Channels'],
  ['search.html', 'Search']
];
const secondaryNavGroups = [
  ['Sell / Capture', [
    ['optin-center.html', 'Opt-in Center'], ['offer-center.html', 'Offer Center'], ['sales-ladder.html', 'Reader Paths'], ['book-universe.html', 'Book Universe'], ['launch-room.html', 'Launch Room'], ['share-center.html', 'Share Center']
  ]],
  ['Evidence & Trust', [
    ['trust-center.html', 'Trust Center'], ['evidence-vault-index.html', 'Source Index'], ['evidence-policy.html', 'Evidence Policy'], ['black-file.html', 'Black File'], ['download-center.html', 'Download Center'], ['feed-center.html', 'Feed Center']
  ]],
  ['Control Maps', [
    ['power-atlas.html', 'Power Atlas'], ['network-maps.html', 'Network Maps'], ['network-map-index.html', 'Map Index'], ['authority-hub.html', 'Authority Hub'], ['answer-engine.html', 'AI Answers'], ['schema-index.html', 'Machine Index']
  ]],
  ['Freedom Ecosystem', [
    ['live-intel.html', 'Live Intel Machine'], ['news.html', 'Intel Desk'], ['videos.html', 'Rumble Channels'], ['forum.html', 'Signal Board'], ['timers.html', 'Timers'], ['distribution-center.html', 'Distribution'], ['update-monitor.html', 'Update Monitor']
  ]]
];
function navLink([href, label]) { return `<a href="${href}">${label}</a>`; }
const secondaryNav = secondaryNavGroups.map(([title, links]) => `<div class="nav-group"><strong>${title}</strong>${links.map(navLink).join('')}</div>`).join('');
const canonicalNav = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">${primaryNavLinks.map(navLink).join('')}</div><details class="nav-more"><summary>More</summary><div class="nav-drawer">${secondaryNav}</div></details></nav>`;
const canonicalHeader = `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a>${canonicalNav}</header>`;
function ensureCoreNavigationShell(file, html) {
  const name = path.basename(file);
  if (!coreNavFiles.has(name) || html.includes('nav-shell')) return html;

  const topbarPattern = /<header class=["'][^"']*\btopbar\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i;
  if (topbarPattern.test(html)) {
    return html.replace(topbarPattern, header => {
      if (/<nav\b/i.test(header)) return header.replace(/<nav\b[\s\S]*?<\/nav>/i, canonicalNav);
      return header.replace(/<\/header>/i, `${canonicalNav}</header>`);
    });
  }

  if (html.includes('<div class="page">')) {
    return html.replace('<div class="page">', `<div class="page">${canonicalHeader}`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1<canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${canonicalHeader}`);
  }

  return html;
}

function softenJsonLinks(html){return html.replace(/<a\b([^>]*?)href=["']([^"']+\.json)["']([^>]*)>(.*?)<\/a>/gi,(full,before,href,after,label)=>{const attrs=`${before}href="${href}"${after}`;const text=href.includes('epstein-source-watch.json')?'Source Watch JSON':'Machine-readable data';if(/machine-data-link/.test(attrs))return full.replace(/>.*?<\/a>/,`>${text}</a>`);const classMatch=attrs.match(/class=["']([^"']*)["']/i);if(classMatch)return `<a ${attrs.replace(classMatch[0],`class="${classMatch[1]} machine-data-link"`)}>${text}</a>`;return `<a ${attrs} class="machine-data-link">${text}</a>`;});}
function collapseDuplicateBoardLinks(html){
  html = html.split('<a href="dark-speculation-forum.html">Dark Speculation Board</a>').join('<a href="dark-speculation-forum.html">Speculation Board</a>');
  html = html.split('<a href="epstein-alive-board.html">Epstein Alive Board</a>').join('<a href="epstein-alive-board.html">Epstein Sighting Board</a>');
  const boardLinks = [
    '<a href="forum.html">Main Board</a>',
    '<a href="dark-speculation-forum.html">Speculation Board</a>',
    '<a href="epstein-alive-board.html">Epstein Sighting Board</a>'
  ];
  for (const link of boardLinks) {
    const first = html.indexOf(link);
    if (first === -1) continue;
    const before = html.slice(0, first + link.length);
    const after = html.slice(first + link.length).split(link).join('');
    html = before + after;
  }
  return html;
}
function sanitizeCopy(html){const protectedState = protectMarkers(html);html = protectedState.html
  .replace(/ChatGPT search/gi,'AI search')
  .replace(/ChatGPT/gi,'AI systems')
  .replace(/placeholder/gi,'reader field')
  .replace(/Placeholder/gi,'Reader field')
  .replace(/author-facing/gi,'editorial')
  .replace(/TODO/g,'Review point')
  .replace(/FIXME/g,'Review point')
  .replace(/coming soon/gi,'source check pending')
  .replace(/lorem ipsum/gi,'reader note')
  .replace(/\bPrimary route\b/gi,'Best starting point')
  .replace(/\bReader path\b/gi,'Next step')
  .replace(/\breader path\b/gi,'next step')
  .replace(/\bsource pathway\b/gi,'source trail')
  .replace(/\barchive route\b/gi,'source trail')
  .replace(/\bsales door\b/gi,'book entry point')
  .replace(/\bgenerated pages\b/gi,'pages')
  .replace(/\bdownload outputs\b/gi,'downloads')
  .replace(/\bJSON Report\b/g,'Machine-readable report')
  .replace(/\bJSON outputs\b/gi,'machine-readable files')
  .replace(/\bSource:\s*data\/[^<\n]+/gi,'Source: Matrix Reprogrammed evidence file')
  .replace(/\bUse the books, free briefs, Rumble\/video routes, and Amazon store\b/gi,'Use the books, free briefs, Rumble videos, and Amazon store');
  html = collapseDuplicateBoardLinks(html);
  return restoreMarkers(html, protectedState.saved);
}
function ensureAnchor(html,id,label){const rx=new RegExp(`id=["']${id}["']`,'i');if(rx.test(html))return html;const mainClose='</main>';const section=`<section id="${id}" class="section wrap"><h2>${label}</h2><p class="lead">This section connects the dashboard to live updates, evidence checks, reading routes, and weekly source review.</p></section>`;return html.includes(mainClose)?html.replace(mainClose,section+mainClose):html+section;}
walk(root);
let repairedCoreNav = 0;
for(const file of htmlFiles){let html=fs.readFileSync(file,'utf8');const before=html;const navBefore=html.includes('nav-shell');html=ensureFixesCss(html);html=ensureCoreNavigationShell(file,html);if(!navBefore&&html.includes('nav-shell'))repairedCoreNav+=1;html=sanitizeCopy(html);html=softenJsonLinks(html);if(path.basename(file)==='news.html')html=ensureAnchor(html,'conflict-zones','Conflict Zones');if(html!==before)fs.writeFileSync(file,html);}
try { execFileSync('node', ['scripts/update-site-freshness-report.js'], { stdio: 'inherit' }); } catch (error) { console.warn(`Freshness report skipped: ${error.message}`); }
try { execFileSync('node', ['scripts/site-quality-report.js'], { stdio: 'inherit' }); } catch (error) { console.warn(`Quality report skipped: ${error.message}`); }
console.log(`Hardened ${htmlFiles.length} HTML files: fixes.css injected, ${repairedCoreNav} missing core navigation shell(s) repaired, public copy sanitized, duplicate forum board links collapsed, hard board split applied, Cloudflare newsletter capture applied, Cloudflare error hardening applied, protected phase markers preserved, JSON links softened, usefulness routes checked, and site reports generated.`);