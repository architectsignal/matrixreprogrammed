(()=>{'use strict';
const category=window.MATRIX_MONEY_CATEGORY,body=document.querySelector('#money-category-body'),status=document.querySelector('#money-category-status'),search=document.querySelector('#money-category-search'),filter=document.querySelector('#money-category-filter'),reset=document.querySelector('#money-category-reset'),pager=document.querySelector('#money-category-pagination'),est=document.querySelector('#money-category-established'),notEst=document.querySelector('#money-category-not-established');
if(!category||!body)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],page=1;const size=25;
function selected(){const q=search.value.trim().toLowerCase(),f=filter.value;return rows.filter(x=>(!q||[x.name,x.ticker,x.jurisdiction,x.region,x.value,x.evidenceClass,x.status,x.entityType,x.subtype,x.capitalRole,x.sourceTitle].join(' ').toLowerCase().includes(q))&&(!f||x.status===f))}
function detail(x){
  const source=x.sourceTitle||'Cited source',rank=x.sourceRank||x.rank,parts=[
    `<strong>${esc(x.name)}</strong>`,
    x.entityType?`Type: ${esc(x.entityType)}`:'',
    x.subtype&&x.subtype!==x.entityType?`Subtype: ${esc(x.subtype)}`:'',
    x.capitalRole?`Capital role: ${esc(x.capitalRole)}`:'',
    rank?`Source rank: ${esc(rank)}`:'',
    x.metric?`Measurement: ${esc(x.metric)}`:'',
    x.sourceDate?`Source date: ${esc(x.sourceDate)}`:'',
    x.dataQuality?`Data quality: ${esc(x.dataQuality)}`:'',
    `Source: ${esc(source)}`
  ].filter(Boolean).join(' · ');
  est.innerHTML=`${parts}<br><br><strong>What the record establishes:</strong> ${esc(x.established||'The cited source identifies this entity in the stated capital system.')}`;
  notEst.innerHTML=`<strong>What it does not establish:</strong> ${esc(x.notEstablished||'The record does not establish coordinated control or wrongdoing.')}<br><br><strong>Next research:</strong> ${esc(x.nextResearch||'Open the primary record and current entity disclosures.')}`;
}
function render(){
  const list=selected(),pages=Math.max(1,Math.ceil(list.length/size));page=Math.min(page,pages);
  const slice=list.slice((page-1)*size,page*size);
  const ranked=list.filter(x=>Number(x.rank)>0).length,verified=list.filter(x=>/official|published|verified|regulatory|procurement/i.test(`${x.evidenceClass} ${x.status}`)).length;
  status.textContent=`Showing ${list.length} records: ${ranked} source-ranked and ${verified} official/published records. Page ${page} of ${pages}. Values remain undisclosed where the source does not display them.`;
  body.innerHTML=slice.map(x=>`<tr data-id="${esc(x.id)}"><td>${x.rank?'#'+esc(x.rank):'—'}</td><td><strong>${esc(x.name)}</strong>${x.ticker?`<br><small>${esc(x.ticker)}</small>`:''}${x.capitalRole?`<br><small>${esc(x.capitalRole)}</small>`:''}</td><td>${esc(x.value||x.metric||'Not uniformly disclosed')}${x.metric?`<br><small>${esc(x.metric)}</small>`:''}</td><td>${esc(x.jurisdiction||x.region||'Verify')}${x.subtype?`<br><small>${esc(x.subtype)}</small>`:''}</td><td><span class="evidence-chip">${esc(x.evidenceClass||'Public record')}</span><br><small>${esc(x.status||'Coverage')}</small>${x.sourceDate?`<br><small>Checked ${esc(x.sourceDate)}</small>`:''}</td><td><a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a></td></tr>`).join('')||'<tr><td colspan="6">No matching records.</td></tr>';
  body.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{const x=rows.find(r=>r.id===tr.dataset.id);if(x)detail(x)});
  pager.innerHTML=Array.from({length:pages},(_,i)=>`<button type="button" data-page="${i+1}" aria-current="${i+1===page}">${i+1}</button>`).join('');
  pager.querySelectorAll('button').forEach(b=>b.onclick=()=>{page=Number(b.dataset.page);render();scrollTo({top:document.querySelector('#registry').offsetTop-20,behavior:'smooth'})});
}
fetch('../data/money-intelligence-registry.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Registry unavailable');return r.json()}).then(data=>{
  rows=(data.records||[]).filter(x=>x.category===category);
  filter.innerHTML='<option value="">All statuses</option>'+[...new Set(rows.map(x=>x.status).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join('');
  render();if(rows[0])detail(rows[0]);
}).catch(e=>{body.innerHTML=`<tr><td colspan="6">${esc(e.message)}</td></tr>`});
[search,filter].forEach(x=>x.addEventListener('input',()=>{page=1;render()}));
reset.onclick=()=>{search.value='';filter.value='';page=1;render()};
})();