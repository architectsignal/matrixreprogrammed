(()=>{
'use strict';
const query=document.querySelector('#money-search-q'),status=document.querySelector('#money-search-status'),output=document.querySelector('#money-search-results');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let rows=[];
function label(record){return record.financialMeasureVerified?'Measure verified':record.identityVerified?'Identity sourced':'Research lead'}
function render(){const term=query.value.trim().toLowerCase(),list=(term?rows.filter(record=>record.search.includes(term)):rows.slice(0,60)).slice(0,120);status.textContent=`Showing ${list.length} results. Profiles separate identity evidence from verified measurements.`;output.innerHTML=list.map(record=>`<article class="money-card"><span class="evidence-chip">${esc(label(record))}</span><h3>${esc(record.name)}</h3><p>${esc(record.categoryTitle)} · ${esc(record.value||record.status)}</p><p>${esc(record.jurisdiction||'Jurisdiction pending')} · ${esc(record.verificationStatus||'Research lead')}</p><p class="money-source-boundary">${esc(record.notEstablished)}</p><a class="btn" href="${esc(record.route)}">Open profile</a>${record.categoryRoute?` <a class="btn alt" href="${esc(record.categoryRoute)}">Category</a>`:''}${record.sourceUrl?` <a class="btn alt" href="${esc(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`:''}</article>`).join('')||'<p>No matching money-intelligence records.</p>'}
fetch('data/money-search-index.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Money search index unavailable');return response.json()}).then(data=>{rows=data.records||[];render()}).catch(error=>{status.textContent=error.message});
query.addEventListener('input',render);
})();
