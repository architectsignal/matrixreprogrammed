const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'core-public-surfaces-finalize.json');
const report = { ok: false, generatedAt: new Date().toISOString(), commands: [], copied: [], checks: [] };

function run(script, optional = false) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) {
    if (optional) return false;
    throw new Error(`Required finalizer missing: ${script}`);
  }
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 50
  });
  report.commands.push({
    script,
    status: result.status,
    stdout: String(result.stdout || '').slice(-3000),
    stderr: String(result.stderr || '').slice(-3000)
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} failed`);
  return true;
}

function copy(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) {
    throw new Error(`Core public source missing: ${relative}`);
  }
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (!report.copied.includes(relative)) report.copied.push(relative);
  if (relative.endsWith('.html')) {
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) {
      fs.copyFileSync(source, extensionless);
    }
  }
}

function requireText(relative, markers) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`${relative} is missing`);
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of markers) {
    const ok = text.includes(marker);
    report.checks.push({ relative, marker, ok });
    if (!ok) throw new Error(`${relative} missing required marker: ${marker}`);
  }
}

function cleanLocalHtmlRoute(value) {
  const raw = String(value || '').trim();
  if (!raw || /^(?:https?:|mailto:|tel:|javascript:)/i.test(raw)) return '';
  const pathname = raw.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  if (!pathname.endsWith('.html') || pathname.split('/').includes('..')) return '';
  return pathname;
}

function requireLocalRouteTarget(route, label) {
  const relative = cleanLocalHtmlRoute(route);
  if (!relative) throw new Error(`${label} is not a safe local HTML route: ${route || 'missing'}`);
  const target = path.join(root, relative);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`${label} target is unavailable: ${relative}`);
  }
  return relative;
}

function repairDailyPowerMissingRecordRoute() {
  const staleRoute = 'entity-briefs/control-structure.html';
  const canonicalRoute = 'entity-timelines/control-structure.html';
  requireLocalRouteTarget(canonicalRoute, 'Daily Power compatibility route');

  const htmlFile = path.join(root, 'daily-power-conclusions.html');
  const dataFile = path.join(root, 'data', 'daily-power-conclusions.json');
  if (!fs.existsSync(htmlFile)) throw new Error('daily-power-conclusions.html is missing');
  if (!fs.existsSync(dataFile)) throw new Error('data/daily-power-conclusions.json is missing');

  const beforeHtml = fs.readFileSync(htmlFile, 'utf8');
  let afterHtml = beforeHtml.split(staleRoute).join(canonicalRoute);
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const conclusions = Array.isArray(data.conclusions) ? data.conclusions : [];
  let dataChanged = false;

  for (const conclusion of conclusions) {
    if (conclusion.route === staleRoute) {
      conclusion.route = canonicalRoute;
      dataChanged = true;
    }
    if (conclusion.integrity && conclusion.integrity.route === staleRoute) {
      conclusion.integrity.route = canonicalRoute;
      dataChanged = true;
    }
  }

  const missingRecord = conclusions.find(conclusion => String(conclusion.title || '').trim().toLowerCase() === 'most important missing record');
  if (!missingRecord) throw new Error('Daily Power data has no Most important missing record conclusion');

  const requestedRoute = cleanLocalHtmlRoute(missingRecord.route || missingRecord.integrity?.route);
  if (requestedRoute && !fs.existsSync(path.join(root, requestedRoute)) && requestedRoute.startsWith('entity-briefs/')) {
    const slug = path.basename(requestedRoute, '.html');
    const fallbackRoute = [
      `entity-timelines/${slug}.html`,
      `reports/entity-${slug}.html`
    ].find(candidate => fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile());
    if (fallbackRoute) {
      afterHtml = afterHtml.split(requestedRoute).join(fallbackRoute);
      if (missingRecord.route === requestedRoute) missingRecord.route = fallbackRoute;
      if (missingRecord.integrity?.route === requestedRoute) missingRecord.integrity.route = fallbackRoute;
      dataChanged = true;
    }
  }
  const activeRoute = requireLocalRouteTarget(
    missingRecord.route || missingRecord.integrity?.route,
    'Current Daily Power missing-record route'
  );

  if (!afterHtml.includes(activeRoute)) {
    throw new Error(`Daily Power HTML does not expose its current missing-record route: ${activeRoute}`);
  }

  for (const conclusion of conclusions) {
    for (const candidate of [conclusion.route, conclusion.integrity?.route]) {
      const localRoute = cleanLocalHtmlRoute(candidate);
      if (localRoute) requireLocalRouteTarget(localRoute, `Daily Power conclusion ${conclusion.title || 'untitled'}`);
    }
  }

  const renderedData = JSON.stringify(data, null, 2);
  if (afterHtml.includes(staleRoute) || renderedData.includes(staleRoute)) {
    throw new Error('Daily Power still contains the retired Control Structure entity-brief route');
  }

  if (afterHtml !== beforeHtml) fs.writeFileSync(htmlFile, afterHtml);
  if (dataChanged) fs.writeFileSync(dataFile, `${renderedData}\n`);

  report.dailyPowerRoute = {
    staleRoute,
    canonicalRoute,
    activeRoute,
    htmlChanged: afterHtml !== beforeHtml,
    dataChanged
  };
  return activeRoute;
}

if (!fs.existsSync(site)) throw new Error('_site is missing; run the normal build first');

run('scripts/expand-death-files-100.js');
run('scripts/build-death-files.js');
run('scripts/enhance-death-files-100-ui.js', true);
run('scripts/death-files-pressure-test.js');
run('scripts/patch-main-navigation-safety-links.js');
run('scripts/restore-homepage-navigation.js');
run('scripts/patch-homepage-construction-banner.js');

const fixed = [
  'index.html', 'start-here.html', 'independent-links.html',
  'elite-family-tracker.html', 'behind-the-curtain-capstone.html',
  'data/independent-links-1.json', 'data/independent-links-2.json',
  'data/independent-links-3.json', 'data/independent-links-4.json',
  'death-files.html', 'death-files.js', 'data/death-files.json',
  'data/death-files-runtime.json', 'downloads/death-files-index.json',
  'downloads/death-files-index.md', 'downloads/death-files-pressure-test.json',
  'fixes.css', 'sitemap.xml'
];
for (const relative of fixed) copy(relative);

const generatedDeathPages = fs.readdirSync(root)
  .filter(name => (/^death-files-.+\.html$/i.test(name) || /^death-file-.+\.html$/i.test(name)))
  .sort();
const dossierPages = generatedDeathPages.filter(name => /^death-file-.+\.html$/i.test(name));
if (dossierPages.length !== 100) {
  throw new Error(`Death Files output must contain exactly 100 dossier pages; found ${dossierPages.length}`);
}
for (const relative of generatedDeathPages) copy(relative);
copy('index.html');
copy('start-here.html');
copy('behind-the-curtain-capstone.html');

// These are the final canonical owners. Nothing broad may run after them.
run('scripts/reconcile-power-family-capstone.js');
run('scripts/patch-power-family-public-gateways.js');
run('scripts/reconcile-release-homepage-order.js');
const activeDailyPowerRoute = repairDailyPowerMissingRecordRoute();
copy('daily-power-conclusions.html');
copy('data/daily-power-conclusions.json');
copy('entity-timelines/control-structure.html');
if (activeDailyPowerRoute !== 'entity-timelines/control-structure.html') copy(activeDailyPowerRoute);

const deathData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'death-files.json'), 'utf8'));
if (!Array.isArray(deathData.dossiers) || deathData.dossiers.length !== 100) {
  throw new Error('Canonical Death Files data must contain exactly 100 dossiers');
}

requireText('index.html', [
  'id="matrix-construction-banner"',
  'UNDER CONSTRUCTION — HELP US BUILD THE MACHINE.',
  'https://gofund.me/0a3c74fc9',
  'href="death-files.html"',
  'href="independent-links.html"',
  'href="elite-family-tracker.html"',
  'My Watchlist',
  'name="q"',
  'href="live-intel.html"'
]);
requireText('independent-links.html', [
  'TOP 100 INDEPENDENT RESEARCH LINKS.',
  'data/independent-links-1.json',
  'Expected 100 sources'
]);
requireText('death-files.html', ['THE DEATH FILES.', 'id="dossiers"', 'death-files.js']);
requireText('death-files-pattern-lab.html', ['DEATH PATTERN LAB.', 'A cluster is not a conspiracy']);
requireText('death-files-methodology.html', ['HOW THE DEATH FILES WORK.', 'Three-Layer Conclusion System']);
requireText('behind-the-curtain-capstone.html', ['id="wallenberg-ecosystem"', 'id="investor-ownership"', 'id="investor-board"']);
requireText('daily-power-conclusions.html', ['Most important missing record', activeDailyPowerRoute]);
requireText('entity-timelines/control-structure.html', ['CONTROL STRUCTURE', 'Evidence boundary']);

for (const relative of dossierPages) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  if (content.includes('[object Object]')) throw new Error(`Literal object placeholder published in ${relative}`);
}
const capstone = fs.readFileSync(path.join(root, 'behind-the-curtain-capstone.html'), 'utf8');
if (capstone.includes('search-system.js')) throw new Error('Capstone still references missing search-system.js');

const deployableCoreRoutes = [...new Set([
  'index.html', 'independent-links.html', 'elite-family-tracker.html', 'death-files.html',
  'death-files-pattern-lab.html', 'death-files-methodology.html', 'behind-the-curtain-capstone.html',
  'daily-power-conclusions.html', 'entity-timelines/control-structure.html', activeDailyPowerRoute
])];
for (const relative of deployableCoreRoutes) {
  const deployed = path.join(site, relative);
  if (!fs.existsSync(deployed)) throw new Error(`Deployable core route missing: _site/${relative}`);
}
const deployedHome = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
for (const marker of ['matrix-construction-banner', 'death-files.html', 'independent-links.html', 'elite-family-tracker.html', 'My Watchlist', 'name="q"', 'live-intel.html']) {
  if (!deployedHome.includes(marker)) throw new Error(`Deployable homepage lost protected marker: ${marker}`);
}
if (deployedHome.includes('track-the-families.html')) throw new Error('Deployable homepage still references obsolete Track the Families route');
const deployedDailyPower = fs.readFileSync(path.join(site, 'daily-power-conclusions.html'), 'utf8');
if (deployedDailyPower.includes('entity-briefs/control-structure.html')) {
  throw new Error('Deployable Daily Power page contains the retired Control Structure entity-brief route');
}
if (!deployedDailyPower.includes(activeDailyPowerRoute)) {
  throw new Error(`Deployable Daily Power page lost its current missing-record route: ${activeDailyPowerRoute}`);
}

report.ok = true;
report.deathDossiers = deathData.dossiers.length;
report.deathPages = ['death-files.html', ...generatedDeathPages];
report.protectedRoutes = [...new Set([
  '/', '/independent-links.html', '/elite-family-tracker.html', '/death-files.html',
  '/behind-the-curtain-capstone.html', '/daily-power-conclusions.html',
  '/entity-timelines/control-structure.html', `/${activeDailyPowerRoute}`,
  ...generatedDeathPages.map(name => `/${name}`)
])];
report.existingIntroPreserved = true;
report.canonicalHomepageOwnerAppliedLast = true;
report.canonicalPowerFamilyOwnerAppliedLast = true;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Core public surfaces finalized: construction banner, Top 100 Links, live family tracker, current Daily Power route ${activeDailyPowerRoute}, and exactly ${dossierPages.length} readable Death Files dossiers copied into the Cloudflare bundle; canonical homepage and capstone owners were applied last.`);
