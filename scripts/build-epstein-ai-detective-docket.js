const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'daily-epstein-update.json');
const outputPath = path.join(root, 'data', 'epstein-investigator-status.json');

const readJson = file => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
};
const clean = (value, max = 700) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const source = readJson(sourcePath) || { items: [] };
const records = Array.isArray(source.items) ? source.items.filter(item => item && item.title) : [];
const lower = item => `${item.title || ''} ${item.summary || ''} ${item.recordClass || ''} ${item.sourceLabel || ''}`.toLowerCase();
const select = pattern => records.filter(item => pattern.test(lower(item)));
const firstSource = (items, label, fallback = 'daily-epstein-update.html') => {
  const chosen = items.find(item => item.url) || records.find(item => item.url);
  return {
    label,
    url: chosen?.url || fallback,
    locator: chosen ? clean(chosen.title, 220) : 'Current Daily Epstein public-record window',
    evidenceClass: chosen?.recordClass || 'current public-record discovery lead'
  };
};
const commonSources = [
  { label: 'Daily Epstein Update', url: 'daily-epstein-update.html', locator: `${records.length} current record leads`, evidenceClass: 'current public-record window' },
  { label: 'Epstein Command Center', url: 'epstein-files.html', locator: 'evidence and file routes', evidenceClass: 'public evidence hub' },
  { label: 'Daily Epstein JSON', url: 'data/daily-epstein-update.json', locator: source.updated || 'current build', evidenceClass: 'machine-readable source window' }
];

const oversight = select(/house|committee|congress|hearing|panel|subpoena|interview|testimony|oversight/);
const custody = select(/unredacted|redact|justice dept|department of justice|files?|records?|release|provide|disclos/);
const intermediaries = select(/counsel|attorney|lawyer|bank|goldman|finance|financial|advisor|executive|professional|committee interview/);
const intelligenceClaims = select(/\bcia\b|mossad|intelligence|spy|agency|asset/);
const primaryOrOfficial = records.filter(item => /primary|official/i.test(item.sourceTier || ''));
const discovery = records.filter(item => !/primary|official/i.test(item.sourceTier || '') || /discovery/i.test(item.recordClass || ''));

const base = {
  classification: 'ai_speculative_conclusion',
  topic: 'epstein',
  investigationLane: 'epstein-public-record-docket',
  criminalConductEstablished: false,
  humanReviewed: false,
  generatedAt: new Date().toISOString(),
  lastReviewedAt: null
};

const docket = [
  {
    ...base,
    id: 'EP-AI-001',
    title: 'Fragmented custody and disclosure rules may be the main bottleneck in the Epstein files',
    status: custody.length ? 'evidence-supported' : 'developing',
    confidence: { score: custody.length ? 66 : 42, band: custody.length ? 'moderate analytic support' : 'limited analytic support', meaning: 'Support for a records-management hypothesis, not proof of concealment or unlawful conduct.' },
    conclusion: 'The most important obstacle to a complete public record may be fragmented custody, redaction rules, victim-protection duties, court restrictions and overlapping federal or state authority rather than one single unreleased master file.',
    documentedSupport: [
      `${custody.length} current lead(s) refer to files, records, redaction, release, disclosure or Justice Department access.`,
      'The current source window distinguishes official records, oversight actions and discovery leads instead of treating all “Epstein files” as one evidentiary object.'
    ],
    sources: [firstSource(custody, 'Current custody or disclosure lead'), ...commonSources],
    contraryEvidence: [
      'A documented central index, unified evidence inventory or comprehensive release protocol could show that custody is less fragmented than the public record suggests.',
      'Some non-disclosure may result from lawful victim protection, sealed proceedings, grand-jury rules or unrelated privacy obligations rather than institutional obstruction.'
    ],
    missingRecords: ['A complete cross-agency evidence inventory', 'Chain-of-custody and transfer logs', 'Redaction and withholding schedules with legal authority', 'A reconciliation of federal, state, civil and congressional record holdings'],
    alternativeExplanations: ['Lawful privacy and victim-protection restrictions', 'Ordinary inter-agency record fragmentation', 'Pending litigation or grand-jury secrecy', 'Duplicate or low-value material being described as separate “files”'],
    falsificationTests: ['A verified unified inventory accounts for all major collections', 'Agencies publish consistent custody and withholding explanations', 'Court records show the disputed material does not exist or is duplicative', 'Independent audits find no material gaps between known collections'],
    boundary: 'This hypothesis concerns record custody and disclosure mechanics. It does not establish deliberate suppression, a secret controller, or wrongdoing by any named person or institution.'
  },
  {
    ...base,
    id: 'EP-AI-002',
    title: 'Oversight activity may increase records without producing a complete evidentiary picture',
    status: oversight.length ? 'evidence-supported' : 'developing',
    confidence: { score: oversight.length ? 62 : 40, band: oversight.length ? 'moderate analytic support' : 'limited analytic support', meaning: 'Support for an oversight-process pattern, not a forecast that any inquiry will prove misconduct.' },
    conclusion: 'Congressional interviews, hearings and document requests may expand the public record while still leaving unresolved differences between testimony, documentary corroboration, legal privilege and evidence of actual conduct.',
    documentedSupport: [
      `${oversight.length} current lead(s) refer to congressional, committee, hearing, interview, testimony or oversight activity.`,
      'The Daily Epstein system already separates mention, testimony, subpoena, allegation, settlement, charge and conviction as different evidence classes.'
    ],
    sources: [firstSource(oversight, 'Current oversight lead'), ...commonSources],
    contraryEvidence: ['An inquiry may obtain primary records that resolve key questions decisively.', 'Independent court or agency releases may provide stronger evidence than public hearing coverage.'],
    missingRecords: ['Full interview transcripts and exhibits', 'Document-production indexes', 'Privilege and refusal logs', 'Independent corroboration of material testimony'],
    alternativeExplanations: ['Routine political oversight', 'Partisan or media incentives shaping the visible agenda', 'Witness caution based on legal advice', 'Duplicative questioning of already documented relationships'],
    falsificationTests: ['Primary exhibits substantively resolve the disputed questions', 'Oversight reports map each conclusion to disclosed records', 'Contradictory testimony is reconciled through independent evidence', 'The inquiry closes identified custody gaps rather than only producing publicity'],
    boundary: 'An interview, refusal, subpoena or committee appearance is not proof of guilt. This hypothesis evaluates the information value of oversight, not the culpability of witnesses.'
  },
  {
    ...base,
    id: 'EP-AI-003',
    title: 'Professional and institutional intermediaries may be more informative than raw contact lists',
    status: intermediaries.length ? 'developing' : 'weakened',
    confidence: { score: intermediaries.length ? 55 : 30, band: intermediaries.length ? 'limited-to-moderate analytic support' : 'insufficient current support', meaning: 'A prioritisation hypothesis for further document review, not an allegation against professionals or institutions.' },
    conclusion: 'Records involving legal, financial, advisory, property, scheduling or institutional services may reveal how access and transactions were facilitated more clearly than a name appearing once in an address book, photograph or social record.',
    documentedSupport: [
      `${intermediaries.length} current lead(s) mention legal, financial, advisory, executive or professional roles.`,
      'The site’s evidence boundary rejects guilt by association and therefore requires transaction, service, authority or knowledge records before drawing stronger conclusions.'
    ],
    sources: [firstSource(intermediaries, 'Current professional-intermediary lead'), ...commonSources],
    contraryEvidence: ['Many professional interactions may be routine, limited, lawful or performed without knowledge of abuse.', 'A service relationship can be documented without showing facilitation, intent or awareness.'],
    missingRecords: ['Engagement scopes and invoices', 'Transaction-level records with lawful provenance', 'Internal escalation or compliance records', 'Calendars, instructions and communications that establish purpose and knowledge'],
    alternativeExplanations: ['Ordinary professional services', 'Client confidentiality or legal privilege', 'Institutional contact without operational involvement', 'Retrospective prominence caused by later publicity'],
    falsificationTests: ['Primary records show only routine limited services', 'Compliance records demonstrate appropriate escalation and disengagement', 'No transaction, authority or knowledge link exists beyond social association', 'Independent evidence contradicts the proposed facilitation pathway'],
    boundary: 'Professional contact is not evidence of participation in wrongdoing. Stronger inferences require records showing action, knowledge, authority, transaction or concealment.'
  },
  {
    ...base,
    id: 'EP-AI-004',
    title: 'Unverified intelligence-service claims may spread faster than primary evidence',
    status: intelligenceClaims.length ? 'developing' : 'weakened',
    confidence: { score: intelligenceClaims.length ? 48 : 25, band: intelligenceClaims.length ? 'limited analytic support' : 'insufficient current support', meaning: 'Support for an information-quality risk, not support for the underlying intelligence-service allegation.' },
    conclusion: 'Claims connecting Epstein to intelligence services may gain prominence through political statements and secondary reporting before documentary evidence is available, creating a high risk that repetition is mistaken for corroboration.',
    documentedSupport: [
      `${intelligenceClaims.length} current lead(s) contain intelligence-service language or claims.`,
      `${discovery.length} of ${records.length} current lead(s) remain discovery or publisher leads requiring underlying-source review; ${primaryOrOfficial.length} are labelled primary-or-official by the current collector.`
    ],
    sources: [firstSource(intelligenceClaims, 'Current intelligence-claim lead'), ...commonSources],
    contraryEvidence: ['Future declassified files, sworn evidence, authenticated communications or official findings could provide direct support.', 'Multiple genuinely independent primary sources could move the claim beyond repetition.'],
    missingRecords: ['Authenticated tasking, payment or reporting records', 'Declassified agency files with reliable provenance', 'Sworn testimony corroborated by documents', 'Evidence distinguishing intelligence contact from speculation, boasting or political rhetoric'],
    alternativeExplanations: ['Political messaging', 'Secondary-source repetition', 'Confusion between social access and operational relationship', 'Unverified claims amplified by the subject’s secrecy and elite contacts'],
    falsificationTests: ['Primary agency or court records directly establish or reject the relationship', 'Claim chains trace back only to circular secondary reporting', 'Named sources retract or cannot substantiate the allegation', 'Independent document authentication fails'],
    boundary: 'The presence of an intelligence claim in current reporting does not establish an intelligence relationship. The docket keeps the claim unverified until primary evidence meets a substantially higher threshold.'
  }
];

const active = records.length > 0;
const result = {
  version: '2.0',
  updated: new Date().toISOString(),
  status: active ? 'active public-record analysis' : 'awaiting current source window',
  source: 'Matrix Reprogrammed Daily Epstein Update and linked public-record routes',
  currentDataset: 'data/daily-epstein-update.json',
  sourceWindowUpdated: source.sourceWindowUpdated || source.updated || null,
  corpusDocuments: records.length,
  corpusPassages: records.length,
  eligiblePassages: records.filter(item => item.url && item.title).length,
  queuedMissions: 0,
  completedMissions: active ? docket.length : 0,
  publishedConclusions: active ? docket.length : 0,
  reviewDrafts: 0,
  lastMissionStatus: active ? `Rebuilt ${docket.length} bounded hypotheses from ${records.length} current Epstein record leads.` : 'No current record leads were available; no hypotheses were promoted.',
  automaticPublicationScope: 'Epstein system-level speculation page only',
  engine: 'deterministic public-record hypothesis builder',
  docket: active ? docket : [],
  boundary: 'The automated docket publishes questions and system-level hypotheses only. It does not infer named-person guilt, convert association into wrongdoing, expose private victim data, or promote discovery leads to established fact.'
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Epstein AI detective docket built: ${result.publishedConclusions} hypotheses from ${records.length} current record leads.`);
