const fs = require('fs');
const path = require('path');

const root = process.cwd();
const startedAt = new Date().toISOString();
const OUT_DATA = path.join(root, 'data', 'auto-evidence-pipeline-report.json');
const OUT_MD = path.join(root, 'downloads', 'auto-evidence-pipeline-report.md');
const OUT_HTML_DATA = path.join(root, 'data', 'auto-evidence-latest.json');

const sources = [
  {
    id: 'DOJ-EPSTEIN-CASE',
    label: 'United States v. Epstein DOJ court-record page',
    url: 'https://www.justice.gov/epstein/doj-disclosures/court-records-united-states-v-epstein-no-119-cr-00490-sdny-2019',
    lane: 'confirmed criminal case lane'
  },
  {
    id: 'DOJ-MAXWELL-CASE',
    label: 'United States v. Maxwell DOJ court-record page',
    url: 'https://www.justice.gov/epstein/doj-disclosures/court-records-united-states-v-maxwell-no-120-cr-00330-sdny-2020',
    lane: 'confirmed criminal case lane'
  },
  {
    id: 'DOJ-USVI-JPMORGAN',
    label: 'Government of the USVI v. JPMorgan Chase Bank, N.A. DOJ court-record page',
    url: 'https://www.justice.gov/epstein/doj-disclosures/court-records-government-united-states-virgin-islands-v-jpmorgan-chase-bank-na-no-122-cv-10904-sdny-2022',
    lane: 'institution / banking compliance lane'
  },
  {
    id: 'DOJ-DATASET-9',
    label: 'DOJ Data Set 9 files',
    url: 'https://www.justice.gov/epstein/doj-disclosures/data-set-9-files',
    lane: 'data-set scanner lane'
  },
  {
    id: 'DOJ-DISCLOSURES',
    label: 'DOJ Epstein disclosures index',
    url: 'https://www.justice.gov/epstein/doj-disclosures',
    lane: 'source route index lane'
  }
];

function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function unique(arr) { return Array.from(new Set(arr)); }
function extractPdfIds(html) {
  return unique(String(html || '').match(/EFTA\d+\.pdf/gi) || []).sort();
}
function sourceRecord(source, ok, details = {}) {
  return {
    id: source.id,
    label: source.label,
    url: source.url,
    lane: source.lane,
    ok,
    ...details
  };
}
async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AUTO_EVIDENCE_TIMEOUT_MS || 20000));
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'matrixreprogrammed-auto-evidence-pipeline/1.0',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, url: res.url, text };
  } finally {
    clearTimeout(timeout);
  }
}
function classifyIndex(source, html, fetched) {
  const pdfIds = extractPdfIds(html);
  const hasAgeGate = /age verification|verify your age|age-verification/i.test(html) || /age-verification/i.test(fetched.url || '');
  const hasPrivacyNotice = /sensitive|non-public personal information|sexual assault|redaction/i.test(html);
  return sourceRecord(source, fetched.ok, {
    statusCode: fetched.status,
    finalUrl: fetched.url,
    pdfCount: pdfIds.length,
    firstTenPdfIds: pdfIds.slice(0, 10),
    hasAgeGate,
    hasPrivacyNotice,
    evidenceGrade: fetched.ok ? 'A for official index route; C for PDF content until reviewed' : 'C route unavailable / retry required',
    recordShows: fetched.ok ? 'Official source index was reachable and PDF identifiers were extracted where present.' : 'Source route was attempted but not reachable in this run.',
    recordDoesNotShow: 'This automated scan does not read gated PDF contents, identify private victims, verify allegations, or infer wrongdoing.',
    nextPull: pdfIds.length ? 'Review newly seen PDF IDs manually after any required verification; create verified record cards only after file-level review.' : 'Retry route and monitor for public changes.'
  });
}
function diffIds(previous, current) {
  const prev = new Set(previous || []);
  return (current || []).filter(id => !prev.has(id));
}
async function main() {
  const previous = readJson(OUT_DATA, { sources: [] });
  const previousById = new Map((previous.sources || []).map(item => [item.id, item]));
  const records = [];
  const failures = [];
  for (const source of sources) {
    try {
      const fetched = await fetchText(source.url);
      const rec = classifyIndex(source, fetched.text, fetched);
      const old = previousById.get(source.id) || {};
      rec.newPdfIds = diffIds(old.pdfIds || old.allPdfIds || [], extractPdfIds(fetched.text));
      rec.allPdfIds = extractPdfIds(fetched.text);
      rec.changed = rec.newPdfIds.length > 0 || rec.pdfCount !== (old.pdfCount || 0) || rec.ok !== old.ok;
      records.push(rec);
    } catch (error) {
      const rec = sourceRecord(source, false, {
        error: error.message,
        pdfCount: 0,
        firstTenPdfIds: [],
        allPdfIds: [],
        newPdfIds: [],
        changed: true,
        evidenceGrade: 'C route unavailable / retry required',
        recordShows: 'The source route could not be fetched by the automated scanner in this run.',
        recordDoesNotShow: 'No file content or claims were verified.',
        nextPull: 'Retry route and inspect manually if repeated failures occur.'
      });
      failures.push(rec);
      records.push(rec);
    }
  }
  const allPdfIds = unique(records.flatMap(r => r.allPdfIds || []));
  const report = {
    updated: new Date().toISOString(),
    startedAt,
    title: 'Auto Evidence Pipeline Report',
    mission: 'Automatically scan reachable official Epstein source indexes, detect new PDF IDs, create safe review tasks, and refuse gated/private file-level claims.',
    boundary: 'Automation scans public index pages and PDF identifiers only. It does not bypass age verification, publish private victim identifiers, read inaccessible gated PDFs, or assert wrongdoing without verified record cards.',
    sourceCount: records.length,
    reachableSources: records.filter(r => r.ok).length,
    failedSources: records.filter(r => !r.ok).length,
    totalPdfIds: allPdfIds.length,
    changedSources: records.filter(r => r.changed).map(r => r.id),
    newPdfIds: unique(records.flatMap(r => r.newPdfIds || [])),
    sources: records,
    tasks: [
      {
        taskId: 'AUTO-EFT-001',
        subject: 'Monitor official DOJ Epstein source indexes',
        status: 'automatic recurring',
        cadence: 'daily plus manual workflow_dispatch',
        evidenceClass: 'official source index / PDF identifier route',
        nextPull: 'If new PDF IDs appear, create manual review tasks and verified cards after safe file-level review.',
        privacyBoundary: 'No bypassing gates, no private victim identifiers, no explicit content, no unsupported claims.'
      },
      {
        taskId: 'AUTO-EFT-002',
        subject: 'Flag gated PDFs for manual review',
        status: 'automatic recurring',
        evidenceClass: 'gated official PDF route',
        nextPull: 'Manual reviewer opens accessible PDFs through lawful public process and enters non-sensitive record classifications.',
        privacyBoundary: 'Gated content remains C until manually reviewed and safely summarized.'
      }
    ]
  };

  ensureDir(OUT_DATA); ensureDir(OUT_MD); ensureDir(OUT_HTML_DATA);
  fs.writeFileSync(OUT_DATA, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_HTML_DATA, JSON.stringify(report, null, 2));
  const lines = [];
  lines.push('# Auto Evidence Pipeline Report');
  lines.push('');
  lines.push(`Updated: ${report.updated}`);
  lines.push('');
  lines.push(`Boundary: ${report.boundary}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Sources scanned: ${report.sourceCount}`);
  lines.push(`- Reachable sources: ${report.reachableSources}`);
  lines.push(`- Failed sources: ${report.failedSources}`);
  lines.push(`- Total unique PDF IDs indexed: ${report.totalPdfIds}`);
  lines.push(`- New PDF IDs since previous run: ${report.newPdfIds.length}`);
  lines.push('');
  lines.push('## Sources');
  lines.push('');
  for (const r of records) {
    lines.push(`### ${r.label}`);
    lines.push('');
    lines.push(`- ID: ${r.id}`);
    lines.push(`- URL: ${r.url}`);
    lines.push(`- OK: ${r.ok}`);
    lines.push(`- PDF IDs indexed: ${r.pdfCount}`);
    lines.push(`- New PDF IDs: ${(r.newPdfIds || []).length}`);
    lines.push(`- Evidence grade: ${r.evidenceGrade}`);
    lines.push(`- Record shows: ${r.recordShows}`);
    lines.push(`- Record does not show: ${r.recordDoesNotShow}`);
    lines.push(`- Next pull: ${r.nextPull}`);
    if ((r.firstTenPdfIds || []).length) lines.push(`- First ten PDF IDs: ${(r.firstTenPdfIds || []).join(', ')}`);
    lines.push('');
  }
  fs.writeFileSync(OUT_MD, lines.join('\n'));
  if (failures.length) console.warn(`Auto evidence pipeline completed with ${failures.length} source failure(s).`);
  console.log(`Auto evidence pipeline complete: ${records.length} sources, ${allPdfIds.length} PDF IDs, ${report.newPdfIds.length} new.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
