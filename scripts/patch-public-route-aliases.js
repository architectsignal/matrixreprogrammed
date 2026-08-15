'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-production.js');
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const reportPath = path.join(root, 'downloads', 'public-route-alias-routing.json');
const aliases = [
  ['/epstein', '/epstein-files.html'],
  ['/follow-the-money', '/follow-the-money.html'],
  ['/making-money', '/making-money.html'],
  ['/card-artwork-batches', '/card-artwork-batches.html'],
  ['/subject-briefs', '/subject-briefs.html'],
  ['/entity-timelines', '/entity-timelines.html']
];
const protectedWorkerAliases = new Set([
  '/card-artwork-batches'
]);

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  let next = source;
  for (const [requestPath, assetPath] of aliases) {
    if (!protectedWorkerAliases.has(requestPath)) continue;
    const unsafePublicMapping = new RegExp(
      `^[ \\t]*\\['${escapeRegExp(requestPath)}',[ \\t]*'${escapeRegExp(assetPath)}'\\],[ \\t]*(?:\\r?\\n|$)`,
      'gm'
    );
    next = next.replace(unsafePublicMapping, '');
  }
  const lines = aliases
    .filter(([requestPath]) => !protectedWorkerAliases.has(requestPath))
    .filter(([requestPath]) => !next.includes(`['${requestPath}',`))
    .map(([requestPath, assetPath]) => `  ['${requestPath}', '${assetPath}'],`);
  if (!lines.length) return next;
  return next.replace(marker, `${marker}\n${lines.join('\n')}`);
}

function runWorkerFirstBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} owner is missing`);
  const open = source.indexOf('[', markerIndex);
  const close = source.indexOf(']', open + 1);
  if (open < 0 || close < 0) throw new Error(`${marker} array boundary is invalid`);
  return {
    before: source.slice(0, open + 1),
    body: source.slice(open + 1, close),
    after: source.slice(close)
  };
}

function quotedRoutes(body) {
  return [...String(body || '').matchAll(/["'](\/[^"']+)["']/g)].map(match => match[1]);
}

function wildcardCovers(exactRoute, candidate) {
  if (!String(candidate || '').endsWith('*')) return false;
  const prefix = candidate.slice(0, -1);
  return exactRoute.startsWith(prefix);
}

function removeExactLine(body, requestPath) {
  const expression = new RegExp(`^[ \\t]*["']${escapeRegExp(requestPath)}["'][ \\t]*,?[ \\t]*(?:\\r?\\n|$)`, 'gm');
  return body.replace(expression, '');
}

function patchRunWorkerFirst(source, marker, indent) {
  const block = runWorkerFirstBlock(source, marker);
  const originalRoutes = quotedRoutes(block.body);
  const additions = [];
  const coverage = [];
  let body = block.body;

  for (const [requestPath] of aliases) {
    const coveringWildcard = originalRoutes.find(route => wildcardCovers(requestPath, route)) || '';
    const exactPresent = originalRoutes.includes(requestPath);
    if (coveringWildcard) {
      // Wrangler rejects an exact path when an existing wildcard already routes
      // that request through the Worker. Keep the Worker asset mapping, but
      // remove the redundant configuration entry.
      body = removeExactLine(body, requestPath);
    } else if (!exactPresent) {
      additions.push(`${indent}"${requestPath}",`);
    }
    coverage.push({ requestPath, coveringWildcard, exactRequired: !coveringWildcard });
  }

  if (additions.length) body = `\n${additions.join('\n')}${body}`;
  return {
    source: `${block.before}${body}${block.after}`,
    coverage
  };
}

function routeCoverage(source, marker, requestPath) {
  const routes = quotedRoutes(runWorkerFirstBlock(source, marker).body);
  const exact = routes.includes(requestPath);
  const wildcard = routes.find(route => wildcardCovers(requestPath, route)) || '';
  return { requestPath, exact, wildcard, covered: exact || Boolean(wildcard), redundant: exact && Boolean(wildcard) };
}

function redundantRoutes(source, marker) {
  const routes = quotedRoutes(runWorkerFirstBlock(source, marker).body);
  return routes
    .filter(route => !route.endsWith('*'))
    .map(route => ({ route, wildcard: routes.find(candidate => wildcardCovers(route, candidate)) || '' }))
    .filter(item => item.wildcard);
}

function patchToml(source) {
  return patchRunWorkerFirst(source, 'run_worker_first = [', '  ');
}

function patchJsonc(source) {
  return patchRunWorkerFirst(source, '"run_worker_first": [', '      ');
}

function runSelfTest() {
  const toml = `run_worker_first = [\n  "/api/*",\n  "/card-artwork-batches*",\n  "/card-artwork-batches",\n]\n`;
  const jsonc = `{"assets":{"run_worker_first": [\n      "/api/*",\n      "/card-artwork-batches*",\n      "/card-artwork-batches",\n]}}\n`;
  const patchedToml = patchToml(toml).source;
  const patchedJsonc = patchJsonc(jsonc).source;
  for (const [name, source, marker] of [
    ['toml', patchedToml, 'run_worker_first = ['],
    ['jsonc', patchedJsonc, '"run_worker_first": [']
  ]) {
    const card = routeCoverage(source, marker, '/card-artwork-batches');
    if (!card.covered || card.exact || card.wildcard !== '/card-artwork-batches*' || card.redundant) {
      throw new Error(`${name} self-test did not preserve wildcard-only card artwork routing`);
    }
    const followMoney = routeCoverage(source, marker, '/follow-the-money');
    if (!followMoney.covered || !followMoney.exact || followMoney.redundant) {
      throw new Error(`${name} self-test did not add the required exact follow-the-money route`);
    }
    if (redundantRoutes(source, marker).length) throw new Error(`${name} self-test left a redundant route`);
  }
  const worker = `const publicStaticAssetRoutes = new Map([\n  ['/card-artwork-batches', '/card-artwork-batches.html'],\n]);\n`;
  const patchedWorker = patchWorker(worker);
  if (patchedWorker.includes("['/card-artwork-batches', '/card-artwork-batches.html']")) {
    throw new Error('Worker self-test left a protected admin asset in the public static bridge');
  }
  if (!patchedWorker.includes("['/epstein', '/epstein-files.html']")) {
    throw new Error('Worker self-test did not preserve public alias bridging');
  }
  console.log('PUBLIC ROUTE ALIAS ROUTING SELF-TEST PASSED: wildcard coverage is preserved without redundant exact routes, and protected admin assets stay outside the public bridge.');
}

function run() {
  const changed = [];
  const workerBefore = read(workerPath);
  const tomlBefore = read(tomlPath);
  const jsoncBefore = read(jsoncPath);
  const workerAfter = patchWorker(workerBefore);
  const tomlPatch = patchToml(tomlBefore);
  const jsoncPatch = patchJsonc(jsoncBefore);
  const tomlAfter = tomlPatch.source;
  const jsoncAfter = jsoncPatch.source;
  writeIfChanged(workerPath, workerBefore, workerAfter, changed);
  writeIfChanged(tomlPath, tomlBefore, tomlAfter, changed);
  writeIfChanged(jsoncPath, jsoncBefore, jsoncAfter, changed);

  const failures = [];
  const coverage = [];
  for (const [requestPath, assetPath] of aliases) {
    const workerCount = (workerAfter.match(new RegExp(`\\['${escapeRegExp(requestPath)}',\\s*'${escapeRegExp(assetPath)}'\\]`, 'g')) || []).length;
    const expectedWorkerCount = protectedWorkerAliases.has(requestPath) ? 0 : 1;
    if (workerCount !== expectedWorkerCount) failures.push(`${requestPath} public static Worker mapping count is ${workerCount}; expected ${expectedWorkerCount}`);
    const tomlCoverage = routeCoverage(tomlAfter, 'run_worker_first = [', requestPath);
    const jsoncCoverage = routeCoverage(jsoncAfter, '"run_worker_first": [', requestPath);
    coverage.push({ requestPath, toml: tomlCoverage, jsonc: jsoncCoverage });
    if (!tomlCoverage.covered) failures.push(`${requestPath} is not covered by wrangler.toml run_worker_first`);
    if (!jsoncCoverage.covered) failures.push(`${requestPath} is not covered by wrangler.jsonc run_worker_first`);
    if (tomlCoverage.redundant) failures.push(`${requestPath} is redundantly covered by exact and wildcard TOML routes`);
    if (jsoncCoverage.redundant) failures.push(`${requestPath} is redundantly covered by exact and wildcard JSONC routes`);
  }

  const tomlRedundant = redundantRoutes(tomlAfter, 'run_worker_first = [');
  const jsoncRedundant = redundantRoutes(jsoncAfter, '"run_worker_first": [');
  for (const item of tomlRedundant) failures.push(`wrangler.toml exact route ${item.route} is subsumed by ${item.wildcard}`);
  for (const item of jsoncRedundant) failures.push(`wrangler.jsonc exact route ${item.route} is subsumed by ${item.wildcard}`);

  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    aliases: aliases.map(([requestPath, assetPath]) => ({
      requestPath,
      assetPath,
      workerBoundary: protectedWorkerAliases.has(requestPath) ? 'protected-asset-gate' : 'public-static-asset'
    })),
    changed,
    coverage,
    redundantRoutes: { toml: tomlRedundant, jsonc: jsoncRedundant },
    failures,
    boundary: 'Exact extensionless routes that collide with real namespace directories are handled by the strict production Worker. Public aliases may be served from canonical root .html assets, while protected aliases remain outside the public bridge and continue through the membership/admin asset gate. run_worker_first uses an exact entry only when no existing wildcard already covers that path; nested namespace files remain unchanged.'
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    console.error('PUBLIC ROUTE ALIAS ROUTING FAILED');
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
  }
  console.log(`Public route namespace aliases verified: ${aliases.length} Worker-first aliases with protected/public boundaries; ${changed.length} owner file(s) patched; no run_worker_first redundancy.`);
  return report;
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  module.exports = run();
}
