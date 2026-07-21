const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'epstein-relationship-intelligence.json');
const pagePath = path.join(root, 'epstein-email-network.html');
const downloads = path.join(root, 'downloads');
const profileIndexPath = path.join(root, 'data', 'epstein-relationship-profile-index.json');
const commandCenterPath = path.join(root, 'epstein-files.html');
const forbidden = new Set([
  'content_markdown', 'content_html', 'bcc_recipients', 'bcc_recipients_json',
  'restricted_text', 'raw_json', 'body_original', 'body_clean', 'sender_raw',
]);

const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = value => String(value || 'unclassified').replace(/_/g, ' ');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

function assertSafe(value, trail = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafe(item, `${trail}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`Private field ${trail}.${key} cannot enter the public site`);
    assertSafe(child, `${trail}.${key}`);
  }
}

function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Relationship export must be a JSON object');
  for (const key of ['entities', 'relationships', 'events', 'financial_records']) {
    if (!Array.isArray(data[key])) throw new Error(`${key} must be an array`);
  }
  if (!data.evidence_notice) throw new Error('The permanent evidence notice is required');
  assertSafe(data);
}

function buildProfileIndex(data, byId) {
  const index = {};
  for (const entity of data.entities) {
    const connections = data.relationships
      .filter(item => item.source_entity_id === entity.entity_id || item.target_entity_id === entity.entity_id)
      .map(item => ({
        relationship_id: item.relationship_id,
        direction: item.source_entity_id === entity.entity_id ? 'outbound' : 'inbound',
        other_entity_id: item.source_entity_id === entity.entity_id ? item.target_entity_id : item.source_entity_id,
        other_name: byId.get(item.source_entity_id === entity.entity_id ? item.target_entity_id : item.source_entity_id)?.name || 'Unresolved identity',
        relationship_type: item.relationship_type,
        evidence_count: Array.isArray(item.evidence) ? item.evidence.length : 0,
        strength: item.strength || null,
        public_safe_summary: item.public_safe_summary || '',
      }));
    index[entity.entity_id] = {
      entity_id: entity.entity_id,
      name: entity.name,
      aliases: entity.aliases || [],
      entity_type: entity.entity_type || 'person',
      identity_confidence: entity.identity_confidence || 'unresolved',
      search_route: `search.html?q=${encodeURIComponent(entity.name || '')}`,
      connections,
    };
  }
  return {
    schema_version: data.schema_version || '1.0.0',
    generated_at_utc: data.generated_at_utc,
    evidence_notice: data.evidence_notice,
    profiles: index,
  };
}

function injectCommandCenterLink() {
  if (!fs.existsSync(commandCenterPath)) return;
  let html = fs.readFileSync(commandCenterPath, 'utf8');
  if (html.includes('id="epstein-email-network-link"')) return;
  const block = `<section id="epstein-email-network-link" class="section wrap"><div class="card redline"><span class="label">New evidence intelligence layer</span><h2>The Epstein Email Network</h2><p>Search approved correspondence, introductions, meetings, institutions and financial references. Every published connection retains its supporting record. Contact is not proof of misconduct.</p><div class="cta-row"><a class="btn" href="epstein-email-network.html">Open the relationship map</a><a class="btn alt" href="downloads/epstein-relationship-intelligence.json">Approved public data</a></div></div></section>`;
  html = html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : `${html}${block}`;
  fs.writeFileSync(commandCenterPath, html);
}

if (!fs.existsSync(dataPath)) throw new Error('Missing data/epstein-relationship-intelligence.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
validate(data);
fs.mkdirSync(downloads, { recursive: true });

const byId = new Map(data.entities.map(entity => [entity.entity_id, entity]));
const nameOf = id => byId.get(id)?.name || id || 'Unresolved identity';
const profileIndex = buildProfileIndex(data, byId);
fs.writeFileSync(profileIndexPath, JSON.stringify(profileIndex, null, 2));
fs.writeFileSync(path.join(downloads, 'epstein-relationship-profile-index.json'), JSON.stringify(profileIndex, null, 2));
fs.writeFileSync(path.join(downloads, 'epstein-relationship-intelligence.json'), JSON.stringify(data, null, 2));

const entityCards = data.entities.map(entity => {
  const profile = profileIndex.profiles[entity.entity_id];
  return `<article class="card entity-card" data-search="${esc([entity.name, ...(entity.aliases || [])].join(' '))}"><span class="label">${esc(label(entity.entity_type))} · ${esc(label(entity.identity_confidence))}</span><h3>${esc(entity.name)}</h3><p><strong>Approved documented links:</strong> ${profile.connections.length}</p><p><strong>Aliases:</strong> ${esc((entity.aliases || []).join(' · ') || 'None recorded')}</p><div class="actions"><button class="text-button" data-profile="${esc(entity.entity_id)}">Open connection profile</button><a href="${esc(profile.search_route)}">Search the wider site</a></div></article>`;
}).join('');

const relationshipCards = data.relationships.map(item => {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const tier = item.strength?.tier || 1;
  const evidenceList = evidence.map(record => `<li><a href="${esc(record.source_url)}" target="_blank" rel="noopener">${esc(record.public_safe_paraphrase || record.locator || 'Open supporting record')}</a><span>${esc(label(record.evidence_level))} · confidence ${esc(record.confidence)}</span></li>`).join('');
  return `<article class="card relationship-card" data-type="${esc(item.relationship_type)}" data-tier="${esc(tier)}" data-search="${esc(`${nameOf(item.source_entity_id)} ${nameOf(item.target_entity_id)} ${item.relationship_type}`)}"><span class="label">Tier ${esc(tier)} · ${esc(label(item.direct_or_inferred))}</span><h3>${esc(nameOf(item.source_entity_id))} → ${esc(nameOf(item.target_entity_id))}</h3><p><strong>Relationship:</strong> ${esc(label(item.relationship_type))}</p><p>${esc(item.public_safe_summary || '')}</p><p><strong>Documented range:</strong> ${esc(item.first_seen || 'Unknown')} to ${esc(item.last_seen || item.first_seen || 'Unknown')}</p><p><strong>Supporting records:</strong> ${evidence.length}</p>${evidenceList ? `<details><summary>Open exact evidence</summary><ul class="evidence-list">${evidenceList}</ul></details>` : '<p class="warning">No public evidence attached; this edge should not have been approved.</p>'}</article>`;
}).join('');

const eventCards = data.events.map(item => `<article class="card event-card" data-search="${esc(`${item.title} ${item.location} ${item.event_type}`)}"><span class="label">${esc(label(item.event_type))} · ${esc(label(item.outcome_status))}</span><h3>${esc(item.title)}</h3><p><strong>Date:</strong> ${esc(item.start_date || 'Unknown')}</p><p><strong>Location:</strong> ${esc(item.location || 'Not established')}</p><p><strong>Evidence:</strong> ${esc(label(item.evidence_classification))}</p>${(item.source_urls || []).map(url => `<a href="${esc(url)}" target="_blank" rel="noopener">Open supporting record</a>`).join(' · ')}</article>`).join('');
const financialCards = data.financial_records.map(item => `<article class="card financial-card" data-search="${esc(`${item.financial_type} ${item.status} ${item.amount_text} ${item.jurisdiction}`)}"><span class="label">${esc(label(item.financial_type))} · ${esc(label(item.status))}</span><h3>${esc(item.amount_text || 'Amount not stated')}</h3><p><strong>Date:</strong> ${esc(item.transaction_date || 'Unknown')}</p><p><strong>Jurisdiction:</strong> ${esc(item.jurisdiction || 'Not established')}</p><p><strong>Evidence:</strong> ${esc(label(item.evidence_classification))}</p>${(item.source_urls || []).map(url => `<a href="${esc(url)}" target="_blank" rel="noopener">Open supporting record</a>`).join(' · ')}</article>`).join('');
const types = [...new Set(data.relationships.map(item => item.relationship_type))].sort();

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Epstein Email Network | Matrix Reprogrammed</title><meta name="description" content="Evidence-led map of approved Epstein email correspondence, introductions, institutions, investments, properties and intermediaries."><style>
:root{--bg:#070809;--panel:#111318;--line:#2b3038;--text:#eee9df;--muted:#aaa49a;--copper:#bd7941;--gold:#d6aa70;--red:#c95b55}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,Arial,sans-serif;line-height:1.55}a{color:#eda76e}.wrap{width:min(1240px,92vw);margin:auto}.hero{padding:5rem 0 3rem;background:radial-gradient(circle at 85% 0,#3b190f 0,transparent 35%),linear-gradient(#08090b,#0c0d10)}h1{font-size:clamp(2.7rem,7vw,5.8rem);line-height:.95;margin:.4rem 0 1.25rem}h2{font-size:clamp(1.7rem,3vw,2.5rem);margin-top:3rem}.eyebrow,.label{color:var(--copper);text-transform:uppercase;letter-spacing:.13em;font-size:.75rem}.lead{max-width:900px;color:var(--muted);font-size:1.18rem}.notice{border:1px solid var(--copper);border-left:5px solid var(--copper);background:#bd794115;padding:1rem 1.2rem;margin:1.6rem 0}.stats,.grid{display:grid;gap:1rem}.stats{grid-template-columns:repeat(4,1fr);margin-top:2rem}.stat{border-top:2px solid var(--copper);padding:1rem 0}.stat strong{display:block;font-size:2.2rem}.grid{grid-template-columns:repeat(auto-fit,minmax(290px,1fr))}.card{background:var(--panel);border:1px solid var(--line);border-radius:.55rem;padding:1.15rem}.card h3{margin:.3rem 0 .7rem}.toolbar{display:flex;flex-wrap:wrap;gap:.7rem;margin:1rem 0 1.4rem}.toolbar input,.toolbar select{background:#0b0d10;color:var(--text);border:1px solid var(--line);padding:.75rem;border-radius:.35rem}.toolbar input{min-width:min(420px,100%)}.graph-shell{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:1rem}.graph{min-height:520px;background:#0d0f12;border:1px solid var(--line);border-radius:.55rem;overflow:hidden}.graph svg{width:100%;height:520px}.edge{stroke:#8d5b38;stroke-width:2;cursor:pointer}.edge:hover{stroke:var(--gold);stroke-width:4}.node{fill:#161a20;stroke:var(--copper);stroke-width:2;cursor:pointer}.node-label{fill:var(--text);font-size:12px;pointer-events:none}.panel{background:var(--panel);border:1px solid var(--line);padding:1rem;border-radius:.55rem;min-height:520px}.actions{display:flex;gap:.75rem;flex-wrap:wrap}.text-button{background:none;border:0;padding:0;color:#eda76e;text-decoration:underline;cursor:pointer;font:inherit}.evidence-list li{margin-bottom:.8rem}.evidence-list span{display:block;color:var(--muted);font-size:.85rem}.warning{color:#e7aaa4}.empty{border:1px dashed var(--line);padding:1.2rem;color:var(--muted)}footer{padding:4rem 0;color:var(--muted)}@media(max-width:850px){.stats{grid-template-columns:repeat(2,1fr)}.graph-shell{grid-template-columns:1fr}.graph,.panel{min-height:auto}}
</style></head><body><header class="hero"><div class="wrap"><div class="eyebrow">Matrix Reprogrammed · Evidence Intelligence</div><h1>${esc(data.title)}</h1><p class="lead">${esc(data.subtitle)}</p><div class="notice"><strong>Permanent evidence boundary:</strong> ${esc(data.evidence_notice)}</div><p>Approved investigator export: ${esc(data.generated_at_utc || 'No approved records released yet')}</p></div></header><main class="wrap"><section class="stats"><div class="stat"><strong>${data.entities.length}</strong>approved entities</div><div class="stat"><strong>${data.relationships.length}</strong>documented edges</div><div class="stat"><strong>${data.events.length}</strong>reviewed events</div><div class="stat"><strong>${data.financial_records.length}</strong>financial records</div></section><section><h2>Search and filter the approved record</h2><div class="toolbar"><input id="search" type="search" placeholder="Search names, aliases, organizations, meetings or money references"><select id="type"><option value="">All relationship types</option>${types.map(type => `<option value="${esc(type)}">${esc(label(type))}</option>`).join('')}</select><select id="tier"><option value="">All strength tiers</option>${[1,2,3,4,5].map(tier => `<option value="${tier}">Tier ${tier}</option>`).join('')}</select></div></section><section><h2>Interactive relationship map</h2><p class="lead">Select any line to open the exact records supporting that connection. A line is an evidence route, not a verdict.</p><div class="graph-shell"><div id="graph" class="graph"></div><aside id="detail" class="panel"><h3>Evidence inspector</h3><p>Select a person or relationship line.</p></aside></div></section><section><h2>People and organizations</h2><div class="grid filter-zone">${entityCards || '<div class="empty">No entities have passed owner review for public release.</div>'}</div></section><section><h2>Who connects whom?</h2><div class="grid filter-zone">${relationshipCards || '<div class="empty">No relationship edges have passed owner review for public release.</div>'}</div></section><section><h2>Meetings, travel and events</h2><div class="grid filter-zone">${eventCards || '<div class="empty">No event records have passed owner review.</div>'}</div></section><section><h2>Money and investment map</h2><div class="grid filter-zone">${financialCards || '<div class="empty">No financial records have passed owner review.</div>'}</div></section><section><h2>Method and source contract</h2><div class="notice"><p><strong>Source:</strong> ${esc(data.source?.name || 'Jmail Data API')} · dataset ${esc(data.source?.dataset_version || 'v1')}</p><p><strong>Identity:</strong> email identifiers may confirm an identity; names alone remain unresolved until corroborated.</p><p><strong>Relationships:</strong> direct recipients, copied recipients and body mentions are different evidence states.</p><p><strong>Money:</strong> proposals, introductions and discussions are never displayed as completed investments.</p><p><strong>Publication:</strong> only records individually approved in the private investigator are included.</p><div class="actions"><a href="downloads/epstein-relationship-intelligence.json">Open approved public dataset</a><a href="downloads/epstein-relationship-profile-index.json">Open people connection index</a><a href="epstein-files.html">Return to the Epstein Command Center</a></div></div></section></main><footer><div class="wrap">Matrix Reprogrammed · Sequence is not a verdict · Contact is not proof of misconduct.</div></footer><script id="network-data" type="application/json">${safeJson({entities:data.entities,relationships:data.relationships,profiles:profileIndex.profiles})}</script><script>
const network=JSON.parse(document.getElementById('network-data').textContent);const byId=new Map(network.entities.map(x=>[x.entity_id,x]));const graph=document.getElementById('graph');const detail=document.getElementById('detail');const ns='http://www.w3.org/2000/svg';function evidenceHtml(rel){const links=(rel.evidence||[]).map(x=>'<li><a target="_blank" rel="noopener" href="'+escapeHtml(x.source_url)+'">'+escapeHtml(x.public_safe_paraphrase||x.locator||'Open record')+'</a></li>').join('');return '<h3>'+escapeHtml((byId.get(rel.source_entity_id)||{}).name||rel.source_entity_id)+' → '+escapeHtml((byId.get(rel.target_entity_id)||{}).name||rel.target_entity_id)+'</h3><p><strong>'+escapeHtml(rel.relationship_type.replaceAll('_',' '))+'</strong></p><p>'+escapeHtml(rel.public_safe_summary||'')+'</p><ul>'+links+'</ul><p class="warning">Relationship strength is not a guilt score.</p>'}function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}function showProfile(id){const p=network.profiles[id];if(!p)return;detail.innerHTML='<h3>'+escapeHtml(p.name)+'</h3><p><strong>Identity:</strong> '+escapeHtml(p.identity_confidence)+'</p><p><strong>Approved links:</strong> '+p.connections.length+'</p>'+p.connections.map(c=>'<button class="text-button" data-rel="'+escapeHtml(c.relationship_id)+'">'+escapeHtml(c.relationship_type.replaceAll('_',' '))+' · '+escapeHtml(c.other_name)+'</button><br>').join('');detail.querySelectorAll('[data-rel]').forEach(b=>b.onclick=()=>showRelationship(b.dataset.rel))}function showRelationship(id){const r=network.relationships.find(x=>x.relationship_id===id);if(r)detail.innerHTML=evidenceHtml(r)}function renderGraph(){graph.innerHTML='';if(!network.entities.length){graph.innerHTML='<div class="empty">The graph will activate after approved records are exported.</div>';return}const svg=document.createElementNS(ns,'svg'),w=900,h=520,cx=w/2,cy=h/2,r=Math.min(w,h)*.36;const positions=new Map();network.entities.forEach((e,i)=>{const a=(Math.PI*2*i/network.entities.length)-Math.PI/2;positions.set(e.entity_id,{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r})});network.relationships.forEach(rel=>{const a=positions.get(rel.source_entity_id),b=positions.get(rel.target_entity_id);if(!a||!b)return;const line=document.createElementNS(ns,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'edge','data-rel':rel.relationship_id,tabindex:'0'}).forEach(([k,v])=>line.setAttribute(k,v));line.onclick=()=>showRelationship(rel.relationship_id);line.onkeydown=e=>{if(e.key==='Enter')showRelationship(rel.relationship_id)};svg.appendChild(line)});network.entities.forEach(e=>{const p=positions.get(e.entity_id),g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text');Object.entries({cx:p.x,cy:p.y,r:16,class:'node',tabindex:'0'}).forEach(([k,v])=>circle.setAttribute(k,v));circle.onclick=()=>showProfile(e.entity_id);circle.onkeydown=x=>{if(x.key==='Enter')showProfile(e.entity_id)};text.setAttribute('x',p.x+22);text.setAttribute('y',p.y+4);text.setAttribute('class','node-label');text.textContent=e.name;g.append(circle,text);svg.appendChild(g)});svg.setAttribute('viewBox','0 0 900 520');svg.setAttribute('role','img');svg.setAttribute('aria-label','Approved Epstein email relationship graph');graph.appendChild(svg)}document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>showProfile(b.dataset.profile));const search=document.getElementById('search'),type=document.getElementById('type'),tier=document.getElementById('tier');function filterCards(){const q=search.value.toLowerCase();document.querySelectorAll('.filter-zone .card').forEach(card=>{const text=(card.dataset.search||card.textContent).toLowerCase(),typeOk=!type.value||card.dataset.type===type.value||!card.classList.contains('relationship-card'),tierOk=!tier.value||card.dataset.tier===tier.value||!card.classList.contains('relationship-card');card.hidden=!(text.includes(q)&&typeOk&&tierOk)})}search.oninput=filterCards;type.onchange=filterCards;tier.onchange=filterCards;renderGraph();
</script></body></html>`;

fs.writeFileSync(pagePath, page);
injectCommandCenterLink();
console.log(`Built Epstein Relationship Intelligence: ${data.entities.length} entities, ${data.relationships.length} approved edges, ${data.events.length} events, ${data.financial_records.length} financial records.`);
