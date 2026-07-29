const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [path.join(root, 'index.html'), path.join(root, '_site', 'index.html'), path.join(root, '_site', 'index')];

const primary = [
  ['start-here.html','Start Here'],
  ['books.html','Books'],
  ['death-files.html','Death Files'],
  ['independent-links.html','Independent Links'],
  ['live-intel.html','Live Intel'],
  ['power-atlas.html','Control System'],
  ['evidence-vault.html','Evidence'],
  ['search.html','Search']
];
const groups = [
  ['Live Tracking & Clocks', [
    ['daily-command-brief.html','Daily Brief'],['timers.html','Risk Timers'],['control-system-tracker.html','Control Tracker'],['control-structure.html','Power Map'],['tracker-dashboard.html','Tracker Dashboard'],['entities.html','Entities'],['investigations.html','Investigations'],['daily-missing-records.html','Missing Records'],['conclusion-engine.html','Conclusion Engine'],['update-monitor.html','Update Monitor']
  ]],
  ['Research & Evidence', [
    ['death-files.html','Death Files'],['independent-links.html','Top 100 Independent Links'],['data-lab.html','Public Data Lab'],['research-tools.html','Research Tools'],['evidence-archive.html','Evidence Archive'],['evidence-network-map.html','Evidence Network'],['evidence-reader.html','Evidence Reader'],['evidence-timeline.html','Evidence Timeline'],['geographic-power-atlas.html','Geographic Atlas'],['source-document-vault.html','Source Vault'],['network-maps.html','Network Maps']
  ]],
  ['Power, Files & Investigations', [
    ['behind-the-curtain.html','Behind the Curtain'],['follow-the-money.html','Follow the Money'],['elite-family-tracker.html','Track the Families'],['epstein-files.html','Epstein Files'],['investigation-machine.html','Investigation Machine'],['dark-speculation-lab.html','Dark Speculation Lab']
  ]],
  ['Community, Books & Membership', [
    ['book-universe.html','Book Universe'],['forum.html','Signal Board'],['membership.html','Membership'],['subscriber-dashboard.html','Subscriber Dashboard'],['billing-dashboard.html','Billing Dashboard'],['amazon-store-books.html','Amazon Store'],['videos.html','Rumble Channels']
  ]],
  ['Briefs, Safety & Support', [
    ['security-privacy.html','Security Tools'],['dark-web-safety.html','Dark Web Safety'],['optin-center.html','Free Briefs'],['daily-command-brief.html','Today’s Brief'],['newsletter.html','Newsletter'],['download-center.html','Download Center'],['trust-center.html','Trust Center'],['contact-the-machine.html','Contact the Machine']
  ]]
];
const canonicalNavigation = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">${primary.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</div><details class="nav-more"><summary>More</summary><div class="nav-drawer">${groups.map(([title,links])=>`<div class="nav-group"><strong>${title}</strong>${links.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</div>`).join('')}</div></details></nav>`;
const navPattern = /<nav class="nav(?: nav-shell)?"(?: aria-label="Primary navigation")?>[\s\S]*?<\/nav>/i;
const requiredRoutes = [...new Set([...primary.map(x=>x[0]), ...groups.flatMap(x=>x[1].map(y=>y[0]))])];
const searchFirstMarkers = [
  'class="accountability-home"',
  'id="accountability-search"',
  'id="accountability-hit-list"',
  'id="open-question-ledger"',
  'class="accountability-nav-drawer"',
  'href="hit-list.html"',
  'href="evidence-vault.html"',
  'href="member-dashboard.html"'
];
const isSearchFirst = html => html.includes('class="accountability-home"') && html.includes('id="accountability-search"') && html.includes('id="accountability-hit-list"');

const changed = [];
const preservedSearchFirst = [];
for (const target of targets) {
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) continue;
  const before = fs.readFileSync(target, 'utf8');
  if (isSearchFirst(before)) {
    for (const marker of searchFirstMarkers) {
      if (!before.includes(marker)) throw new Error(`Search-first homepage navigation marker missing in ${path.relative(root, target)}: ${marker}`);
    }
    preservedSearchFirst.push(path.relative(root, target));
    continue;
  }
  if (!navPattern.test(before)) throw new Error(`Homepage navigation anchor missing in ${path.relative(root, target)}`);
  const after = before.replace(navPattern, canonicalNavigation);
  for (const route of requiredRoutes) {
    if (!after.includes(`href="${route}"`)) throw new Error(`Required homepage route missing after repair: ${route}`);
  }
  if (after !== before) {
    fs.writeFileSync(target, after);
    changed.push(path.relative(root, target));
  }
}

require('./patch-global-contact-and-current-pm.js');
require('./patch-public-static-route-bridge.js');

for (const target of targets) {
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) continue;
  const finalHtml = fs.readFileSync(target, 'utf8');
  if (isSearchFirst(finalHtml)) {
    for (const marker of searchFirstMarkers) {
      if (!finalHtml.includes(marker)) throw new Error(`${path.relative(root,target)} search-first navigation verification failed: ${marker}`);
    }
  } else {
    for (const route of requiredRoutes) {
      if (!finalHtml.includes(`href="${route}"`)) throw new Error(`${path.relative(root,target)} navigation verification failed: ${route}`);
    }
  }
  if (finalHtml.includes('track-the-families.html')) throw new Error(`${path.relative(root,target)} still contains obsolete Track the Families route`);
}

const reportPath = path.join(root, 'downloads', 'homepage-navigation-repair.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  preservedSearchFirst,
  primaryRoutes: primary.map(x=>x[0]),
  restoredGroups: groups.map(x=>x[0]),
  requiredRoutes,
  searchFirstMarkers,
  protectedPublicRoutes: ['death-files.html','independent-links.html','elite-family-tracker.html'],
  currentPrimeMinisterOwner: 'scripts/patch-global-contact-and-current-pm.js',
  publicStaticRouteOwner: 'scripts/patch-public-static-route-bridge.js'
}, null, 2)}\n`);
console.log(preservedSearchFirst.length
  ? `Search-first homepage navigation preserved and validated across ${preservedSearchFirst.length} target(s); classic navigation repaired across ${changed.length} target(s).`
  : `Homepage navigation restored with Death Files, Independent Links, the live Family Tracker and ${requiredRoutes.length} verified public routes.`);