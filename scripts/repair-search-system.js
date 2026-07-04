const fs = require('fs');
const path = require('path');
const root = process.cwd();
const repairs = [];
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function replaceAllText(value, from, to){ return value.split(from).join(to); }
const requiredIndexRoutes = [
  { title:'Control Structure Map', category:'Main Mission', layer:'control-structure', url:'control-structure.html', description:'The intuitive seven-layer map for exposing the control structure.', keywords:['control structure','power map','money','identity','information','elite networks','disclosure'], priority:100, sourceType:'repair-route' },
  { title:'Daily Brain Brief', category:'Living Brain', layer:'information-narrative', url:'daily-brain-brief.html', description:'Daily conclusions, top signals, missing records and watch list.', keywords:['daily brain','brief','conclusions','records needed'], priority:98, sourceType:'repair-route' },
  { title:'Matrix Brain', category:'Living Brain', layer:'information-narrative', url:'matrix-brain.html', description:'Matrix Brain operating dashboard and machine pulse.', keywords:['matrix brain','machine pulse','brain'], priority:96, sourceType:'repair-route' },
  { title:'Outcome Briefings', category:'Finished Intelligence', layer:'information-narrative', url:'outcome-briefings.html', description:'Detailed outcome briefings and likely next moves.', keywords:['outcome','briefings','likely outcome'], priority:94, sourceType:'repair-route' },
  { title:'Evidence Vault', category:'Evidence', layer:'information-narrative', url:'evidence-vault.html', description:'Evidence vault, source hierarchy, claim classes and public-record routes.', keywords:['evidence','source cards','records'], priority:92, sourceType:'repair-route' },
  { title:'Epstein Files', category:'Disclosure / Black Files', layer:'disclosure-black-files', url:'epstein-files.html', description:'Disclosure watch, redactions, court records and source boundaries.', keywords:['epstein','redaction','withheld','court','files'], priority:91, sourceType:'repair-route' },
  { title:'Policy Watch', category:'Identity / Access', layer:'identity-access', url:'policy-watch.html', description:'Policy-system convergence, access systems, data, identity and payment routes.', keywords:['policy','digital identity','wallet','access'], priority:90, sourceType:'repair-route' },
  { title:'Gold Reserve Tracker', category:'Money / Reserves', layer:'money-reserves', url:'gold-reserve-tracker.html', description:'Worldwide reported gold reserves, custody routes, vault route and audit status.', keywords:['gold','custody','vault','audit','reserves'], priority:88, sourceType:'repair-route' },
  { title:'Speculation Review', category:'Speculation Review', layer:'speculation-review', url:'speculation-review.html', description:'Speculation case files, source chains, counter-sources and probability triggers.', keywords:['speculation','claim','source chain','counter source'], priority:82, sourceType:'repair-route' },
  { title:'Books', category:'Books', layer:'reader-route', url:'books.html', description:'Matrix Reprogrammed book universe and reader paths.', keywords:['books','amazon','reader path'], priority:80, sourceType:'repair-route' },
  { title:'Newsletter', category:'Free Brief', layer:'reader-route', url:'newsletter.html', description:'Weekly Signal Drop and free briefing route.', keywords:['newsletter','free brief','signal drop'], priority:77, sourceType:'repair-route' },
  { title:'Daily Brain Brief JSON', category:'Machine Data', layer:'information-narrative', url:'data/daily-brain-brief.json', description:'Machine-readable Daily Brain Brief data.', keywords:['json','brain','conclusions'], priority:70, sourceType:'repair-route' },
  { title:'Control Structure Core JSON', category:'Machine Data', layer:'control-structure', url:'data/control-structure-core.json', description:'Machine-readable control structure mission data.', keywords:['json','control structure','mission'], priority:70, sourceType:'repair-route' }
];
if (exists('search-index.json')) {
  let index;
  try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  if (!Array.isArray(index)) index = [];
  const byUrl = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));
  for (const route of requiredIndexRoutes) {
    if (!byUrl.has(route.url)) { byUrl.set(route.url, route); repairs.push(`search-index-route:${route.url}`); }
  }
  const fixed = [...byUrl.values()].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.title||'').localeCompare(String(b.title||'')));
  write('search-index.json', JSON.stringify(fixed, null, 2));
} else {
  write('search-index.json', JSON.stringify(requiredIndexRoutes, null, 2));
  repairs.push('search-index-created');
}
const authoritySection = '<section id="phase-twelve-authority-engine" class="section wrap"><h2>Authority / Internal Link Engine</h2><p class="lead">Search V2 connects the control map, Daily Brain Brief, evidence lanes, source routes, books, downloads and newsletter so visitors can move from question to record fast.</p><div class="cta-row"><a class="btn" href="authority-hub.html">Authority Hub</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="books.html">Books</a></div></section>';
if (exists('search.html')) {
  let html = read('search.html');
  const before = html;
  if (!html.includes('id="phase-twelve-authority-engine"')) {
    html = html.includes('</main>') ? html.replace('</main>', authoritySection + '</main>') : html + authoritySection;
    repairs.push('phase-twelve-authority-anchor');
  }
  if (!html.includes('SEARCH THE MACHINE.') && !html.includes('ASK MATRIX.')) {
    html = html.replace('<main>', '<main><section class="hero wrap"><h1>SEARCH THE MACHINE.</h1><p class="lead">Brain-aware local search for the control structure.</p></section>');
    repairs.push('search-hero-fallback');
  }
  if (!html.includes('<script src="search.js"></script>') && html.includes('</body>')) {
    html = html.replace('</body>', '<script src="search.js"></script></body>');
    repairs.push('search-js-script');
  }
  if (html !== before) write('search.html', html);
}
if (exists('search.js')) {
  const js = read('search.js');
  if (!js.includes('/search-index.json')) repairs.push('warning-search-js-missing-index-fetch');
  if (!js.includes('SEARCH V2') && !js.includes('ASK MATRIX')) repairs.push('warning-search-js-missing-status-marker');
}
fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs, mode: 'Search V2 preserving repair' }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s).');
