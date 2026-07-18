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
const interactiveTypes = new Set(['button', 'input', 'select', 'textarea', 'form', 'details']);
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

function classifyReference(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'empty';
  if (/^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw)) return 'external-or-special';
  if (raw.startsWith('#')) return 'fragment';
  if (raw.startsWith('/api/')) return 'api';
  return 'local';
}

function resolveLocal(fromFile, reference) {
  const clean = stripQueryHash(reference).replace(/^\//, '');
  if (!clean) return null;
  const base = reference.startsWith('/') ? root : path.dirname(fromFile);
  const direct = path.resolve(base, clean);
  const candidates = [direct];
  if (!path.extname(direct)) {
    candidates.push(`${direct}.html`);
    candidates.push(path.join(direct, 'index.html'));
  }
  return {
    reference,
    candidates: candidates.map(relative),
    exists: candidates.some(candidate => fs.existsSync(candidate))
  };
}

function pageRoute(file) {
  const rel = relative(file);
  if (rel === 'index.html') return '/';
  return `/${rel}`;
}

function parseHtml(file) {
  const html = read(file);
  const scripts = unique(allMatches(html, /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const styles = unique(allMatches(html, /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)
    .concat(allMatches(html, /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*>/gi)));
  const links = unique(allMatches(html, /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const images = unique(allMatches(html, /<(?:img|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const forms = [...html.matchAll(/<form\b([^>]*)>/gi)].map(match => ({
    action: (match[1].match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || '',
    method: ((match[1].match(/\bmethod\s*=\s*["']([^"']*)["']/i) || [])[1] || 'GET').toUpperCase()
  }));
  const controls = [];
  for (const tag of interactiveTypes) {
    const regex = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    for (const match of html.matchAll(regex)) {
      const attrs = match[1] || '';
      controls.push({
        tag,
        id: (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '',
        type: (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '',
        disabled: /\bdisabled\b/i.test(attrs),
        name: (attrs.match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1] || ''
      });
    }
  }
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const inlineCode = inlineScripts.join('\n');
  const fetches = unique(allMatches(inlineCode, /\bfetch\s*\(\s*["'`]([^"'`]+)["'`]/g));
  const eventBindingIds = unique(
    allMatches(inlineCode, /getElementById\s*\(\s*["']([^"']+)["']\s*\)/g)
      .concat(allMatches(inlineCode, /querySelector\s*\(\s*["']#([^"']+)["']\s*\)/g))
  );
  const placeholders = unique(html.split(/\r?\n/)
    .filter(line => placeholderPatterns.some(pattern => pattern.test(line)))
    .map(line => line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)));
  const localReferences = [...scripts, ...styles, ...links, ...images]
    .filter(value => classifyReference(value) === 'local')
    .map(value => resolveLocal(file, value))
    .filter(Boolean);
  const missingReferences = localReferences.filter(item => !item.exists);
  const visibleControls = controls.filter(control => !control.disabled);
  const unboundControlIds = visibleControls
    .filter(control => control.id && !eventBindingIds.includes(control.id) && !forms.some(form => form.action))
    .map(control => control.id);
  const hasFailureHandling = /\.catch\s*\(|try\s*\{|addEventListener\s*\(\s*["']error|unhandledrejection/i.test(inlineCode);
  const hasDynamicDependency = fetches.length > 0 || scripts.some(src => classifyReference(src) === 'external-or-special');
  const critical = criticalRoutePatterns.some(pattern => pattern.test(relative(file)) || pattern.test(html.slice(0, 2500)));

  return {
    file: relative(file),
    route: pageRoute(file),
    title: (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '',
    scripts,
    styles,
    links,
    images,
    forms,
    controls,
    fetches,
    placeholders,
    missingReferences,
    unboundControlIds: unique(unboundControlIds),
    inlineScriptCount: inlineScripts.length,
    hasFailureHandling,
    hasDynamicDependency,
    critical,
    risks: unique([
      missingReferences.length ? 'missing-local-reference' : '',
      placeholders.length && hasDynamicDependency ? 'dynamic-loading-state' : '',
      placeholders.length && hasDynamicDependency && !hasFailureHandling ? 'loading-state-without-visible-failure-path' : '',
      unboundControlIds.length ? 'possibly-unbound-controls' : '',
      /\[object Object\]/.test(html) ? 'object-placeholder-published' : '',
      /<script\b[^>]*src=["'][^"']+\.js["'][^>]*>/i.test(html) ? 'unversioned-javascript-reference' : ''
    ])
  };
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
  const catches = (code.match(/\.catch\s*\(/g) || []).length + (code.match(/\bcatch\s*\(/g) || []).length;
  return {
    file: relative(file),
    fetches,
    imports,
    apiRoutes,
    dataRoutes,
    externalDependencies,
    placeholders,
    catches,
    risks: unique([
      externalDependencies.length ? 'external-runtime-dependency' : '',
      fetches.length && catches === 0 ? 'fetch-without-catch' : '',
      /\[object Object\]/.test(code) ? 'object-placeholder-risk' : ''
    ])
  };
}

function parseWorkerRoutes(files) {
  const workerFiles = files.filter(file => /(?:^|\/)src\/worker[^/]*\.js$/i.test(relative(file)));
  const routes = [];
  for (const file of workerFiles) {
    const code = read(file);
    for (const match of code.matchAll(/["'`]((?:\/api\/|\/forum|\/submit|\/report|\/downloads\/)[^"'`\s]*)["'`]/g)) {
      routes.push({ route: match[1], owner: relative(file) });
    }
  }
  return unique(routes.map(item => `${item.route}\t${item.owner}`)).map(value => {
    const [route, owner] = value.split('\t');
    return { route, owner };
  });
}

const files = walk(root);
const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
const jsFiles = files.filter(file => path.extname(file).toLowerCase() === '.js');
const pages = htmlFiles.map(parseHtml);
const scripts = jsFiles.map(parseJavaScript);
const workerRoutes = parseWorkerRoutes(jsFiles);

const missingReferences = pages.flatMap(page => page.missingReferences.map(item => ({ page: page.file, ...item })));
const dynamicLoadingPages = pages.filter(page => page.risks.includes('dynamic-loading-state'));
const criticalRiskPages = pages.filter(page => page.critical && page.risks.length);
const possiblyDeadControls = pages.filter(page => page.unboundControlIds.length);
const externalRuntimeScripts = scripts.filter(script => script.externalDependencies.length);
const apiConsumers = scripts.filter(script => script.apiRoutes.length);

const summary = {
  scannedFiles: files.length,
  htmlPages: pages.length,
  javascriptFiles: scripts.length,
  workerRoutes: workerRoutes.length,
  missingLocalReferences: missingReferences.length,
  dynamicLoadingPages: dynamicLoadingPages.length,
  criticalRiskPages: criticalRiskPages.length,
  pagesWithPossiblyDeadControls: possiblyDeadControls.length,
  scriptsWithExternalRuntimeDependencies: externalRuntimeScripts.length,
  scriptsUsingApiRoutes: apiConsumers.length
};

const report = {
  ok: missingReferences.length === 0 && criticalRiskPages.length === 0,
  generatedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || '',
  commit: process.env.GITHUB_SHA || '',
  purpose: 'Authoritative recovery inventory of visible routes, controls, scripts, data dependencies, loading states and Worker/API ownership.',
  summary,
  pages,
  scripts,
  workerRoutes,
  priorityFindings: {
    missingReferences,
    dynamicLoadingPages: dynamicLoadingPages.map(page => ({ file: page.file, route: page.route, placeholders: page.placeholders, scripts: page.scripts, fetches: page.fetches, risks: page.risks })),
    criticalRiskPages: criticalRiskPages.map(page => ({ file: page.file, route: page.route, risks: page.risks, missingReferences: page.missingReferences, unboundControlIds: page.unboundControlIds })),
    possiblyDeadControls: possiblyDeadControls.map(page => ({ file: page.file, route: page.route, controlIds: page.unboundControlIds })),
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
  '',
  '## Summary',
  '',
  ...Object.entries(summary).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Critical risk pages',
  '',
  ...(criticalRiskPages.length ? criticalRiskPages.slice(0, 300).map(page => `- \`${page.file}\` — ${page.risks.join(', ')}`) : ['- None detected']),
  '',
  '## Dynamic loading pages',
  '',
  ...(dynamicLoadingPages.length ? dynamicLoadingPages.slice(0, 300).map(page => `- \`${page.file}\` — ${page.placeholders.slice(0, 3).join(' | ')}`) : ['- None detected']),
  '',
  '## Missing local references',
  '',
  ...(missingReferences.length ? missingReferences.slice(0, 500).map(item => `- \`${item.page}\` → \`${item.reference}\``) : ['- None detected']),
  '',
  '## Possibly dead control IDs',
  '',
  ...(possiblyDeadControls.length ? possiblyDeadControls.slice(0, 300).map(page => `- \`${page.file}\` — ${page.unboundControlIds.join(', ')}`) : ['- None detected']),
  '',
  '## External runtime dependencies',
  '',
  ...(externalRuntimeScripts.length ? externalRuntimeScripts.map(script => `- \`${script.file}\` — ${script.externalDependencies.join(', ')}`) : ['- None detected']),
  '',
  'This inventory is a discovery report. Browser execution tests remain mandatory before any feature is declared working.'
].join('\n');
fs.writeFileSync(markdownPath, `${md}\n`);

console.log(`Recovery functional inventory generated: ${JSON.stringify(summary)}`);
if (process.argv.includes('--fail-on-critical') && !report.ok) process.exit(1);
