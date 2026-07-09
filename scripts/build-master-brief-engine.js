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
function slug(value = 'item'){ return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'item'; }
function arr(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items){ return [...new Set(arr(items).map(clean).filter(Boolean))]; }
function scoreLevel(score){ if (score >= 85) return 'elite priority'; if (score >= 65) return 'high priority'; if (score >= 40) return 'active watch'; if (score >= 20) return 'developing'; return 'seed profile'; }
function mdList(items){ return arr(items).map(x => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') || '- No items yet.'; }
function li(items){ return arr(items).map(x => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('') || '<li>No current item recorded.</li>'; }
function linkList(items){ return arr(items).map(x => `<li><a href="${esc(x)}">${esc(x)}</a></li>`).join('') || '<li>No linked route recorded yet.</li>'; }
function recordList(items){ return arr(items).map(x => `<li><strong>${esc(x.title || x.summary || 'Record')}</strong>${x.grade ? ` · ${esc(x.grade)}` : ''}${x.url ? ` · <a href="${esc(x.url)}">source</a>` : ''}</li>`).join('') || '<li>No attached source route yet.</li>'; }
function relList(items){ return arr(items).map(x => `<li>${esc(x.from || 'source')} → ${esc(x.to || 'target')}${x.score ? ` · score ${esc(x.score)}` : ''}</li>`).join('') || '<li>No relationship candidate recorded yet.</li>'; }

const updated = new Date().toISOString();
const dailyBrain = readJson('data/daily-brain-brief.json', {});
const recordEvents = readJson('data/record-events.json', { events: [], pullSummary: [] });
const entityBriefs = readJson('data/entity-daily-briefs.json', { briefs: [] });
const recordReview = readJson('data/entity-exposure-index.json', { profiles: [] });
const contractorIntel = readJson('data/private-contractor-intelligence.json', { profiles: [] });
const changeData = readJson('data/change-detection.json', { newRecords: [], changedRecords: [], evidenceUpgrades: [], clockTriggers: [] });
const relationshipData = readJson('data/entity-relationship-scores.json', { relationships: [] });

const controlLayers = ['money','banking','gold-reserves','identity-access','ai-data','media-narrative','health','food','energy','security','war','courts-law','migration','education','foundations-ngos','public-private-contracts','intelligence-links','disclosure-gaps'];
const subjectSeeds = [
  { id:'digital-id-access', name:'Digital ID and access systems', terms:['digital id','identity','access','wallet','biometric'], layers:['identity-access','ai-data','public-private-contracts'] },
  { id:'private-contractor-power', name:'Private contractor power', terms:['contractor','private security','award','defense','security'], layers:['security','war','public-private-contracts'] },
  { id:'ai-surveillance-data', name:'AI, surveillance and data systems', terms:['ai','surveillance','cloud','data','platform'], layers:['ai-data','security','identity-access'] },
  { id:'banking-payment-rails', name:'Banking and payment rails', terms:['bank','payment','cbdc','treasury','sanctions'], layers:['money','banking','identity-access'] },
  { id:'public-health-data', name:'Health data and emergency systems', terms:['health','public health','vaccine','medical','emergency'], layers:['health','identity-access','public-private-contracts'] },
  { id:'disclosure-gaps', name:'Disclosure gaps and missing files', terms:['sealed','redacted','withheld','missing record','disclosure'], layers:['disclosure-gaps','courts-law'] },
  { id:'foundation-ngo-policy', name:'Foundation and NGO policy influence', terms:['foundation','ngo','grant','policy','world bank'], layers:['foundations-ngos','education','health'] },
  { id:'gold-reserve-custody', name:'Gold, reserve and custody systems', terms:['gold','reserve','custody','vault','central bank'], layers:['gold-reserves','banking','money'] }
];
const billionaireSeeds = [
  { name:'Elon Musk', ecosystems:['Tesla','SpaceX','X','xAI','Starlink'], layers:['ai-data','media-narrative','security','energy','public-private-contracts'] },
  { name:'Jeff Bezos', ecosystems:['Amazon','AWS','Blue Origin','Washington Post'], layers:['ai-data','media-narrative','public-private-contracts','security'] },
  { name:'Bill Gates', ecosystems:['Gates Foundation','Microsoft legacy','health and development philanthropy'], layers:['health','foundations-ngos','education','ai-data'] },
  { name:'Mark Zuckerberg', ecosystems:['Meta','Facebook','Instagram','WhatsApp'], layers:['media-narrative','ai-data','identity-access'] },
  { name:'Larry Ellison', ecosystems:['Oracle','cloud infrastructure','health-data systems'], layers:['ai-data','health','public-private-contracts'] },
  { name:'Peter Thiel', ecosystems:['Palantir','Founders Fund','political and technology networks'], layers:['ai-data','security','public-private-contracts'] },
  { name:'Bernard Arnault', ecosystems:['LVMH','luxury networks','media and culture influence routes'], layers:['media-narrative','money'] },
  { name:'Michael Bloomberg', ecosystems:['Bloomberg LP','media data terminals','philanthropy'], layers:['media-narrative','banking','foundations-ngos'] },
  { name:'Warren Buffett', ecosystems:['Berkshire Hathaway','insurance','energy','rail and finance holdings'], layers:['money','energy','food'] },
  { name:'Jensen Huang', ecosystems:['NVIDIA','AI chips','data-center infrastructure'], layers:['ai-data','energy','public-private-contracts'] }
];
const institutionSeeds = [
  { name:'World Economic Forum', kind:'policy network', layers:['public-private-contracts','foundations-ngos','media-narrative'], routes:['public-private partnerships','policy convening','corporate membership'] },
  { name:'World Health Organization', kind:'global health institution', layers:['health','public-private-contracts','foundations-ngos'], routes:['health policy','emergency guidance','member-state route'] },
  { name:'World Bank', kind:'development finance institution', layers:['money','foundations-ngos','public-private-contracts'], routes:['development finance','projects','procurement'] },
  { name:'International Monetary Fund', kind:'monetary institution', layers:['money','banking','policy'], routes:['financial surveillance','conditionality','country programs'] },
  { name:'Federal Reserve', kind:'central bank', layers:['money','banking','gold-reserves'], routes:['monetary policy','bank regulation','reserve system'] },
  { name:'European Commission', kind:'supranational policy body', layers:['identity-access','migration','public-private-contracts'], routes:['regulation','procurement','digital policy'] },
  { name:'NATO', kind:'security alliance', layers:['security','war','public-private-contracts'], routes:['defense policy','contractor ecosystem','member-state procurement'] },
  { name:'United Nations', kind:'global institution', layers:['foundations-ngos','migration','health','education'], routes:['agencies','programs','global policy'] }
];

function eventText(e){ return `${e.summary} ${e.source_lane} ${e.record_type} ${arr(e.entity_names).join(' ')} ${arr(e.institution_names).join(' ')} ${arr(e.control_layers).join(' ')}`.toLowerCase(); }
function matchingEvents(terms){ return arr(recordEvents.events).filter(e => terms.some(t => eventText(e).includes(String(t).toLowerCase()))).slice(0, 30); }
function matchingBriefs(name){ const key = slug(name); return arr(entityBriefs.briefs).filter(b => slug(b.name).includes(key) || key.includes(slug(b.name))).slice(0,5); }
function matchingReviews(name){ const key = slug(name); return arr(recordReview.profiles).filter(p => slug(p.name).includes(key) || key.includes(slug(p.name))).slice(0,5); }
function layerScore(layers, records, rels){ const out = {}; for (const layer of controlLayers) out[layer] = 0; for (const layer of arr(layers)) if (out[layer] !== undefined) out[layer] += 20; for (const r of arr(records)) for (const l of arr(r.control_layers)) if (out[l] !== undefined) out[l] += 10; for (const rel of arr(rels)) for (const l of arr(rel.control_layers)) if (out[l] !== undefined) out[l] += 6; return Object.fromEntries(Object.entries(out).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1])); }
function qualityForBrief(brief){
  const sources = arr(brief.source_routes).length;
  const missing = arr(brief.missing_records).length;
  const connections = arr(brief.connections).length;
  const hasJudgement = clean(brief.plain_english_judgement).length > 20;
  const score = Math.min(100, sources*18 + connections*12 + missing*5 + (hasJudgement ? 20 : 0));
  return { id: brief.id, name: brief.name, score, level: scoreLevel(score), source_strength: Math.min(100, sources*25), relationship_depth: Math.min(100, connections*20), missing_record_pressure: Math.min(100, missing*14), reader_friendliness: hasJudgement ? 85 : 35 };
}

const topEntityBriefs = arr(entityBriefs.briefs).slice(0, 80);
const briefQuality = topEntityBriefs.map(qualityForBrief).sort((a,b)=>b.score-a.score);
const missingRecords = [];
for (const brief of topEntityBriefs) for (const record of arr(brief.missing_records)) missingRecords.push({ entity: brief.name, record, route: `entity-briefs/${brief.id || slug(brief.name)}.html`, type:'entity brief' });
for (const profile of arr(recordReview.profiles).slice(0, 80)) for (const record of arr(profile.missing_records)) missingRecords.push({ entity: profile.name, record, route: `entity-exposure/${profile.id || slug(profile.name)}.html`, type:'record review' });
for (const profile of arr(contractorIntel.profiles)) for (const record of arr(profile.missing_records)) missingRecords.push({ entity: profile.name, record, route: `contractor-briefs/${profile.id}.html`, type:'contractor profile' });
const missingOut = { updated, title:'Missing Record Machine', purpose:'Turn gaps into watch triggers: contracts, dockets, filings, ownership records, oversight reports, counter-sources and primary documents.', boundary:'A missing record is a watch trigger, not proof.', records: missingRecords.slice(0, 300) };
write('data/missing-records.json', JSON.stringify(missingOut, null, 2));

const billionaireProfiles = billionaireSeeds.map(seed => {
  const terms = [seed.name, ...seed.ecosystems];
  const events = matchingEvents(terms);
  const briefs = matchingBriefs(seed.name);
  const reviews = matchingReviews(seed.name);
  const rels = arr(relationshipData.relationships).filter(r => terms.some(t => `${r.from} ${r.to}`.toLowerCase().includes(t.toLowerCase()))).slice(0,20);
  const scores = layerScore(seed.layers, events, rels);
  const controlScore = Math.min(100, Object.values(scores).reduce((a,b)=>a+b,0) + events.length*3 + rels.length*4 + reviews.length*8);
  return { id: slug(seed.name), name: seed.name, type:'billionaire / elite-network watch seed', ecosystems: seed.ecosystems, control_layers: seed.layers, control_layer_scores: scores, control_score: controlScore, level: scoreLevel(controlScore), latest_records: events.slice(0,8).map(e => ({ title:e.summary, url:e.source_url, grade:e.evidence_grade })), entity_briefs: briefs.map(b => `entity-briefs/${b.id || slug(b.name)}.html`), record_reviews: reviews.map(p => `entity-exposure/${p.id || slug(p.name)}.html`), relationship_candidates: rels.slice(0,8), missing_records: ['Current beneficial ownership and voting-control record where relevant','Public contracts touching the ecosystem','Foundation grant routes where relevant','Lobbying or political funding routes where relevant','Legal/regulatory records and counter-sources'], watch_next: ['New filings','New contracts','New court or regulatory records','New foundation or policy-route records'], boundary:'This is a control-influence tracker seed. It is not a claim of wrongdoing.' };
});
write('data/billionaire-control-index.json', JSON.stringify({ updated, title:'Billionaire Control Tracker', boundary:'Watchlist profiles track control-layer exposure and public records, not private intent.', profiles:billionaireProfiles }, null, 2));

const institutionProfiles = institutionSeeds.map(seed => {
  const terms = [seed.name, ...seed.routes];
  const events = matchingEvents(terms);
  const rels = arr(relationshipData.relationships).filter(r => terms.some(t => `${r.from} ${r.to} ${arr(r.lanes).join(' ')}`.toLowerCase().includes(t.toLowerCase()))).slice(0,20);
  const scores = layerScore(seed.layers, events, rels);
  const controlScore = Math.min(100, Object.values(scores).reduce((a,b)=>a+b,0) + events.length*4 + rels.length*5);
  return { id:slug(seed.name), name:seed.name, kind:seed.kind, control_layers:seed.layers, routes:seed.routes, control_layer_scores:scores, control_score:controlScore, level:scoreLevel(controlScore), latest_records:events.slice(0,8).map(e=>({title:e.summary,url:e.source_url,grade:e.evidence_grade})), relationship_candidates:rels.slice(0,8), missing_records:['Funding route','Board / leadership record','Partner companies','Procurement or grant route','Legal, audit or oversight record','Counter-source route'], watch_next:['Policy changes','Procurement records','Partner announcements','Legal or oversight records'], boundary:'Institution profile tracks public-record power routes and missing records.' };
});
write('data/institution-control-index.json', JSON.stringify({ updated, title:'Institution Control Tracker', boundary:'Institution profiles describe public-record routes, partnerships and missing documents.', profiles:institutionProfiles }, null, 2));

const subjectProfiles = subjectSeeds.map(seed => {
  const events = matchingEvents(seed.terms);
  const relatedEntities = uniq(events.flatMap(e => [...arr(e.entity_names), ...arr(e.institution_names)])).slice(0,25);
  const rels = arr(relationshipData.relationships).filter(r => seed.terms.some(t => `${r.from} ${r.to} ${arr(r.lanes).join(' ')}`.toLowerCase().includes(t.toLowerCase()))).slice(0,12);
  return { id:seed.id, name:seed.name, control_layers:seed.layers, latest_records:events.slice(0,12).map(e=>({title:e.summary,url:e.source_url,grade:e.evidence_grade,lane:e.source_lane})), top_entities:relatedEntities, relationship_candidates:rels, missing_records:['Primary record route','Entity brief links','Counter-source route','Court/filing/contract route where relevant'], watch_next:['New records in this subject lane','Repeated entities','Evidence upgrades','Contradictions'], boundary:'Subject briefs collect signals and records by topic; they do not prove a claim by themselves.' };
});
write('data/subject-briefs.json', JSON.stringify({ updated, title:'Subject Brief Engine', boundary:'Subject pages group records by control topic with evidence grades.', subjects:subjectProfiles }, null, 2));

const contradictions = [];
const grouped = {};
for (const e of arr(recordEvents.events)) {
  const key = slug(arr(e.entity_names)[0] || arr(e.institution_names)[0] || 'unknown');
  grouped[key] = grouped[key] || [];
  grouped[key].push(e);
}
for (const [name, group] of Object.entries(grouped)) {
  if (!group || group.length < 2) continue;
  const grades = uniq(group.map(e => e.evidence_grade));
  const lanes = uniq(group.map(e => e.source_lane));
  if (grades.length > 1 || lanes.length > 1) contradictions.push({ id:name, entity:clean(arr(group[0].entity_names)[0] || arr(group[0].institution_names)[0] || name), issue:`Mixed source lanes/grades: ${grades.join(', ')} across ${lanes.join(', ')}`, records:group.slice(0,5) });
}
write('data/contradictions.json', JSON.stringify({ updated, title:'Contradiction Watch', boundary:'Contradictions are review prompts, not findings.', contradictions: contradictions.slice(0,100) }, null, 2));

const mainPlayers = new Map();
for (const p of arr(contractorIntel.profiles)) for (const player of arr(p.main_players)) {
  const id = slug(player.name); const prior = mainPlayers.get(id) || { id, name:player.name, roles:[], companies:[], boundaries:[], watch_next:[] };
  prior.roles = uniq([...prior.roles, player.role]); prior.companies = uniq([...prior.companies, p.name]); prior.boundaries = uniq([...prior.boundaries, player.boundary]); prior.watch_next = uniq([...prior.watch_next, `Watch company and public-record routes linked to ${p.name}.`]); mainPlayers.set(id, prior);
}
for (const b of billionaireProfiles) { const prior = mainPlayers.get(b.id) || { id:b.id, name:b.name, roles:[], companies:[], boundaries:[], watch_next:[] }; prior.roles = uniq([...prior.roles, 'billionaire / control-layer watch seed']); prior.companies = uniq([...prior.companies, ...b.ecosystems]); prior.boundaries = uniq([...prior.boundaries, b.boundary]); prior.watch_next = uniq([...prior.watch_next, ...b.watch_next]); mainPlayers.set(b.id, prior); }
write('data/main-player-profiles.json', JSON.stringify({ updated, title:'Main Player Profiles', boundary:'Main player profiles track roles, companies and record routes only.', profiles:[...mainPlayers.values()].slice(0,200) }, null, 2));

const timelines = topEntityBriefs.slice(0,80).map(b => ({ id:b.id, name:b.name, events:[...arr(b.source_routes).map((r,i)=>({ date:b.updated || updated, order:i, title:r.title || r.url, url:r.url, grade:r.grade })), ...arr(changeData.newRecords).filter(r => slug(r.summary || '').includes(slug(b.name))).map(r=>({date:r.date,title:r.summary,url:r.source_url,grade:r.evidence_grade}))].slice(0,20), boundary:'Entity timeline is generated from attached source routes and change records.' }));
write('data/entity-timelines.json', JSON.stringify({ updated, title:'Entity Timelines', boundary:'Timelines show record order, not hidden intent.', timelines }, null, 2));

const command = { updated, title:'Daily Command Brief', boundary:'Command brief summarizes machine outputs with source routes and evidence boundaries.', topMovements: arr(changeData.newRecords).slice(0,10), topEntityChanges: topEntityBriefs.slice(0,10).map(b=>({name:b.name, judgement:b.plain_english_judgement, route:`entity-briefs/${b.id || slug(b.name)}.html`})), topContractors: arr(contractorIntel.profiles).slice(0,10).map(p=>({name:p.name, score:p.contractor_score, route:`contractor-briefs/${p.id}.html`})), topBillionaires:billionaireProfiles.slice(0,10), topInstitutions:institutionProfiles.slice(0,10), missingRecords:missingRecords.slice(0,20), contradictions:contradictions.slice(0,10), watchNext: uniq([...arr(dailyBrain.tomorrowWatchList), ...subjectProfiles.flatMap(s=>s.watch_next)]).slice(0,20) };
write('data/daily-command-brief.json', JSON.stringify(command, null, 2));
write('data/brief-quality-report.json', JSON.stringify({ updated, title:'Brief Quality Report', boundary:'Quality scores prioritize source strength, relationship depth, missing-record pressure and reader clarity.', briefs:briefQuality }, null, 2));

function card(title, text, href){ return `<article class="card redline"><h3>${esc(title)}</h3><p>${esc(text)}</p>${href ? `<a class="btn alt" href="${esc(href)}">Open</a>` : ''}</article>`; }
function page(title, lead, cards, buttons=''){ return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="${esc(lead)}"/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Command Brief</a><a href="entity-daily-briefs.html">Entity Briefs</a><a href="private-contractor-tracker.html">Contractors</a><a href="source-intake.html">Submit Source</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Master Brief Engine</div><h1>${esc(title).toUpperCase()}</h1><p class="lead">${esc(lead)}</p><p><strong>Evidence boundary:</strong> Inclusion means public-record relevance. It does not prove wrongdoing, hidden control, shared intent, or conspiracy.</p><div class="cta-row">${buttons}</div></section><section class="section wrap"><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>Boundary:</strong> record grade first, conclusion second, missing record always visible.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`; }
write('daily-command-brief.html', page('Daily Command Brief','Top movements, entity changes, contractor signals, billionaire and institution trackers, missing records, contradictions and watch-next triggers.', [card('Top Movements', `${command.topMovements.length} new record movement(s).`, 'data/daily-command-brief.json'), card('Contractor Signals', `${command.topContractors.length} contractor profiles ranked.`, 'private-contractor-tracker.html'), card('Missing Records', `${command.missingRecords.length} priority missing-record prompts.`, 'daily-missing-records.html'), card('Billionaire Tracker', `${command.topBillionaires.length} elite-network seed profiles.`, 'billionaire-control-tracker.html'), card('Institution Tracker', `${command.topInstitutions.length} institution profiles.`, 'institution-control-tracker.html'), card('Contradiction Watch', `${command.contradictions.length} review prompts.`, 'contradiction-watch.html')].join(''), '<a class="btn" href="data/daily-command-brief.json">Command JSON</a>'));
write('brief-quality-report.html', page('Brief Quality Report','Scores briefs by source strength, relationship depth, missing-record pressure and reader clarity.', briefQuality.slice(0,60).map(b=>card(`${b.name} — ${b.level}`, `Quality ${b.score}/100 · source ${b.source_strength} · relationship ${b.relationship_depth}`, `entity-briefs/${b.id}.html`)).join(''), '<a class="btn" href="data/brief-quality-report.json">Quality JSON</a>'));
write('daily-missing-records.html', page('Daily Missing Records','A machine-readable watch queue of contracts, dockets, filings, ownership records, oversight reports, counter-sources and primary documents.', missingRecords.slice(0,80).map(r=>card(r.entity, `${r.record} · ${r.type}`, r.route)).join(''), '<a class="btn" href="data/missing-records.json">Missing Records JSON</a>'));
write('billionaire-control-tracker.html', page('Billionaire Control Tracker','Watchlist profiles for elite-network control layers, ecosystem routes, source gaps and public-record signals.', billionaireProfiles.map(p=>card(`${p.name} — ${p.level}`, `Control score ${p.control_score}/100 · ${p.ecosystems.join(', ')}`, `billionaire-briefs/${p.id}.html`)).join(''), '<a class="btn" href="data/billionaire-control-index.json">Billionaire JSON</a>'));
write('institution-control-tracker.html', page('Institution Control Tracker','Institution profiles for policy bodies, global institutions, finance, health, security and public-private control routes.', institutionProfiles.map(p=>card(`${p.name} — ${p.level}`, `Control score ${p.control_score}/100 · ${p.kind}`, `institution-briefs/${p.id}.html`)).join(''), '<a class="btn" href="data/institution-control-index.json">Institution JSON</a>'));
write('subject-briefs.html', page('Subject Briefs','Briefs by control topic: digital ID, contractor power, AI/data, banking rails, health systems, disclosure gaps and foundation/NGO policy routes.', subjectProfiles.map(p=>card(p.name, `${p.latest_records.length} record(s), ${p.top_entities.length} linked entity seed(s).`, `subject-briefs/${p.id}.html`)).join(''), '<a class="btn" href="data/subject-briefs.json">Subject JSON</a>'));
write('contradiction-watch.html', page('Contradiction Watch','Flags mixed grades, cross-lane conflicts and review prompts that need counter-sources or primary records.', (contradictions.length ? contradictions : [{entity:'No contradictions detected', issue:'The machine will flag conflicts when records diverge.', id:'none'}]).slice(0,60).map(c=>card(c.entity, c.issue, 'data/contradictions.json')).join(''), '<a class="btn" href="data/contradictions.json">Contradictions JSON</a>'));
write('main-player-profiles.html', page('Main Player Profiles','Profiles for main players, founders, executives, billionaire watch seeds and company roles.', [...mainPlayers.values()].slice(0,80).map(p=>card(p.name, `${p.roles.join(', ')} · ${p.companies.slice(0,5).join(', ')}`, `main-players/${p.id}.html`)).join(''), '<a class="btn" href="data/main-player-profiles.json">Main Players JSON</a>'));
write('entity-timelines.html', page('Entity Timelines','Entity timelines generated from source routes, change records and brief events.', timelines.slice(0,80).map(t=>card(t.name, `${t.events.length} timeline item(s).`, `entity-timelines/${t.id}.html`)).join(''), '<a class="btn" href="data/entity-timelines.json">Timelines JSON</a>'));

function detailPage(folder, item, body){ write(`${folder}/${item.id}.html`, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(item.name)} | Matrix Reprogrammed</title><meta name="description" content="Reader-ready tracker brief with source routes, missing records, watch triggers and evidence boundary."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../reader-experience.css"/><link rel="stylesheet" href="../fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../daily-command-brief.html">Daily Brief</a><a href="../evidence-vault.html">Evidence</a><a href="../daily-missing-records.html">Missing Records</a><a href="../source-intake.html">Submit Source</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">tracker brief</div><h1>${esc(item.name).toUpperCase()}</h1><p class="lead">${esc(item.level || item.kind || 'public-record watch profile')}</p><div class="cta-row"><a class="btn" href="../daily-command-brief.html">Daily Command Brief</a><a class="btn alt" href="../evidence-vault.html">Evidence Vault</a><a class="btn alt" href="../source-intake.html">Submit Source</a></div></section><section class="section wrap split"><div class="terminal">TRACKER BRIEF\n-&gt; overview\n-&gt; public-record routes\n-&gt; source records\n-&gt; relationship routes\n-&gt; missing records\n-&gt; watch next</div><aside class="card redline"><h2>Evidence boundary</h2><p>${esc(item.boundary || 'This page maps public-record relevance and missing records. It is not a claim of wrongdoing.')}</p></aside></section>${body}</main><footer class="footer wrap"><p><strong>Boundary:</strong> public-record tracking, not a conclusion of intent or wrongdoing.</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script></body></html>`); }
for (const p of billionaireProfiles) detailPage('billionaire-briefs', p, `<section class="section wrap"><div class="grid"><article class="card redline"><h2>Why this profile is tracked</h2><p>${esc(p.name)} touches these public-record control layers: ${esc(p.control_layers.join(', '))}. This is a watch profile, not an accusation.</p></article><article class="card"><h2>Ecosystems / routes</h2><ul>${li(p.ecosystems)}</ul></article><article class="card"><h2>Layer scores</h2><pre>${esc(JSON.stringify(p.control_layer_scores, null, 2))}</pre></article><article class="card redline"><h2>Attached source records</h2><ul>${recordList(p.latest_records)}</ul></article><article class="card"><h2>Related entity briefs</h2><ul>${linkList(p.entity_briefs)}</ul></article><article class="card"><h2>Record-review routes</h2><ul>${linkList(p.record_reviews)}</ul></article><article class="card"><h2>Relationship candidates</h2><ul>${relList(p.relationship_candidates)}</ul></article><article class="card redline"><h2>Missing records</h2><ul>${li(p.missing_records)}</ul></article><article class="card"><h2>Watch next</h2><ul>${li(p.watch_next)}</ul></article><article class="card"><h2>What cannot be concluded</h2><p>Public proximity to companies, contracts, institutions, platforms, policy routes or filings is not proof of hidden intent. Claims upgrade only through primary records.</p></article></div></section>`);
for (const p of institutionProfiles) detailPage('institution-briefs', p, `<section class="section wrap"><div class="grid"><article class="card redline"><h2>Why this institution is tracked</h2><p>${esc(p.name)} is tracked as a ${esc(p.kind)} with public-record routes through ${esc(p.routes.join(', '))}.</p></article><article class="card"><h2>Control layers</h2><ul>${li(p.control_layers)}</ul></article><article class="card"><h2>Known routes</h2><ul>${li(p.routes)}</ul></article><article class="card redline"><h2>Attached source records</h2><ul>${recordList(p.latest_records)}</ul></article><article class="card"><h2>Relationship candidates</h2><ul>${relList(p.relationship_candidates)}</ul></article><article class="card redline"><h2>Missing records</h2><ul>${li(p.missing_records)}</ul></article><article class="card"><h2>Watch next</h2><ul>${li(p.watch_next)}</ul></article><article class="card"><h2>What cannot be concluded</h2><p>An institution appearing in a route does not prove secret control or misconduct. The page shows records to check and source gaps to close.</p></article></div></section>`);
for (const p of subjectProfiles) detailPage('subject-briefs', p, `<section class="section wrap"><div class="grid"><article class="card redline"><h2>Subject lane</h2><p>This topic groups records and signals around ${esc(p.name)}.</p></article><article class="card"><h2>Control layers</h2><ul>${li(p.control_layers)}</ul></article><article class="card redline"><h2>Latest records</h2><ul>${recordList(p.latest_records)}</ul></article><article class="card"><h2>Top entities</h2><ul>${li(p.top_entities)}</ul></article><article class="card"><h2>Relationship candidates</h2><ul>${relList(p.relationship_candidates)}</ul></article><article class="card redline"><h2>Missing records</h2><ul>${li(p.missing_records)}</ul></article><article class="card"><h2>Watch next</h2><ul>${li(p.watch_next)}</ul></article></div></section>`);
for (const p of [...mainPlayers.values()].slice(0,120)) detailPage('main-players', p, `<section class="section wrap"><div class="grid"><article class="card redline"><h2>Role summary</h2><ul>${li(p.roles)}</ul></article><article class="card"><h2>Companies / ecosystems</h2><ul>${li(p.companies)}</ul></article><article class="card redline"><h2>Boundary</h2><ul>${li(p.boundaries)}</ul></article><article class="card"><h2>Watch next</h2><ul>${li(p.watch_next)}</ul></article></div></section>`);
for (const t of timelines) detailPage('entity-timelines', t, `<section class="section wrap"><div class="grid"><article class="card redline"><h2>Timeline boundary</h2><p>${esc(t.boundary)}</p></article><article class="card"><h2>Timeline</h2><ul>${li(t.events.map(e=>`${e.date || updated}: ${e.title} (${e.grade || 'grade pending'})`))}</ul></article></div></section>`);

write('downloads/daily-command-brief.md', `# Daily Command Brief\n\nUpdated: ${updated}\n\n## Top Contractor Signals\n\n${mdList(command.topContractors.map(x=>`${x.name}: ${x.score}`))}\n\n## Missing Records\n\n${mdList(missingRecords.slice(0,40).map(x=>`${x.entity}: ${x.record}`))}`);
write('downloads/master-brief-engine.md', `# Master Brief Engine\n\nUpdated: ${updated}\n\nGenerated command brief, brief quality, missing records, billionaire tracker, institution tracker, subject briefs, contradiction watch, main-player profiles and entity timelines.`);
write('data/master-brief-engine.json', JSON.stringify({ updated, outputs:['daily-command-brief.html','brief-quality-report.html','daily-missing-records.html','billionaire-control-tracker.html','institution-control-tracker.html','subject-briefs.html','contradiction-watch.html','main-player-profiles.html','entity-timelines.html'], boundary:'Master engine improves readability and linking while keeping source-grade boundaries.' }, null, 2));
let brain = dailyBrain;
if (brain && typeof brain === 'object') {
  brain.masterBriefEngine = { updated, route:'daily-command-brief.html', briefQualityRoute:'brief-quality-report.html', missingRecordsRoute:'daily-missing-records.html', billionaireTrackerRoute:'billionaire-control-tracker.html', institutionTrackerRoute:'institution-control-tracker.html', subjectBriefsRoute:'subject-briefs.html', contradictionWatchRoute:'contradiction-watch.html', mainPlayersRoute:'main-player-profiles.html', entityTimelinesRoute:'entity-timelines.html', boundary:'Master brief engine adds readable command intelligence without replacing source review.' };
  write('data/daily-brain-brief.json', JSON.stringify(brain, null, 2));
}
console.log('Master Brief Engine built with rich reader-ready pages, evidence boundaries, records, missing files and watch triggers.');