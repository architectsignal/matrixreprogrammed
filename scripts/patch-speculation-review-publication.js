const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=new Date().toISOString();
const label='THEORY LAB — SPECULATION / NEEDS REVIEW, NOT FACT';
const warning='These items were routed to review because evidence is weak, phrasing is risky, records are missing, or the theory needs falsification. They are published here only as hypotheses and research prompts. They are not claims of guilt, hidden command, criminal conduct, proven conspiracy, or established fact.';
const conclusions=js('data/speculative-conclusions.json',{conclusions:[]});
const queue=js('data/speculative-conclusion-review-queue.json',{queue:[]});
const reviewItems=(queue.queue||[]).map(item=>({
  ...item,
  publicLabel:label,
  publicStatus:'published_under_speculation_needs_review',
  readerWarning:warning,
  whatThisDoesNotProve:'This does not prove wrongdoing, secret control, criminal conduct, hidden command, or a completed world-system plan.',
  missingRecord:item.missingRecord||'Primary public records, counter-evidence, dated source routes, and falsification criteria are required before this can become an evidence conclusion.',
  nextAction:item.nextAction||'Collect primary sources, add counter-evidence, and keep the item clearly labelled as speculation.'
}));
const publicSpeculation={ok:true,updated:now,boundary:warning,publicLabel:label,total:reviewItems.length,items:reviewItems};
wr('data/speculation-needs-review-public.json',JSON.stringify(publicSpeculation,null,2));
wr('downloads/speculation-needs-review-public.md','# Speculation / Needs Review\n\nUpdated: '+now+'\n\n'+warning+'\n\n'+(reviewItems.map(i=>`## ${i.title}\nTheory Lane: ${i.theoryLane||'Unassigned'}\nReason: ${i.reason||'Needs review'}\nRisk: ${i.riskLevel||'watch'}\nDoes Not Prove: ${i.whatThisDoesNotProve}\nMissing Record: ${i.missingRecord}\nNext Action: ${i.nextAction}\n`).join('\n')||'No review items currently published under speculation.'));
function page(){return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Speculation / Needs Review | Matrix Reprogrammed</title><meta name="description" content="Speculation and review queue items, clearly labelled as hypotheses not facts."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/><style>.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.card{border:1px solid rgba(255,120,80,.55);border-radius:22px;padding:1rem;background:linear-gradient(150deg,rgba(14,8,2,.96),rgba(0,0,0,.95))}.label{color:#d8b56a;font-weight:900}.mini{font-size:.84rem;color:#c8b98c}</style></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="speculative-conclusions.html">Conclusions</a><a href="theory-lab.html">Theory Lab</a><a href="speculative-conclusion-review-queue.html">Review Queue</a><a href="source-intake.html">Submit Source</a><a href="premium-reports.html">Reports</a></nav></header><main class="wrap section"><div class="eyebrow">${esc(label)}</div><h1>SPECULATION / NEEDS REVIEW.</h1><p class="lead">${esc(warning)}</p><section class="section card"><h2>Public Display Rule</h2><p>Items on this page can be interesting to theory-minded readers, but they remain unverified research prompts. They must not be copied into evidence conclusions until source quality, missing-record and falsification requirements are met.</p></section><section class="section"><h2>Review Items Published As Speculation</h2><div class="grid">${reviewItems.length?reviewItems.map(i=>`<article class="card"><div class="label">${esc(label)}</div><h3>${esc(i.title)}</h3><p><strong>Theory Lane:</strong> ${esc(i.theoryLane||'Unassigned')}</p><p><strong>Why it is in review:</strong> ${esc(i.reason||'Needs review')}</p><p><strong>Risk:</strong> ${esc(i.riskLevel||'watch')}</p><p><strong>What this does not prove:</strong> ${esc(i.whatThisDoesNotProve)}</p><p><strong>Missing record:</strong> ${esc(i.missingRecord)}</p><p><strong>Next action:</strong> ${esc(i.nextAction)}</p><div class="cta-row small"><a class="btn alt" href="source-intake.html">Submit Source</a><a class="btn alt" href="source-intake.html">Submit Correction</a></div></article>`).join(''):'<article class="card"><h3>No active review items</h3><p>Nothing is currently published under speculation review.</p></article>'}</div></section></main><footer class="footer wrap"><p><strong>${esc(label)}:</strong> ${esc(warning)}</p></footer></div><script src="matrix.js"></script></body></html>`}
wr('speculation-needs-review.html',page());
function addLink(file,needle){if(!ex(file))return;let html=rd(file);if(html.includes('speculation-needs-review.html'))return;const link='<a class="btn alt" href="speculation-needs-review.html">Speculation / Needs Review</a>';if(html.includes(needle))html=html.replace(needle,needle+link);else if(html.includes('</main>'))html=html.replace('</main>',`<section class="section wrap"><h2>Speculation / Needs Review</h2><p>${esc(warning)}</p><div class="cta-row">${link}</div></section></main>`);wr(file,html)}
addLink('speculative-conclusions.html','<div class="cta-row">');
addLink('theory-lab.html','<div class="cta-row">');
addLink('review-dashboard.html','<div class="cta-row">');
addLink('index.html','<div class="cta-row">');
const audit=js('data/speculative-conclusion-audit.json',{});audit.updated=now;audit.reviewItemsPublishedUnderSpeculation=reviewItems.length;audit.publicSpeculationPage='speculation-needs-review.html';audit.publicSpeculationBoundary=warning;wr('data/speculative-conclusion-audit.json',JSON.stringify(audit,null,2));
console.log(`Speculation review publication patched: ${reviewItems.length} item(s) published under speculation tab.`);
