const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const pullsDir = path.join(dataDir, 'investigation-source-pulls');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(pullsDir, { recursive: true });

const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
if (!['daily', 'weekly'].includes(mode)) {
  console.error('Usage: node scripts/run-investigation-machine.js daily|weekly');
  process.exit(2);
}

const registryPath = path.join(dataDir, 'investigation-source-registry.json');
if (!fs.existsSync(registryPath)) {
  console.error('Missing data/investigation-source-registry.json');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const laneMap = new Map((registry.lanes || []).map(lane => [lane.id, lane]));
const statePath = path.join(dataDir, 'investigation-source-state.json');
const ledgerPath = path.join(dataDir, 'investigation-ledger.json');
const priorState = readJson(statePath, { updated: null, sources: {} });
const priorLedger = readJson(ledgerPath, { updated: null, findings: [] });
const now = new Date();
const checkedAt = now.toISOString();
const endDate = checkedAt.slice(0, 10);
const start = new Date(now.getTime() - (mode === 'weekly' ? 8 : 3) * 86400000);
const startDate = start.toISOString().slice(0, 10);
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const USER_AGENT = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedInvestigation/1.0';
let resourceBroker;
let resourceAuditLogger;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
function clean(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
function compact(value = '', max = 560) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function absoluteUrl(value, base) {
  try { return new URL(String(value || ''), base).href; } catch { return ''; }
}
function tag(block, name) {
  const match = String(block).match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? clean(match[1]) : '';
}
function attr(block, name) {
  const match = String(block).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : '';
}
function parseDate(value, fallback = checkedAt) {
  const date = new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}
function template(value) {
  return String(value || '')
    .replace(/\{\{START_DATE\}\}/g, startDate)
    .replace(/\{\{END_DATE\}\}/g, endDate)
    .replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => process.env[key] || `{{${key}}}`);
}
function templateObject(value) {
  if (Array.isArray(value)) return value.map(templateObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, templateObject(v)]));
  return typeof value === 'string' ? template(value) : value;
}
function requiredEnvironmentMissing(source) {
  return (source.requiredEnv || []).filter(key => !process.env[key]);
}
function keywordMatches(text, source) {
  const lower = String(text || '').toLowerCase();
  return (source.keywords || []).filter(term => lower.includes(String(term).toLowerCase()));
}
function itemId(sourceId, title, url, published) {
  return hash(`${sourceId}|${clean(title).toLowerCase()}|${url}|${String(published || '').slice(0, 10)}`).slice(0, 24);
}
function normalizeItem(source, raw) {
  const title = compact(raw.title || raw.name || raw.headline || raw.description || source.label, 280);
  const url = absoluteUrl(raw.url || raw.link || raw.html_url || source.url, source.url);
  const summary = compact(raw.summary || raw.description || raw.abstract || raw.content || title, 700);
  const published = parseDate(raw.published || raw.publication_date || raw.date || raw.updated || raw.start_date || checkedAt);
  const combined = `${title} ${summary} ${url}`;
  return {
    id: itemId(source.id, title, url, published),
    sourceId: source.id,
    sourceLabel: source.label,
    sourceUrl: source.url,
    lane: source.lane,
    authority: source.authority,
    title,
    url,
    summary,
    published,
    fetchedAt: checkedAt,
    keywordMatches: keywordMatches(combined, source),
    rawMeta: raw.rawMeta || null
  };
}
function parseRss(source, body) {
  const itemBlocks = [...body.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(match => match[0]);
  const blocks = itemBlocks.length ? itemBlocks : [...body.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(match => match[0]);
  return blocks.slice(0, 100).map(block => {
    const linkTag = block.match(/<link\b[^>]*>/i)?.[0] || '';
    return normalizeItem(source, {
      title: tag(block, 'title'),
      url: tag(block, 'link') || attr(linkTag, 'href') || tag(block, 'guid'),
      summary: tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'),
      published: tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated')
    });
  }).filter(item => item.title && item.url);
}
function parseHtml(source, body) {
  const pageTitle = clean(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || source.label);
  const anchors = [];
  for (const match of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1], 'href');
    const text = clean(match[2]);
    if (!href || !text || text.length < 7) continue;
    const url = absoluteUrl(href, source.url);
    if (!/^https?:\/\//i.test(url)) continue;
    const combined = `${text} ${url}`;
    anchors.push({
      title: text,
      url,
      summary: pageTitle,
      published: extractDate(`${text} ${url}`) || checkedAt,
      matches: keywordMatches(combined, source)
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const item of anchors) {
    const key = `${item.title.toLowerCase()}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const matching = deduped.filter(item => item.matches.length);
  const chosen = (matching.length ? matching : deduped).slice(0, 80);
  if (!chosen.length) {
    return [normalizeItem(source, {
      title: `${source.label} source page checked`,
      url: source.url,
      summary: compact(clean(body), 700),
      published: checkedAt
    })];
  }
  return chosen.map(item => normalizeItem(source, item));
}
function extractDate(value) {
  const text = String(value || '');
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return iso;
  const named = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
  return named || '';
}
function findFirstArray(value) {
  if (Array.isArray(value) && value.some(item => item && typeof item === 'object')) return value;
  if (!value || typeof value !== 'object') return null;
  for (const child of Object.values(value)) {
    const found = findFirstArray(child);
    if (found) return found;
  }
  return null;
}
function parseJson(source, data) {
  if (source.parser === 'federal-register') {
    return (data.results || []).slice(0, 100).map(row => normalizeItem(source, {
      title: row.title,
      url: row.html_url || row.pdf_url,
      summary: row.abstract || `${(row.agencies || []).map(a => a.name).join(', ')} · ${row.type || ''}`,
      published: row.publication_date,
      rawMeta: { documentNumber: row.document_number, type: row.type, agencies: (row.agencies || []).map(a => a.name) }
    }));
  }
  if (source.parser === 'usaspending-awards') {
    return (data.results || []).slice(0, 100).map(row => normalizeItem(source, {
      title: `${row['Recipient Name'] || 'Unknown recipient'} — ${row['Awarding Agency'] || 'Federal award'}`,
      url: row.generated_subawards || row['generated_subawards'] || `https://www.usaspending.gov/award/${encodeURIComponent(row['Award ID'] || '')}`,
      summary: `${row.Description || 'Federal contract award'} · Amount: ${row['Award Amount'] ?? 'not stated'} · Sub-agency: ${row['Awarding Sub Agency'] || 'not stated'}`,
      published: row['Start Date'] || checkedAt,
      rawMeta: { awardId: row['Award ID'], amount: row['Award Amount'], agency: row['Awarding Agency'], subAgency: row['Awarding Sub Agency'] }
    }));
  }
  if (source.parser === 'openfec') {
    return (data.results || []).slice(0, 100).map(row => normalizeItem(source, {
      title: `${row.contributor_name || 'Contributor'} — ${row.committee?.name || row.committee_name || 'political committee'}`,
      url: source.url,
      summary: `Contribution amount: ${row.contribution_receipt_amount ?? 'not stated'} · memo: ${row.memo_text || 'none'}`,
      published: row.contribution_receipt_date || checkedAt,
      rawMeta: { contributor: row.contributor_name, amount: row.contribution_receipt_amount, committeeId: row.committee_id }
    }));
  }
  const array = findFirstArray(data) || [];
  return array.slice(0, 100).map(row => normalizeItem(source, {
    title: row.title || row.name || row.headline || row.subject || row.description,
    url: row.url || row.link || row.html_url || row.web_url || source.url,
    summary: row.summary || row.description || row.abstract || row.content,
    published: row.published || row.publication_date || row.date || row.updated || row.created_at,
    rawMeta: row
  })).filter(item => item.title);
}
function wrongdoingClassification(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const official = item.authority === 'primary-official';
  const matches = (registry.wrongdoingTerms || []).filter(term => text.includes(String(term).toLowerCase()));
  const adjudicated = /\b(convicted|sentenced|pleaded guilty|pled guilty|guilty plea|found liable|final judgment|criminal conviction)\b/i.test(text);
  const charged = /\b(indicted|charged|criminal complaint|arrested|accused|alleged)\b/i.test(text);
  const enforcement = /\b(enforcement action|civil penalty|sanctioned|sanctions|settlement|debarred|disgorgement|consent judgment)\b/i.test(text);
  const audit = /\b(inspector general|audit|improper payment|waste and abuse|misconduct finding|substantiated)\b/i.test(text);
  const release = /\b(released|publication|documents|files|declassified|disclosure|archive|leak)\b/i.test(text);
  let status = 'record-update';
  let evidenceGrade = official ? 'B' : 'C';
  let severity = 1;
  let establishes = 'A dated source update exists and should be compared with prior records.';
  let boundary = 'This update alone does not establish wrongdoing, intent or coordinated action.';
  if (official && adjudicated) {
    status = 'established-wrongdoing'; evidenceGrade = 'A'; severity = 5;
    establishes = 'An official record reports a conviction, guilty plea, sentence, final judgment or comparable adjudicated outcome within the scope described by the source.';
    boundary = 'The finding applies only to the conduct, parties and legal outcome stated in the official record. It does not justify unrelated accusations.';
  } else if (official && enforcement) {
    status = 'official-enforcement'; evidenceGrade = 'A'; severity = 4;
    establishes = 'An official body reports an enforcement, sanctions, penalty, settlement or debarment action.';
    boundary = 'A settlement or civil enforcement action may not include an admission of every alleged fact. Read the order and settlement terms.';
  } else if (official && charged) {
    status = 'official-charge-or-allegation'; evidenceGrade = 'A'; severity = 4;
    establishes = 'An official body reports a charge, indictment, complaint, arrest or allegation.';
    boundary = 'A charge, indictment, complaint, arrest or allegation is not proof of guilt. Presumption of innocence and later outcomes must be preserved.';
  } else if (official && audit) {
    status = 'official-audit-finding'; evidenceGrade = 'A'; severity = 3;
    establishes = 'An official inspector-general, audit or oversight record reports a finding within its stated scope.';
    boundary = 'An audit finding is limited to the reviewed period, programme and evidentiary scope.';
  } else if (release && matches.length) {
    status = official ? 'document-release' : 'leak-or-document-lead'; evidenceGrade = official ? 'B' : 'D'; severity = 2;
    establishes = official ? 'An official source released records relevant to the mission.' : 'A non-official source points to documents or leaked material requiring authentication.';
    boundary = official ? 'Publication does not prove every interpretation placed on the records.' : 'A leak is a lead, not established fact, until authenticated and corroborated.';
  } else if (matches.length) {
    status = 'wrongdoing-lead'; evidenceGrade = official ? 'B' : 'C'; severity = 2;
    establishes = 'The source contains language relevant to alleged wrongdoing or oversight failure.';
    boundary = 'Keyword relevance is not proof. The underlying record must be read and corroborated.';
  }
  return { status, evidenceGrade, severity, wrongdoingIndicators: matches, establishes, boundary };
}
function laneFor(source) {
  return laneMap.get(source.lane) || { id: source.lane, label: source.lane, questions: [], watchTerms: [] };
}
function findingFromItem(item) {
  const source = (registry.sources || []).find(entry => entry.id === item.sourceId) || {};
  const lane = laneFor(source);
  const classified = wrongdoingClassification({ ...item, authority: source.authority });
  const score = (classified.severity * 10) + (source.authority === 'primary-official' ? 8 : source.authority === 'primary-official-request' ? 5 : 2) + Math.min(item.keywordMatches.length, 5);
  return {
    id: hash(`${item.sourceId}|${item.id}`).slice(0, 24),
    title: item.title,
    summary: item.summary,
    published: item.published,
    fetchedAt: item.fetchedAt,
    lane: source.lane,
    laneLabel: lane.label,
    sourceId: source.id,
    sourceLabel: source.label,
    sourceAuthority: source.authority,
    sourceUrl: source.url,
    itemUrl: item.url,
    status: classified.status,
    evidenceGrade: classified.evidenceGrade,
    severity: classified.severity,
    score,
    wrongdoingIndicators: classified.wrongdoingIndicators,
    keywordMatches: item.keywordMatches,
    establishes: classified.establishes,
    boundary: classified.boundary,
    nextRecords: source.nextRecords || [],
    questions: lane.questions || []
  };
}
async function fetchSource(source) {
  const missing = requiredEnvironmentMissing(source);
  if (missing.length) {
    return { source, status: source.optional ? 'skipped-optional-missing-env' : 'failed-missing-env', error: `Missing ${missing.join(', ')}`, items: [] };
  }
  const url = template(source.url);
  const request = source.request || {};
  const timeout = Number(source.timeoutMs || process.env.INVESTIGATION_TIMEOUT_MS || 25000);
  try {
    const method = String(request.method || (source.type === 'json-post' ? 'POST' : 'GET')).toUpperCase();
    const headers = { accept: request.accept || '*/*', ...(templateObject(request.headers || {})) };
    const requestBody = request.body || (source.type === 'json-post' ? source.payload : null);
    const brokerResult = await resourceBroker.execute({
      job_type: 'public-data.fetch',
      capability_type: 'public_data',
      priority: mode === 'daily' ? 'P2' : 'P3',
      data_class: 'public',
      payload: {
        url,
        method,
        headers,
        body: requestBody ? templateObject(requestBody) : undefined,
        maximum_bytes: MAX_BODY_BYTES,
        quota_units: 1,
        source_id: source.id
      },
      requirements: {
        cost_ceiling_eur: 0,
        minimum_quality_score: source.authority === 'primary-official' ? 80 : 60,
        minimum_provenance_score: 70,
        maximum_latency_ms: timeout,
        maximum_attempts: 2,
        requires_provenance: true,
        cacheable: true,
        cache_ttl_seconds: mode === 'daily' ? 900 : 3600
      },
      metadata: {
        investigator_mode: mode,
        source_id: source.id,
        lane: source.lane,
        authority: source.authority
      }
    });
    const fetched = brokerResult.output;
    const body = fetched.body;
    const contentType = fetched.content_type || '';
    let items = [];
    if (/json/i.test(contentType) || source.format === 'json' || source.type === 'json' || source.type === 'json-post') items = parseJson(source, JSON.parse(body));
    else if (/xml|rss|atom/i.test(contentType) || source.format === 'rss' || source.type === 'rss') items = parseRss(source, body);
    else items = parseHtml(source, body);
    return {
      source,
      status: 'fetched',
      statusCode: fetched.status,
      finalUrl: fetched.final_url,
      contentType,
      bytes: fetched.bytes,
      bodyHash: fetched.body_hash || hash(body),
      items,
      resourceId: brokerResult.selected_resource,
      utilityScore: brokerResult.utility_score,
      costConfirmedZero: brokerResult.cost_confirmed_zero,
      brokerAttempts: brokerResult.attempts,
      provenance: brokerResult.provenance
    };
  } catch (error) {
    const policyFailure = error?.code === 'NO_ELIGIBLE_ZERO_COST_RESOURCE';
    return {
      source,
      status: policyFailure ? 'failed-policy' : 'failed-request',
      error: `${error?.code || 'RESOURCE_BROKER_ERROR'}: ${error.message}`,
      items: [],
      costConfirmedZero: true,
      brokerExcludedResources: error?.details?.excluded_resources || []
    };
  }
}
async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, values.length || 1)) }, worker));
  return results;
}
function mergeLedger(current) {
  const map = new Map((priorLedger.findings || []).map(finding => [finding.id, finding]));
  for (const finding of current) map.set(finding.id, finding);
  return [...map.values()].sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 5000);
}
function sourceState(results) {
  return Object.fromEntries(results.map(result => {
    const prior = priorState.sources?.[result.source.id] || {};
    const changed = Boolean(result.bodyHash && result.bodyHash !== prior.bodyHash);
    return [result.source.id, {
      label: result.source.label,
      lane: result.source.lane,
      authority: result.source.authority,
      url: result.source.url,
      checkedAt,
      status: result.status,
      statusCode: result.statusCode || null,
      finalUrl: result.finalUrl || result.source.url,
      contentType: result.contentType || '',
      bytes: result.bytes || 0,
      bodyHash: result.bodyHash || prior.bodyHash || '',
      changed,
      itemCount: (result.items || []).length,
      error: result.error || '',
      resourceId: result.resourceId || null,
      utilityScore: result.utilityScore ?? null,
      costConfirmedZero: result.costConfirmedZero === true,
      brokerAttempts: result.brokerAttempts || 0
    }];
  }));
}
function recent(findings, days) {
  const floor = Date.now() - days * 86400000;
  return findings.filter(finding => new Date(finding.published).getTime() >= floor);
}
function rank(findings) {
  return [...findings].sort((a, b) => b.score - a.score || new Date(b.published) - new Date(a.published));
}
function patternSummary(findings) {
  const byLane = {};
  const byStatus = {};
  const indicators = {};
  for (const finding of findings) {
    byLane[finding.lane] = (byLane[finding.lane] || 0) + 1;
    byStatus[finding.status] = (byStatus[finding.status] || 0) + 1;
    for (const term of finding.wrongdoingIndicators || []) indicators[term] = (indicators[term] || 0) + 1;
  }
  return {
    byLane,
    byStatus,
    topWrongdoingIndicators: Object.entries(indicators).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([term, count]) => ({ term, count }))
  };
}
function conclusionProduct(kind, findings, results, state) {
  const days = kind === 'weekly' ? 8 : 2;
  const windowFindings = rank(recent(findings, days));
  const strongest = windowFindings.slice(0, kind === 'weekly' ? 40 : 18);
  const failures = results.filter(result => !['fetched', 'skipped-optional-missing-env'].includes(result.status));
  const changedSources = Object.values(state).filter(source => source.changed);
  const established = strongest.filter(item => item.status === 'established-wrongdoing');
  const officialActions = strongest.filter(item => ['official-enforcement', 'official-charge-or-allegation', 'official-audit-finding'].includes(item.status));
  const leads = strongest.filter(item => ['leak-or-document-lead', 'document-release', 'wrongdoing-lead'].includes(item.status));
  return {
    ok: true,
    kind,
    generatedAt: checkedAt,
    period: { start: new Date(Date.now() - days * 86400000).toISOString(), end: checkedAt, days },
    mission: registry.mission,
    evidenceStandard: registry.rules,
    summary: {
      sourcesScheduled: results.length,
      sourcesFetched: results.filter(result => result.status === 'fetched').length,
      sourceFailures: failures.length,
      changedSources: changedSources.length,
      findingsInWindow: windowFindings.length,
      establishedWrongdoingFindings: established.length,
      officialActionFindings: officialActions.length,
      documentOrLeakLeads: leads.length
    },
    topConclusion: strongest.length
      ? 'The machine found evidence routes requiring attention. The strongest findings are ranked by official authority, adjudicated status, enforcement significance, severity and recency; every accusation boundary remains attached.'
      : 'No new finding crossed the publication threshold in this period. This is a neutral result, not proof that no wrongdoing occurred outside the monitored sources.',
    patterns: patternSummary(windowFindings),
    establishedWrongdoing: established,
    officialActions,
    documentAndLeakLeads: leads,
    strongestFindings: strongest,
    changedSources,
    sourceFailures: failures.map(result => ({ sourceId: result.source.id, label: result.source.label, url: result.source.url, status: result.status, error: result.error })),
    missingRecords: strongest.slice(0, 20).map(finding => ({ findingId: finding.id, title: finding.title, nextRecords: finding.nextRecords, source: finding.itemUrl })),
    boundary: 'Established wrongdoing is used only for the scope of an official conviction, guilty plea, sentence, judgment or equivalent final record. Charges and allegations are not guilt. Leaks are leads until authenticated and corroborated.'
  };
}
function canUsePriorLedgerForProduction() {
  const productionWorkflow = /Matrix Reprogrammed Controlled Production Deploy/i.test(String(process.env.GITHUB_WORKFLOW || ''));
  if (!productionWorkflow) return { ok: false, reason: 'not a production deployment' };
  const priorTime = Date.parse(priorLedger.updated || '');
  const ageHours = Number.isFinite(priorTime) ? (Date.now() - priorTime) / 3600000 : Infinity;
  const findingCount = Array.isArray(priorLedger.findings) ? priorLedger.findings.length : 0;
  const ok = ageHours >= 0 && ageHours <= 30 && findingCount > 0;
  return { ok, ageHours, findingCount, reason: ok ? 'fresh prior ledger available' : 'prior ledger is missing, stale or empty' };
}

(async () => {
  if (typeof fetch !== 'function') throw new Error('Node 18+ fetch is required');
  const brokerModuleUrl = pathToFileURL(path.join(root, 'ai-management', 'node', 'investigation-broker.mjs')).href;
  const { createInvestigationBroker } = await import(brokerModuleUrl);
  const brokerRuntime = createInvestigationBroker({
    sources: registry.sources || [],
    priorState,
    fetchImpl: fetch,
    userAgent: USER_AGENT,
    maximumBytes: MAX_BODY_BYTES,
    environment: process.env,
    now
  });
  resourceBroker = brokerRuntime.broker;
  resourceAuditLogger = brokerRuntime.logger;
  const selected = (registry.sources || []).filter(source => (source.frequency || []).includes(mode));
  const results = await mapLimit(selected, Number(process.env.INVESTIGATION_CONCURRENCY || 4), fetchSource);
  const fetchedItems = results.flatMap(result => result.items || []);
  const currentFindings = fetchedItems.map(findingFromItem);
  const runHealthy = results.some(result => result.status === 'fetched');
  const mergedFindings = runHealthy ? mergeLedger(currentFindings) : [...(priorLedger.findings || [])];
  const sources = sourceState(results);
  const state = { updated: checkedAt, lastMode: mode, sources };
  const ledger = {
    updated: checkedAt,
    mission: registry.mission,
    evidenceStandard: registry.rules,
    findingCount: mergedFindings.length,
    findings: mergedFindings
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  if (runHealthy) fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  const daily = conclusionProduct('daily', mergedFindings, results, sources);
  const weekly = conclusionProduct('weekly', mergedFindings, results, sources);
  fs.writeFileSync(path.join(dataDir, 'daily-investigation-conclusions.json'), JSON.stringify(daily, null, 2));
  fs.writeFileSync(path.join(dataDir, 'weekly-investigation-conclusions.json'), JSON.stringify(weekly, null, 2));
  const runReport = {
    ok: runHealthy,
    mode,
    checkedAt,
    selectedSources: selected.length,
    fetchedSources: results.filter(result => result.status === 'fetched').length,
    skippedSources: results.filter(result => result.status.startsWith('skipped')).length,
    failedSources: results.filter(result => result.status.startsWith('failed')).length,
    policyFilteredSources: results.filter(result => result.status === 'failed-policy').length,
    parsedItems: fetchedItems.length,
    newOrSeenFindings: currentFindings.length,
    ledgerFindings: mergedFindings.length,
    results: results.map(result => ({
      sourceId: result.source.id,
      label: result.source.label,
      url: result.source.url,
      status: result.status,
      statusCode: result.statusCode,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
      bytes: result.bytes,
      bodyHash: result.bodyHash,
      itemCount: (result.items || []).length,
      error: result.error || '',
      resourceId: result.resourceId || null,
      utilityScore: result.utilityScore ?? null,
      costConfirmedZero: result.costConfirmedZero === true,
      brokerAttempts: result.brokerAttempts || 0
    })),
    resourceBroker: {
      zeroSpendLock: true,
      monetaryCeilingEur: 0,
      paidFallbackPossible: false,
      decisionsRecorded: resourceAuditLogger.records.length,
      successfulSelections: results.filter(result => result.resourceId).length,
      policyFilteredSources: results.filter(result => result.status === 'failed-policy').length,
      localOnly: String(process.env.AI_RESOURCE_LOCAL_ONLY || 'false').toLowerCase() === 'true'
    },
    resourceDecisions: resourceAuditLogger.records.map(record => ({
      actionId: record.action_id,
      jobId: record.job_id,
      selectedResource: record.selected_resource,
      utilityScore: record.utility_score,
      candidateResources: record.candidate_resources,
      excludedResources: record.excluded_resources,
      decisionReason: record.decision_reason,
      quotaBefore: record.quota_before,
      quotaAfter: record.quota_after,
      latency: record.latency,
      costConfirmedZero: record.cost_confirmed_zero,
      validationResult: record.validation_result,
      error: record.error,
      createdAt: record.created_at
    })),
    boundary: daily.boundary
  };
  fs.writeFileSync(path.join(pullsDir, `${mode}-latest.json`), JSON.stringify(runReport, null, 2));
  fs.writeFileSync(path.join(downloadsDir, 'investigation-machine-run-report.json'), JSON.stringify(runReport, null, 2));

  const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-investigation-pages.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (build.stdout) process.stdout.write(build.stdout);
  if (build.stderr) process.stderr.write(build.stderr);
  if (build.status !== 0) process.exit(build.status || 1);

  console.log(`Investigation machine ${mode} run complete: ${runReport.fetchedSources}/${runReport.selectedSources} sources fetched, ${runReport.parsedItems} items parsed, ${runReport.ledgerFindings} ledger findings.`);
  if (!runReport.ok) {
    const fallback = canUsePriorLedgerForProduction();
    if (fallback.ok) {
      console.warn(`No scheduled source was fetched successfully, but the prior investigation ledger is ${fallback.ageHours.toFixed(2)} hours old with ${fallback.findingCount} findings. The controlled production deployment may continue; the later strict freshness guard remains authoritative.`);
      return;
    }
    console.error(`No scheduled source was fetched successfully. ${fallback.reason}. The previous ledger was preserved, but the run is not healthy.`);
    process.exit(1);
  }
})().catch(error => {
  console.error(`Investigation machine failed: ${error.stack || error.message}`);
  process.exit(1);
});
