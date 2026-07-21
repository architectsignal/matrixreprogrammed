(()=>{
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function latestDate(registry){const dates=[registry.updated,...(registry.sources||[]).map(s=>s.checked),...(registry.records||[]).map(r=>r.sourceDate)].filter(Boolean).map(String).sort();return dates.at(-1)?.slice(0,10)||'Not recorded'}
function jurisdictionCount(records){return new Set(records.map(r=>String(r.jurisdiction||'').replace(/[^A-Za-zÀ-ÿ .'-]/g,'').trim()).filter(Boolean)).size}
function breakdown(records){const verified=records.filter(r=>/verified|official|institutional disclosure|public filing|regulator|contract/i.test(`${r.evidenceClass} ${r.status}`)).length;return{verified,research:Math.max(0,records.length-verified),ranked:records.filter(r=>Number.isFinite(Number(r.rank))&&Number(r.rank)>0).length}}
async function load(){
  const response=await fetch('data/money-intelligence-registry.json',{cache:'no-store'});if(!response.ok)throw new Error('Money registry unavailable');const registry=await response.json();
  const records=registry.records||[],categories=registry.categories||[];
  const stats=$('#money-command-stats');if(stats)stats.innerHTML=[['Tracked records',records.length.toLocaleString()],['Category systems',categories.length],['Jurisdictions named',jurisdictionCount(records)],['Last checked',latestDate(registry)]].map(([label,value])=>`<div class="money-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  const grid=$('#money-command-grid');if(grid)grid.innerHTML=categories.map(c=>{const rows=records.filter(r=>r.category===c.id),b=breakdown(rows),target=c.target||100,coverage=rows.length,pct=Math.min(100,Math.round(coverage/target*100));return`<a class="money-command-card" href="${esc(c.route)}"><span>${coverage}/${target} covered</span><strong>${esc(c.title)}</strong><small>${esc(c.rankingStatus||'Public-record registry')}</small><div class="money-coverage-bar"><i style="width:${pct}%"></i></div><em>${b.ranked} ranked · ${b.verified} verified · ${b.research} research leads</em></a>`}).join('');
  const overlap=$('#money-overlap-preview');if(overlap){
    let graph=null;try{const g=await fetch('data/money-overlap-graph.json',{cache:'no-store'});if(g.ok)graph=await g.json()}catch{}
    const s=graph?.summary||registry.overlapSummary||{};overlap.innerHTML=`<article class="money-card"><div class="money-kicker">Relationship intelligence</div><h2>${Number(s.overlapEntities||0).toLocaleString()} cross-category entities</h2><p>Trace where the same entity appears across multiple capital systems, then inspect every underlying source and evidence boundary.</p><a class="btn" href="money-graph.html">Open overlap map</a></article><article class="money-card"><div class="money-kicker">Coverage truth</div><h2>Covered is not the same as ranked</h2><p>Every card now separates total registry coverage, dated ranked records, verified evidence and research leads. The system no longer implies that a 100-name target is a fully verified ranking.</p><a class="btn alt" href="follow-the-money-methodology.html">Read methodology</a></article>`;
  }
}
load().catch(error=>{const target=$('#money-command-center');if(target)target.insertAdjacentHTML('beforeend',`<p class="money-warning"><strong>Registry status:</strong> ${esc(error.message)}</p>`)});
})();
