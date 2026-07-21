const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'epstein-relationship-intelligence.json');
const pagePath = path.join(root, 'epstein-email-network.html');

if (!fs.existsSync(dataPath) || !fs.existsSync(pagePath)) {
  throw new Error('Epstein relationship data and generated page are required');
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let html = fs.readFileSync(pagePath, 'utf8');
const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
const label = value => String(value || 'unconfirmed_lead').replace(/_/g, ' ');

const laneLabels = {
  documented_fact: 'Documented fact',
  supported_inference: 'Supported inference',
  strong_inference: 'Strong inference',
  unconfirmed_lead: 'Unconfirmed lead',
  unresolved_identity: 'Unresolved identity',
  speculation: 'Speculation / research question',
};

const lanes = data.counts?.publication_lanes || {};
const laneCards = Object.keys(laneLabels).map(key =>
  `<div class="lane-stat lane-${esc(key)}"><strong>${Number(lanes[key] || 0)}</strong><span>${esc(laneLabels[key])}</span></div>`
).join('');

const mentionCards = (data.mentions || []).map(item => {
  const publication = item.publication || {};
  return `<article class="card lane-card lane-${esc(publication.lane)}" data-lane="${esc(publication.lane)}"><span class="lane-badge">${esc(publication.label || laneLabels[publication.lane])}</span><h3>${esc(item.raw_mention || 'Unresolved reference')}</h3><p><strong>Context:</strong> ${esc(item.mention_context || 'No context extracted')}</p><p><strong>Identity confidence:</strong> ${esc(label(item.identity_confidence))}</p><p>${esc(publication.boundary || '')}</p>${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener">Open exact public record</a>` : ''}</article>`;
}).join('');

const reviewCards = (data.editorial_review || []).map(item => {
  const publication = item.publication || { lane: 'speculation', label: laneLabels.speculation };
  return `<article class="card lane-card lane-${esc(publication.lane)}" data-lane="${esc(publication.lane)}"><span class="lane-badge">${esc(publication.label || laneLabels.speculation)}</span><h3>${esc(item.item_type)} · ${esc(item.reason)}</h3><p><strong>Review status:</strong> ${esc(label(item.review_status))}</p><p><strong>Risk marker:</strong> ${esc(label(item.risk_level))}</p><p>${esc(publication.boundary || 'This item is published as speculation, not as a factual allegation.')}</p><details><summary>Open public-record payload</summary><pre>${esc(JSON.stringify(item.public_record_payload || {}, null, 2))}</pre></details></article>`;
}).join('');

const section = `<section id="publication-lanes"><h2>Evidence publication lanes</h2><p class="lead">Every source-backed public record remains visible. Editorial review changes the label, confidence and boundary—not whether the record exists.</p><div class="lane-stats">${laneCards}</div><div class="notice"><strong>Editorial rule:</strong> Anything still in review is displayed as speculation or a research question until classified more precisely. Public-record content is not masked.</div></section><section id="unresolved-mentions"><h2>Mentions and unresolved identities</h2><div class="grid filter-zone">${mentionCards || '<div class="empty">No extracted mentions are available yet.</div>'}</div></section><section id="editorial-speculation"><h2>Editorial review published as speculation</h2><div class="grid filter-zone">${reviewCards || '<div class="empty">No items are currently in editorial review.</div>'}</div></section>`;

const css = `.lane-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin:1rem 0}.lane-stat{border:1px solid var(--line);border-radius:.45rem;padding:.8rem;background:var(--panel)}.lane-stat strong{display:block;font-size:1.8rem}.lane-stat span,.lane-badge{text-transform:uppercase;letter-spacing:.08em;font-size:.72rem}.lane-badge{display:inline-block;padding:.25rem .45rem;border:1px solid currentColor;border-radius:999px;margin-bottom:.55rem}.lane-documented_fact{color:#9fd5af}.lane-supported_inference{color:#c9c78a}.lane-strong_inference{color:#e0a566}.lane-unconfirmed_lead{color:#e8b577}.lane-unresolved_identity{color:#c0a5e8}.lane-speculation{color:#e58b84}.lane-card pre{white-space:pre-wrap;word-break:break-word;background:#08090b;padding:.8rem;border-radius:.35rem;max-height:340px;overflow:auto}`;

if (!html.includes('id="publication-lanes"')) {
  html = html.replace('</main>', `${section}</main>`);
}
if (!html.includes('.lane-stats{')) {
  html = html.replace('</style></head>', `${css}</style></head>`);
}

const client = `<script id="publication-lane-runtime">(function(){const laneData=${safeJson({ relationships: data.relationships || [] })};const laneLabels=${safeJson(laneLabels)};if(typeof network!=='undefined'){network.relationships.forEach(function(item){if(!item.public_safe_summary)item.public_safe_summary=item.public_summary||''})}const cards=[].slice.call(document.querySelectorAll('.relationship-card'));cards.forEach(function(card,index){const item=laneData.relationships[index]||{};const publication=item.publication||{lane:'unconfirmed_lead',label:'Unconfirmed lead'};card.dataset.lane=publication.lane||'unconfirmed_lead';const badge=document.createElement('span');badge.className='lane-badge lane-'+card.dataset.lane;badge.textContent=publication.label||laneLabels[card.dataset.lane]||card.dataset.lane;card.insertBefore(badge,card.firstChild);if(publication.boundary){const boundary=document.createElement('p');boundary.className='warning';boundary.textContent=publication.boundary;card.appendChild(boundary)}});const toolbar=document.querySelector('.toolbar');let laneSelect=document.getElementById('lane-filter');if(toolbar&&!laneSelect){laneSelect=document.createElement('select');laneSelect.id='lane-filter';laneSelect.innerHTML='<option value="">All publication lanes</option>'+Object.keys(laneLabels).map(function(key){return '<option value="'+key+'">'+laneLabels[key]+'</option>'}).join('');toolbar.appendChild(laneSelect)}function apply(){const q=(document.getElementById('search')?.value||'').toLowerCase();const type=document.getElementById('type')?.value||'';const tier=document.getElementById('tier')?.value||'';const lane=document.getElementById('lane-filter')?.value||'';document.querySelectorAll('.filter-zone .card').forEach(function(card){const text=(card.dataset.search||card.textContent).toLowerCase();const typeOk=!type||card.dataset.type===type||!card.classList.contains('relationship-card');const tierOk=!tier||card.dataset.tier===tier||!card.classList.contains('relationship-card');const laneOk=!lane||card.dataset.lane===lane;card.hidden=!(text.includes(q)&&typeOk&&tierOk&&laneOk)})}['search','type','tier','lane-filter'].forEach(function(id){const node=document.getElementById(id);if(node){node.addEventListener(id==='search'?'input':'change',apply)}})})();</script>`;

if (!html.includes('id="publication-lane-runtime"')) {
  html = html.replace('</body>', `${client}</body>`);
}

fs.writeFileSync(pagePath, html);
console.log(`Enhanced Epstein publication lanes: ${(data.relationships || []).length} relationships, ${(data.mentions || []).length} mentions, ${(data.editorial_review || []).length} review items.`);
