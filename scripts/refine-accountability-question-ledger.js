'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 1200) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const unique = values => [...new Set(array(values).map(value => clean(value)).filter(Boolean))];
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const stripEnd = value => clean(value).replace(/[\s.;:,!?-]+$/g, '');
const actionWords = 'maintain|obtain|verify|restore|request|secure|publish|locate|identify|confirm|authenticate|collect|compare|trace|review|document|find|add|attach|preserve|release|check|establish';

function writeEverywhere(relative, value) {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function patchEverywhere(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
}

function subjectName(value) {
  const withoutInstruction = clean(value, 500).replace(new RegExp(`\\s+[—–-]\\s+(?:${actionWords})\\b[\\s\\S]*$`, 'i'), '');
  return stripEnd(withoutInstruction) || 'this accountability record';
}

function questionFor(entry) {
  const name = subjectName(entry.name);
  const missing = stripEnd(array(entry.missingRecords)[0]);
  if (!missing) return `Which primary records would materially confirm, challenge or resolve the accountability record for ${name}?`;
  if (/^(who|what|when|where|why|how|did|does|do|is|are|can|will|which|has|have)\b/i.test(missing)) return `${missing}?`;
  const action = missing.match(new RegExp(`^(?:${actionWords})\\s+(?:the\\s+)?(.+)$`, 'i'));
  if (action) return `Can the record for ${name} be completed with ${action[1]}?`;
  return `Can this evidence gap for ${name} be resolved: ${missing}?`;
}

const hit = readJson('data/cinematic-hit-list.json');
const ledger = readJson('data/accountability-question-ledger.json');
const byId = new Map(array(hit.entries).map(entry => [clean(entry.id), entry]));
let directRoutes = 0;
let timerOnlyRoutes = 0;
let cleanedSubjects = 0;

for (const question of array(ledger.questions)) {
  const entry = byId.get(clean(question.subjectId));
  if (!entry) continue;
  const refinedSubject = subjectName(entry.name);
  if (refinedSubject !== clean(question.subject)) cleanedSubjects += 1;
  question.subject = refinedSubject;
  question.question = questionFor(entry);
  question.recordsNeeded = unique(entry.missingRecords).slice(0, 8);
  question.dossierRoutes = unique(entry.dossierRoutes).slice(0, 8);
  question.sourceRoutes = unique(entry.sourceRoutes).slice(0, 10);
  question.timerRoutes = unique(array(entry.timerRoutes).map(item => typeof item === 'string' ? item : item && item.route)).slice(0, 8);
  question.lastReviewed = clean(entry.lastReviewed || question.lastReviewed || ledger.generatedAt?.slice(0, 10), 80);
  if (question.dossierRoutes.length || question.sourceRoutes.length) directRoutes += 1;
  else if (question.timerRoutes.length) timerOnlyRoutes += 1;
}

ledger.count = array(ledger.questions).length;
ledger.refinedAt = new Date().toISOString();
ledger.operatingRule = 'Every question retains what is known, what is not proven, which records are needed, whether a response has been received, and what evidence would change the conclusion.';
ledger.questionQualityRule = 'Questions and subject names must be grammatical, avoid imported instruction fragments, end with a question mark, and retain at least one dossier, source or timer route where available.';
ledger.routeCoverage = {
  directDossierOrSource: directRoutes,
  timerOnly: timerOnlyRoutes,
  noMappedRoute: ledger.count - directRoutes - timerOnlyRoutes
};
ledger.cleanedImportedSubjectNames = cleanedSubjects;
writeEverywhere('data/accountability-question-ledger.json', ledger);
patchEverywhere('index.html', html => html
  .replace('How did the public conclusion change over time?', 'What evidence would change the conclusion?')
  .replace('and how the answer changes over time.', 'and what evidence would change the conclusion.'));
writeEverywhere('downloads/accountability-question-ledger-refinement.json', {
  ok: true,
  generatedAt: ledger.refinedAt,
  questions: ledger.count,
  routeCoverage: ledger.routeCoverage,
  cleanedImportedSubjectNames: cleanedSubjects,
  qualityRule: ledger.questionQualityRule,
  operatingRule: ledger.operatingRule
});
console.log(`Accountability Question Ledger refined: ${ledger.count} questions, ${cleanedSubjects} imported subject names cleaned, ${directRoutes} with dossier/source routes, ${timerOnlyRoutes} with timer routes.`);

require('./run-public-consequence-contracts.js');
