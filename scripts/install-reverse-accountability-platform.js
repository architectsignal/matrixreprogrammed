'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();
const MISSION = 'Matrix Reprogrammed is a public accountability system where anyone can search a consequence, trace it backwards through decisions, authority and money, follow the unanswered questions, and return to see what actually happened.';
const PROMISE = 'Search the consequence. Trace the power. Follow the outcome.';

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 1800) => String(value == null ? '' : value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:#39|quot|amp|lt|gt);/g, token => ({ '&#39;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' }[token] || token))
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const slug = value => clean(value, 300).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || 'record';
const unique = values => [...new Set(array(values).map(value => clean(value)).filter(Boolean))];

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function patchEverywhere(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
}

function copyToOutput(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.existsSync(outputRoot)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function nextCheckpoint(checkpoints) {
  const sorted = array(checkpoints).slice().sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
  return sorted.find(item => ['due-now', 'overdue-for-review'].includes(item.status)) || sorted[0] || null;
}

const contractsPayload = readJson('data/public-consequence-contracts.json', { contracts: [] });
const questionsPayload = readJson('data/accountability-question-ledger.json', { questions: [] });
const dropsPayload = readJson('data/latest-public-drops.json', { drops: [] });
const questions = array(questionsPayload.questions);

function relatedQuestions(contract) {
  const title = clean(contract.title, 500).toLowerCase();
  const lane = clean(contract.lane, 160).toLowerCase();
  return questions
    .filter(item => {
      const subject = clean(item.subject, 400).toLowerCase();
      const question = clean(item.question, 900).toLowerCase();
      return (subject && (title.includes(subject) || subject.includes(title))) || (lane && question.includes(lane));
    })
    .map(item => clean(item.question, 900))
    .filter(Boolean)
    .slice(0, 5);
}

function contractRecord(contract, index) {
  const action = contract.actionRecord || {};
  const map = contract.consequenceMap || {};
  const source = contract.source || {};
  const checkpoint = nextCheckpoint(contract.checkpoints);
  const beneficiaries = unique(map.knownBeneficiaries);
  const affected = unique(map.affectedGroups);
  const moneyQuestions = unique(map.moneyQuestions);
  const unanswered = unique([
    contract.accountabilityQuestion,
    map.authorityQuestion,
    map.beneficiaryQuestion,
    map.affectedGroupQuestion,
    ...moneyQuestions,
    ...relatedQuestions(contract)
  ]).slice(0, 10);
  const authority = [clean(action.responsibleActor), clean(action.authorityBasis)].filter(Boolean).join(' · ')
    || clean(map.authorityQuestion)
    || 'Authority has not yet been resolved from a primary record.';
  const money = beneficiaries.length
    ? `Documented or review-stage beneficiaries: ${beneficiaries.join(', ')}`
    : clean(map.moneyStatus) && map.moneyStatus !== 'unmapped'
      ? `Money status: ${clean(map.moneyStatus)}`
      : moneyQuestions[0] || 'Funding, contracts and beneficiaries remain unmapped.';
  const promised = [clean(action.statedRationale), clean(action.claimedPublicBenefit)].filter(Boolean).join(' · ')
    || 'The stated justification and measurable public benefit have not yet been locked.';
  const consequenceSummary = clean(action.summary || action.headline || contract.title, 1200);
  const route = clean(contract.followTarget?.route || `public-consequence-contracts.html#${contract.id || slug(contract.title)}`, 900);
  const pathSteps = [
    { type: 'consequence', label: 'Observed consequence or public issue', value: consequenceSummary || clean(contract.title) },
    { type: 'implementation', label: 'Implementation', value: clean(action.implementationStatus) || 'Implementation status has not yet been verified.', status: clean(contract.termsLock) },
    { type: 'authority', label: 'Decision and authority', value: authority },
    { type: 'money', label: 'Money and beneficiaries', value: money },
    { type: 'justification', label: 'Stated justification and promised benefit', value: promised },
    { type: 'outcome', label: 'Outcome checkpoint', value: checkpoint ? `${clean(checkpoint.label)} due ${String(checkpoint.dueAt || '').slice(0, 10)}: ${clean(checkpoint.reviewQuestion)}` : 'No dated checkpoint has yet been created.', status: checkpoint ? clean(checkpoint.status) : 'unscheduled' }
  ];
  const searchableText = [
    contract.title, contract.lane, contract.laneTitle, consequenceSummary, authority, money, promised,
    beneficiaries.join(' '), affected.join(' '), unanswered.join(' '), source.label, source.classification,
    ...pathSteps.map(item => item.value)
  ].map(value => clean(value, 1600)).join(' ');
  return {
    schemaVersion: 1,
    id: clean(contract.id || `reverse-${slug(contract.title)}-${index + 1}`, 220),
    title: clean(contract.title, 500),
    lane: clean(contract.lane || 'public-accountability', 160),
    laneTitle: clean(contract.laneTitle || 'Public Accountability', 220),
    actionDate: clean(contract.actionDate || contract.createdAt || generatedAt, 80),
    consequenceSummary,
    route,
    source: {
      label: clean(source.label || 'Public source', 260),
      url: clean(source.url, 1200),
      classification: clean(source.classification || 'public-source-lead', 160),
      evidenceRoute: clean(source.evidenceRoute || 'evidence-vault.html', 900)
    },
    path: pathSteps,
    unansweredQuestions: unanswered,
    checkpoints: array(contract.checkpoints),
    knownBeneficiaries: beneficiaries,
    affectedGroups: affected,
    evidenceBoundary: clean(contract.evidenceBoundary || contractsPayload.boundary || 'This is a route into the public record, not proof of wrongdoing, responsibility or causation.', 1400),
    searchableText
  };
}

function fallbackRecord(drop, index) {
  const title = clean(drop.title, 500);
  const summary = clean(drop.summary || drop.whyItMatters || title, 1200);
  const lane = clean(drop.lane || 'public-accountability', 160);
  const question = `Which decision, authority, funding route and implementation chain produced or shaped this consequence: ${title}?`;
  const source = {
    label: clean(drop.sourceLabel || 'Public source', 260),
    url: clean(drop.url, 1200),
    classification: clean(drop.evidenceLevel || 'public-source-lead', 160),
    evidenceRoute: clean(drop.evidenceRoute || 'evidence-vault.html', 900)
  };
  const pathSteps = [
    { type: 'consequence', label: 'Observed consequence or public issue', value: summary },
    { type: 'implementation', label: 'Implementation', value: 'This lead has not yet been resolved into an implementation record.', status: 'lead-stage' },
    { type: 'authority', label: 'Decision and authority', value: 'The responsible decision-maker and legal or delegated authority remain unresolved.' },
    { type: 'money', label: 'Money and beneficiaries', value: 'Funding, contracts, ownership effects and direct beneficiaries remain unmapped.' },
    { type: 'justification', label: 'Stated justification and promised benefit', value: 'A primary statement of purpose and measurable benefit has not yet been attached.' },
    { type: 'outcome', label: 'Outcome checkpoint', value: 'Create a Public Consequence Contract before judging the outcome.', status: 'contract-required' }
  ];
  return {
    schemaVersion: 1,
    id: `reverse-${slug(drop.id || title)}-${index + 1}`,
    title,
    lane,
    laneTitle: clean(drop.laneTitle || 'Public Accountability', 220),
    actionDate: clean(drop.published || generatedAt, 80),
    consequenceSummary: summary,
    route: 'public-consequence-contracts.html',
    source,
    path: pathSteps,
    unansweredQuestions: [question],
    checkpoints: [],
    knownBeneficiaries: [],
    affectedGroups: [],
    evidenceBoundary: clean(drop.evidenceBoundary || dropsPayload.boundary || 'This is a public-source lead. Relevance does not prove responsibility, causation or wrongdoing.', 1400),
    searchableText: [title, summary, lane, question, source.label, ...pathSteps.map(item => item.value)].join(' ')
  };
}

const contracts = array(contractsPayload.contracts);
const records = contracts.length
  ? contracts.map(contractRecord)
  : array(dropsPayload.drops).slice(0, 40).map(fallbackRecord);

const reverseIndex = {
  schemaVersion: 1,
  generatedAt,
  title: 'Reverse Accountability Search Index',
  mission: MISSION,
  publicPromise: PROMISE,
  operatingRule: 'A match is a route into potentially relevant public records. It is not proof that a named person or institution caused the consequence, exercised authority or benefited.',
  count: records.length,
  records
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(reverseIndex, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reverse Accountability Search | Matrix Reprogrammed</title><meta name="description" content="Start with a consequence and trace backwards through implementation, decisions, authority, money, promised benefits and unanswered questions."><meta property="og:title" content="Search the consequence. Trace the power. Follow the outcome."><meta property="og:description" content="Reverse Accountability Search by Matrix Reprogrammed."><meta property="og:type" content="website"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="reverse-accountability-search.css"></head><body class="reverse-accountability-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="signal-face" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div><div class="page"><header class="reverse-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav aria-label="Primary navigation"><a href="index.html">Search power</a><a href="public-consequence-contracts.html">Accountability Twins</a><a href="hit-list.html">Hit List</a><a href="member-dashboard.html">My Watchlist</a></nav></header><main><section class="reverse-hero wrap"><p class="reverse-kicker">A new way to investigate power</p><h1>START WITH<br>WHAT HAPPENED.</h1><p class="lead">Describe the bill, closure, restriction, contract, policy outcome or public consequence. The system searches backwards for the decision, authority, money, implementation chain, promised benefit and unanswered questions.</p><p class="reverse-mission">${esc(MISSION)}</p><form class="reverse-search-form" data-reverse-search-form role="search"><label class="sr-only" for="reverse-accountability-query">Describe a consequence</label><input id="reverse-accountability-query" data-reverse-search-input type="search" autocomplete="off" spellcheck="false" placeholder="Why did my bill rise? Who authorised this system? Who benefited?"><button type="submit">Trace the power</button></form><p class="reverse-status" data-reverse-search-status aria-live="polite">Loading consequence and accountability records…</p><div class="reverse-examples" aria-label="Example consequence searches"><button type="button" data-reverse-example="Why did my electricity bill rise?">Electricity bill rose</button><button type="button" data-reverse-example="Why was this hospital closed?">Hospital closed</button><button type="button" data-reverse-example="Who authorised this surveillance system?">Surveillance system</button><button type="button" data-reverse-example="Who benefited from this government contract?">Government contract</button><button type="button" data-reverse-example="Why is digital identity being required?">Digital identity</button></div></section><section class="reverse-explainer wrap"><article><span>1</span><h2>Search the consequence</h2><p>Begin with the real-world effect rather than needing to know an obscure official, regulator, contractor or institution.</p></article><article><span>2</span><h2>Trace the power</h2><p>Follow the evidence backwards through implementation, authority, decisions, money, beneficiaries and the stated justification.</p></article><article><span>3</span><h2>Follow the outcome</h2><p>Open the Accountability Twin, follow the unanswered question and return at the next evidence or outcome checkpoint.</p></article></section><section class="reverse-results wrap" data-reverse-search-results></section><section class="reverse-boundary-panel wrap"><strong>Evidence boundary:</strong> Search relevance is not proof of responsibility, causation, benefit or wrongdoing. Each result must be checked against original records, authority, timing, alternative explanations and evidence that may weaken the proposed path.</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — ${esc(PROMISE)}</p></footer></div><script src="matrix.js"></script><script src="reverse-accountability-search.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('reverse-accountability-search.html', page);

copyToOutput('reverse-accountability-search.js');
copyToOutput('reverse-accountability-search.css');
copyToOutput('data/accountability-innovation-roadmap.json');

function patchWelcomeGate(source) {
  const intro = `  const introLines = [\n    '> WELCOME TO MATRIX REPROGRAMMED',\n    '> ${MISSION}',\n    '> SEARCH THE CONSEQUENCE.',\n    '> TRACE THE POWER.',\n    '> FOLLOW THE OUTCOME.'\n  ];`;
  let next = source.replace(/  const introLines = \[[\s\S]*?\n  \];/, intro);
  next = next.replace("const storageKey = 'matrix-reprogrammed-signal-gate-entered';", "const storageKey = 'matrix-reprogrammed-signal-gate-entered-accountability-v1';");
  next = next.replace(/voiceButton\.textContent = 'Voice Intro';/g, "voiceButton.textContent = 'Play Voice Mission';");
  next = next.replace(/setVoiceStatus\('Voice Intro', false\)/g, "setVoiceStatus('Play Voice Mission', false)");
  return next;
}
patchEverywhere('welcome-gate.js', patchWelcomeGate);
copyToOutput('welcome-gate.js');
copyToOutput('welcome-gate.css');

const gateMarkup = `<!-- accountability-mission-intro:start --><section class="signal-gate" data-signal-gate aria-label="Welcome to Matrix Reprogrammed"><div class="gate-panel"><div class="gate-content"><div class="gate-sigil" aria-hidden="true"></div><div class="gate-kicker">Public Accountability System</div><h1 class="gate-title">Welcome To <span>Matrix Reprogrammed</span></h1><div class="gate-terminal" data-gate-type aria-live="polite"></div><div class="gate-actions"><a class="btn" href="#accountability-search" data-enter-archive>Search The Record</a><a class="btn alt" href="reverse-accountability-search.html" data-enter-archive>Search A Consequence</a><button class="gate-skip" type="button" data-enter-archive>Skip Intro</button></div></div></div></section><button class="gate-replay" type="button" data-replay-gate aria-label="Replay welcome intro">◎</button><!-- accountability-mission-intro:end -->`;
const reverseEntry = `<!-- reverse-accountability-entry:start --><p class="accountability-lead reverse-accountability-promise">${esc(MISSION)}</p><div class="accountability-primary-actions reverse-accountability-mode"><a href="reverse-accountability-search.html"><strong>Start with a consequence</strong> — ${esc(PROMISE)}</a></div><!-- reverse-accountability-entry:end -->`;

function patchHomepage(html) {
  let next = html;
  if (!next.includes('welcome-gate.css')) next = next.replace('</head>', '<link rel="stylesheet" href="welcome-gate.css"></head>');
  if (!next.includes('data-signal-gate')) next = next.replace(/<body([^>]*)>/i, `<body$1>${gateMarkup}`);
  if (!next.includes('welcome-gate.js')) next = next.replace('</body>', '<script src="welcome-gate.js"></script></body>');
  if (!next.includes('reverse-accountability-entry:start')) {
    const leadPattern = /(<p class="accountability-lead">[\s\S]*?<\/p>)/i;
    if (leadPattern.test(next)) next = next.replace(leadPattern, `$1${reverseEntry}`);
    else next = next.replace(/<main([^>]*)>/i, `<main$1>${reverseEntry}`);
  }
  if (!next.includes('href="reverse-accountability-search.html"') && next.includes('<nav')) {
    next = next.replace(/(<nav[^>]*>)/i, '$1<a href="reverse-accountability-search.html">Search a consequence</a>');
  }
  return next;
}
patchEverywhere('index.html', patchHomepage);

const report = {
  ok: records.length > 0,
  generatedAt,
  mission: MISSION,
  publicPromise: PROMISE,
  recordCount: records.length,
  source: contracts.length ? 'public-consequence-contracts' : 'latest-public-drops-fallback',
  outputs: ['reverse-accountability-search.html', 'reverse-accountability-search.js', 'reverse-accountability-search.css', 'data/reverse-accountability-index.json'],
  intro: { visible: true, voiceSource: 'existing ElevenLabs endpoint with browser speech fallback', storageVersion: 'accountability-v1' },
  lockedSystems: array(readJson('data/accountability-innovation-roadmap.json', {}).systems).map(item => item.name)
};
writeEverywhere('downloads/reverse-accountability-platform-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Reverse Accountability Search could not build any records.');
console.log(`Reverse Accountability Search installed with ${records.length} evidence-bounded path records.`);
