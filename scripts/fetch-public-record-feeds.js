const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const pullsDir = path.join(dataDir, 'source-pulls');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(pullsDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const updated = new Date().toISOString();
const RUNNER_VERSION = 'machine-feed-runner-2026-07-04-b';
const USER_AGENT = process.env.MATRIX_FEED_USER_AGENT || 'MatrixReprogrammedPublicRecordBot/1.0 contact: public-record-intake';
const FETCH_TIMEOUT_MS = Number(process.env.MATRIX_FEED_TIMEOUT_MS || 4500);
const MAX_EVENTS_PER_PULL = Number(process.env.MATRIX_FEED_MAX_EVENTS || 6);

function file(name) { return path.join(root, name); }
function write(name, value) { fs.mkdirSync(path.dirname(file(name)), { recursive: true }); fs.writeFileSync(file(name), value); }
function readJson(name, fallback) { try { const full = file(name); return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : fallback; } catch { return fallback; } }
function esc(value = '') { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function clean(value = '') { return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function slug(value = 'record') { return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'record'; }
function arr(value) { return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
function uniq(items) { return [...new Set(arr(items).map(clean).filter(Boolean))]; }

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json,text/plain,*/*', ...(options.headers || {}) };
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, url, fetchedAt: updated, body, bodyPreview: typeof body === 'string' ? body.slice(0, 1000) : undefined };
  } catch (error) {
    return { ok: false, status: 0, url, fetchedAt: updated, error: error.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function getByPath(obj, keys = []) {
  let current = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}
function firstArray(...values) {
  for (const value of values) if (Array.isArray(value)) return value;
  return [];
}
function csvRows(text, limit = 10) {
  if (typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, limit + 1);
  const header = (lines.shift() || '').split(',').map(x => x.replace(/^"|"$/g, '').trim());
  return lines.map(line => {
    const cols = line.split(',').map(x => x.replace(/^"|"$/g, '').trim());
    const row = {};
    header.forEach((h, i) => { row[h || `field_${i}`] = cols[i] || ''; });
    return row;
  });
}

const lanes = [
  {
    id: 'federal-register-policy',
    name: 'Federal Register latest policy records',
    output: 'data/source-pulls/federal-register-latest.json',
    method: 'GET',
    url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=10&order=newest&conditions%5Bterm%5D=digital%20identity%20OR%20emergency%20OR%20surveillance%20OR%20bank',
    recordType: 'rule_or_notice',
    evidenceGrade: 'documented association',
    controlLayers: ['policy', 'emergency_power', 'identity_access'],
    sendTo: ['daily-brain-brief', 'global-risk-clocks', 'control-structure', 'search-index'],
    items: pull => firstArray(getByPath(pull, ['body', 'results'])),
    normalize: item => ({ title: item.title, date: item.publication_date, source_url: item.html_url || item.pdf_url, record_id: item.document_number, names: arr(item.agencies).map(a => a.name) })
  },
  {
    id: 'sec-edgar-filings',
    name: 'SEC EDGAR company tickers snapshot',
    output: 'data/source-pulls/sec-edgar-watch.json',
    method: 'GET',
    url: 'https://www.sec.gov/files/company_tickers.json',
    recordType: 'company_registry_snapshot',
    evidenceGrade: 'documented association',
    controlLayers: ['money', 'companies', 'ownership'],
    sendTo: ['power-entities', 'evidence-vault', 'outcome-briefings', 'search-index'],
    items: pull => Object.values(pull.body || {}).slice(0, 12),
    normalize: item => ({ title: `${item.title || 'Company'} (${item.ticker || 'ticker unknown'})`, date: updated.slice(0, 10), source_url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', record_id: item.cik_str ? `CIK${String(item.cik_str).padStart(10, '0')}` : item.ticker, names: [item.title, item.ticker] })
  },
  {
    id: 'courtlistener-court-records',
    name: 'CourtListener court record signal',
    output: 'data/source-pulls/courtlistener-watch.json',
    method: 'GET',
    url: 'https://www.courtlistener.com/api/rest/v4/search/?q=Epstein&type=o&order_by=dateFiled%20desc',
    recordType: 'court_record_signal',
    evidenceGrade: 'charged / sued',
    controlLayers: ['courts', 'litigation', 'disclosure'],
    sendTo: ['evidence-vault', 'epstein-files', 'record-intake-queue', 'black-file'],
    items: pull => firstArray(getByPath(pull, ['body', 'results'])),
    normalize: item => ({ title: item.caseName || item.caseNameFull || item.suitNature || item.absolute_url || 'Court record', date: item.dateFiled || item.dateArgued || item.dateCreated, source_url: item.absolute_url ? `https://www.courtlistener.com${item.absolute_url}` : 'https://www.courtlistener.com/help/api/', record_id: item.id || item.cluster_id, names: [item.caseName, item.court, item.docketNumber] })
  },
  {
    id: 'usaspending-contracts',
    name: 'USAspending public awards signal',
    output: 'data/source-pulls/usaspending-watch.json',
    method: 'POST',
    url: 'https://api.usaspending.gov/api/v2/search/spending_by_award/',
    body: { filters: { keyword_search: ['digital identity', 'biometric', 'surveillance', 'cloud'] }, fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Start Date', 'End Date'], page: 1, limit: 10, sort: 'Award Amount', order: 'desc' },
    recordType: 'contract_or_award',
    evidenceGrade: 'documented association',
    controlLayers: ['money', 'contractors', 'public_private'],
    sendTo: ['power-entities', 'evidence-vault', 'outcome-briefings', 'search-index'],
    items: pull => firstArray(getByPath(pull, ['body', 'results'])),
    normalize: item => ({ title: `${item['Recipient Name'] || item.recipient_name || 'Recipient'} — ${item['Awarding Agency'] || item.awarding_agency || 'Agency'}`, date: item['Start Date'] || item.period_of_performance_start_date, source_url: 'https://www.usaspending.gov/search', record_id: item['Award ID'] || item.generated_unique_award_id, names: [item['Recipient Name'], item['Awarding Agency'], item.recipient_name, item.awarding_agency] })
  },
  {
    id: 'ofac-sanctions',
    name: 'OFAC sanctions CSV snapshot',
    output: 'data/source-pulls/ofac-watch.json',
    method: 'GET',
    url: 'https://www.treasury.gov/ofac/downloads/sdn.csv',
    recordType: 'sanctions_record',
    evidenceGrade: 'documented association',
    controlLayers: ['sanctions', 'money', 'security'],
    sendTo: ['evidence-vault', 'power-entities', 'search-index'],
    items: pull => csvRows(pull.body, 12),
    normalize: item => ({ title: item.SDN_Name || item.field_1 || item[1] || 'OFAC sanctions entry', date: updated.slice(0, 10), source_url: 'https://ofac.treasury.gov/sanctions-list-service', record_id: item.Ent_num || item.field_0 || item[0], names: [item.SDN_Name, item.field_1] })
  },
  {
    id: 'world-bank-projects',
    name: 'World Bank project search',
    output: 'data/source-pulls/worldbank-watch.json',
    method: 'GET',
    url: 'https://search.worldbank.org/api/v2/projects?format=json&rows=10&fl=project_name,countryname,sector1,boardapprovaldate,totalamt,impagency',
    recordType: 'global_project_record',
    evidenceGrade: 'documented association',
    controlLayers: ['development_finance', 'infrastructure', 'global_money'],
    sendTo: ['control-structure', 'power-entities', 'global-risk-clocks'],
    items: pull => Object.values(getByPath(pull, ['body', 'projects']) || {}).slice(0, 12),
    normalize: item => ({ title: item.project_name || item.id || 'World Bank project', date: item.boardapprovaldate, source_url: 'https://search.worldbank.org/api/v2/projects', record_id: item.id, names: [item.impagency, item.countryname, item.sector1] })
  },
  {
    id: 'news-signal-not-evidence',
    name: 'GDELT early warning signal',
    output: 'data/source-pulls/news-signal-watch.json',
    method: 'GET',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22digital%20ID%22%20OR%20%22central%20bank%22%20OR%20%22sealed%20records%22&mode=artlist&format=json&maxrecords=10&sort=hybridrel',
    recordType: 'news_signal',
    evidenceGrade: 'signal only',
    controlLayers: ['narrative', 'early_warning', 'media'],
    sendTo: ['live-intel', 'daily-brain-brief'],
    items: pull => firstArray(getByPath(pull, ['body', 'articles'])),
    normalize: item => ({ title: item.title, date: item.seendate, source_url: item.url, record_id: item.url, names: [item.domain, item.sourceCountry] })
  }
];

function eventFrom(lane, item, normalized, index) {
  const title = clean(normalized.title || `${lane.name} item ${index + 1}`);
  const names = uniq(normalized.names || []);
  return {
    id: `${lane.id}-${slug(normalized.record_id || title)}-${index + 1}`,
    date: clean(normalized.date || updated.slice(0, 10)),
    pulled_at: updated,
    runner_version: RUNNER_VERSION,
    source_lane: lane.id,
    source_name: lane.name,
    entity_names: names,
    institution_names: names.filter(name => /agency|department|ministry|bank|commission|court|treasury|foundation|university|group|inc|corp|ltd|llc|plc|company/i.test(name)),
    control_layers: lane.controlLayers,
    record_type: lane.recordType,
    evidence_grade: lane.evidenceGrade,
    source_url: normalized.source_url || lane.url,
    source_record_id: normalized.record_id || null,
    summary: title,
    missing_records: lane.evidenceGrade === 'signal only' ? ['Find the primary record before upgrading this signal.'] : ['Confirm the primary record page, PDF, docket, filing, award notice or registry record.'],
    send_to: lane.sendTo,
    boundary: lane.evidenceGrade === 'signal only' ? 'Signal only. Do not present as evidence without a primary record.' : 'Documented source route. Interpret only within the evidence grade.'
  };
}

async function main() {
  const pulls = [];
  const events = [];
  for (const lane of lanes) {
    const options = lane.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lane.body || {}) } : { method: 'GET' };
    const pull = await fetchWithTimeout(lane.url, options);
    const items = pull.ok ? arr(lane.items(pull)).slice(0, MAX_EVENTS_PER_PULL) : [];
    const record = { updated, runner_version: RUNNER_VERSION, lane: lane.id, name: lane.name, ok: pull.ok, status: pull.status, url: lane.url, source_type: lane.recordType, evidence_grade: lane.evidenceGrade, itemCount: items.length, raw: pull.ok ? pull.body : null, error: pull.error || null };
    write(lane.output, JSON.stringify(record, null, 2));
    pulls.push({ lane: lane.id, name: lane.name, ok: pull.ok, status: pull.status, output: lane.output, itemCount: items.length, error: pull.error || null });
    items.forEach((item, index) => {
      try {
        const normalized = lane.normalize(item) || {};
        if (clean(normalized.title || '').length) events.push(eventFrom(lane, item, normalized, index));
      } catch (error) {
        events.push({ id: `${lane.id}-normalization-error-${index + 1}`, date: updated.slice(0, 10), pulled_at: updated, runner_version: RUNNER_VERSION, source_lane: lane.id, source_name: lane.name, entity_names: [], institution_names: [], control_layers: lane.controlLayers, record_type: lane.recordType, evidence_grade: 'unsupported claim', source_url: lane.url, summary: `Normalization error: ${error.message || error}`, missing_records: ['Review source pull manually.'], send_to: ['record-intake-queue'], boundary: 'Normalization failed. Do not use as evidence.' });
      }
    });
  }

  const observationsByName = new Map();
  for (const event of events) {
    for (const name of uniq([...event.entity_names, ...event.institution_names]).slice(0, 8)) {
      const id = slug(name);
      const prior = observationsByName.get(id) || { id, name, count: 0, lanes: [], record_types: [], evidence_grades: [], source_events: [], last_seen: event.date };
      prior.count += 1;
      prior.lanes = uniq([...prior.lanes, event.source_lane]);
      prior.record_types = uniq([...prior.record_types, event.record_type]);
      prior.evidence_grades = uniq([...prior.evidence_grades, event.evidence_grade]);
      prior.source_events = uniq([...prior.source_events, event.id]).slice(0, 12);
      prior.last_seen = event.date || prior.last_seen;
      observationsByName.set(id, prior);
    }
  }

  const recordEvents = { updated, runner_version: RUNNER_VERSION, title: 'Public Record Events', purpose: 'Normalized events produced by the public-record feed runner. These are additive machine inputs and do not replace Live Intel, Daily Brain or existing update systems.', boundary: 'Events must keep evidence grades. News signals are not findings.', pullSummary: pulls, events: events.slice(0, 120) };
  const entityObservations = { updated, runner_version: RUNNER_VERSION, title: 'Entity Observations', purpose: 'Repeated names detected from public-record pulls. These are candidates for Power Entity Engine review, not proof of wrongdoing.', observations: [...observationsByName.values()].sort((a, b) => b.count - a.count).slice(0, 120) };
  write('data/record-events.json', JSON.stringify(recordEvents, null, 2));
  write('data/entity-observations.json', JSON.stringify(entityObservations, null, 2));
  write('data/source-pulls/source-pull-index.json', JSON.stringify({ updated, runner_version: RUNNER_VERSION, pulls }, null, 2));

  const latest = events.slice(0, 24);
  const eventCards = latest.map(event => `<article class="card redline"><span class="label">${esc(event.evidence_grade)} · ${esc(event.record_type)}</span><h3>${esc(event.summary)}</h3><p><strong>Lane:</strong> ${esc(event.source_lane)}</p><p><strong>Source:</strong> <a href="${esc(event.source_url)}" target="_blank" rel="noopener">open record route</a></p><p>${event.control_layers.map(layer => `<span class="pill">${esc(layer)}</span>`).join(' ')}</p></article>`).join('') || '<article class="card redline"><h3>No live pulls available yet</h3><p>The runner created the structure and will populate records when upstream public endpoints respond.</p></article>';
  const obsCards = entityObservations.observations.slice(0, 18).map(obs => `<article class="card"><span class="label">ENTITY OBSERVATION</span><h3>${esc(obs.name)}</h3><p><strong>Mentions:</strong> ${esc(obs.count)}</p><p><strong>Lanes:</strong> ${esc(obs.lanes.join(', '))}</p></article>`).join('') || '<article class="card"><h3>No entity observations yet</h3><p>Records must be pulled before entity candidates appear.</p></article>';
  const okCount = pulls.filter(p => p.ok).length;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Machine Digest | Matrix Reprogrammed</title><meta name="description" content="Machine Digest: latest public-record pulls, normalized events, entity observations, missing records and evidence-grade boundaries."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary"><a href="public-record-intake.html">Record Intake</a><a href="daily-brain-brief.html">Daily Brain</a><a href="power-entities.html">Power Entities</a><a href="evidence-vault.html">Evidence Vault</a><a href="search.html">Search</a></div><details class="nav-more"><summary>More</summary><div class="nav-drawer"><div class="nav-group"><strong>Machine Data</strong><a href="data/record-events.json">Record Events</a><a href="data/entity-observations.json">Entity Observations</a><a href="data/source-pulls/source-pull-index.json">Pull Index</a><a href="data/machine-feed-queue.json">Feed Queue</a></div></div></details></nav></header><main><section class="hero wrap"><div class="eyebrow">Machine Feed Runner · Additive Layer</div><h1>MACHINE DIGEST.</h1><p class="lead">Latest public-record pulls normalized into evidence-graded machine events. This page does not replace Live Intel or Daily Brain; it feeds them with primary-record routes.</p><div class="cta-row"><a class="btn" href="data/record-events.json">Record Events JSON</a><a class="btn alt" href="data/entity-observations.json">Entity Observations</a><a class="btn alt" href="data/source-pulls/source-pull-index.json">Pull Index</a></div></section><section class="section wrap split"><div class="terminal">MACHINE DIGEST\n&gt; updated: ${esc(updated)}\n&gt; runner: ${esc(RUNNER_VERSION)}\n&gt; feed lanes attempted: ${pulls.length}\n&gt; feeds reached: ${okCount}\n&gt; normalized events: ${events.length}\n&gt; entity observations: ${entityObservations.observations.length}\n&gt; boundary: record route first</div><aside class="card redline"><h2>Integration Boundary</h2><p>Existing updates stay untouched. This runner writes separate raw pulls, normalized events, entity observations and a digest page. Search and brain layers can consume these as additional inputs.</p></aside></section><section class="section wrap"><h2>Latest Record Events</h2><div class="grid">${eventCards}</div></section><section class="section wrap"><h2>Entity Observations</h2><div class="grid">${obsCards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — public records feed the machine.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script><script src="analytics.js"></script></body></html>`;
  write('machine-digest.html', html);

  const md = ['# Machine Digest', '', `Updated: ${updated}`, `Runner: ${RUNNER_VERSION}`, '', `Feed lanes attempted: ${pulls.length}`, `Feeds reached: ${okCount}`, `Normalized events: ${events.length}`, `Entity observations: ${entityObservations.observations.length}`, '', '## Latest Events', '', ...latest.map(event => `- ${event.evidence_grade}: ${event.summary} — ${event.source_lane} — ${event.source_url}`), '', '## Entity Observations', '', ...entityObservations.observations.slice(0, 30).map(obs => `- ${obs.name}: ${obs.count} mention(s), lanes: ${obs.lanes.join(', ')}`), ''].join('\n');
  write('downloads/machine-digest.md', md);
  console.log(`Machine Feed Runner complete: ${pulls.length} lanes, ${okCount} reached, ${events.length} events, ${entityObservations.observations.length} observations.`);
}

main().catch(error => {
  console.warn(`Machine Feed Runner failed safely: ${error.message || error}`);
  const fallback = { updated, runner_version: RUNNER_VERSION, title: 'Public Record Events', purpose: 'Fallback output. Feed runner failed safely and did not replace existing updates.', boundary: 'No events should be treated as evidence from this run.', pullSummary: [], events: [] };
  write('data/record-events.json', JSON.stringify(fallback, null, 2));
  write('data/entity-observations.json', JSON.stringify({ updated, runner_version: RUNNER_VERSION, title: 'Entity Observations', observations: [] }, null, 2));
  write('data/source-pulls/source-pull-index.json', JSON.stringify({ updated, runner_version: RUNNER_VERSION, pulls: [] }, null, 2));
  write('machine-digest.html', '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Machine Digest</title><link rel="stylesheet" href="styles.css"/></head><body><main class="wrap"><h1>Machine Digest</h1><p>Feed runner failed safely. Existing updates were not touched.</p></main></body></html>');
});
