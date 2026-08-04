'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-production.js');
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const reportPath = path.join(root, 'downloads', 'public-route-alias-routing.json');
const aliases = [
  ['/follow-the-money', '/follow-the-money.html'],
  ['/making-money', '/making-money.html'],
  ['/card-artwork-batches', '/card-artwork-batches.html'],
  ['/subject-briefs', '/subject-briefs.html'],
  ['/entity-timelines', '/entity-timelines.html']
];

function read(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Required route owner missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function writeIfChanged(file, before, after, changed) {
  if (before === after) return;
  fs.writeFileSync(file, after);
  changed.push(path.relative(root, file).split(path.sep).join('/'));
}

function patchWorker(source) {
  const marker = 'const publicStaticAssetRoutes = new Map([';
  if (!source.includes(marker)) throw new Error('Strict Worker publicStaticAssetRoutes owner is missing');
  const lines = aliases
    .filter(([requestPath]) => !source.includes(`['${requestPath}',`))
    .map(([requestPath, assetPath]) => `  ['${requestPath}', '${assetPath}'],`);
  if (!lines.length) return source;
  return source.replace(marker, `${marker}\n${lines.join('\n')}`);
}

function patchToml(source) {
  const marker = 'run_worker_first = [';
  if (!source.includes(marker)) throw new Error('wrangler.toml run_worker_first owner is missing');
  const paths = aliases.map(([requestPath]) => requestPath);
  const lines = paths
    .filter(requestPath => !source.includes(`  "${requestPath}",`))
    .map(requestPath => `  "${requestPath}",`);
  if (!lines.length) return source;
  return source.replace(marker, `${marker}\n${lines.join('\n')}`);
}

function patchJsonc(source) {
  const marker = '"run_worker_first": [';
  if (!source.includes(marker)) throw new Error('wrangler.jsonc run_worker_first owner is missing');
  const paths = aliases.map(([requestPath]) => requestPath);
  const lines = paths
    .filter(requestPath => !source.includes(`      "${requestPath}",`))
    .map(requestPath => `      "${requestPath}",`);
  if (!lines.length) return source;
  return source.replace(marker, `${marker}\n${lines.join('\n')}`);
}

const changed = [];
const workerBefore = read(workerPath);
const tomlBefore = read(tomlPath);
const jsoncBefore = read(jsoncPath);
const workerAfter = patchWorker(workerBefore);
const tomlAfter = patchToml(tomlBefore);
const jsoncAfter = patchJsonc(jsoncBefore);
writeIfChanged(workerPath, workerBefore, workerAfter, changed);
writeIfChanged(tomlPath, tomlBefore, tomlAfter, changed);
writeIfChanged(jsoncPath, jsoncBefore, jsoncAfter, changed);

const failures = [];
for (const [requestPath, assetPath] of aliases) {
  const workerCount = (workerAfter.match(new RegExp(`\\['${requestPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',\\s*'${assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\]`, 'g')) || []).length;
  if (workerCount !== 1) failures.push(`${requestPath} strict Worker mapping count is ${workerCount}`);
  if (!tomlAfter.includes(`  "${requestPath}",`)) failures.push(`${requestPath} missing from wrangler.toml run_worker_first`);
  if (!jsoncAfter.includes(`      "${requestPath}",`)) failures.push(`${requestPath} missing from wrangler.jsonc run_worker_first`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  aliases: aliases.map(([requestPath, assetPath]) => ({ requestPath, assetPath })),
  changed,
  failures,
  boundary: 'Exact extensionless routes that collide with real namespace directories are handled by the strict production Worker and served from their canonical root .html assets. Nested namespace files remain unchanged.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('PUBLIC ROUTE ALIAS ROUTING FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public route namespace aliases verified: ${aliases.length} exact Worker routes; ${changed.length} owner file(s) patched.`);
module.exports = report;
