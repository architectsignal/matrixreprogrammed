const fs = require('fs');
const path = require('path');
const root = process.cwd();
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.mkdirSync(path.dirname(fp(name)), { recursive: true }); fs.writeFileSync(fp(name), value); }
function readJson(name, fallback){ try { return exists(name) ? JSON.parse(read(name)) : fallback; } catch { return fallback; } }
function esc(value = ''){ return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function slug(value = 'contractor'){ return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'contractor'; }
function arr(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items){ return [...new Set(arr(items).map(clean).filter(Boolean))]; }

const updated = new Date().toISOString();
const records = readJson('data/record-events.json', { events: [] });
const entityBriefs = readJson('data/entity-daily-briefs.json', { briefs: [] });
const recordReview = readJson('data/entity-exposure-index.json', { profiles: [] });
const relationships = readJson('data/entity-relationship-scores.json', { relationships: [] });

const contractorFamilies = [
  {
    id: 'blackwater-constellis-lineage',
    name: 'Blackwater / Xe / Academi / Constellis lineage',
    aliases: ['Blackwater','Blackwater USA','Blackwater Worldwide','Xe Services','Academi','Constellis','Triple Canopy','Centerra'],
    category: 'private security / military contractor lineage',
    main_players: [
      { name: 'Erik Prince', role: 'Blackwater founder / former owner route', boundary: 'Track through public records, books, hearings, filings, contracts and court records only.' },
      { name: 'Constellis', role: 'current corporate lineage route', boundary: 'Track company records, contracts, subsidiaries and ownership changes.' },
      { name: 'Triple Canopy', role: 'related contractor lineage / Constellis family route', boundary: 'Track awards, contracts and corporate lineage.' }
    ],
    control_layers: ['war', 'security', 'contractors', 'public-private power', 'intelligence-adjacent systems'],
    watch_terms: ['blackwater','xe services','academi','constellis','triple canopy','centerra','erik prince'],
    record_routes_needed: ['USAspending awards', 'Court records', 'Congressional hearing material', 'SEC or corporate records where available', 'Sanctions / debarment checks', 'News signals verified against primary records']
  },
  {
    id: 'dyncorp-amentum-lineage',
    name: 'DynCorp / Amentum lineage',
    aliases: ['DynCorp','DynCorp International','Amentum'],
    category: 'defense services / logistics / support contractor',
    main_players: [
      { name: 'DynCorp International', role: 'historic contractor route', boundary: 'Track through contracts, court records, audits and corporate transactions.' },
      { name: 'Amentum', role: 'current corporate route after acquisition lineage', boundary: 'Track contracts, awards and corporate filings.' }
    ],
    control_layers: ['war', 'logistics', 'contractors', 'public money'],
    watch_terms: ['dyncorp','amentum'],
    record_routes_needed: ['USAspending awards', 'Court records', 'Inspector General reports', 'Corporate transaction records']
  },
  {
    id: 'caci-intelligence-contractor',
    name: 'CACI International',
    aliases: ['CACI','CACI International'],
    category: 'defense / intelligence / technology contractor',
    main_players: [{ name: 'CACI International', role: 'contractor entity route', boundary: 'Track contracts, filings, court records and public awards.' }],
    control_layers: ['intelligence', 'defense technology', 'surveillance', 'public money'],
    watch_terms: ['caci','caci international'],
    record_routes_needed: ['SEC filings', 'USAspending awards', 'Court records', 'Contract notices']
  },
  {
    id: 'booz-allen-intelligence-contractor',
    name: 'Booz Allen Hamilton',
    aliases: ['Booz Allen','Booz Allen Hamilton','BAH'],
    category: 'consulting / intelligence / technology contractor',
    main_players: [{ name: 'Booz Allen Hamilton', role: 'contractor entity route', boundary: 'Track filings, awards, lobbying and public contracts.' }],
    control_layers: ['intelligence', 'consulting', 'AI/data', 'public money'],
    watch_terms: ['booz allen','booz allen hamilton'],
    record_routes_needed: ['SEC filings', 'USAspending awards', 'Lobbying records', 'Court records']
  },
  {
    id: 'palantir-government-platforms',
    name: 'Palantir government platforms',
    aliases: ['Palantir','Palantir Technologies'],
    category: 'data / analytics / government platform contractor',
    main_players: [{ name: 'Palantir Technologies', role: 'platform contractor entity route', boundary: 'Track public contracts, filings, procurement and government deployment records.' }],
    control_layers: ['AI/data', 'surveillance', 'security', 'health data', 'border systems'],
    watch_terms: ['palantir','palantir technologies'],
    record_routes_needed: ['SEC filings', 'USAspending awards', 'Procurement notices', 'Court records', 'Policy documents']
  },
  {
    id: 'g4s-allied-security-lineage',
    name: 'G4S / Allied Universal security lineage',
    aliases: ['G4S','Allied Universal'],
    category: 'private security / detention / facilities contractor route',
    main_players: [{ name: 'G4S / Allied Universal', role: 'security contractor route', boundary: 'Track contracts, facility roles, legal records and procurement routes.' }],
    control_layers: ['security', 'detention', 'facilities', 'public-private power'],
    watch_terms: ['g4s','allied universal'],
    record_routes_needed: ['Procurement records', 'Court records', 'Regulatory records', 'Public contract routes']
  },
  {
    id: 'leidos-saic-lineage',
    name: 'SAIC / Leidos lineage',
    aliases: ['SAIC','Leidos','Science Applications International Corporation'],
    category: 'defense / intelligence / systems contractor lineage',
    main_players: [{ name: 'SAIC / Leidos', role: 'defense and intelligence systems route', boundary: 'Track contracts, filings, corporate split lineage and public awards.' }],
    control_layers: ['defense', 'intelligence', 'technology', 'public money'],
    watch_terms: ['saic','leidos','science applications international'],
    record_routes_needed: ['SEC filings', 'USAspending awards', 'Contract notices', 'Court records']
  }
];

const sourceRoutes = [
  { label: 'USAspending awards', url: 'https://www.usaspending.gov/search', use: 'federal awards, recipients, agencies and award values' },
  { label: 'SEC EDGAR filings', url: 'https://www.sec.gov/edgar/search/', use: 'public company filings, risk factors, subsidiaries and material events' },
  { label: 'SAM.gov', url: 'https://sam.gov/', use: 'contract opportunities, entity registrations and exclusions where available' },
  { label: 'CourtListener', url: 'https://www.courtlistener.com/', use: 'court records, opinions, dockets and named parties' },
  { label: 'OFAC sanctions', url: 'https://ofac.treasury.gov/sanctions-list-service', use: 'sanctions list checks and aliases' },
  { label: 'Justice Department releases', url: 'https://www.justice.gov/news', use: 'official legal and enforcement releases' },
  { label: 'Inspector General route', url: 'https://www.oversight.gov/', use: 'audit, investigation and oversight reports' },
  { label: 'Public Record Intake', url: 'public-record-intake.html', use: 'machine source-lane rules and evidence ladder' }
];

function matchFamily(text, family){
  const hay = String(text || '').toLowerCase();
  return family.watch_terms.some(term => hay.includes(term));
}
function relatedRecords(family){
  const out = [];
  for (const event of arr(records.events)) {
    const hay = `${event.summary} ${event.source_lane} ${event.record_type} ${arr(event.entity_names).join(' ')} ${arr(event.institution_names).join(' ')}`;
    if (matchFamily(hay, family)) out.push({ title: event.summary, url: event.source_url || 'machine-digest.html', evidence_grade: event.evidence_grade, source_lane: event.source_lane, record_type: event.record_type, missing_records: event.missing_records || [] });
  }
  for (const brief of arr(entityBriefs.briefs)) {
    const hay = `${brief.name} ${brief.at_a_glance} ${brief.plain_english_judgement}`;
    if (matchFamily(hay, family)) out.push({ title: brief.name + ' entity brief', url: `entity-briefs/${brief.id || slug(brief.name)}.html`, evidence_grade: brief.evidence_grade || 'entity brief', source_lane: 'entity-daily-briefs', record_type: 'entity_brief', missing_records: brief.missing_records || [] });
  }
  for (const profile of arr(recordReview.profiles)) {
    const hay = `${profile.name} ${arr(profile.exposure_categories).join(' ')}`;
    if (matchFamily(hay, family)) out.push({ title: profile.name + ' record review', url: `entity-exposure/${profile.id || slug(profile.name)}.html`, evidence_grade: profile.highest_evidence_grade || 'record review', source_lane: 'entity-record-review', record_type: 'record_review', missing_records: profile.missing_records || [] });
  }
  return out.slice(0, 30);
}
function relatedRelationships(family){
  return arr(relationships.relationships).filter(rel => matchFamily(`${rel.from} ${rel.to} ${arr(rel.lanes).join(' ')}`, family)).slice(0, 20);
}
function scoreFamily(records, rels, family){
  let score = family.control_layers.length * 6 + family.main_players.length * 4;
  score += records.length * 8;
  score += rels.length * 5;
  if (records.some(r => /charged|sued|sanction|fine|convicted|court/i.test(`${r.evidence_grade} ${r.record_type} ${r.title}`))) score += 20;
  return Math.round(score);
}
function level(score){
  if (score >= 90) return 'top contractor watch';
  if (score >= 55) return 'high contractor watch';
  if (score >= 30) return 'active contractor watch';
  return 'seed contractor profile';
}
const profiles = contractorFamilies.map(family => {
  const recs = relatedRecords(family);
  const rels = relatedRelationships(family);
  const score = scoreFamily(recs, rels, family);
  return { ...family, updated, source_routes: sourceRoutes, related_records: recs, relationship_candidates: rels, contractor_score: score, contractor_level: level(score), missing_records: uniq([...family.record_routes_needed, ...recs.flatMap(r => r.missing_records || [])]).slice(0, 20), watch_next: [`Search new awards for ${family.aliases[0]}.`, `Check court and oversight routes for ${family.name}.`, `Update main-player links for ${family.name}.`, `Compare contracts, subsidiaries and ownership changes.`], boundary: 'Contractor score is a public-record triage score. It is not a verdict or accusation.' };
});
const out = { updated, title: 'Private Contractor Intelligence', purpose: 'Track private military, security, intelligence, logistics, surveillance and government-platform contractors through public records, contracts, legal routes, ownership changes, main players, relationship candidates and missing records.', boundary: 'This system separates contracts, legal records, documented associations, allegations, signals and unsupported claims. Association is not guilt.', sourceRoutes, profiles };
write('data/private-contractor-intelligence.json', JSON.stringify(out, null, 2));

function card(p){ return `<article class="card redline"><span class="label">${esc(p.contractor_level)} · score ${esc(p.contractor_score)}</span><h3>${esc(p.name)}</h3><p>${esc(p.category)}</p><p><strong>Layers:</strong> ${esc(p.control_layers.join(', '))}</p><div class="cta-row small"><a class="btn" href="contractor-briefs/${esc(p.id)}.html">Open Contractor Brief</a><a class="btn alt" href="data/private-contractor-intelligence.json">JSON</a></div></article>`; }
function briefPage(p){
  const list = items => arr(items).map(x => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('') || '<li>No items yet.</li>';
  const players = arr(p.main_players).map(x => `<li><strong>${esc(x.name)}</strong> — ${esc(x.role)}<br/><em>${esc(x.boundary)}</em></li>`).join('');
  const recordsList = arr(p.related_records).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a> — ${esc(r.evidence_grade)} — ${esc(r.source_lane)}</li>`).join('') || '<li>No attached records yet. Use source routes below.</li>';
  const routes = arr(p.source_routes).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a> — ${esc(r.use)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(p.name)} Contractor Brief | Matrix Reprogrammed</title><meta name="description" content="Private contractor intelligence brief for ${esc(p.name)}."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../private-contractor-tracker.html">Contractor Tracker</a><a href="../entity-daily-briefs.html">Entity Briefs</a><a href="../evidence-vault.html">Evidence</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Private Contractor Brief</div><h1>${esc(p.name).toUpperCase()}</h1><p class="lead">${esc(p.category)} tracked through contracts, records, people, relationships and missing-document routes.</p></section><section class="section wrap split"><div class="terminal">CONTRACTOR PROFILE\n&gt; score: ${esc(p.contractor_score)}\n&gt; level: ${esc(p.contractor_level)}\n&gt; aliases: ${esc(p.aliases.join(', '))}\n&gt; boundary: public-record triage, not verdict</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(p.boundary)}</p></aside></section><section class="section wrap"><div class="grid"><article class="card"><h2>Main Players</h2><ul>${players}</ul></article><article class="card"><h2>Related Records</h2><ul>${recordsList}</ul></article><article class="card"><h2>Source Routes</h2><ul>${routes}</ul></article><article class="card"><h2>Missing Records</h2><ul>${list(p.missing_records)}</ul></article><article class="card"><h2>Watch Next</h2><ul>${list(p.watch_next)}</ul></article></div></section></main><footer class="footer wrap"><p><strong>Boundary:</strong> ${esc(p.boundary)}</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script></body></html>`;
}
for (const profile of profiles) write(`contractor-briefs/${profile.id}.html`, briefPage(profile));
const hub = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Private Contractor Tracker | Matrix Reprogrammed</title><meta name="description" content="Private contractor intelligence tracker for military, security, intelligence, logistics, surveillance and government-platform contractors."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="entity-daily-briefs.html">Entity Briefs</a><a href="entity-exposure-index.html">Record Review</a><a href="machine-intelligence.html">Machine Intelligence</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Private Contractor Intelligence</div><h1>PRIVATE CONTRACTOR TRACKER.</h1><p class="lead">Tracks contractor lineages, main players, contracts, public-money routes, legal records, ownership changes, relationship candidates and missing records.</p><div class="cta-row"><a class="btn" href="data/private-contractor-intelligence.json">Contractor JSON</a><a class="btn alt" href="downloads/private-contractor-intelligence.md">Download Brief</a></div></section><section class="section wrap split"><div class="terminal">CONTRACTOR TRACKER\n&gt; updated: ${esc(updated)}\n&gt; profiles: ${profiles.length}\n&gt; source routes: ${sourceRoutes.length}\n&gt; method: contracts + people + records + missing documents\n&gt; boundary: association is not guilt</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(out.boundary)}</p></aside></section><section class="section wrap"><h2>Contractor Profiles</h2><div class="grid">${profiles.map(card).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — follow the contract, follow the company, follow the record.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
write('private-contractor-tracker.html', hub);
const md = ['# Private Contractor Intelligence', '', `Updated: ${updated}`, '', '## Boundary', out.boundary, '', ...profiles.map(p => `## ${p.name}\n\nScore: ${p.contractor_score}\n\nLevel: ${p.contractor_level}\n\nMain players: ${p.main_players.map(x => x.name).join(', ')}\n\nMissing records: ${p.missing_records.join('; ')}\n`)].join('\n');
write('downloads/private-contractor-intelligence.md', md);
let brain = readJson('data/daily-brain-brief.json', null);
if (brain) {
  brain.privateContractorIntelligence = { updated, profileCount: profiles.length, route: 'private-contractor-tracker.html', json: 'data/private-contractor-intelligence.json', topProfiles: profiles.slice(0, 5).map(p => ({ name: p.name, score: p.contractor_score, level: p.contractor_level })), boundary: out.boundary };
  write('data/daily-brain-brief.json', JSON.stringify(brain, null, 2));
}
console.log(`Private Contractor Intelligence built: ${profiles.length} profiles.`);
