const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputDir = path.join(root, 'downloads');
const jsonPath = path.join(outputDir, 'recovery-functional-inventory.json');
const markdownPath = path.join(outputDir, 'recovery-functional-inventory.md');

const ignoredDirectories = new Set([
  '.git', '.github', 'node_modules', '_site', 'evidence-archive',
  'source-snapshots', 'browsertrix-output', 'downloads', 'tools'
]);
const publicExtensions = new Set([
  '.html', '.js', '.css', '.json', '.csv', '.xml', '.txt', '.md', '.pdf',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.wasm', '.mp4', '.webm'
]);
const placeholderPatterns = [
  /loading(?:\s+the)?\b/i,
  /please wait/i,
  /initiali[sz]ing/i,
  /fetching\b/i,
  /preparing\b/i,
  /connecting\b/i,
  /\[object Object\]/i
];
const criticalRoutePatterns = [
  /search/i, /dossier/i, /entity/i, /evidence/i, /data-lab/i, /network/i,
  /member/i, /login/i, /membership/i, /billing/i, /paypal/i, /forum/i,
  /live-intel/i, /brief/i, /report/i, /research/i, /market/i
];

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}
function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (publicExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}
function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function allMatches(text, regex, group = 1) {
  return [...String(text).matchAll(regex)].map(match => match[group]).filter(Boolean);
}
function stripQueryHash(value) {
  return String(value || '').split('#')[0].split('?')[0];
}
function pageRoute(file) {
  const rel = relative(file);
  return rel === 'index.html' ? '/' : `/${rel}`;
}
function resolveCandidates(fromFile, reference) {
  const raw = stripQueryHash(reference);
  const clean = raw.replace(/^\//, '');
  if (!clean) return [];
  const base = raw.startsWith('/') ? root : path.dirname(fromFile);
  const direct = path.resolve(base, clean);
  const candidates = [direct];
  if (!path.extname(direct)) {
    candidates.push(`${direct}.html`);
    candidates.push(path.join(direct, 'index.html'));
  }
  return candidates;
}
function resolvedLocalFile(fromFile, reference) {
  return resolveCandidates(fromFile, reference).find(candidate => fs.existsSync(candidate)) || null;
}
function localReferenceStatus(fromFile, reference) {
  const candidates = resolveCandidates(fromFile, reference);
  return {
    reference,
    candidates: candidates.map(relative),
    exists: candidates.some(candidate => fs.existsSync(candidate))
  };
}
function scriptBindingIds(code) {
  return unique(
    allMatches(code, /getElementById\s*\(\s*["']([^"']+)["']\s*\)/g)
      .concat(allMatches(code, /querySelector(?:All)?\s*\(\s*["']#([^"'\s>+~.[\]:]+)[^"']*["']\s*\)/g))
      .concat(allMatches(code, /(?:closest|matches)\s*\(\s*["']#([^"'\s>+~.[\]:]+)[^"']*["']\s*\)/g))
  );
}
function hasVisibleFailurePath(code) {
  return /\.catch\s*\(|\bcatch\s*\(|try\s*\{|unhandledrejection|addEventListener\s*\(\s*["']error|setStatus\s*\([^)]*(?:error|failed|unavailable)|textContent\s*=\s*[`"'][^`"']*(?:error|failed|unavailable)/i.test(code);
}
function parseJavaScript(file) {
  const code = read(file);
  const fetches = unique(allMatches(code, /\bfetch\s*\(\s*["'`]([^"'`]+)["'`]/g));
  const imports = unique(allMatches(code, /\bimport(?:\s+[\s\S]*?\s+from\s+|\s*\(\s*)["'`]([^"'`]+)["'`]/g));
  const apiRoutes = unique(fetches.filter(value => value.startsWith('/api/')));
  const dataRoutes = unique(fetches.filter(value => /(?:^|\/)data\/|\.json(?:[?#]|$)|\.csv(?:[?#]|$)/i.test(value)));
  const externalDependencies = unique(imports.filter(value => /^(?:https?:|\/\/)/i.test(value)));
  const placeholders = unique(code.split(/\r?\n/)
    .filter(line => placeholderPatterns.some(pattern => pattern.test(line)))
    .map(line => line.trim().slice(0, 220)));
  return {
    file: relative(file),
    absoluteFile: file,
    code,
    fetches,
    imports,
    apiRoutes,
    dataRoutes,
    externalDependencies,
    bindingIds: scriptBindingIds(code),
    hasFailureHandling: hasVisibleFailurePath(code),
    placeholders,
    risks: unique([
      externalDependencies.length ? 'external-runtime-dependency' : '',
      fetches.length && !hasVisibleFailurePath(code) ? 'fetch-without-visible-failure-path' : '',
      /\[object Object\]/.test(code) ? 'object-placeholder-risk' : ''
    ])
  };
}
function parseWorkerRoutes(jsRecords) {
  const routes = [];
  for (const script of jsRecords.filter(item => /(?:^|\/)src\/worker[^/]*\.js$/i.test(item.file))) {
    for (const match of script.code.matchAll(/["'`]((?:\/api\/|\/forum|\/submit|\/report|\/downloads\/)[^"'`\s]*)["'`]/g)) {
      routes.push({ route: stripQueryHash(match[1]).replace(/\/+$/, '') || '/', owner: script.file });
    }
  }
  const seen = new Set();
  return routes.filter(item => {
    const key = `${item.route}\t${item.owner}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function classifyReference(value, workerRouteSet) {
  const raw = String(value || '').trim();
  if (!raw) return 'empty';
  if (/^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw)) return 'external-or-special';
  if (raw.startsWith('#')) return 'fragment';
  const route = stripQueryHash(raw).replace(/\/+$/, '') || '/';
  if (raw.startsWith('/api/') || workerRouteSet.has(route)) return 'runtime-route';
  return 'local';
}
function referencedScriptRecords(htmlFile, scriptSources, jsByFile, workerRouteSet) {
  const records = [];
  for (const source of scriptSources) {
    if (classifyReference(source, workerRouteSet) !== 'local') continue;
    const resolved = resolvedLocalFile(htmlFile, source);
    if (!resolved) continue;
    const record = jsByFile.get(relative(resolved));
    if (record) records.push(record);
  }
  return records;
}
function parseControls(html) {
  const controls = [];
  for (const tag of ['button', 'form', 'input', 'select', 'textarea']) {
    const regex = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    for (const match of html.matchAll(regex)) {
      const attrs = match[1] || '';
      controls.push({
        tag,
        id: (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '',
        type: ((attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '').toLowerCase(),
        action: (attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || '',
        disabled: /\bdisabled\b/i.test(attrs),
        inlineHandler: /\bon(?:click|submit|change|input)\s*=/i.test(attrs),
        dataAction: /\bdata-(?:action|command|tool|submit|dataset|mode)\s*=/i.test(attrs)
      });
    }
  }
  return controls;
}
function isActionableControl(control) {
  if (control.disabled) return false;
  if (control.tag === 'button') return control.type !== 'submit' || Boolean(control.id);
  if (control.tag === 'form') return true;
  return false;
}
function parseHtml(file, jsByFile, workerRouteSet) {
  const html = read(file);
  const scripts = unique(allMatches(html, /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const styles = unique(allMatches(html, /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)
    .concat(allMatches(html, /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*>/gi)));
  const links = unique(allMatches(html, /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const images = unique(allMatches(html, /<(?:img|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const localScriptRecords = referencedScriptRecords(file, scripts, jsByFile, workerRouteSet);
  const combinedCode = `${inlineScripts.join('\n')}\n${localScriptRecords.map(item => item.code).join('\n')}`;
  const fetches = unique(allMatches(combinedCode, /\bfetch\s*\(\s*["'`]([^"'`]+)["'`]/g));
  const bindingIds = scriptBindingIds(combinedCode);
  const controls = parseControls(html);
  const unboundControlIds = unique(controls
    .filter(isActionableControl)
    .filter(control => control.id)
    .filter(control => !control.action && !control.inlineHandler && !control.dataAction)
    .filter(control => !bindingIds.includes(control.id))
    .map(control => control.id));
  const placeholders = unique(html.split(/\r?\n/)
    .filter(line => placeholderPatterns.some(pattern => pattern.test(line)))
    .map(line => line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)));
  const allReferences = [...scripts, ...styles, ...links, ...images];
  const missingReferences = allReferences
    .filter(value => classifyReference(value, workerRouteSet) === 'local')
    .map(value => localReferenceStatus(file, value))
    .filter(item => !item.exists);
  const dataDependencies = fetches
    .filter(value => classifyReference(value, workerRouteSet) === 'local')
    .map(value => localReferenceStatus(file, value));
  const missingDataDependencies = dataDependencies.filter(item => !item.exists);
  const dynamic = fetches.length > 0 || scripts.some(src => classifyReference(src, workerRouteSet) === 'external-or-special');
  const failureHandling = hasVisibleFailurePath(combinedCode);
  const unversionedScripts = scripts.filter(src => classifyReference(src, workerRouteSet) === 'local' && /\.js(?:$|[?#])/.test(src) && !/[?&](?:v|ver|version|hash)=/i.test(src));
  const functionalRisks = unique([
    missingReferences.length ? 'missing-local-reference' : '',
    missingDataDependencies.length ? 'missing-data-dependency' : '',
    placeholders.length && dynamic ? 'dynamic-loading-state' : '',
    placeholders.length && dynamic && !failureHandling ? 'loading-state-without-visible-failure-path' : '',
    unboundControlIds.length ? 'possibly-unbound-controls' : '',
    /\[object Object\]/.test(html) ? 'object-placeholder-published' : ''
  ]);
  const platformRisks = unique([
    unversionedScripts.length ? 'unversioned-javascript-reference' : ''
  ]);
  const critical = criticalRoutePatterns.some(pattern => pattern.test(relative(file)) || pattern.test(html.slice(0, 3000)));
  return {
    file: relative(file),
    route: pageRoute(file),
    title: (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '',
    scripts,
    styles,
    links,
    images,
    controls,
    fetches,
    dataDependencies,
    placeholders,
    missingReferences,
    missingDataDependencies,
    unboundControlIds,
    unversionedScripts,
    inlineScriptCount: inlineScripts.length,
    localScriptFiles: localScriptRecords.map(item => item.file),
    hasFailureHandling: failureHandling,
    hasDynamicDependency: dynamic,
    critical,
    functionalRisks,
    platformRisks,
    risks: unique([...functionalRisks, ...platformRisks])
  };
}

const files = walk(root);
const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
const jsFiles = files.filter(file => path.extname(file).toLowerCase() === '.js');
const scripts = jsFiles.map(parseJavaScript);
const jsByFile = new Map(scripts.map(script => [script.file, script]));
const workerRoutes = parseWorkerRoutes(scripts);
const workerRouteSet = new Set(workerRoutes.map(item => item.route));
const pages = htmlFiles.map(file => parseHtml(file, jsByFile, workerRouteSet));

const missingReferences = pages.flatMap(page => page.missingReferences.map(item => ({ page: page.file, ...item })));
const missingDataDependencies = pages.flatMap(page => page.missingDataDependencies.map(item => ({ page: page.file, ...item })));
const dynamicLoadingPages = pages.filter(page => page.functionalRisks.includes('dynamic-loading-state'));
const loadingWithoutFailurePath = pages.filter(page => page.functionalRisks.includes('loading-state-without-visible-failure-path'));
const criticalRiskPages = pages.filter(page => page.critical && page.functionalRisks.length);
const possiblyDeadControls = pages.filter(page => page.unboundControlIds.length);
const objectPlaceholderPages = pages.filter(page => page.functionalRisks.includes('object-placeholder-published'));
const unversionedAssetPages = pages.filter(page => page.platformRisks.includes('unversioned-javascript-reference'));
const externalRuntimeScripts = scripts.filter(script => script.externalDependencies.length);
const apiConsumers = scripts.filter(script => script.apiRoutes.length);

const summary = {
  scannedFiles: files.length,
  htmlPages: pages.length,
  javascriptFiles: scripts.length,
  workerRoutes: workerRoutes.length,
  missingLocalReferences: missingReferences.length,
  missingDataDependencies: missingDataDependencies.length,
  dynamicLoadingPages: dynamicLoadingPages.length,
  loadingPagesWithoutVisibleFailurePath: loadingWithoutFailurePath.length,
  criticalFunctionalRiskPages: criticalRiskPages.length,
  pagesWithPossiblyDeadControls: possiblyDeadControls.length,
  pagesPublishingObjectPlaceholders: objectPlaceholderPages.length,
  pagesUsingUnversionedJavaScript: unversionedAssetPages.length,
  scriptsWithExternalRuntimeDependencies: externalRuntimeScripts.length,
  scriptsUsingApiRoutes: apiConsumers.length
};

const report = {
  ok: missingReferences.length === 0
    && missingDataDependencies.length === 0
    && criticalRiskPages.length === 0
    && objectPlaceholderPages.length === 0,
  generatedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || '',
  commit: process.env.GITHUB_SHA || '',
  version: 2,
  purpose: 'Authoritative recovery inventory of visible routes, controls, scripts, data dependencies, loading states and Worker/API ownership.',
  summary,
  platformFindings: {
    unversionedJavaScript: {
      affectedPages: unversionedAssetPages.length,
      boundary: 'This is a platform cache/versioning defect. It is counted once as platform debt rather than treating every affected page as an independent functional failure.'
    }
  },
  pages,
  scripts: scripts.map(({ absoluteFile, code, ...script }) => script),
  workerRoutes,
  priorityFindings: {
    missingReferences,
    missingDataDependencies,
    dynamicLoadingPages: dynamicLoadingPages.map(page => ({
      file: page.file,
      route: page.route,
      placeholders: page.placeholders,
      scripts: page.scripts,
      localScriptFiles: page.localScriptFiles,
      fetches: page.fetches,
      risks: page.functionalRisks
    })),
    loadingWithoutFailurePath: loadingWithoutFailurePath.map(page => ({ file: page.file, route: page.route, fetches: page.fetches })),
    criticalRiskPages: criticalRiskPages.map(page => ({
      file: page.file,
      route: page.route,
      risks: page.functionalRisks,
      missingReferences: page.missingReferences,
      missingDataDependencies: page.missingDataDependencies,
      unboundControlIds: page.unboundControlIds
    })),
    possiblyDeadControls: possiblyDeadControls.map(page => ({ file: page.file, route: page.route, controlIds: page.unboundControlIds })),
    objectPlaceholderPages: objectPlaceholderPages.map(page => ({ file: page.file, route: page.route })),
    externalRuntimeScripts: externalRuntimeScripts.map(script => ({ file: script.file, dependencies: script.externalDependencies, risks: script.risks })),
    apiConsumers: apiConsumers.map(script => ({ file: script.file, apiRoutes: script.apiRoutes }))
  }
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Matrix Reprogrammed Recovery Functional Inventory',
  '',
  `Generated: ${report.generatedAt}`,
  `Commit: ${report.commit || 'local'}`,
  `Scanner version: ${report.version}`,
  '',
  '## Summary',
  '',
  ...Object.entries(summary).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Platform-wide findings',
  '',
  `- Unversioned JavaScript affects ${unversionedAssetPages.length} pages. Repair this once through deterministic asset versioning and safe cache policy.`,
  '',
  '## Critical functional risk pages',
  '',
  ...(criticalRiskPages.length ? criticalRiskPages.slice(0, 300).map(page => `- \`${page.file}\` — ${page.functionalRisks.join(', ')}`) : ['- None detected']),
  '',
  '## Loading states without a visible failure path',
  '',
  ...(loadingWithoutFailurePath.length ? loadingWithoutFailurePath.slice(0, 300).map(page => `- \`${page.file}\` — ${page.fetches.join(', ') || 'external runtime dependency'}`) : ['- None detected']),
  '',
  '## Missing local references',
  '',
  ...(missingReferences.length ? missingReferences.slice(0, 500).map(item => `- \`${item.page}\` → \`${item.reference}\``) : ['- None detected']),
  '',
  '## Missing fetched data dependencies',
  '',
  ...(missingDataDependencies.length ? missingDataDependencies.slice(0, 500).map(item => `- \`${item.page}\` → \`${item.reference}\``) : ['- None detected']),
  '',
  '## Possibly dead actionable controls',
  '',
  ...(possiblyDeadControls.length ? possiblyDeadControls.slice(0, 300).map(page => `- \`${page.file}\` — ${page.unboundControlIds.join(', ')}`) : ['- None detected']),
  '',
  '## External runtime dependencies',
  '',
  ...(externalRuntimeScripts.length ? externalRuntimeScripts.map(script => `- \`${script.file}\` — ${script.externalDependencies.join(', ')}`) : ['- None detected']),
  '',
  'This inventory is a discovery report. Headless browser execution and live user-journey tests remain mandatory before any feature is declared working.'
].join('\n');
fs.writeFileSync(markdownPath, `${md}\n`);

console.log(`Recovery functional inventory v2 generated: ${JSON.stringify(summary)}`);
if (process.argv.includes('--fail-on-critical') && !report.ok) process.exit(1);
