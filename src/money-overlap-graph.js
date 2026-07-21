(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CORPORATE=/\b(the|plc|incorporated|inc|corp|corporation|company|co|limited|ltd|llc|lp|sa|se|ag|nv|group|holdings?|partners?|management|investment|investments|capital|international|global)\b/g;
const ALIASES=new Map(Object.entries({
  'alphabet google':'alphabet','google public sector':'alphabet','alphabet youtube':'alphabet','google':'alphabet',
  'amazon web services':'amazon','amazon mgm studios':'amazon','aws':'amazon',
  'apple services':'apple','meta platforms':'meta','facebook':'meta',
  'boeing defense space security':'boeing','boeing defense space and security':'boeing',
  'blackstone real estate':'blackstone','brookfield property partners':'brookfield','brookfield asset management':'brookfield','brookfield corporation':'brookfield',
  'tencent media':'tencent','walt disney':'disney','the walt disney company':'disney',
  'government pension fund global norway':'government pension fund global',
  'federal election commission committees':'federal election commission',
  'bill melinda gates foundation network':'bill melinda gates foundation',
  'open society foundations network':'open society foundations',
  'bloomberg philanthropies network':'bloomberg philanthropies',
  'ford foundation network':'ford foundation','rockefeller foundation network':'rockefeller foundation',
  'wellcome trust network':'wellcome trust','chan zuckerberg initiative network':'chan zuckerberg initiative',
  'macarthur foundation network':'macarthur foundation','hewlett foundation network':'william flora hewlett foundation',
  'packard foundation network':'david lucile packard foundation','walton family foundation network':'walton family foundation',
  'moore foundation network':'moore foundation','robert wood johnson foundation network':'robert wood johnson foundation',
  'mastercard foundation network':'mastercard foundation','ikea foundation network':'ikea foundation',
  'novo nordisk foundation network':'novo nordisk foundation','tata trusts network':'tata trusts',
  'azim premji foundation network':'azim premji foundation','carnegie corporation network':'carnegie corporation new york',
  'mellon foundation network':'andrew w mellon foundation','lilly endowment network':'lilly endowment',
  'knight foundation network':'knight foundation','kresge foundation network':'kresge foundation',
  'pew charitable trusts network':'pew charitable trusts','fidelity charitable network':'fidelity charitable donor advised funds',
  'schwab charitable network':'schwab charitable donor advised funds','national philanthropic trust network':'national philanthropic trust'
}));
function cleanName(value=''){
  let s=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  s=s.replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  if(ALIASES.has(s))return ALIASES.get(s);
  const stripped=s.replace(CORPORATE,' ').replace(/\s+/g,' ').trim();
  return ALIASES.get(stripped)||stripped||s;
}
function displayName(rows,key){
  const names=rows.map(r=>r.name).filter(Boolean).sort((a,b)=>a.length-b.length);
  return names[0]||key;
}
function categoryPairs(groups){
  const counts=new Map();
  for(const group of groups){
    const cats=[...new Set(group.records.map(r=>r.category))].sort();
    for(let i=0;i<cats.length;i++)for(let j=i+1;j<cats.length;j++){
      const k=`${cats[i]}|${cats[j]}`;counts.set(k,(counts.get(k)||0)+1);
    }
  }
  return [...counts].map(([key,count])=>{const [from,to]=key.split('|');return{from,to,count}}).sort((a,b)=>b.count-a.count||a.from.localeCompare(b.from));
}
function buildGraph(registry){
  const categories=registry.categories||[];
  const grouped=new Map();
  for(const row of registry.records||[]){
    const key=cleanName(row.name);if(!key)continue;
    if(!grouped.has(key))grouped.set(key,{key,records:[]});
    grouped.get(key).records.push(row);
  }
  const relationNames=new Set();
  for(const rel of registry.relationships||[]){relationNames.add(cleanName(rel.from));relationNames.add(cleanName(rel.to));}
  const groups=[...grouped.values()].map(g=>({...g,name:displayName(g.records,g.key),categories:[...new Set(g.records.map(r=>r.category))]}));
  const overlaps=groups.filter(g=>g.categories.length>1).sort((a,b)=>b.categories.length-a.categories.length||b.records.length-a.records.length||a.name.localeCompare(b.name));
  const retained=groups.filter(g=>g.categories.length>1||relationNames.has(g.key));
  const nodes=categories.map(c=>({id:`category:${c.id}`,kind:'category',label:c.title.replace(/^Top 100 /,''),category:c.id,coverage:c.coverage||0,target:c.target||100,status:c.rankingStatus||''}));
  for(const g of retained)nodes.push({id:`entity:${g.key}`,kind:'entity',label:g.name,key:g.key,categories:g.categories,recordCount:g.records.length,evidence:[...new Set(g.records.map(r=>r.evidenceClass).filter(Boolean))]});
  const nodeIds=new Set(nodes.map(n=>n.id));
  const edges=[];
  for(const g of retained){
    for(const category of g.categories){
      const source=`entity:${g.key}`,target=`category:${category}`;
      if(nodeIds.has(source)&&nodeIds.has(target))edges.push({id:`membership:${g.key}:${category}`,source,target,type:'appears in category',evidenceClass:'Registry overlap',category,sourceUrl:g.records.find(r=>r.category===category)?.sourceUrl||'',notEstablished:'Repeated appearance across categories does not by itself establish common control, coordination or wrongdoing.'});
    }
  }
  for(const rel of registry.relationships||[]){
    const fromKey=cleanName(rel.from),toKey=cleanName(rel.to),source=`entity:${fromKey}`,target=`entity:${toKey}`;
    if(!nodeIds.has(source))nodes.push({id:source,kind:'entity',label:rel.from,key:fromKey,categories:[],recordCount:0,evidence:[rel.evidenceClass].filter(Boolean)}),nodeIds.add(source);
    if(!nodeIds.has(target))nodes.push({id:target,kind:'entity',label:rel.to,key:toKey,categories:[],recordCount:0,evidence:[rel.evidenceClass].filter(Boolean)}),nodeIds.add(target);
    edges.push({id:rel.id||`relationship:${fromKey}:${toKey}:${rel.type}`,source,target,type:rel.type||'related to',evidenceClass:rel.evidenceClass||'Public record',sourceUrl:rel.sourceUrl||'',sourceDate:rel.sourceDate||'',established:rel.established||'',notEstablished:rel.notEstablished||''});
  }
  const pairs=categoryPairs(groups);
  const jurisdictions=new Set((registry.records||[]).map(r=>String(r.jurisdiction||'').replace(/[^A-Za-zÀ-ÿ .'-]/g,'').trim()).filter(Boolean));
  return{
    version:1,generatedAt:new Date().toISOString(),registryUpdated:registry.updated||null,
    methodology:'Nodes are public-record registry entries. Category links show repeated appearance after conservative name normalisation. Existing sourced relationships remain separate from inferred overlap.',
    boundary:'An overlap is a research route, not proof that entities coordinate, control one another or commit wrongdoing.',
    summary:{records:(registry.records||[]).length,categories:categories.length,jurisdictions:jurisdictions.size,overlapEntities:overlaps.length,relationshipEdges:(registry.relationships||[]).length,categoryPairs:pairs.filter(p=>p.count>0).length},
    categories,nodes,edges,overlaps:overlaps.map(g=>({key:g.key,name:g.name,categories:g.categories,recordCount:g.records.length,records:g.records.map(r=>({id:r.id,category:r.category,rank:r.rank,name:r.name,status:r.status,evidenceClass:r.evidenceClass,sourceUrl:r.sourceUrl,sourceDate:r.sourceDate,established:r.established,notEstablished:r.notEstablished}))})),categoryPairs:pairs
  };
}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0)/4294967295}
let graph=null;
function filteredOverlaps(){
  const term=$('#overlap-search').value.trim().toLowerCase(),category=$('#overlap-category').value,min=Number($('#overlap-min').value||2);
  return graph.overlaps.filter(o=>o.categories.length>=min&&(!category||o.categories.includes(category))&&(!term||[o.name,...o.categories].join(' ').toLowerCase().includes(term)));
}
function renderSummary(){
  const s=graph.summary||{};
  $('#overlap-summary').innerHTML=[['Registry records',s.records],['Category systems',s.categories],['Cross-category entities',s.overlapEntities],['Sourced relationships',s.relationshipEdges]].map(([label,value])=>`<div class="money-stat"><span>${esc(label)}</span><strong>${Number(value||0).toLocaleString()}</strong></div>`).join('');
  $('#overlap-boundary').textContent=graph.boundary||'';
}
function fillFilters(){
  const select=$('#overlap-category');select.innerHTML='<option value="">All categories</option>'+graph.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.title.replace(/^Top 100 /,''))}</option>`).join('');
}
function positions(overlaps){
  const W=1200,H=820,cx=W/2,cy=H/2,outer=330,inner=225;
  const cats=graph.categories;const catPos=new Map();
  cats.forEach((c,i)=>{const a=(Math.PI*2*i/cats.length)-Math.PI/2;catPos.set(c.id,{x:cx+Math.cos(a)*outer,y:cy+Math.sin(a)*outer,a})});
  const entityPos=new Map();
  overlaps.forEach(o=>{
    const ps=o.categories.map(c=>catPos.get(c)).filter(Boolean);let x=cx,y=cy;
    if(ps.length){x=ps.reduce((a,p)=>a+p.x,0)/ps.length;y=ps.reduce((a,p)=>a+p.y,0)/ps.length;const dx=x-cx,dy=y-cy,len=Math.hypot(dx,dy)||1;x=cx+dx/len*inner;y=cy+dy/len*inner;}
    const j=(hash(o.key)-.5)*75,k=(hash(o.key+'y')-.5)*75;entityPos.set(o.key,{x:x+j,y:y+k});
  });
  return{W,H,catPos,entityPos};
}
function renderMap(){
  const overlaps=filteredOverlaps().slice(0,100),{W,H,catPos,entityPos}=positions(overlaps),parts=[];
  for(const o of overlaps){const p=entityPos.get(o.key);for(const c of o.categories){const q=catPos.get(c);if(q)parts.push(`<line class="overlap-edge" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`)}}
  for(const c of graph.categories){const p=catPos.get(c.id),active=!$('#overlap-category').value||$('#overlap-category').value===c.id;parts.push(`<g class="overlap-node category-node ${active?'':'muted'}" data-id="category:${esc(c.id)}"><circle cx="${p.x}" cy="${p.y}" r="31"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle">${esc((c.coverage||0)+'/'+(c.target||100))}</text><text class="outer-label" x="${p.x}" y="${p.y+(p.y<410?-43:51)}" text-anchor="middle">${esc(c.title.replace(/^Top 100 /,'').slice(0,28))}</text></g>`)}
  overlaps.forEach((o,i)=>{const p=entityPos.get(o.key),r=7+Math.min(10,o.categories.length*2);parts.push(`<g class="overlap-node entity-node" data-key="${esc(o.key)}"><circle cx="${p.x}" cy="${p.y}" r="${r}"/><title>${esc(o.name)} — ${o.categories.length} categories</title>${i<22?`<text x="${p.x+11}" y="${p.y-9}">${esc(o.name.slice(0,25))}</text>`:''}</g>`)});
  const svg=$('#overlap-svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML=parts.join('');
  svg.querySelectorAll('.entity-node').forEach(el=>el.addEventListener('click',()=>showEntity(el.dataset.key)));
  $('#map-status').textContent=`Showing ${overlaps.length} cross-category entities. Increase the minimum overlap or choose a category to reduce the map.`;
}
function renderMatrix(){
  const cats=graph.categories,lookup=new Map(graph.categoryPairs.map(p=>[`${p.from}|${p.to}`,p.count]));
  const value=(a,b)=>a===b?'—':lookup.get([a,b].sort().join('|'))||0;
  $('#overlap-matrix').innerHTML=`<table><thead><tr><th>Category</th>${cats.map(c=>`<th title="${esc(c.title)}">${esc(c.id.slice(0,8))}</th>`).join('')}</tr></thead><tbody>${cats.map(a=>`<tr><th>${esc(a.title.replace(/^Top 100 /,''))}</th>${cats.map(b=>`<td class="${Number(value(a.id,b.id))>0?'has-overlap':''}">${value(a.id,b.id)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function renderList(){
  const list=filteredOverlaps();
  $('#overlap-list').innerHTML=list.slice(0,150).map(o=>`<article class="money-card overlap-result" data-key="${esc(o.key)}"><span class="evidence-chip">${o.categories.length} systems</span><h3>${esc(o.name)}</h3><p>${o.categories.map(c=>`<span class="overlap-tag">${esc(graph.categories.find(x=>x.id===c)?.title.replace(/^Top 100 /,'')||c)}</span>`).join(' ')}</p><p class="print-note">${o.recordCount} registry records. Open the entity to inspect sources and evidence boundaries.</p><button class="btn alt" type="button">Inspect overlap</button></article>`).join('')||'<p>No cross-category overlap matches the current filters.</p>';
  document.querySelectorAll('.overlap-result').forEach(el=>el.addEventListener('click',()=>showEntity(el.dataset.key)));
  $('#list-status').textContent=`${list.length} matching overlap entities.`;
}
function showEntity(key){
  const o=graph.overlaps.find(x=>x.key===key);if(!o)return;
  $('#overlap-detail').innerHTML=`<button id="overlap-detail-close" class="money-close" type="button">Close</button><div class="money-kicker">Cross-category evidence route</div><h2>${esc(o.name)}</h2><p>${o.categories.map(c=>`<span class="overlap-tag">${esc(graph.categories.find(x=>x.id===c)?.title||c)}</span>`).join(' ')}</p><div class="money-warning"><strong>Boundary:</strong> repeated appearance does not establish common control, coordination, beneficial ownership or wrongdoing.</div><div class="overlap-records">${o.records.map(r=>`<article><span class="evidence-chip">${esc(r.evidenceClass||r.status||'Record')}</span><h3>${esc(r.name)}</h3><p>${esc(graph.categories.find(x=>x.id===r.category)?.title||r.category)}${r.rank?` · rank ${r.rank}`:''}</p><p><strong>Establishes:</strong> ${esc(r.established||'The cited source identifies the entity in this category.')}</p><p><strong>Does not establish:</strong> ${esc(r.notEstablished||'The record does not establish coordinated control or misconduct.')}</p>${r.sourceUrl?`<a class="btn alt" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Open source</a>`:''}</article>`).join('')}</div>`;
  $('#overlap-detail').classList.add('open');$('#overlap-detail-close').onclick=()=>$('#overlap-detail').classList.remove('open');
}
function renderAll(){renderMap();renderList()}
function bind(){
  ['#overlap-search','#overlap-category','#overlap-min'].forEach(s=>$(s).addEventListener('input',renderAll));
  $('#overlap-reset').onclick=()=>{$('#overlap-search').value='';$('#overlap-category').value='';$('#overlap-min').value='2';renderAll()};
  document.querySelectorAll('[data-overlap-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-overlap-view]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.overlap-view').forEach(v=>v.hidden=v.id!==`overlap-${b.dataset.overlapView}`)});
  $('#overlap-detail').addEventListener('click',e=>{if(e.target.id==='overlap-detail')e.currentTarget.classList.remove('open')});
}
async function load(){
  let data=null;
  try{const r=await fetch('data/money-overlap-graph.json',{cache:'no-store'});if(r.ok)data=await r.json()}catch{}
  if(!data){const r=await fetch('data/money-intelligence-registry.json',{cache:'no-store'});if(!r.ok)throw new Error('Money registry unavailable');data=buildGraph(await r.json())}
  graph=data;renderSummary();fillFilters();renderMatrix();renderAll();bind();
}
load().catch(error=>{$('#overlap-app').innerHTML=`<section class="money-warning"><strong>Overlap map unavailable:</strong> ${esc(error.message)}</section>`});
})();
