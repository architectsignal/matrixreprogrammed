const fs = require('fs');
const path = require('path');
const {
  clean,
  sha256,
  parseForm4,
  parse13F,
  compare13F
} = require('./sec-market-utils');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const watchlistPath = path.join(dataDir, 'market-activity-watchlist.json');
const statePath = path.join(dataDir, 'market-activity-state.json');
const outputPath = path.join(dataDir, 'market-activity.json');
const holdingsRoot = path.join(dataDir, 'market-holdings');
const changesRoot = path.join(dataDir, 'market-position-changes');
const now = new Date().toISOString();
const userAgent = process.env.SEC_USER_AGENT || 'MatrixReprogrammedMarketTracker/1.0 njmgroupfrance@gmail.com';
const maxForm4PerIssuer = Math.max(1, Number(process.env.SEC_FORM4_FILINGS_PER_ISSUER || 12));
const requestDelayMs = Math.max(110, Number(process.env.SEC_REQUEST_DELAY_MS || 180));
const requestTimeoutMs = Math.max(5000, Number(process.env.SEC_REQUEST_TIMEOUT_MS || 30000));
const publicChangeLimit = Math.max(100, Number(process.env.SEC_PUBLIC_CHANGE_LIMIT || 3000));

for (const dir of [dataDir, downloadsDir, holdingsRoot, changesRoot]) fs.mkdirSync(dir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeSegment(value = '') { return String(value || 'record').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'record'; }
function accessionDirectory(cik, accession) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(String(cik).replace(/\D/g, ''))}/${String(accession || '').replace(/-/g, '')}`;
}
function filingUrl(cik, accession, primaryDocument = '') {
  const base = accessionDirectory(cik, accession);
  return primaryDocument ? `${base}/${String(primaryDocument).replace(/^\/+/, '')}` : `${base}/`;
}
function filingRows(submissions) {
  const recent = submissions?.filings?.recent || {};
  const keys = ['accessionNumber', 'filingDate', 'reportDate', 'acceptanceDateTime', 'act', 'form', 'fileNumber', 'filmNumber', 'items', 'size', 'isXBRL', 'isInlineXBRL', 'primaryDocument', 'primaryDocDescription'];
  const length = Math.max(0, ...keys.map(key => Array.isArray(recent[key]) ? recent[key].length : 0));
  return Array.from({ length }, (_, index) => Object.fromEntries(keys.map(key => [key, Array.isArray(recent[key]) ? recent[key][index] : null])));
}
function dedupeById(items) {
  const map = new Map();
  for (const item of items || []) if (item?.id) map.set(item.id, item);
  return [...map.values()];
}
function latestByDate(items, fields) {
  return [...(items || [])].sort((a, b) => {
    const aValue = fields.map(field => a?.[field]).find(Boolean) || '';
    const bValue = fields.map(field => b?.[field]).find(Boolean) || '';
    return String(bValue).localeCompare(String(aValue));
  });
}
function relativeUrl(file) { return path.relative(root, file).replace(/\\/g, '/'); }

async function fetchResource(url, type = 'text') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': userAgent,
        accept: type === 'json' ? 'application/json,text/plain;q=0.8,*/*;q=0.5' : 'application/xml,text/xml,text/plain,text/html;q=0.8,*/*;q=0.5',
        'accept-encoding': 'gzip, deflate'
      }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    await sleep(requestDelayMs);
    if (type === 'json') return JSON.parse(body);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function filingXml(subject, filing, rootTag) {
  const primaryUrl = filingUrl(subject.cik, filing.accessionNumber, filing.primaryDocument || '');
  if (filing.primaryDocument) {
    try {
      const primary = await fetchResource(primaryUrl);
      if (new RegExp(`<(?:(?:[a-zA-Z0-9_-]+):)?${rootTag}\\b`, 'i').test(primary)) return { xml: primary, sourceUrl: primaryUrl };
    } catch {}
  }
  const directory = accessionDirectory(subject.cik, filing.accessionNumber);
  const index = await fetchResource(`${directory}/index.json`, 'json');
  const items = Array.isArray(index?.directory?.item) ? index.directory.item : [];
  const candidates = items
    .filter(item => item?.name && /\.xml$/i.test(item.name))
    .sort((a, b) => {
      const preferred = rootTag === 'ownershipDocument' ? /ownership|primary|form4/i : /info.*table|information.*table|13f/i;
      return Number(preferred.test(b.name)) - Number(preferred.test(a.name)) || Number(a.size || 0) - Number(b.size || 0);
    });
  for (const candidate of candidates) {
    const url = `${directory}/${candidate.name}`;
    try {
      const xml = await fetchResource(url);
      if (new RegExp(`<(?:(?:[a-zA-Z0-9_-]+):)?${rootTag}\\b`, 'i').test(xml)) return { xml, sourceUrl: url };
    } catch {}
  }
  throw new Error(`No ${rootTag} XML found for ${filing.accessionNumber}`);
}

async function collectForm4Subject(subject, rows, existingTransactions, failures) {
  const allowed = new Set(subject.forms || ['4', '4/A']);
  const filings = rows.filter(row => allowed.has(row.form)).slice(0, maxForm4PerIssuer);
  const transactions = [];
  for (const filing of filings) {
    try {
      const source = await filingXml(subject, filing, 'ownershipDocument');
      const parsed = parseForm4(source.xml, {
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        sourceUrl: source.sourceUrl
      });
      for (const transaction of parsed.transactions) {
        transactions.push({
          ...transaction,
          trackedSubjectId: subject.id,
          trackedSubjectName: subject.name,
          ticker: transaction.issuer?.ticker || subject.ticker || '',
          sourceType: 'SEC Form 4 ownership XML',
          retrievalDate: now
        });
      }
    } catch (error) {
      failures.push({ subjectId: subject.id, form: filing.form, accessionNumber: filing.accessionNumber, observedAt: now, error: clean(error.message, 400) });
    }
  }
  return dedupeById([...transactions, ...(existingTransactions || []).filter(item => item.trackedSubjectId === subject.id)]);
}

async function collect13FSubject(subject, rows, failures) {
  const allowed = new Set(subject.forms || ['13F-HR', '13F-HR/A']);
  const filings = rows.filter(row => allowed.has(row.form) && row.reportDate).slice(0, 8);
  const byReportDate = new Map();
  for (const filing of filings) {
    if (!byReportDate.has(filing.reportDate) || /\/A$/.test(filing.form)) byReportDate.set(filing.reportDate, filing);
  }
  const selected = [...byReportDate.values()].sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate))).slice(0, 2);
  const parsed = [];
  for (const filing of selected) {
    try {
      const source = await filingXml(subject, filing, 'informationTable');
      const result = parse13F(source.xml, {
        subjectId: subject.id,
        subjectName: subject.name,
        cik: subject.cik,
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        sourceUrl: source.sourceUrl
      });
      const managerDir = path.join(holdingsRoot, safeSegment(subject.id));
      const file = path.join(managerDir, `${filing.reportDate}.json`);
      writeJson(file, {
        ok: true,
        generatedAt: now,
        evidenceBoundary: 'This file reproduces official Form 13F information-table records. It does not reveal exact trade dates, execution prices, short positions, present ownership today or motive.',
        filing: result.filing,
        holdings: result.holdings
      });
      result.filing.holdingsDataUrl = relativeUrl(file);
      result.filing.holdingsSha256 = sha256(fs.readFileSync(file));
      parsed.push(result);
    } catch (error) {
      failures.push({ subjectId: subject.id, form: filing.form, accessionNumber: filing.accessionNumber, observedAt: now, error: clean(error.message, 400) });
    }
  }
  const current = parsed[0] || null;
  const previous = parsed[1] || null;
  let changes = [];
  if (current && previous) {
    changes = compare13F(current.filing, current.holdings, previous.filing, previous.holdings);
    const changeDir = path.join(changesRoot, safeSegment(subject.id));
    const changeFile = path.join(changeDir, `${current.filing.reportDate}.json`);
    writeJson(changeFile, {
      ok: true,
      generatedAt: now,
      evidenceBoundary: 'These changes are inferred by comparing consecutive official quarter-end Form 13F reports. They do not reveal exact trade dates, execution prices, current holdings today, short exposure or motive.',
      manager: { id: subject.id, name: subject.name, cik: subject.cik },
      currentFiling: current.filing,
      previousFiling: previous.filing,
      changes
    });
    current.filing.changesDataUrl = relativeUrl(changeFile);
    current.filing.changesSha256 = sha256(fs.readFileSync(changeFile));
  }
  return { filings: parsed.map(item => item.filing), changes };
}

(async () => {
  if (typeof fetch !== 'function') throw new Error('Node 18+ fetch is required');
  const watchlist = readJson(watchlistPath, { subjects: [] });
  const previousOutput = readJson(outputPath, { insiderTransactions: [], institutionalFilings: [], positionChanges: [], collectionFailures: [] });
  const state = readJson(statePath, { version: 1, subjects: {}, processedAccessions: [] });
  const subjects = (watchlist.subjects || []).filter(subject => subject.enabled && /^\d{10}$/.test(String(subject.cik || '')));
  const allTransactions = [...(previousOutput.insiderTransactions || [])];
  const institutionalFilings = [];
  const allChanges = [];
  const failures = [];

  for (const subject of subjects) {
    try {
      const submissionsUrl = `https://data.sec.gov/submissions/CIK${subject.cik}.json`;
      const submissions = await fetchResource(submissionsUrl, 'json');
      const rows = filingRows(submissions);
      state.subjects[subject.id] = {
        cik: subject.cik,
        name: subject.name,
        lastAttempt: now,
        lastSuccess: now,
        submissionsUrl,
        filingCountObserved: rows.length,
        error: null
      };
      if (subject.kind === 'issuer') {
        const current = await collectForm4Subject(subject, rows, allTransactions, failures);
        const other = allTransactions.filter(item => item.trackedSubjectId !== subject.id);
        allTransactions.splice(0, allTransactions.length, ...other, ...current);
      } else if (subject.kind === 'institution') {
        const result = await collect13FSubject(subject, rows, failures);
        institutionalFilings.push(...result.filings);
        allChanges.push(...result.changes);
      }
    } catch (error) {
      const failure = { subjectId: subject.id, observedAt: now, error: clean(error.message, 400) };
      failures.push(failure);
      state.subjects[subject.id] = {
        ...(state.subjects[subject.id] || {}),
        cik: subject.cik,
        name: subject.name,
        lastAttempt: now,
        lastFailure: now,
        error: failure.error
      };
    }
  }

  const insiderTransactions = latestByDate(dedupeById(allTransactions), ['transactionDate', 'filingDate']).slice(0, 8000);
  const positionChanges = latestByDate(dedupeById(allChanges), ['currentReportDate', 'currentFilingDate'])
    .sort((a, b) => String(b.currentReportDate).localeCompare(String(a.currentReportDate)) || Math.abs(Number(b.currentValueUsd || b.previousValueUsd || 0)) - Math.abs(Number(a.currentValueUsd || a.previousValueUsd || 0)))
    .slice(0, publicChangeLimit);
  const summary = {
    trackedSubjects: subjects.length,
    insiderTransactions: insiderTransactions.length,
    insiderMarketPurchases: insiderTransactions.filter(item => item.transactionCategory === 'open-market-purchase').length,
    insiderMarketSales: insiderTransactions.filter(item => item.transactionCategory === 'open-market-sale').length,
    insiderOtherTransactions: insiderTransactions.filter(item => !item.marketTrade).length,
    institutionalFilings: institutionalFilings.length,
    positionChanges: positionChanges.length,
    newPositions: positionChanges.filter(item => item.changeType === 'new-position').length,
    increasedPositions: positionChanges.filter(item => item.changeType === 'increased-position').length,
    reducedPositions: positionChanges.filter(item => item.changeType === 'reduced-position').length,
    exitedPositions: positionChanges.filter(item => item.changeType === 'exited-position').length,
    collectionFailures: failures.length
  };
  const output = {
    ok: true,
    version: 1,
    generatedAt: now,
    source: 'U.S. Securities and Exchange Commission EDGAR',
    sourceUrl: 'https://www.sec.gov/edgar/search/',
    evidenceGrade: 'A',
    evidenceBoundary: 'These records reproduce or compare official SEC disclosures. A filing does not prove motive, investment merit, present ownership, coordination or wrongdoing. Form 13F differences do not reveal exact trade dates or execution prices.',
    methodology: {
      form4: 'Official ownership XML is parsed by transaction code. Open-market purchases and sales remain separate from grants, exercises, gifts, tax withholding and other events.',
      form13f: 'Official information-table XML from the latest two quarter-end reports is compared by CUSIP, class and put/call status.',
      collection: 'SEC submissions JSON is collected with an identified user agent, serial requests and a delay exceeding the SEC fair-access minimum.'
    },
    summary,
    subjects: subjects.map(subject => ({ ...subject, state: state.subjects[subject.id] || null })),
    insiderTransactions,
    institutionalFilings: latestByDate(institutionalFilings, ['reportDate', 'filingDate']),
    positionChanges,
    collectionFailures: [...failures, ...(previousOutput.collectionFailures || [])].slice(0, 300)
  };
  writeJson(outputPath, output);
  state.updated = now;
  state.lastSuccessfulCollection = failures.length < subjects.length ? now : state.lastSuccessfulCollection || null;
  state.lastFailure = failures.length ? now : null;
  state.processedAccessions = dedupeById([
    ...insiderTransactions.map(item => ({ id: item.filingAccession })),
    ...institutionalFilings.map(item => ({ id: item.accessionNumber }))
  ]).map(item => item.id).filter(Boolean).slice(0, 10000);
  writeJson(statePath, state);
  writeJson(path.join(downloadsDir, 'sec-market-activity-collection-report.json'), {
    ok: summary.trackedSubjects > 0 && summary.collectionFailures < summary.trackedSubjects,
    generatedAt: now,
    summary,
    userAgentConfigured: Boolean(process.env.SEC_USER_AGENT),
    dataFile: relativeUrl(outputPath),
    holdingsDirectories: relativeUrl(holdingsRoot),
    changesDirectories: relativeUrl(changesRoot),
    failures
  });
  console.log(`SEC market activity collection complete: ${summary.insiderTransactions} insider transactions, ${summary.institutionalFilings} institutional filings and ${summary.positionChanges} public position changes.`);
  if (summary.collectionFailures >= summary.trackedSubjects && summary.trackedSubjects > 0) process.exit(1);
})().catch(error => {
  console.error(`SEC market activity collection failed: ${error.stack || error.message}`);
  process.exit(1);
});
