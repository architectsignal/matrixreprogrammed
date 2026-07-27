(()=>{
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const array=value=>Array.isArray(value)?value:[];
const CORPORATE=/\b(the|plc|incorporated|inc|corp|corporation|company|co|limited|ltd|llc|lp|sa|se|ag|nv|group|holdings?|partners?|management|investment|investments|capital|international|global)\b/g;
function key(value=''){
  const base=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  return base.replace(CORPORATE,' ').replace(/\s+/g,' ').trim()||base;
}
function verificationLabel(profile){return profile.financialMeasureVerified?'Measure verified':profile.identityVerified?'Identity sourced':'Research lead'}
function profileCard(profile){
  return `<article class="money-card"><span class="evidence-chip">${esc(verificationLabel(profile))}</span><h3>${esc(profile.name)}</h3><p><strong>${esc(profile.categoryTitle||profile.category)}</strong>${profile.rank?` · rank ${esc(profile.rank)}`:profile.candidateOrder?` · lead ${esc(profile.candidateOrder)}`:''}</p><p><strong>Measure:</strong> ${esc(profile.value||'Not uniformly disclosed')}</p><p><strong>Jurisdiction:</strong> ${esc(profile.jurisdiction||'Not resolved')}</p><p class="money-source-boundary">${esc(profile.notEstablished||'No control or wrongdoing is established by this record alone.')}</p><div class="cta-row"><a class="btn" href="money-profile.html?id=${encodeURIComponent(profile.id)}">Open evidence profile</a>${profile.sourceUrl?`<a class="btn alt" href="${esc(profile.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>`:''}</div></article>`;
}
function relationshipCard(relation){
  return `<article class="money-card"><span class="evidence-chip">${esc(relation.type||'relationship')}</span><h3>${esc(relation.from)} → ${esc(relation.to)}</h3><p>${esc(relation.established||'A sourced relationship route is recorded.')}</p><p class="money-source-boundary"><strong>Boundary:</strong> ${esc(relation.notEstablished||'The link does not establish coordinated control or wrongdoing.')}</p>${relation.sourceUrl?`<a class="btn alt" href="${esc(relation.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open evidence</a>`:''}</article>`;
}
function timelineCard(event){
  return `<article class="money-card"><span class="evidence-chip">${esc(event.evidenceGrade||event.type||'source')}</span><h3>${esc(event.title||'Evidence event')}</h3><p><strong>${esc(event.date||'Date not recorded')}</strong></p><p>${esc(event.establishes||'A dated source is linked to this profile.')}</p>${event.sourceUrl?`<a class="btn alt" href="${esc(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>`:''}</article>`;
}
const dataPromise=Promise.all([
  fetch('data/money-profile-index.json',{cache:'no-store'}).then(response=>response.ok?response.json():{records:[]}).catch(()=>({records:[]})),
  fetch('data/money-relationship-feed.json',{cache:'no-store'}).then(response=>response.ok?response.json():{relationships:[]}).catch(()=>({relationships:[]})),
  fetch('data/money-timeline-feed.json',{cache:'no-store'}).then(response=>response.ok?response.json():{events:[]}).catch(()=>({events:[]})),
  fetch('data/money-overlap-graph.json',{cache:'no-store'}).then(response=>response.ok?response.json():{summary:{}}).catch(()=>({summary:{}}))
]);
async function augmentSummary(){
  const summary=document.querySelector('#overlap-summary');if(!summary||summary.dataset.depthEnhanced)return;
  const [, , , graph]=await dataPromise;const stats=graph.summary||{};
  summary.insertAdjacentHTML('beforeend',`<div class="money-stat"><span>Identity profiles</span><strong>${Number(stats.identityProfiles||0).toLocaleString()}</strong></div><div class="money-stat"><span>Verified measures</span><strong>${Number(stats.verifiedMeasures||0).toLocaleString()}</strong></div>`);
  summary.dataset.depthEnhanced='true';
}
async function augmentDetail(){
  const detail=document.querySelector('#overlap-detail');if(!detail||!detail.classList.contains('open'))return;
  const name=detail.querySelector('h2')?.textContent?.trim();if(!name||detail.dataset.depthFor===name)return;
  detail.dataset.depthFor=name;
  detail.querySelector('.overlap-depth-panel')?.remove();
  const [profilesData,relationshipsData,timelineData]=await dataPromise;
  if(!detail.classList.contains('open')||detail.querySelector('h2')?.textContent?.trim()!==name)return;
  const targetKey=key(name);
  const profiles=array(profilesData.records).filter(profile=>[profile.name,...array(profile.profile?.aliases)].some(value=>key(value)===targetKey));
  const relationships=array(relationshipsData.relationships).filter(relation=>key(relation.from)===targetKey||key(relation.to)===targetKey);
  const events=array(timelineData.events).filter(event=>key(event.entity)===targetKey||profiles.some(profile=>profile.id===event.entityId));
  const panel=document.createElement('section');panel.className='overlap-depth-panel';
  panel.innerHTML=`<div class="money-kicker">Integrated entity intelligence</div><h2>MEASUREMENTS, SOURCES, TIMELINE &amp; RELATIONSHIPS.</h2><p class="print-note">This panel is generated from the same profile, timeline and relationship feeds used by Money Search and the intelligence brief.</p><h3>Category profiles</h3><div class="money-grid">${profiles.length?profiles.slice(0,20).map(profileCard).join(''):'<article class="money-card"><p>No individual profile is resolved for this normalised overlap yet.</p></article>'}</div><h3>Sourced relationships</h3><div class="money-grid">${relationships.length?relationships.slice(0,16).map(relationshipCard).join(''):'<article class="money-card"><p>No separate sourced relationship edge is currently attached. Category overlap remains visible as a research route.</p></article>'}</div><h3>Evidence timeline</h3><div class="money-grid">${events.length?events.slice(0,12).map(timelineCard).join(''):'<article class="money-card"><p>No dated profile event is currently available.</p></article>'}</div>`;
  detail.appendChild(panel);
}
function bind(){
  const detail=document.querySelector('#overlap-detail');if(!detail)return;
  new MutationObserver(()=>{augmentDetail()}).observe(detail,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',()=>queueMicrotask(augmentDetail));
  augmentSummary();augmentDetail();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
