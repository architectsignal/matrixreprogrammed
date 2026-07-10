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

let source = fs.readFileSync(file, 'utf8');
const marker = 'const fallbackIndex=';
const fetchStart = source.lastIndexOf('fetch("/search-index.json"');
const close = source.lastIndexOf('})();');

if (fetchStart < 0 || close < fetchStart) {
  console.error('Search runtime hardening failed: generated fetch block not found');
  process.exit(1);
}

const fallback = [
  { title: 'Control Structure Map', url: 'control-structure.html', category: 'Main Mission', layer: 'control-structure', description: 'Open the seven-layer control map.', keywords: ['control','power','structure'], priority: 100 },
  { title: 'Daily Brain Brief', url: 'daily-brain-brief.html', category: 'Living Brain', layer: 'information-narrative', description: 'Open the latest conclusions and watch list.', keywords: ['daily','brain','brief'], priority: 98 },
  { title: 'Evidence Vault', url: 'evidence-vault.html', category: 'Evidence', layer: 'disclosure-black-files', description: 'Follow source documents and evidence routes.', keywords: ['evidence','records','documents'], priority: 92 },
  { title: 'Books', url: 'books.html', category: 'Books', layer: 'general', description: 'Open the Matrix Reprogrammed book archive.', keywords: ['books','archive'], priority: 80 }
];

const hardened = [
  `const fallbackIndex=${JSON.stringify(fallback)};`,
  'function loadSearchIndex(){',
  "return fetch('/search-index.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(async function(r){",
  "const type=String(r.headers.get('content-type')||'').toLowerCase();",
  'const text=await r.text();',
  "if(!r.ok)throw new Error('HTTP '+r.status);",
  "if(!type.includes('application/json')||/^\\s*</.test(text))throw new Error('HTML returned instead of JSON');",
  'let parsed;try{parsed=JSON.parse(text);}catch(e){throw new Error("Invalid search JSON: "+e.message);}',
  "if(!Array.isArray(parsed))throw new Error('Search index is not an array');",
  'return parsed;',
  '});',
  '}',
  'loadSearchIndex().then(init).catch(function(err){',
  'init(fallbackIndex);',
  'if(count)count.textContent="Search index unavailable — showing verified fallback routes";',
  'if(answer)answer.textContent=["SEARCH V2 STATUS","> Fallback index active","> "+String(err.message||err).slice(0,120),"> Verified mission routes remain available"].join("\\n");',
  '});'
].join('\n');

source = source.slice(0, fetchStart) + hardened + '\n' + source.slice(close);
fs.writeFileSync(file, source);

const required = [marker, "cache:'no-store'", 'HTML returned instead of JSON', 'loadSearchIndex()', 'init(fallbackIndex)'];
const missing = required.filter(value => !source.includes(value));
const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const report = {
  ok: missing.length === 0 && syntax.status === 0,
  generatedAt: new Date().toISOString(),
  required,
  missing,
  syntaxOk: syntax.status === 0,
  syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed')
};
fs.writeFileSync(path.join(reportDir, 'search-runtime-hardening-report.json'), JSON.stringify(report, null, 2));

if (!report.ok) {
  console.error('SEARCH RUNTIME HARDENING FAILED');
  if (missing.length) console.error(`Missing: ${missing.join(', ')}`);
  if (!report.syntaxOk) console.error(report.syntaxError);
  process.exit(1);
}

console.log('Search runtime hardened with a real fallback index and HTML-response guard.');
