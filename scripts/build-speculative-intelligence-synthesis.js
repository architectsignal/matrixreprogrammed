const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = p => path.join(root, p);
const clean = (v, n = 1200) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const read = (p, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(p), 'utf8')); } catch { return fallback; } };
const uniq = values => [...new Set(values.filter(Boolean))];
const files = [
  'data/evidence-weighted-relationship-graph.json', 'data/entity-registry.json',
  'data/relationship-registry.json', 'data/top-52-power-deck.json',
  'data/institution-deck.json', 'data/controlled-opposition-deck.json',
  'data/investigation-ledger.json', 'data/daily-power-conclusions.json',
  'data/latest-public-drops.json', 'data/clock-wall.json', 'data/global-risk-clocks.json',
  'data/record-events.json', 'data/entity-observations.json', 'data/daily-investigation-conclusions.json'
].filter(p => fs.existsSync(at(p)));

function objects(value, source, out = [], depth = 0) {
  if (depth > 7 || out.length > 22000 || value == null) return out;
  if (Array.isArray(value)) { for (const item of value) objects(item, source, out, depth + 1); return out; }
  if (typeof value !== 'object') return out;
  if (Object.values(value).filter(v => ['string','number','boolean'].includes(typeof v)).length >= 2) out.push({ source, value });
  for (const child of Object.values(value)) if (child && typeof child === 'object') objects(child, source, out, depth + 1);
  return out;
}
const rows = files.flatMap(source => objects(read(source), source));
const text = rows.map(row => clean(Object.values(row.value).filter(v => typeof v === 'string').join(' '), 1800)).join(' ').toLowerCase();
const first = (o, keys, max = 300) => { for (const k of keys) if (typeof o?.[k] === 'string' && clean(o[k], max)) return clean(o[k], max); return ''; };
const genericAction = /^(?:increased position|reduced position|exited position|new position|mentions?|open-market or private sale|open market sale|private sale|final judgment|view files?|open files?|read more|source|filing|document|record|update|changed|unchanged|added|removed|position|transaction|judgment)$/i;
const validActor = label => label && label.length >= 3 && label.length <= 130 && label.split(/\s+/).length <= 14 && !/[.!?].{8,}/.test(label) && !genericAction.test(label) && !/(?:anonymous|redacted|unnamed|victim|survivor|minor|public record|evidence|report|brief|conclusion|record|source|unknown|other documented institutional actor)/i.test(label);
function group(name, role) {
  const h = `${name} ${role}`.toLowerCase();
  if (/bank|payment|currency|financial|asset manager|treasury|imf|bis|ecb|reserve/.test(h)) return 'money, banking and payment infrastructure';
  if (/united nations|world health|\bwho\b|oecd|european union|commission|nato|multilateral|treaty|standards/.test(h)) return 'multilateral governance and standards';
  if (/government|ministry|department|agency|regulator|parliament|congress|court|justice|commission|authority/.test(h)) return 'public authority and regulation';
  if (/intelligence|security|defen[cs]e|military|police|border|cyber/.test(h)) return 'security, intelligence and emergency power';
  if (/cloud|technology|platform|software|artificial intelligence|\bai\b|data|identity|biometric|telecom/.test(h)) return 'technology, identity, data and platforms';
  if (/contractor|consulting|procurement|vendor|infrastructure|logistics/.test(h)) return 'contractors and public-private implementation';
  if (/foundation|ngo|nonprofit|philanthrop|think tank|university/.test(h)) return 'foundations, NGOs and knowledge networks';
  if (/media|news|publisher|advertising|information/.test(h)) return 'media and information access';
  if (/health|medical|pharma|vaccine|hospital|biosecurity/.test(h)) return 'health and biosecurity systems';
  if (/religion|church|faith|interfaith|vatican/.test(h)) return 'religious and interfaith institutions';
  if (/inc\.?|corp\.?|company|holdings|capital|partners|fund|management/.test(h)) return 'corporate ownership and capital';
  return 'documented person or institution';
}
function sourceRoute(source, value) {
  const explicit = first(value, ['evidenceRoute','sourceRoute','route','detailRoute','entityRoute','page','localUrl'], 500);
  if (explicit) return explicit;
  if (/investigation|judgment|court|sec/i.test(source)) return 'daily-investigation-conclusions.html';
  if (/record-event|entity-observation|relationship/i.test(source)) return 'entity-daily-briefs.html';
  return 'daily-command-brief.html';
}
const actorMap = new Map();
for (const { source, value } of rows) {
  const role = first(value, ['documentedRole','entityRole','role','entityType','type','category','kind','sector','action','changeType','eventType','filingType'], 220) || 'Documented in the linked public record';
  const preferred = first(value, ['entityName','actorName','organizationName','institutionName','companyName','personName','subjectName','issuerName','filerName','ownerName','respondentName','defendantName','agencyName','authorityName'], 150);
  const fallback = first(value, ['entity','actor','organization','institution','company','subject','name','label'], 150);
  const label = validActor(preferred) ? preferred : validActor(fallback) ? fallback : '';
  if (!label) continue;
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const authority = first(value, ['authority','regulator','agency','court','sourceLabel','publisher','institution','organization','issuer','filer'], 220);
  const instrument = first(value, ['law','legalAuthority','legalInstrument','rule','regulation','statute','caseName','caseNumber','formType','filingType','documentTitle','title'], 260);
  const action = first(value, ['action','changeType','eventType','transactionType','status','outcome','documentedRole','role'], 220) || role;
  const summary = first(value, ['whyItMatters','plainEnglishConclusion','controlSystemMeaning','conclusion','summary','text','description','finding','implication'], 700);
  const item = actorMap.get(key) || { name: label, documentedRole: role, roleGroup: group(label, `${role} ${authority}`), authority:'', instrument:'', action:'', whyItMatters:'', sourceRoute:sourceRoute(source,value), records: 0, sources: new Set(), summaries: [] };
  item.records += 1;
  item.sources.add(source);
  if (!item.authority && authority && authority.toLowerCase() !== label.toLowerCase()) item.authority = authority;
  if (!item.instrument && instrument && !genericAction.test(instrument)) item.instrument = instrument;
  if (!item.action && action) item.action = action;
  if (!item.whyItMatters && summary) item.whyItMatters = summary;
  if (summary && item.summaries.length < 3) item.summaries.push(summary);
  actorMap.set(key, item);
}
const actors = [...actorMap.values()].map(a => {
  const sources=[...a.sources].slice(0,8);
  const whyItMatters=a.whyItMatters || a.summaries[0] || `This record places ${a.name} inside a documented decision, ownership, transaction, regulatory or implementation chain that can be tested against primary records.`;
  const specificity=(a.authority?3:0)+(a.instrument?3:0)+(a.action?2:0)+(whyItMatters?2:0)+Math.min(5,a.records);
  return { ...a, sources, summaries:uniq(a.summaries), whyItMatters, specificity, boundary:'The cited material establishes only the recorded role, action, ownership, contract, filing or relationship. It does not prove shared motive, wrongdoing or central command.' };
}).sort((a,b) => b.specificity-a.specificity || b.records-a.records).slice(0,50);

const pathways = [
  ['law-standards','Law, treaties and standards',['law','regulation','treaty','standard','directive','mandate','governance'],'Common rules can turn policy preference into cross-jurisdiction operating requirements.'],
  ['money-payments','Money, banking and payment access',['payment','bank','cbdc','digital euro','currency','wallet','settlement'],'Payment, custody and financial identity can make participation conditional.'],
  ['identity-biometrics','Identity, credentials and biometrics',['digital identity','identity','biometric','credential','passport','age verification'],'Reusable identity can connect decisions across otherwise separate services.'],
  ['data-ai-cloud','Data, cloud and AI infrastructure',['artificial intelligence','cloud','data exchange','algorithm','platform','database'],'Shared data and automated decisions can centralise practical gatekeeping.'],
  ['security-emergency','Security, intelligence and emergency powers',['security','intelligence','emergency','surveillance','cyber','defence','border'],'Crisis and security powers can accelerate integration and become permanent.'],
  ['health-mobility','Health, biosecurity and mobility',['health','pandemic','biosecurity','travel','vaccine','medical'],'Health records and emergency credentials can become cross-border access controls.'],
  ['information-access','Information, media and platform access',['media','information','moderation','search','advertising','speech'],'Visibility can be shaped through platforms, ownership, moderation and payment dependencies.'],
  ['procurement-vendors','Procurement and public-private implementation',['procurement','contract','contractor','vendor','consulting','outsourcing'],'Public authority can become dependent on private operators of critical infrastructure.']
].map(([id,title,keywords,meaning]) => ({ id,title,meaning,signalCount: keywords.reduce((n,k) => n + text.split(k).length - 1, 0), actors: actors.filter(a => keywords.some(k => `${a.name} ${a.documentedRole} ${a.roleGroup} ${a.authority} ${a.instrument}`.toLowerCase().includes(k))).slice(0,6).map(a => a.name) })).sort((a,b) => b.signalCount - a.signalCount);

const chain = [
  ['Agenda and standards','Multilateral bodies, regulators, industry groups and standards organisations define common objectives and technical requirements.'],
  ['Law, funding and procurement','Governments translate selected objectives into law, budgets, tenders, licences or compliance duties.'],
  ['Infrastructure and vendor dependency','Technology, consulting, payment, security and cloud vendors build the operating systems.'],
  ['Interoperability and shared identity','Identity, payment, health, mobility, platform and public-service systems exchange credentials or status.'],
  ['Conditional access and enforcement','Eligibility, accounts, licences, travel, benefits or payment access can be restricted across connected systems.'],
  ['Permanence and lock-in','Contracts, data standards, sunk costs and emergency measures make reversal difficult without a single world state.']
].map(([title,explanation], i) => ({ stage:i+1,title,explanation }));
const clocks = read('data/clock-wall.json',{clocks:[]}).clocks || [];
const critical = clocks.filter(c => Number(c.score) > 90).sort((a,b) => Number(b.score)-Number(a.score));
const confidence = Math.min(82, Math.round(Math.min(25, files.length*3) + Math.min(20, actors.length/2) + Math.min(20, pathways.filter(p=>p.signalCount>0).length*2.5) + Math.min(12, critical.length*3) + Math.min(5, rows.length/1000)));
const confidenceBand = confidence >= 70 ? 'substantial analytic support' : confidence >= 50 ? 'moderate analytic support' : confidence >= 30 ? 'limited analytic support' : 'insufficient analytic support';
const scenarios = [
  ['functional-convergence','Functional global governance without a single world state','speculative scenario — not a factual forecast',confidence>=60?'moderate-to-high under continuation of current signals':'moderate but incomplete','Compatible standards, public procurement and shared vendors create common governance effects while sovereignty formally remains national.',['Binding cross-jurisdiction implementation','Shared technical standards','Documented identity, payment or eligibility exchange'],['Durable decentralisation','Independent technical exit','Effective local veto and appeal']],
  ['conditional-access','Conditional-access society','speculative scenario — not a factual forecast','moderate enabling conditions; outcome not established','Identity, payment, health, mobility and platform status become linked, allowing a decision in one system to affect another.',['Mandatory linkage rules','Shared identifiers','Cross-domain enforcement records'],['Strict purpose limitation','Offline alternatives','Separated databases and effective appeal']],
  ['one-world-government-threshold','Formal one-world government threshold','high-bar speculative scenario — currently unproven','low on present evidence; functional convergence is more plausible','A central authority would require binding law-making, taxation, enforcement, adjudication and removal of meaningful national veto.',['Supranational constitutional authority','Central taxation','Direct compulsory jurisdiction'],['Sovereign vetoes','Treaty withdrawal','Competing blocs','Constitutional rejection']],
  ['one-world-currency-threshold','One-world currency or unified payment-control threshold','speculative scenario — enabling infrastructure only','low for one legal currency; moderate for interoperable digital payment governance','Common wallet, identity, settlement and compliance standards could create currency-like control across different legal currencies.',['Mandatory legal-tender consolidation','Global settlement authority','Restrictions on competing rails'],['Cash preservation','Competing currencies','Privacy-preserving offline payment']],
  ['one-world-religion-threshold','One-world religion threshold','speculative scenario — weak and currently unsupported','low without direct doctrinal and enforcement evidence','Shared ethical language would have to become mandatory doctrine backed by central religious authority and sanctions.',['Mandatory doctrine','Central religious authority','Compulsory adherence'],['Religious pluralism','Freedom of belief','Independent institutions']],
  ['fragmented-blocs','Competing digital-control blocs','alternative speculative scenario','moderate and compatible with geopolitical fragmentation','Rival blocs build incompatible identity, payment, AI, security and information regimes rather than one global system.',['Divergent standards','Bloc-specific vendors','Restricted interoperability'],['Successful global interoperability','Reduced sanctions and technical fragmentation']],
  ['decentralised-countertrend','Decentralised and rights-preserving countertrend','alternative speculative scenario','plausible where law and technology preserve exit and appeal','Open standards, privacy law, cash, judicial review, local control and competition prevent convergence from becoming coercive.',['Working opt-outs','Open-source systems','Successful legal limits'],['Mandatory central credentials','Vendor lock-in','Elimination of offline alternatives']]
].map(([id,title,status,plausibilityBand,trajectory,evidenceNeeded,disconfirmingEvidence]) => ({ id,title,status,plausibilityBand,trajectory,evidenceNeeded,disconfirmingEvidence,boundary:'Scenario analysis identifies enabling conditions and thresholds; it does not prove intent, inevitability or a secret controller.' }));
const conclusion = `The strongest current pattern is practical convergence: standards, law, procurement, private infrastructure and shared identity or data can combine into access systems that are difficult to avoid or exit. ${critical[0] ? `${critical[0].title} is the highest canonical pressure index at ${critical[0].score}%.` : ''} The key intelligence question is not whether every actor shares one plan, but whether their documented roles form an implementation chain with enforceable leverage.`;
const leading = 'If the pattern continues, the most plausible outcome is a de facto governance layer rather than one dramatic declaration: compatible rules and public-private infrastructure connect identity, payments, AI, health, security, mobility and information access. This could make world-government-like functions or currency-like controls technically possible without proving one central authority. A one-world religion claim remains weak without direct evidence of mandatory doctrine and enforcement.';
const counterpoint = 'The thesis weakens when participation remains voluntary, systems are decentralised and reversible, data stays separated, open standards preserve exit, meaningful competition exists, courts enforce rights, and primary records show parallel development rather than common enforcement.';
const watchNext = ['Voluntary identity or wallet systems becoming mandatory','Identity linked to payments, benefits, health, travel or platform access','International standards becoming law or procurement conditions','Government dependence on a small vendor group','Emergency infrastructure becoming permanent','Risk or eligibility decisions reused across unrelated systems','Legal, technical or political reversals that weaken convergence'];
const synthesis = {
  ok:true, version:'1.1.0', updated:new Date().toISOString(), title:'Speculative Intelligence Synthesis',
  evidenceLayer:{ status:'documented records and canonical site data', files, recordsInspected:rows.length, criticalClocks:critical, conclusion },
  inferenceLayer:{ status:'analytic inference — not direct proof of intent', confidenceScore:confidence, confidenceBand, confidenceMeaning:'Support for the observed convergence pattern, not probability that a scenario will occur.', pathways, implementationChain:chain, actorMap:actors },
  speculativeLayer:{ status:'scenario analysis — not fact or prediction', leadingTrajectory:leading, scenarios },
  uncertaintyLayer:{ counterpoint, watchNext, boundary:'Association, shared standards, policy similarity, ownership or technical compatibility do not establish guilt, common command, secret intent or control by a single entity.' }
};
if (pathways.length !== 8 || chain.length !== 6 || scenarios.length < 7) throw new Error('Speculative synthesis structure incomplete');
for (const id of ['one-world-government-threshold','one-world-currency-threshold','one-world-religion-threshold']) if (!scenarios.some(s => s.id===id && s.evidenceNeeded.length && s.disconfirmingEvidence.length)) throw new Error(`Missing bounded scenario ${id}`);
if (actors.some(a => genericAction.test(a.name) || /other documented institutional actor/i.test(a.name))) throw new Error('Generic action label leaked into actor map');
fs.mkdirSync(at('data'),{recursive:true}); fs.mkdirSync(at('downloads'),{recursive:true});
fs.writeFileSync(at('data/speculative-intelligence-synthesis.json'),JSON.stringify(synthesis,null,2));
const md = ['# Speculative Intelligence Synthesis','',`Updated: ${synthesis.updated}`,'','## Evidence-led conclusion','',conclusion,'',`Analytic confidence: **${confidence}/100 — ${confidenceBand}**`,'','> Pattern support only. This is not event probability.','','## Who is involved — documented roles only','',...actors.slice(0,20).map(a=>`- **${a.name}** — ${a.action || a.documentedRole}${a.authority?`; authority/institution: ${a.authority}`:''}${a.instrument?`; law, filing or instrument: ${a.instrument}`:''}. Why it matters: ${a.whyItMatters}`),'','## How the systems fit together','',...chain.map(s=>`${s.stage}. **${s.title}:** ${s.explanation}`),'','## Scenario matrix','',...scenarios.flatMap(s=>[`### ${s.title}`,'',`**Status:** ${s.status}`,'',`**Plausibility:** ${s.plausibilityBand}`,'',s.trajectory,'',`**Evidence needed:** ${s.evidenceNeeded.join('; ')}`,'',`**Would weaken it:** ${s.disconfirmingEvidence.join('; ')}`,'',`**Boundary:** ${s.boundary}`,'']),'## Overall boundary','',synthesis.uncertaintyLayer.boundary].join('\n');
fs.writeFileSync(at('downloads/speculative-intelligence-synthesis.md'),md);
module.exports = synthesis;
