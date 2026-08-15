const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const engineReportPath = path.join(root, 'downloads', 'criminal-conduct-engine-report.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-extensionless-sync.json');
const failures = [];
const synchronized = [];
const directoryBackedRoutes = [];
const materializedBuiltRoutes = [];
const privateBuiltRoutesSkipped = [];
const privateBuiltRouteRoots = new Set([
  'ai-management', 'automation', 'card-art-inbox', 'card-artwork-batches',
  'deploy-triggers', 'deployments', 'diagnostics', 'docs', 'functions',
  'local-agent', 'migrations', 'recovery', 'runtime', 'scripts', 'src',
  'templates', 'tests', 'tmp', 'tools'
]);

if (!fs.existsSync(engineReportPath)) throw new Error('Missing criminal conduct engine report before extensionless synchronization');
const engine = JSON.parse(fs.readFileSync(engineReportPath, 'utf8'));
const sourceRoutes = [...new Set((engine.surfaces || []).filter(item => item.scope === 'source' && item.route.endsWith('.html')).map(item => item.route))];

function isPrivateBuiltRoute(route) {
  const normalized = String(route || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.includes('/')) return false;
  return privateBuiltRouteRoots.has(normalized.split('/')[0]);
}

function syncAlias(base, route, label) {
  const htmlFile = path.join(base, route);
  const alias = path.join(base, route.replace(/\.html$/i, ''));
  if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) {
    failures.push(`${label}/${route} missing`);
    return;
  }
  const html = fs.readFileSync(htmlFile, 'utf8');
  if (!html.includes('<!-- criminal-conduct-engine:start -->') || !html.includes('<details class="criminal-conduct-engine">')) {
    failures.push(`${label}/${route} lacks criminal conduct engine before alias synchronization`);
    return;
  }
  if (fs.existsSync(alias) && fs.statSync(alias).isDirectory()) {
    // A directory-backed public route is a valid route owner and must never be
    // replaced by a file. The explicit .html dossier remains available, while
    // Cloudflare preserves the directory namespace for its child pages.
    directoryBackedRoutes.push({
      scope: label,
      htmlRoute: route,
      directoryRoute: path.relative(base, alias).replace(/\\/g, '/'),
      htmlEngineVerified: true
    });
    return;
  }
  fs.mkdirSync(path.dirname(alias), { recursive: true });
  fs.writeFileSync(alias, html);
  const aliasHtml = fs.readFileSync(alias, 'utf8');
  if (!aliasHtml.includes('<!-- criminal-conduct-engine:start -->') || !aliasHtml.includes('Criminal Conduct &amp; Allegations')) {
    failures.push(`${label}/${path.relative(base, alias)} failed engine verification`);
    return;
  }
  synchronized.push(`${label}/${path.relative(base, alias).replace(/\\/g, '/')}`);
}

for (const route of sourceRoutes) {
  const sourceAlias = path.join(root, route.replace(/\.html$/i, ''));
  if (fs.existsSync(sourceAlias) && fs.statSync(sourceAlias).isFile()) syncAlias(root, route, 'source');
  else if (fs.existsSync(sourceAlias) && fs.statSync(sourceAlias).isDirectory()) syncAlias(root, route, 'source');
  if (fs.existsSync(site)) {
    if (isPrivateBuiltRoute(route)) {
      privateBuiltRoutesSkipped.push(route);
      continue;
    }
    const sourceHtml = path.join(root, route);
    const builtHtml = path.join(site, route);
    if (!fs.existsSync(builtHtml) && fs.existsSync(sourceHtml) && fs.statSync(sourceHtml).isFile()) {
      fs.mkdirSync(path.dirname(builtHtml), { recursive: true });
      fs.copyFileSync(sourceHtml, builtHtml);
      materializedBuiltRoutes.push(route);
    }
    syncAlias(site, route, 'built');
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  sourceDossierRoutes: sourceRoutes.length,
  synchronizedCount: synchronized.length,
  materializedBuiltCount: materializedBuiltRoutes.length,
  privateBuiltRoutesSkippedCount: privateBuiltRoutesSkipped.length,
  directoryBackedCount: directoryBackedRoutes.length,
  synchronized,
  materializedBuiltRoutes,
  privateBuiltRoutesSkipped,
  directoryBackedRoutes,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`CRIMINAL CONDUCT EXTENSIONLESS SYNC FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Criminal Conduct & Allegations engine synchronized to ${synchronized.length} extensionless dossier route(s); ${materializedBuiltRoutes.length} missing built dossier page(s) materialized; ${privateBuiltRoutesSkipped.length} private built route(s) skipped; ${directoryBackedRoutes.length} directory-backed namespace(s) preserved with their explicit .html dossier verified.`);
