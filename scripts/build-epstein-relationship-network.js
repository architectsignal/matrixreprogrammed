const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-relationship-public.json');
const outputFile = path.join(root, 'epstein-email-network.html');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile)) {
  console.log('No approved Epstein relationship export found. Skipping network build.');
  process.exit(0);
}

if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const entities = Array.isArray(data.entities) ? data.entities : [];
const relationships = Array.isArray(data.relationships) ? data.relationships : [];
const events = Array.isArray(data.events) ? data.events : [];
const financial = Array.isArray(data.financial_records) ? data.financial_records : [];

const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const byId = new Map(entities.map(entity => [entity.entity_id, entity]));
const nameOf = id => byId.get(id)?.canonical_name || id || 'Unresolved identity';
const evidenceLabel = value => String(value || 'unclassified').replace(/_/g, ' ');

const relationshipCards = relationships.map(item => {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const sourceLinks = evidence.map(record => {
    const href = record.discovery_url || record.original_source || '#';
    const label = record.subject || record.record_id || 'Open supporting record';
    return `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>${record.sent_at ? ` · ${esc(record.sent_at)}` : ''}</li>`;
  }).join('');
  return `<article class="card relationship-card" data-type="${esc(item.relationship_type)}" data-tier="${esc(item.strength_tier)}">
    <span class="label">Tier ${esc(item.strength_tier || 1)} · ${esc(evidenceLabel(item.evidence_class))}</span>
    <h3>${esc(nameOf(item.source_entity_id))} → ${esc(nameOf(item.target_entity_id))}</h3>
    <p><strong>Relationship:</strong> ${esc(evidenceLabel(item.relationship_type))}</p>
    <p><strong>Documented range:</strong> ${esc(item.first_known_at || 'Unknown')} to ${esc(item.last_known_at || item.first_known_at || 'Unknown')}</p>
    <p><strong>Supporting emails:</strong> ${esc(item.direct_exchange_count || evidence.length || 0)} · <strong>Threads:</strong> ${esc(item.thread_count || 0)}</p>
    ${item.analyst_notes ? `<p><strong>Analyst note:</strong> ${esc(item.analyst_notes)}</p>` : ''}
    ${sourceLinks ? `<details><summary>Open supporting records</summary><ul>${sourceLinks}</ul></details>` : '<p class="warning">Supporting records must be attached before publication.</p>'}
  </article>`;
}).join('');

const entityCards = entities.map(entity => {
  const connected = relationships.filter(rel => rel.source_entity_id === entity.entity_id || rel.target_entity_id === entity.entity_id);
  return `<article class="card entity-card">
    <span class="label">${esc(entity.entity_type || 'entity')} · ${esc(evidenceLabel(entity.identity_confidence))}</span>
    <h3>${esc(entity.canonical_name)}</h3>
    <p>${esc(entity.role_summary || 'Role summary pending editorial review.')}</p>
    <p><strong>Approved documented links:</strong> ${connected.length}</p>
    <p><strong>First / last appearance:</strong> ${esc(entity.first_seen_at || 'Unknown')} / ${esc(entity.last_seen_at || 'Unknown')}</p>
  </article>`;
}).join('');

const eventCards = events.map(event => `<article class="card">
  <span class="label">${esc(evidenceLabel(event.event_type))} · ${esc(evidenceLabel(event.outcome_status))}</span>
  <h3>${esc(event.title)}</h3>
  <p><strong>Date:</strong> ${esc(event.starts_at || 'Unknown')}</p>
  <p><strong>Location:</strong> ${esc(event.location_text || 'Not established')}</p>
  <p><strong>Evidence:</strong> ${esc(evidenceLabel(event.evidence_class))}</p>
</article>`).join('');

const financialCards = financial.map(item => `<article class="card">
  <span class="label">${esc(evidenceLabel(item.financial_type))} · ${esc(evidenceLabel(item.status))}</span>
  <h3>${esc(nameOf(item.investor_entity_id))} → ${esc(nameOf(item.recipient_entity_id || item.vehicle_entity_id))}</h3>
  <p><strong>Amount:</strong> ${esc(item.amount_text || [item.amount_numeric, item.currency].filter(Boolean).join(' ') || 'Not stated')}</p>
  <p><strong>Date:</strong> ${esc(item.occurred_at || 'Unknown')}</p>
  <p><strong>Evidence:</strong> ${esc(evidenceLabel(item.evidence_class))}</p>
</article>`).join('');

const methodology = data.methodology || {};
const generated = data.generated_at || 'No approved investigator export received yet';
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Epstein Email Network | Matrix Reprogrammed</title>
<meta name="description" content="Evidence-led map of documented Epstein email correspondence, introductions, institutions, investments, properties and intermediaries.">
<style>
:root{--bg:#08090b;--panel:#111318;--line:#2b3038;--text:#ece8df;--muted:#a9a39a;--accent:#bb7942;--danger:#c85656}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,Arial,sans-serif;line-height:1.55}.wrap{width:min(1180px,92vw);margin:auto}.hero{padding:5rem 0 3rem;background:radial-gradient(circle at top right,#31170f 0,transparent 35%)}h1{font-size:clamp(2.4rem,6vw,5rem);margin:.25rem 0}h2{margin-top:3rem;font-size:2rem}.eyebrow,.label{color:var(--accent);text-transform:uppercase;letter-spacing:.12em;font-size:.75rem}.lead{font-size:1.2rem;color:var(--muted);max-width:850px}.notice,.method{border:1px solid var(--accent);padding:1rem 1.2rem;background:rgba(187,121,66,.08);margin:1.5rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.card{background:var(--panel);border:1px solid var(--line);padding:1.2rem;border-radius:.55rem}.card h3{margin:.35rem 0 .8rem}.warning{color:#e7b0a7}.toolbar{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0}.toolbar input,.toolbar select{background:#0c0e12;color:var(--text);border:1px solid var(--line);padding:.75rem;border-radius:.35rem}a{color:#e4a16a}details{margin-top:.8rem}footer{padding:4rem 0;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}.stat{border-top:2px solid var(--accent);padding-top:.75rem}.stat strong{font-size:2rem;display:block}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<header class="hero"><div class="wrap"><div class="eyebrow">Matrix Reprogrammed · Evidence Intelligence</div><h1>THE EPSTEIN EMAIL NETWORK</h1><p class="lead">Follow the correspondence. Map the introductions. Trace the institutions, properties, investments and intermediaries.</p><div class="notice"><strong>Evidence boundary:</strong> ${esc(data.evidence_notice || '')}</div><p>Approved investigator export: ${esc(generated)}</p></div></header>
<main class="wrap">
<section class="stats"><div class="stat"><strong>${entities.length}</strong>approved entities</div><div class="stat"><strong>${relationships.length}</strong>documented relationships</div><div class="stat"><strong>${events.length}</strong>reviewed events</div><div class="stat"><strong>${financial.length}</strong>financial records</div></section>
<section><h2>Search the approved network</h2><div class="toolbar"><input id="search" type="search" placeholder="Search names, organizations or relationship types"><select id="tier"><option value="">All strength tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option><option value="4">Tier 4</option><option value="5">Tier 5</option></select></div></section>
<section><h2>People and organizations</h2><div class="grid" id="entities">${entityCards || '<div class="card"><h3>Awaiting approved export</h3><p>The private investigator has not yet approved public entity records.</p></div>'}</div></section>
<section><h2>Who connects whom?</h2><p class="lead">Every visible edge is required to retain its supporting records. Copied recipients, direct correspondents and body mentions remain separate evidence states.</p><div class="grid" id="relationships">${relationshipCards || '<div class="card"><h3>No approved relationship edges yet</h3><p>Unreviewed or speculative connections are not published.</p></div>'}</div></section>
<section><h2>Meetings, travel and events</h2><div class="grid">${eventCards || '<div class="card"><p>No approved event records yet.</p></div>'}</div></section>
<section><h2>Money and investment map</h2><div class="grid">${financialCards || '<div class="card"><p>No approved financial records yet.</p></div>'}</div></section>
<section><h2>Evidence methodology</h2><div class="method"><p><strong>Source policy:</strong> ${esc(methodology.source_policy || '')}</p><p><strong>Identity policy:</strong> ${esc(methodology.identity_policy || '')}</p><p><strong>Publication policy:</strong> ${esc(methodology.publication_policy || '')}</p><p><strong>Relationship policy:</strong> ${esc(methodology.relationship_policy || '')}</p><p><strong>Financial policy:</strong> ${esc(methodology.financial_policy || '')}</p></div></section>
</main>
<footer><div class="wrap">Matrix Reprogrammed · Sequence is not a verdict · Contact is not proof of misconduct.</div></footer>
<script>
const search=document.getElementById('search');const tier=document.getElementById('tier');function filter(){const q=search.value.toLowerCase();document.querySelectorAll('.entity-card,.relationship-card').forEach(card=>{const text=card.textContent.toLowerCase();const tierMatch=!tier.value||card.dataset.tier===tier.value||card.classList.contains('entity-card');card.hidden=!(text.includes(q)&&tierMatch);});}search.addEventListener('input',filter);tier.addEventListener('change',filter);
</script>
</body></html>`;

fs.writeFileSync(outputFile, page);
fs.writeFileSync(path.join(downloadsDir, 'epstein-relationship-public.json'), JSON.stringify(data, null, 2));
console.log(`Built Epstein Email Network with ${entities.length} entities and ${relationships.length} approved relationships.`);
