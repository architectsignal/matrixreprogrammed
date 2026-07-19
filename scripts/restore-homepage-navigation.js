const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  path.join(root, 'index.html'),
  path.join(root, '_site', 'index.html')
];

const canonicalNavigation = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary"><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="power-atlas.html">Control System</a><a href="evidence-vault.html">Declassified Files</a><a href="live-intel.html">Live Intel</a><a href="timers.html">Timers</a><a href="security-privacy.html">Security Tools</a><a href="search.html">Search</a></div><details class="nav-more"><summary>More</summary><div class="nav-drawer"><div class="nav-group"><strong>Community, Books & Membership</strong><a href="book-universe.html">Book Universe</a><a href="forum.html">Signal Board</a><a href="membership.html">Membership</a><a href="subscriber-dashboard.html">Subscriber Dashboard</a><a href="amazon-store-books.html">Amazon Store</a><a href="videos.html">Rumble Channels</a><a href="optin-center.html">Free Briefs</a><a href="newsletter.html">Newsletter</a></div><div class="nav-group"><strong>Evidence & Trust</strong><a href="evidence-vault.html">Evidence Vault</a><a href="trust-center.html">Trust Center</a><a href="evidence-vault-index.html">Source Index</a><a href="evidence-policy.html">Evidence Policy</a><a href="black-file.html">Black File</a><a href="download-center.html">Download Center</a><a href="feed-center.html">Feed Center</a></div><div class="nav-group"><strong>Control & Monitoring</strong><a href="power-atlas.html">Power Atlas</a><a href="network-maps.html">Network Maps</a><a href="network-map-index.html">Map Index</a><a href="geographic-power-atlas.html">Geographic Atlas</a><a href="news.html">Intel Desk</a><a href="timers.html">Risk Timers</a><a href="update-monitor.html">Update Monitor</a></div><div class="nav-group"><strong>Research & Safety</strong><a href="research-tools.html">Research Tools</a><a href="evidence-reader.html">Evidence Reader</a><a href="evidence-timeline.html">Evidence Timeline</a><a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a><a href="search.html">Search Everything</a><a href="distribution-center.html">Distribution Center</a></div></div></details></nav>`;

const navPattern = /<nav class="nav(?: nav-shell)?"(?: aria-label="Primary navigation")?>[\s\S]*?<\/nav>/i;
const requiredRoutes = [
  'timers.html',
  'news.html',
  'update-monitor.html',
  'network-maps.html',
  'membership.html',
  'download-center.html',
  'research-tools.html',
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
  primaryRoutes: ['start-here.html','books.html','power-atlas.html','evidence-vault.html','live-intel.html','timers.html','security-privacy.html','search.html'],
  restoredGroups: ['Community, Books & Membership','Evidence & Trust','Control & Monitoring','Research & Safety'],
  requiredRoutes
}, null, 2)}\n`);

console.log(`Homepage navigation restored with visible Timers and ${requiredRoutes.length} verified command routes.`);
