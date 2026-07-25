(()=>{
'use strict';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const array=value=>Array.isArray(value)?value:[];
const list=(values,empty='Not publicly resolved')=>array(values).filter(Boolean).length?`<ul>${array(values).filter(Boolean).map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:`<p class="muted">${esc(empty)}</p>`;
const query=new URLSearchParams(location.search),id=query.get('id');
function normalise(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function field(label,value){return `<p><strong>${esc(label)}:</strong> ${esc(value||'Not publicly resolved')}</p>`}
function sourceCard(source){return `<article class="source-card"><span class="eyeline">${esc(source.evidenceGrade||source.factualStatus||'Public record')}</span><h3>${esc(source.sourceTitle||'Source record')}</h3><p><strong>Establishes:</strong> ${esc(source.establishes||'A source record is linked to this identity.')}</p><p><strong>Does not establish:</strong> ${esc(source.doesNotEstablish||'The record does not establish control, coordination or wrongdoing.')}</p>${source.sourceUrl?`<a href="${esc(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>`:''}<small>${esc(source.sourceDate||'Date not recorded')}</small></article>`}
async function load(){
  if(!id)throw new Error('No profile ID was supplied.');
  const [profilesResponse,relationshipsResponse,registryResponse]=await Promise.all([
    fetch('data/money-profile-index.json',{cache:'no-store'}),
    fetch('data/money-relationship-feed.json',{cache:'no-store'}),
    fetch('data/money-intelligence-registry.json',{cache:'no-store'})
  ]);
  if(!profilesResponse.ok)throw new Error('Profile index unavailable.');
  const profiles=await profilesResponse.json(),relationships=relationshipsResponse.ok?await relationshipsResponse.json():{relationships:[]},registry=registryResponse.ok?await registryResponse.json():{categories:[]};
  const profile=array(profiles.records).find(record=>record.id===id);if(!profile)throw new Error('Profile not found.');
  const category=array(registry.categories).find(item=>item.id===profile.category)||{};
  document.title=`${profile.name} | Money Intelligence | Matrix Reprogrammed`;
  $('#profile-name').textContent=profile.name.toUpperCase();
  $('#profile-description').textContent=profile.profile?.description||`${profile.categoryTitle}. Record-level verification status: ${profile.verificationStatus}.`;
  $('#profile-stats').innerHTML=[['Category',profile.categoryTitle],['Measure',profile.value||'Pending'],['Jurisdiction',profile.jurisdiction||'Pending'],['Verification',profile.financialMeasureVerified?'Measure verified':profile.identityVerified?'Identity sourced':'Research lead']].map(([label,value])=>`<div class="money-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  $('#profile-record').innerHTML=[field('Candidate order',profile.candidateOrder),field('Verified rank',profile.rank),field('Ticker',profile.ticker),field('Displayed measure',profile.value),field('Status',profile.verificationStatus),field('Source',profile.sourceTitle),field('Category source',profile.categorySourceTitle),`<p><strong>Established:</strong> ${esc(profile.established)}</p>`,`<p><strong>Not established:</strong> ${esc(profile.notEstablished)}</p>`,`<p><strong>Next research:</strong> ${esc(profile.nextResearch)}</p>`,profile.sourceUrl?`<a class="btn" href="${esc(profile.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open record source</a>`:''].join('');
  const p=profile.profile||{};
  $('#profile-identity').innerHTML=[field('Central entity ID',p.centralEntityId),field('Wikidata ID',p.wikidataId),field('Entity type',p.centralEntityType),field('Inception',p.inception),field('Employees',p.employees),'<h3>Countries</h3>'+list(p.country),'<h3>Headquarters</h3>'+list(p.headquarters),'<h3>Industries</h3>'+list(p.industries),'<h3>Parents</h3>'+list(p.parents),'<h3>Reported owners</h3>'+list(p.owners),'<h3>Subsidiaries</h3>'+list(p.subsidiaries),'<h3>Founders</h3>'+list(p.founders),'<h3>Official websites</h3>'+list(p.officialWebsites)].join('');
  const sources=array(p.linkedSources);$('#profile-sources').innerHTML=sources.length?sources.map(sourceCard).join(''):'<article class="money-card"><h3>Record-level source pending</h3><p>This candidate remains in the research queue and is not counted as individually verified.</p></article>';
  const nameKey=normalise(profile.name),linked=array(relationships.relationships).filter(relation=>normalise(relation.from)===nameKey||normalise(relation.to)===nameKey);
  $('#profile-relationships').innerHTML=linked.length?linked.slice(0,100).map(relation=>`<article class="money-card"><span class="eyeline">${esc(relation.type)}</span><h3>${esc(relation.from)} → ${esc(relation.to)}</h3><p>${esc(relation.established||'A sourced relationship record is present.')}</p><p class="muted"><strong>Boundary:</strong> ${esc(relation.notEstablished||'No control or wrongdoing is established by this relationship alone.')}</p>${relation.sourceUrl?`<a href="${esc(relation.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open evidence</a>`:''}</article>`).join(''):'<article class="money-card"><h3>No sourced relationship edge yet</h3><p>The profile remains searchable and may still overlap by category identity.</p></article>';
  $('#profile-category-link').href=category.route||'follow-the-money.html';
  $('#profile-overlap-link').href=`money-graph.html`;
}
load().catch(error=>{const app=$('#money-profile-app');if(app)app.innerHTML=`<section class="hero wrap"><div class="money-kicker">Profile unavailable</div><h1>RECORD NOT LOADED.</h1><p class="lead">${esc(error.message)}</p><a class="btn" href="money-search.html">Open Money Search</a></section>`});
})();
