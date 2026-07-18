const fs = require('fs');
const path = require('path');

const root = process.cwd();
const jsonPath = path.join(root, 'downloads', 'recovery-functional-inventory.json');
const markdownPath = path.join(root, 'downloads', 'recovery-functional-inventory.md');
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function read(relative) {
  try { return fs.readFileSync(path.join(root, relative), 'utf8'); } catch { return ''; }
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function stripQueryHash(value) {
  return String(value || '').split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
}
function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/worker[^/]*\.js$/i.test(entry.name)) files.push(full);
  }
  return files;
}
function runtimeRoutes() {
  const routes = new Set((report.workerRoutes || []).map(item => stripQueryHash(item.route)));
  for (const file of walk(path.join(root, 'src'))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(/["'`](\/[A-Za-z0-9_./?=&:${}-]+)["'`]/g)) {
      const route = stripQueryHash(match[1]);
      if (!/\.(?:html|css|js|png|jpe?g|webp|svg|gif|ico|wasm|mp4|webm|pdf|json|csv|xml|md|txt)$/i.test(route)) routes.add(route);
    }
  }
  ['/track-event', '/newsletter-signup', '/intro-voice'].forEach(route => routes.add(route));
  return routes;
}
function controlIsReferenced(page, id) {
  const code = [
    ...((page.localScriptFiles || []).map(read)),
    read(page.file).replace(/^[\s\S]*?<script\b/gi, '<script')
  ].join('\n');
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:["'\`#])${escaped}(?:["'\`\\s.,:)\\]])`).test(code)
    || code.includes(id);
}

const runtime = runtimeRoutes();
const pages = report.pages || [];
for (const page of pages) {
  page.missingDataDependencies = (page.missingDataDependencies || []).filter(item => !runtime.has(stripQueryHash(item.reference)));
  page.unboundControlIds = (page.unboundControlIds || []).filter(id => !controlIsReferenced(page, id));
  const blockers = unique([
    (page.missingReferences || []).length ? 'missing-local-reference' : '',
    page.missingDataDependencies.length ? 'missing-data-dependency' : '',
    page.functionalRisks?.includes('loading-state-without-visible-failure-path') ? 'loading-state-without-visible-failure-path' : '',
    page.unboundControlIds.length ? 'possibly-unbound-controls' : '',
    page.functionalRisks?.includes('object-placeholder-published') ? 'object-placeholder-published' : ''
  ]);
  const nonBlocking = page.functionalRisks?.includes('dynamic-loading-state') ? ['dynamic-loading-state'] : [];
  page.blockingRisks = blockers;
  page.functionalRisks = unique([...nonBlocking, ...blockers]);
  page.risks = unique([...(page.functionalRisks || []), ...(page.platformRisks || [])]);
}

const missingReferences = pages.flatMap(page => (page.missingReferences || []).map(item => ({ page: page.file, ...item })));
const missingDataDependencies = pages.flatMap(page => (page.missingDataDependencies || []).map(item => ({ page: page.file, ...item })));
const dynamicLoadingPages = pages.filter(page => page.functionalRisks.includes('dynamic-loading-state'));
const loadingWithoutFailurePath = pages.filter(page => page.blockingRisks.includes('loading-state-without-visible-failure-path'));
const criticalRiskPages = pages.filter(page => page.critical && page.blockingRisks.length);
const possiblyDeadControls = pages.filter(page => page.unboundControlIds.length);
const objectPlaceholderPages = pages.filter(page => page.blockingRisks.includes('object-placeholder-published'));
const unversionedAssetPages = pages.filter(page => page.platformRisks?.includes('unversioned-javascript-reference'));
const externalRuntimeScripts = (report.scripts || []).filter(script => script.externalDependencies?.length);
const apiConsumers = (report.scripts || []).filter(script => script.apiRoutes?.length);

report.version = 3;
report.refinedAt = new Date().toISOString();
report.runtimeRouteCount = runtime.size;
report.summary = {
  scannedFiles: report.summary.scannedFiles,
  htmlPages: pages.length,
  javascriptFiles: (report.scripts || []).length,
  workerRoutes: runtime.size,
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
report.ok = missingReferences.length === 0
  && missingDataDependencies.length === 0
  && criticalRiskPages.length === 0
  && objectPlaceholderPages.length === 0;
report.priorityFindings = {
  missingReferences,
  missingDataDependencies,
  dynamicLoadingPages: dynamicLoadingPages.map(page => ({ file: page.file, route: page.route, fetches: page.fetches, risks: page.functionalRisks })),
  loadingWithoutFailurePath: loadingWithoutFailurePath.map(page => ({ file: page.file, route: page.route, fetches: page.fetches })),
  criticalRiskPages: criticalRiskPages.map(page => ({
    file: page.file,
    route: page.route,
    risks: page.blockingRisks,
    missingReferences: page.missingReferences,
    missingDataDependencies: page.missingDataDependencies,
    unboundControlIds: page.unboundControlIds
  })),
  possiblyDeadControls: possiblyDeadControls.map(page => ({ file: page.file, route: page.route, controlIds: page.unboundControlIds })),
  objectPlaceholderPages: objectPlaceholderPages.map(page => ({ file: page.file, route: page.route })),
  externalRuntimeScripts: externalRuntimeScripts.map(script => ({ file: script.file, dependencies: script.externalDependencies, risks: script.risks })),
  apiConsumers: apiConsumers.map(script => ({ file: script.file, apiRoutes: script.apiRoutes }))
};

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const md = [
  '# Matrix Reprogrammed Recovery Functional Inventory',
  '',
  `Generated: ${report.generatedAt}`,
  `Refined: ${report.refinedAt}`,
  `Commit: ${report.commit || 'local'}`,
  `Scanner version: ${report.version}`,
  '',
  '## Summary',
  '',
  ...Object.entries(report.summary).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Platform-wide finding',
  '',
  `- Unversioned JavaScript affects ${unversionedAssetPages.length} pages. This is one cache/versioning repair, not ${unversionedAssetPages.length} independent bugs.`,
  '',
  '## Blocking functional risk pages',
  '',
  ...(criticalRiskPages.length ? criticalRiskPages.map(page => `- \`${page.file}\` — ${page.blockingRisks.join(', ')}`) : ['- None detected']),
  '',
  '## Published object placeholders',
  '',
  ...(objectPlaceholderPages.length ? objectPlaceholderPages.map(page => `- \`${page.file}\``) : ['- None detected']),
  '',
  '## Missing fetched data',
  '',
  ...(missingDataDependencies.length ? missingDataDependencies.map(item => `- \`${item.page}\` → \`${item.reference}\``) : ['- None detected']),
  '',
  '## Genuinely unbound actionable controls',
  '',
  ...(possiblyDeadControls.length ? possiblyDeadControls.map(page => `- \`${page.file}\` — ${page.unboundControlIds.join(', ')}`) : ['- None detected']),
  '',
  '## External runtime dependencies',
  '',
  ...(externalRuntimeScripts.length ? externalRuntimeScripts.map(script => `- \`${script.file}\` — ${script.externalDependencies.join(', ')}`) : ['- None detected']),
  '',
  'Dynamic pages with valid failure handling remain candidates for headless-browser execution tests; they are not treated as broken solely because they load data at runtime.'
].join('\n');
fs.writeFileSync(markdownPath, `${md}\n`);
console.log(`Recovery functional inventory v3 refined: ${JSON.stringify(report.summary)}`);
