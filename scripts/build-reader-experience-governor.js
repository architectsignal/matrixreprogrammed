const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules']);
function write(name, value){ fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value); }
function esc(value = ''){ return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function prefix(file){ const rel = path.relative(root, path.dirname(file)); return (!rel || rel === '.') ? '' : '../'.repeat(rel.split(path.sep).filter(Boolean).length); }
function walk(dir, out = []){
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html') && !full.includes(`${path.sep}_site${path.sep}`)) out.push(full);
  }
  return out;
}
function clean(html){
  return html
    .replace(/<!-- reader-governor:start -->[\s\S]*?<!-- reader-governor:end -->/g, '')
    .replace(/<!-- page-guide:start -->[\s\S]*?<!-- page-guide:end -->/g, '')
    .replace(/<!-- source-review:start -->[\s\S]*?<!-- source-review:end -->/g, '')
    .replace(/<!-- speculation-source-rules:start -->[\s\S]*?<!-- speculation-source-rules:end -->/g, '')
    .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '');
}
function addCss(html, file){
  const p = prefix(file);
  if (html.includes('reader-experience.css')) return html;
  return html.includes('</head>') ? html.replace('</head>', `<link rel="stylesheet" href="${p}reader-experience.css" /></head>`) : html;
}
function typeOf(name){
  if (name === 'index.html') return 'home';
  if (/contractor|blackwater|constellis|dyncorp|caci|booz|palantir|leidos|g4s/i.test(name)) return 'Contractor tracker';
  if (/billionaire/i.test(name)) return 'Billionaire tracker';
  if (/institution|world|nato|imf|reserve|commission/i.test(name)) return 'Institution tracker';
  if (/evidence|source|vault|record/i.test(name)) return 'Evidence route';
  if (/brief|intel|digest|drop|daily/i.test(name)) return 'Reader brief';
  if (/forum|board/i.test(name)) return 'Signal board';
  if (/book|amazon|author/i.test(name)) return 'Books and media';
  return 'Site route';
}
function insertTop(html, block){
  if (html.includes('</header>')) return html.replace('</header>', `</header>${block}`);
  if (html.includes('<main')) return html.replace(/<main[^>]*>/, m => `${m}${block}`);
  return block + html;
}
function insertBottom(html, block){ return html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : html + block; }
function strip(file){
  const p = prefix(file);
  return `<!-- reader-governor:start --><section class="reader-governor-strip"><div><strong>Matrix Reprogrammed</strong><span>Reports, records, people, institutions, money routes and missing files.</span></div><nav><a href="${p}daily-command-brief.html">Daily Brief</a><a href="${p}control-structure.html">Power Map</a><a href="${p}entities.html">Entities</a><a href="${p}investigations.html">Investigations</a><a href="${p}evidence-vault.html">Evidence</a><a href="${p}search.html">Search</a></nav></section><!-- reader-governor:end -->`;
}
function guide(file, kind){
  const p = prefix(file);
  return `<!-- page-guide:start --><section class="page-guide wrap"><div><span class="label">You are here</span><h2>${esc(kind)}</h2><p>This page is part of the wider reporting system. Start with the summary, then open the evidence route or research tools for deeper source work.</p></div><div class="page-guide-chips"><span>Summary</span><span>Evidence</span><span>Research</span><span>Search</span></div><div class="page-guide-actions"><a class="btn" href="${p}daily-command-brief.html">Today</a><a class="btn alt" href="${p}evidence-vault.html">Evidence</a><a class="btn alt" href="${p}research-tools.html">Research Tools</a></div></section><!-- page-guide:end -->`;
}
function review(file){
  const p = prefix(file);
  return `<!-- source-review:start --><section class="source-review-box wrap"><div class="eyebrow">Source Review</div><h2>Records before conclusions</h2><p class="lead">Use the evidence route, search and missing-record queue before treating any pattern as settled.</p><div class="cta-row"><a class="btn" href="${p}evidence-vault.html">Evidence Vault</a><a class="btn alt" href="${p}daily-missing-records.html">Missing Records</a><a class="btn alt" href="${p}search.html">Search</a></div></section><!-- source-review:end -->`;
}
function cinematic(){
  return `<!-- cinematic-command:start --><section class="cinematic-command wrap"><div class="cinematic-frame"><span class="eyebrow">Live Command Surface</span><h1>MAP THE STRUCTURE. READ THE SIGNALS.</h1><p>The site watches clocks, drops, entities, contractors, profiles, institutions, records and source trails, then turns them into readable reports.</p><div class="cinematic-actions"><a class="btn" href="daily-command-brief.html">Read Today’s Brief</a><a class="btn alt" href="control-structure.html">Open Power Map</a><a class="btn alt" href="search.html">Search a Name</a></div></div></section><!-- cinematic-command:end -->`;
}
const css = `
.reader-governor-strip{position:relative;z-index:3;padding:.75rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.12);background:linear-gradient(90deg,rgba(15,0,0,.94),rgba(0,0,0,.84));display:flex;gap:1rem;justify-content:space-between;align-items:center;flex-wrap:wrap;box-shadow:0 0 40px rgba(255,0,0,.08)}
.reader-governor-strip strong{letter-spacing:.12em;text-transform:uppercase;color:#fff}.reader-governor-strip span{margin-left:.65rem;color:#cfcfcf}.reader-governor-strip nav{display:flex;gap:.55rem;flex-wrap:wrap}.reader-governor-strip a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.16);padding:.45rem .7rem;border-radius:999px;background:rgba(255,255,255,.04)}
.cinematic-command{padding:2rem 1rem 0}.cinematic-frame{border:1px solid rgba(255,255,255,.18);border-radius:24px;padding:2rem;background:radial-gradient(circle at 20% 10%,rgba(180,0,0,.35),transparent 36%),linear-gradient(135deg,rgba(0,0,0,.94),rgba(18,0,0,.9));box-shadow:0 0 70px rgba(180,0,0,.18),inset 0 0 90px rgba(255,255,255,.03)}.cinematic-frame h1{font-size:clamp(2rem,5vw,5rem);line-height:.95;margin:.25rem 0}.cinematic-frame p{max-width:900px;font-size:1.08rem;color:#ddd}.cinematic-actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}
.page-guide{margin:1rem auto 1.5rem;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:1rem;background:linear-gradient(135deg,rgba(20,20,20,.9),rgba(8,0,0,.72));display:grid;grid-template-columns:1.3fr auto auto;gap:1rem;align-items:center}.page-guide h2{margin:.1rem 0}.page-guide p{margin:.15rem 0;color:#d0d0d0}.page-guide-chips{display:flex;gap:.4rem;flex-wrap:wrap}.page-guide-chips span{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:.35rem .6rem;color:#ddd;background:rgba(255,255,255,.04)}.page-guide-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}.source-review-box{margin:2rem auto;border:1px solid rgba(255,0,0,.24);border-radius:22px;padding:1.4rem;background:linear-gradient(135deg,rgba(55,0,0,.42),rgba(0,0,0,.9))}
@media(max-width:850px){.page-guide{grid-template-columns:1fr}.page-guide-actions{justify-content:flex-start}.reader-governor-strip span{display:block;margin:.25rem 0 0}}
`;
write('reader-experience.css', css);
let touched = 0;
const files = walk(root);
for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<html') || !html.includes('</body>')) continue;
  const before = html;
  const name = path.basename(file);
  const kind = typeOf(name);
  html = addCss(clean(html), file);
  html = insertTop(html, strip(file));
  if (name === 'index.html') html = insertTop(html, cinematic());
  else html = insertTop(html, guide(file, kind));
  if (/epstein|speculation|dark|sighting|alive/i.test(name)) html = insertBottom(html, review(file));
  if (html !== before) { fs.writeFileSync(file, html); touched++; }
}
const report = { ok: true, generatedAt: new Date().toISOString(), filesScanned: files.length, filesTouched: touched, mission: 'Preserve depth while improving the reader path.' };
write('downloads/reader-experience-governor-report.json', JSON.stringify(report, null, 2));
write('downloads/reader-experience-governor-report.md', `# Reader Experience Governor\n\nGenerated: ${report.generatedAt}\n\nFiles scanned: ${report.filesScanned}\n\nFiles touched: ${report.filesTouched}\n\nMission: ${report.mission}\n`);
console.log(`Reader Experience Governor complete: ${touched}/${files.length} HTML files touched.`);
