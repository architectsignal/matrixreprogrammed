const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  path.join(root, 'index.html'),
  path.join(root, '_site', 'index.html')
];

const canonicalNavigation = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary"><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="power-atlas.html">Control System</a><a href="evidence-vault.html">Declassified Files</a><a href="live-intel.html">Live Intel</a><a href="timers.html">Risk Timers</a><a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a><a href="search.html">Search</a></div><details class="nav-more"><summary>More</summary><div class="nav-drawer"><div class="nav-group"><strong>Live Tracking &amp; Clocks</strong><a href="daily-command-brief.html">Daily Brief</a><a href="timers.html">Risk Timers</a><a href="control-system-tracker.html">Control Tracker</a><a href="control-structure.html">Power Map</a><a href="tracker-dashboard.html">Tracker Dashboard</a><a href="entities.html">Entities</a><a href="investigations.html">Investigations</a><a href="daily-missing-records.html">Missing Records</a><a href="conclusion-engine.html">Conclusion Engine</a><a href="update-monitor.html">Update Monitor</a></div><div class="nav-group"><strong>Research &amp; Evidence</strong><a href="data-lab.html">Public Data Lab</a><a href="research-tools.html">Research Tools</a><a href="evidence-archive.html">Evidence Archive</a><a href="evidence-network-map.html">Evidence Network</a><a href="evidence-reader.html">Evidence Reader</a><a href="evidence-timeline.html">Evidence Timeline</a><a href="geographic-power-atlas.html">Geographic Atlas</a><a href="source-document-vault.html">Source Vault</a><a href="network-maps.html">Network Maps</a></div><div class="nav-group"><strong>Community, Books &amp; Membership</strong><a href="book-universe.html">Book Universe</a><a href="forum.html">Signal Board</a><a href="membership.html">Membership</a><a href="subscriber-dashboard.html">Subscriber Dashboard</a><a href="billing-dashboard.html">Billing Dashboard</a><a href="amazon-store-books.html">Amazon Store</a><a href="videos.html">Rumble Channels</a></div><div class="nav-group"><strong>Briefs &amp; Support</strong><a href="optin-center.html">Free Briefs</a><a href="daily-command-brief.html">Today’s Brief</a><a href="newsletter.html">Newsletter</a><a href="download-center.html">Download Center</a><a href="trust-center.html">Trust Center</a></div></div></details></nav>`;

const navPattern = /<nav class="nav(?: nav-shell)?"(?: aria-label="Primary navigation")?>[\s\S]*?<\/nav>/i;
const requiredRoutes = [
  'timers.html',
  'daily-command-brief.html',
  'control-system-tracker.html',
  'control-structure.html',
  'tracker-dashboard.html',
  'entities.html',
  'investigations.html',
  'daily-missing-records.html',
  'conclusion-engine.html',
  'update-monitor.html',
  'data-lab.html',
  'research-tools.html',
  'evidence-reader.html',
  'evidence-timeline.html',
  'source-document-vault.html',
  'network-maps.html',
  'membership.html',
  'billing-dashboard.html',
  'download-center.html',
  'security-privacy.html',
  'dark-web-safety.html'
];

const changed = [];
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  const before = fs.readFileSync(target, 'utf8');
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

if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('index.html is required');
const finalHomepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const route of requiredRoutes) {
  if (!finalHomepage.includes(`href="${route}"`)) throw new Error(`Homepage navigation verification failed: ${route}`);
}

const reportPath = path.join(root, 'downloads', 'homepage-navigation-repair.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  primaryRoutes: ['start-here.html','books.html','power-atlas.html','evidence-vault.html','live-intel.html','timers.html','security-privacy.html','dark-web-safety.html','search.html'],
  restoredGroups: ['Live Tracking & Clocks','Research & Evidence','Community, Books & Membership','Briefs & Support'],
  requiredRoutes
}, null, 2)}\n`);

console.log(`Homepage navigation restored with Risk Timers and ${requiredRoutes.length} verified operational routes.`);
