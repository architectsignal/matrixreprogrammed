const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.cwd();
const parts = [1, 2, 3, 4].map(index => {
  const file = path.join(root, 'data', `death-files-catalog.b64.${index}`);
  if (!fs.existsSync(file)) throw new Error(`Death Files catalogue segment missing: ${file}`);
  return fs.readFileSync(file, 'utf8').trim();
});
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(parts.join(''), 'base64')).toString('utf8'));
const catalog = Array.isArray(payload) ? payload : payload?.cases;
const nowYear = new Date().getUTCFullYear();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function clean(value) {
  return String(value || '').trim();
}
function requireText(item, field, min = 24) {
  const value = clean(item[field]);
  assert(value.length >= min, `${item.name || item.slug}: ${field} must contain at least ${min} characters`);
  return value;
}
function genericRelationship(item) {
  return [
    {
      name: item.authorities?.[0] || 'Relevant investigating authority',
      type: 'Official investigation or inquiry',
      status: 'Established fact',
      boundary: 'Institutional involvement in an inquiry is not evidence that the institution caused the death.'
    },
    {
      name: 'People or institutions affected by the death',
      type: 'Consequence and beneficiary analysis',
      status: 'Analytical lead',
      boundary: 'Benefit, succession, or policy advantage does not establish motive or responsibility.'
    }
  ];
}
function fullDossier(item) {
  const pressure = requireText(item, 'pressure');
  const official = requireText(item, 'official');
  const specReason = requireText(item, 'specReason');
  const support = requireText(item, 'support');
  const counter = requireText(item, 'counter');
  const aftermath = requireText(item, 'aftermath');
  const proofNeeded = `A credible causal conclusion would require authenticated evidence connecting a specific actor to motive, capability, planning, access, and the mechanism of ${item.name}'s death. Timing, benefit, association, or institutional secrecy alone are not sufficient.`;
  const suspectedMotive = `The proposed motive is that ${item.name}'s documented work, policy direction, knowledge, invention, testimony, investigation, or challenge to entrenched power threatened interests with the capacity to resist change.`;
  return {
    id: `death-${item.slug}`,
    slug: item.slug,
    name: item.name,
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    year: Number(item.year),
    born: item.born || '',
    died: item.died,
    age: item.age || 'Not yet verified',
    place: item.place,
    nationality: item.nationality,
    occupation: item.occupation,
    categories: Array.isArray(item.categories) && item.categories.length ? item.categories : ['High-profile death', 'Institutional conflict'],
    officialCause: item.officialCause,
    officialManner: item.officialManner,
    caseStatus: item.caseStatus || 'Baseline dossier published; continuing evidence review',
    investigatingAuthorities: Array.isArray(item.authorities) ? item.authorities : [],
    whyMatters: `${pressure} ${aftermath}`,
    cinematicOpening: `${item.name} died on ${item.died} in ${item.place}. The event ended a consequential life and immediately changed the policy, investigation, institution, invention, movement, or network around it. This dossier reconstructs what is documented before testing the suspicions that followed.`,
    officialAccount: official,
    evidenceConclusion: `The current evidence baseline supports the documented cause and official account only to the degree described in the cited record. The surrounding conflict and consequences justify continued investigation, but they do not independently prove a hidden operation. ${counter}`,
    analyticalInference: `${pressure} The timing and aftermath can create a rational investigative hypothesis, especially where transparency, security, forensic, or institutional questions remain. That hypothesis is analysis, not established fact.`,
    speculation: `Why conspiracy theories exist: ${specReason} Suspected motive: ${suspectedMotive} Supporters point to: ${support} Strongest counter-evidence and limitation: ${counter} Proof required: ${proofNeeded}`,
    conspiracyRationale: {
      reason: specReason,
      suspectedMotive,
      supportingClues: support,
      counterEvidence: counter,
      proofNeeded
    },
    involvements: [
      {
        label: 'Documented conflict, work, policy or invention',
        status: 'Established or strongly supported context',
        detail: pressure
      },
      {
        label: 'Claim that this work caused the death',
        status: 'Unverified allegation',
        detail: 'A temporal or political connection must be tested against direct evidence, opportunity, mechanism, and credible alternative explanations.'
      }
    ],
    knowledge: [
      {
        label: 'Documented knowledge and access',
        status: 'Case-specific evidence review',
        detail: `The dossier tracks what ${item.name} demonstrably knew, controlled, investigated, invented, planned, or could access through their position.`
      },
      {
        label: 'Secret knowledge as a motive',
        status: 'Unverified allegation',
        detail: 'Access, association, or public claims do not establish possession of a specific secret or a causal motive.'
      }
    ],
    relationships: genericRelationship(item),
    timeline: [
      {
        date: item.died,
        status: 'Established fact',
        event: `${item.name} died in ${item.place}.`
      },
      {
        date: 'After the death',
        status: 'Documented consequence',
        event: aftermath
      }
    ],
    questions: [
      {
        question: 'Why do conspiracy theories exist around this death?',
        status: 'Detailed speculation review',
        needed: `${specReason} ${support}`
      },
      {
        question: 'What evidence would confirm or falsify the suspected power-conflict motive?',
        status: 'Open evidence request',
        needed: proofNeeded
      },
      {
        question: 'Which evidence weakens the conspiracy interpretation?',
        status: 'Counter-evidence required',
        needed: counter
      }
    ],
    aftermath: [aftermath],
    money: [
      {
        label: 'Policy, control, financial or succession consequences',
        status: 'Documented consequence requiring case-specific sourcing',
        detail: aftermath
      },
      {
        label: 'Benefit as proof of involvement',
        status: 'False inference',
        detail: 'Who benefited is a legitimate investigative question, but benefit does not establish motive, coordination, or action.'
      }
    ],
    evidence: [
      {
        title: `${item.name}: primary or authoritative starting record`,
        publisher: item.authorities?.[0] || 'Authoritative public record',
        date: String(item.year),
        level: 'Primary-source starting point',
        url: item.sourceUrl
      }
    ],
    relatedPages: [
      'follow-the-money.html',
      'track-the-families.html',
      'behind-the-curtain.html',
      'ten-choke-points.html',
      'institution-tracker.html',
      'evidence-vault.html',
      'source-document-vault.html',
      'network-maps.html',
      'dark-speculation-lab.html'
    ],
    keywords: [...new Set([item.name, ...(item.aliases || []), ...(item.keywords || []), ...(item.categories || [])])],
    researchTier: item.researchTier || 'Baseline evidence dossier — scheduled for source expansion',
    speculationRequired: true
  };
}

assert(Array.isArray(catalog), 'Death Files compact catalogue must contain a cases array');
assert(catalog.length === 100, `Death Files catalogue must contain exactly 100 cases; found ${catalog.length}`);
const slugs = new Set();
const names = new Set();
for (const item of catalog) {
  assert(item && typeof item === 'object', 'Every catalogue item must be an object');
  assert(Number.isInteger(Number(item.year)), `${item.name}: year must be an integer`);
  assert(Number(item.year) >= 1963 && Number(item.year) <= nowYear, `${item.name}: year must be between 1963 and ${nowYear}`);
  assert(clean(item.slug).length > 2, `${item.name}: slug missing`);
  assert(!slugs.has(item.slug), `Duplicate Death Files slug: ${item.slug}`);
  assert(!names.has(item.name), `Duplicate Death Files name: ${item.name}`);
  slugs.add(item.slug);
  names.add(item.name);
  for (const field of ['name','died','place','occupation','officialCause','officialManner','pressure','official','specReason','support','counter','aftermath','sourceUrl']) {
    requireText(item, field, field === 'name' ? 3 : 8);
  }
  assert(/^https:\/\//i.test(item.sourceUrl), `${item.name}: sourceUrl must be HTTPS`);
}
assert(slugs.has('john-f-kennedy'), 'The archive must begin with John F. Kennedy');
assert(slugs.has('muammar-gaddafi'), 'Muammar Gaddafi must be included');
assert(slugs.has('alexei-navalny'), 'A present-era case must be included');
assert(slugs.has('ebrahim-raisi'), 'The archive must extend into the current era');

const dossiers = catalog.map(fullDossier).sort((a, b) => a.year - b.year || a.died.localeCompare(b.died) || a.name.localeCompare(b.name));
const model = {
  version: '2.0.0',
  updated: new Date().toISOString().slice(0, 10),
  title: 'The Death Files',
  subtitle: '100 high-profile deaths from John F. Kennedy to the present: what changed, who was threatened, and why conspiracy theories persist.',
  boundary: 'Inclusion does not imply murder, conspiracy, or wrongdoing by any connected person. Official findings, established evidence, disputed claims, analytical inference, and speculation are displayed separately.',
  selectionPrinciple: 'Cases are selected because the person was changing policy, preparing testimony, investigating power, controlling consequential information or assets, developing an invention, leading a movement, or otherwise confronting institutional interests. Inclusion is an investigative priority decision, not a finding that those interests caused the death.',
  speculationRule: 'Every dossier must explain in detail why conspiracy theories exist, the suspected motive, the clues cited by supporters, the strongest counter-evidence, and the proof required. Speculation must never overwrite the evidence-based conclusion.',
  evidenceLevels: ['Established fact','Strongly supported','Official finding','Official allegation','Sworn claim','Credible analytical inference','Disputed claim','Unverified allegation','Deep speculation','False, misleading, or disproven'],
  dossiers
};

const output = path.join(root, 'data', 'death-files.json');
fs.writeFileSync(output, JSON.stringify(model, null, 2) + '\n');
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'death-files-100-catalogue.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: dossiers.length,
  firstYear: Math.min(...dossiers.map(item => item.year)),
  latestYear: Math.max(...dossiers.map(item => item.year)),
  cases: dossiers.map(item => ({ name: item.name, year: item.year, slug: item.slug, categories: item.categories }))
}, null, 2) + '\n');
console.log(`Death Files expansion prepared: ${dossiers.length} dossiers from ${dossiers[0].year} to ${dossiers[dossiers.length - 1].year}.`);
