const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['.git','node_modules']);
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(fp(name)), { recursive:true }); fs.writeFileSync(fp(name), value); }
function esc(value=''){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function relPrefix(file){
  const rel = path.relative(root, path.dirname(file));
  if (!rel || rel === '.') return '';
  return '../'.repeat(rel.split(path.sep).filter(Boolean).length);
}
function addStylesheet(html, file){
  const prefix = relPrefix(file);
  if (/reader-experience\.css/.test(html)) return html;
  if (html.includes('</head>')) return html.replace('</head>', `<link rel="stylesheet" href="${prefix}reader-experience.css" /></head>`);
  return html;
}
function cleanExisting(html){
  return html
    .replace(/<!-- reader-governor:start -->[\s\S]*?<!-- reader-governor:end -->/g, '')
    .replace(/<!-- page-guide:start -->[\s\S]*?<!-- page-guide:end -->/g, '')
    .replace(/<!-- speculation-source-rules:start -->[\s\S]*?<!-- speculation-source-rules:end -->/g, '')
    .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '');
}
function insertAfterHeaderOrMain(html, block){
  if (html.includes('</header>')) return html.replace('</header>', `</header>${block}`);
  if (html.includes('<main')) return html.replace(/<main[^>]*>/, m => `${m}${block}`);
  return block + html;
}
function insertBeforeMainEnd(html, block){
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  return html + block;
}
function fileType(name){
  if (name === 'index.html') return 'home';
  if (/epstein|speculation|dark|claim|sighting|alive/i.test(name)) return 'sensitive';
  if (/contractor|blackwater|constellis|dyncorp|caci|booz|palantir|leidos|g4s/i.test(name)) return 'contractor';
  if (/billionaire/i.test(name)) return 'billionaire';
  if (/institution|world-economic-forum|world-health|world-bank|imf|nato|united-nations|federal-reserve/i.test(name)) return 'institution';
  if (/evidence|source|vault|record/i.test(name)) return 'evidence';
  if (/daily-command|daily-brain|brief|intel|digest|drop/i.test(name)) return 'brief';
  if (/book|amazon|author/i.test(name)) return 'books';
  if (/forum|board/i.test(name)) return 'forum';
  return 'general';
}
function guideFor(type){
  const guides = {
    home: ['Command surface', 'Start with the strongest current signals, then choose a reader path.', ['Daily Brief','Power Map','Entities','Evidence']],
    sensitive: ['High-sensitivity investigation', 'This page separates source records, allegations, associations, hypotheses and unsupported claims.', ['Evidence Vault','Source Trail','Missing Records','Search']],
    contractor: ['Contractor intelligence', 'This page tracks company lineage, main players, public-money routes, legal records and missing documents.', ['Contracts','People','Records','Watch Next']],
    billionaire: ['Elite-network profile', 'This page tracks control-layer exposure, ecosystems, public records, missing records and influence routes.', ['Ecosystem','Control Score','Records','Missing Gaps']],
    institution: ['Institution profile', 'This page tracks policy bodies, funding routes, partnerships, public-private links and missing records.', ['Mission','Routes','Records','Partners']],
    evidence: ['Evidence route', 'Use this page to check the source path before accepting or sharing a claim.', ['Proven','Alleged','Signal','Unsupported']],
    brief: ['Reader brief', 'This page turns machine outputs into plain-English updates and watch triggers.', ['What changed','Why it matters','Evidence','Watch next']],
    books: ['Book and media route', 'This page connects investigations to books, dossiers, free downloads and reader paths.', ['Books','Dossiers','Downloads','Amazon']],
    forum: ['Signal board', 'This page collects reader signals and separates public discussion from verified evidence.', ['Main board','Speculation','Evidence','Rules']],
    general: ['Site route', 'This page is part of the control-structure map. Use the links below to go deeper.', ['Read','Investigate','Source','Search']]
  };
  return guides[type] || guides.general;
}
function governorStrip(file){
  const prefix = relPrefix(file);
  return `<!-- reader-governor:start --><section class="reader-governor-strip"><div><strong>Matrix Reprogrammed</strong><span>Map the control structure through records, people, institutions, money routes and missing files.</span></div><nav><a href="${prefix}daily-command-brief.html">Daily Brief</a><a href="${prefix}control-structure.html">Power Map</a><a href="${prefix}entities.html">Entities</a><a href="${prefix}investigations.html">Investigations</a><a href="${prefix}evidence-vault.html">Evidence</a><a href="${prefix}search.html">Search</a></nav></section><!-- reader-governor:end -->`;
}
function pageGuide(file, type){
  const prefix = relPrefix(file);
  const [title, text, chips] = guideFor(type);
  return `<!-- page-guide:start --><section class="page-guide wrap"><div><span class="label">You are here</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="page-guide-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div><div class="page-guide-actions"><a class="btn" href="${prefix}daily-command-brief.html">Today</a><a class="btn alt" href="${prefix}evidence-vault.html">Evidence</a><a class="btn alt" href="${prefix}research-tools.html">Research Tools</a></div></section><!-- page-guide:end -->`;
}
function speculationRules(file){
  const prefix = relPrefix(file);
  return `<!-- speculation-source-rules:start --><section class="speculation-source-rules wrap"><div class="eyebrow">Evidence Boundary</div><h2>Source-first claim review</h2><p class="lead">High-sensitivity pages must not turn association, archive mention, travel record, social link, claim, rumour or missing file into a finding. Named people require a source route and evidence grade.</p><div class="spec-grid"><article><strong>Record</strong><span>Court, filing, contract, official archive, primary source.</span></article><article><strong>Allegation</strong><span>Named claim; label clearly and seek counter-source.</span></article><article><strong>Association</strong><span>Co-appearance is not guilt; route to records.</span></article><article><strong>Missing file</strong><span>A watch trigger, not proof.</span></article></div><div class="cta-row"><a class="btn" href="${prefix}evidence-vault.html">Open Evidence Vault</a><a class="btn alt" href="${prefix}protected-claim-source-links.html">Source Link Map</a><a class="btn alt" href="${prefix}daily-missing-records.html">Missing Records</a><a class="btn alt" href="${prefix}search.html">Search Entity</a></div></section><!-- speculation-source-rules:end -->`;
}
function cinematicCommand(file){
  if (path.basename(file) !== 'index.html') return '';
  return `<!-- cinematic-command:start --><section class="cinematic-command wrap"><div class="cinematic-frame"><span class="eyebrow">Live Command Surface</span><h1>FOLLOW THE FILES. MAP THE STRUCTURE.</h1><p>The site watches clocks, drops, entities, contractors, billionaires, institutions, sensitive claims, missing records and source trails — then turns them into readable reports.</p><div class="cinematic-actions"><a class="btn" href="daily-command-brief.html">Read Today’s Brief</a><a class="btn alt" href="control-structure.html">Open Power Map</a><a class="btn alt" href="search.html">Search a Name</a></div></div></section><!-- cinematic-command:end -->`;
}
function processHtml(file){
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<html') || !html.includes('</body>')) return false;
  const before = html;
  const type = fileType(path.basename(file));
  html = cleanExisting(html);
  html = addStylesheet(html, file);
  html = insertAfterHeaderOrMain(html, governorStrip(file));
  if (type === 'home') {
    html = insertAfterHeaderOrMain(html, cinematicCommand(file));
  }
  if (!/class="page-guide/.test(html) && type !== 'home') {
    html = insertAfterHeaderOrMain(html, pageGuide(file, type));
  }
  if (type === 'sensitive') {
    html = insertBeforeMainEnd(html, speculationRules(file));
  }
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}
function walk(dir, list=[]){
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, list);
    else if (entry.isFile() && entry.name.endsWith('.html') && !full.includes(`${path.sep}_site${path.sep}`)) list.push(full);
  }
  return list;
}
const css = `
.reader-governor-strip{position:relative;z-index:3;margin:0 auto;padding:.75rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.12);background:linear-gradient(90deg,rgba(15,0,0,.92),rgba(0,0,0,.82));display:flex;gap:1rem;justify-content:space-between;align-items:center;flex-wrap:wrap;box-shadow:0 0 40px rgba(255,0,0,.08)}
.reader-governor-strip strong{letter-spacing:.12em;text-transform:uppercase;color:#fff}.reader-governor-strip span{margin-left:.65rem;color:#cfcfcf}.reader-governor-strip nav{display:flex;gap:.55rem;flex-wrap:wrap}.reader-governor-strip a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.16);padding:.45rem .7rem;border-radius:999px;background:rgba(255,255,255,.04)}
.cinematic-command{padding:2rem 1rem 0}.cinematic-frame{border:1px solid rgba(255,255,255,.18);border-radius:24px;padding:2rem;background:radial-gradient(circle at 20% 10%,rgba(180,0,0,.35),transparent 36%),linear-gradient(135deg,rgba(0,0,0,.94),rgba(18,0,0,.9));box-shadow:0 0 70px rgba(180,0,0,.18),inset 0 0 90px rgba(255,255,255,.03)}.cinematic-frame h1{font-size:clamp(2rem,5vw,5rem);line-height:.95;margin:.25rem 0}.cinematic-frame p{max-width:900px;font-size:1.08rem;color:#ddd}.cinematic-actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}
.page-guide{margin:1rem auto 1.5rem;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:1rem;background:linear-gradient(135deg,rgba(20,20,20,.9),rgba(8,0,0,.72));display:grid;grid-template-columns:1.3fr auto auto;gap:1rem;align-items:center}.page-guide h2{margin:.1rem 0}.page-guide p{margin:.15rem 0;color:#d0d0d0}.page-guide-chips{display:flex;gap:.4rem;flex-wrap:wrap}.page-guide-chips span{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:.35rem .6rem;color:#ddd;background:rgba(255,255,255,.04)}.page-guide-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}
.speculation-source-rules{margin:2rem auto;border:1px solid rgba(255,0,0,.28);border-radius:22px;padding:1.4rem;background:linear-gradient(135deg,rgba(55,0,0,.45),rgba(0,0,0,.9));box-shadow:0 0 40px rgba(255,0,0,.12)}.spec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin:1rem 0}.spec-grid article{border:1px solid rgba(255,255,255,.12);padding:.85rem;border-radius:14px;background:rgba(255,255,255,.04)}.spec-grid strong{display:block;color:#fff}.spec-grid span{display:block;color:#ccc;margin-top:.25rem}
@media(max-width:850px){.page-guide{grid-template-columns:1fr}.page-guide-actions{justify-content:flex-start}.reader-governor-strip{align-items:flex-start}.reader-governor-strip span{display:block;margin:.25rem 0 0}}
`;
write('reader-experience.css', css);
const files = walk(root);
let touched = 0;
for (const file of files) if (processHtml(file)) touched++;
const report = { ok:true, generatedAt:new Date().toISOString(), filesScanned:files.length, filesTouched:touched, outputs:['reader-experience.css'], mission:'Preserve depth while making the site easier to read, investigate and verify.' };
write('downloads/reader-experience-governor-report.json', JSON.stringify(report, null, 2));
write('downloads/reader-experience-governor-report.md', `# Reader Experience Governor\n\nGenerated: ${report.generatedAt}\n\nFiles scanned: ${report.filesScanned}\n\nFiles touched: ${report.filesTouched}\n\nMission: preserve depth while making the site easier to read, investigate and verify.\n`);
console.log(`Reader Experience Governor complete: ${touched}/${files.length} HTML files touched.`);
