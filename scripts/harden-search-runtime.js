const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const file = path.join(root, 'search.js');
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

if (!fs.existsSync(file)) {
  console.error('Search runtime hardening failed: search.js missing');
  process.exit(1);
}

function runInstaller(label, relativePath) {
  const script = path.join(root, relativePath);
  if (!fs.existsSync(script)) {
    console.error(`Search runtime hardening failed: ${relativePath} missing`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`${label} complete.`);
}

runInstaller('Search quality installation', 'scripts/install-search-quality-engine.js');
runInstaller('Source evidence search extension', 'scripts/extend-search-with-source-evidence.js');
runInstaller('Local hybrid semantic retrieval installation', 'scripts/install-search-hybrid-retrieval.js');

const source = fs.readFileSync(file, 'utf8');
const required = [
  'MatrixHybridSearch',
  'search-semantic-index.json',
  "cache:'no-store'",
  'HTML returned instead of JSON',
  'fallbackIndex',
  'No reliable match found',
  'relevance is not proof'
];
const missing = required.filter(value => !source.includes(value));
const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const report = {
  ok: missing.length === 0 && syntax.status === 0,
  generatedAt: new Date().toISOString(),
  engine: 'matrix-hybrid-search-v1',
  required,
  missing,
  syntaxOk: syntax.status === 0,
  syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed'),
  providerBoundary: 'Exact, entity, BM25 and compact semantic retrieval all run locally. No managed AI provider, credential or paid fallback is installed.'
};
fs.writeFileSync(path.join(reportDir, 'search-runtime-hardening-report.json'), JSON.stringify(report, null, 2) + '\n');

if (!report.ok) {
  console.error('SEARCH RUNTIME HARDENING FAILED');
  if (missing.length) console.error(`Missing: ${missing.join(', ')}`);
  if (!report.syntaxOk) console.error(report.syntaxError);
  process.exit(1);
}

console.log('Search runtime hardened with source evidence, exact/entity/BM25 retrieval, compact local semantic vectors, domain reranking and confidence gating. No managed AI provider is required.');
