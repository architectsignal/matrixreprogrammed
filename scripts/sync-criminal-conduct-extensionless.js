const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const engineReportPath = path.join(root, 'downloads', 'criminal-conduct-engine-report.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-extensionless-sync.json');
const failures = [];
const synchronized = [];

if (!fs.existsSync(engineReportPath)) throw new Error('Missing criminal conduct engine report before extensionless synchronization');
const engine = JSON.parse(fs.readFileSync(engineReportPath, 'utf8'));
const sourceRoutes = [...new Set((engine.surfaces || []).filter(item => item.scope === 'source' && item.route.endsWith('.html')).map(item => item.route))];

function syncAlias(base, route, label) {
  const htmlFile = path.join(base, route);
  const alias = path.join(base, route.replace(/\.html$/i, ''));
  if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) {
    failures.push(`${label}/${route} missing`);
    return;
  }
  if (fs.existsSync(alias) && fs.statSync(alias).isDirectory()) {
    failures.push(`${label}/${route.replace(/\.html$/i, '')} is a directory and cannot be synchronized`);
    return;
  }
  const html = fs.readFileSync(htmlFile, 'utf8');
  if (!html.includes('<!-- criminal-conduct-engine:start -->') || !html.includes('<details class="criminal-conduct-engine">')) {
    failures.push(`${label}/${route} lacks criminal conduct engine before alias synchronization`);
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
  if (fs.existsSync(site)) syncAlias(site, route, 'built');
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  sourceDossierRoutes: sourceRoutes.length,
  synchronizedCount: synchronized.length,
  synchronized,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`CRIMINAL CONDUCT EXTENSIONLESS SYNC FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Criminal Conduct & Allegations engine synchronized to ${synchronized.length} extensionless dossier route(s).`);
