const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.resolve(root, process.env.PAGEFIND_SITE || '_site');
const pagefind = path.join(site, 'pagefind');
const reportFile = path.join(root, 'downloads', 'pagefind-output-test.json');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) console.error(`FAILED: ${name}${detail ? ` — ${detail}` : ''}`);
}
function recursiveFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...recursiveFiles(full));
    else files.push(full);
  }
  return files;
}

const files = recursiveFiles(pagefind);
const relative = files.map(file => path.relative(pagefind, file).replace(/\\/g, '/'));
check('Pagefind directory exists', fs.existsSync(pagefind));
check('Pagefind JavaScript entry exists', relative.includes('pagefind.js'));
check('Pagefind runtime package exists', relative.includes('pagefind.js') && relative.includes('pagefind-entry.json'));
check('Pagefind metadata exists', relative.some(file => /\.pf_meta$/i.test(file)));
check('Pagefind index shards exist', relative.some(file => /\.pf_index$/i.test(file)));
check('Pagefind fragments exist', relative.some(file => /\.pf_fragment$/i.test(file)));
check('Pagefind entry manifest exists', relative.includes('pagefind-entry.json'));
check('Search page includes fallback runtime', fs.existsSync(path.join(site, 'search.html')) && fs.readFileSync(path.join(site, 'search.html'), 'utf8').includes('pagefind-fallback.js'));
check('Pagefind fallback runtime is deployed', fs.existsSync(path.join(site, 'pagefind-fallback.js')));

const failed = checks.filter(item => !item.pass);
const report = {
  ok: failed.length === 0,
  generatedAt: new Date().toISOString(),
  site,
  files: relative.length,
  generatedFiles: relative,
  checks: checks.length,
  failures: failed.length,
  results: checks
};
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`Pagefind output test: ${checks.length - failed.length}/${checks.length} checks passed across ${relative.length} generated files.`);
if (failed.length) process.exit(1);
