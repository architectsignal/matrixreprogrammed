const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const hard = [];
const source = rel => path.join(root, rel);
const built = rel => path.join(site, rel);
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const need = (file, label) => { if (!fs.existsSync(file)) hard.push(`missing ${label}: ${path.relative(root, file)}`); };
const requireText = (file, marker, label) => { if (!read(file).includes(marker)) hard.push(`${label} missing marker: ${marker}`); };
const rejectText = (file, marker, label) => { if (read(file).includes(marker)) hard.push(`${label} contains forbidden marker: ${marker}`); };
const parse = (file, label) => { try { return JSON.parse(read(file)); } catch (error) { hard.push(`${label} invalid JSON: ${error.message}`); return null; } };

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024 * 30 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) hard.push(`${script} failed before production validation`);
}

if (!fs.existsSync(site)) hard.push('_site is missing before Behind the Curtain production guard');
else run('scripts/reconcile-power-family-capstone.js');

const requiredSource = [
  'behind-the-curtain.html',
  'behind-the-curtain-access.html',
  'behind-the-curtain-access-v2.js',
  'data/behind-the-curtain-pyramid.json',
  'data/behind-the-curtain-people-registry.json',
  'data/behind-the-curtain-family-access.json',
  'behind-the-curtain-capstone.html',
  'power-family-intelligence-layer.js',
  'power-family-intelligence-layer.css',
  'data/power-family-intelligence-layer.json',
  'data/power-family-curated-people.json',
  'behind-the-curtain-symbolic-capstone.html',
  'behind-the-curtain-capstone.js',
  'data/behind-the-curtain-capstone.json'
];
const requiredBuilt = [
  'behind-the-curtain.html', 'behind-the-curtain',
  'behind-the-curtain-access.html', 'behind-the-curtain-access',
  'behind-the-curtain-access-v2.js',
  'data/behind-the-curtain-pyramid.json',
  'data/behind-the-curtain-people-registry.json',
  'data/behind-the-curtain-family-access.json',
  'behind-the-curtain-capstone.html', 'behind-the-curtain-capstone',
  'power-family-intelligence-layer.js',
  'power-family-intelligence-layer.css',
  'data/power-family-intelligence-layer.json',
  'data/power-family-curated-people.json',
  'behind-the-curtain-symbolic-capstone.html', 'behind-the-curtain-symbolic-capstone',
  'behind-the-curtain-capstone.js',
  'data/behind-the-curtain-capstone.json'
];
requiredSource.forEach(rel => need(source(rel), 'source asset'));
requiredBuilt.forEach(rel => need(built(rel), 'built asset'));

for (const base of [source, built]) {
  const lane = base === source ? 'source' : 'built';
  requireText(base('behind-the-curtain-access.html'), 'behind-the-curtain-access-v2.js', `${lane} Pyramid HTML`);
  requireText(base('behind-the-curtain-access.html'), 'SELECT A LEVEL. NAME ITS OPERATORS.', `${lane} Pyramid HTML`);
  requireText(base('behind-the-curtain-access.html'), 'behind-the-curtain-capstone', `${lane} Pyramid HTML`);
  requireText(base('behind-the-curtain-access-v2.js'), 'renderSelectedTier', `${lane} Pyramid renderer`);

  requireText(base('behind-the-curtain-capstone.html'), 'THE CAPSTONE', `${lane} Power-Family Capstone HTML`);
  requireText(base('behind-the-curtain-capstone.html'), 'POWER-FAMILY INTELLIGENCE LAYER', `${lane} Power-Family Capstone HTML`);
  requireText(base('behind-the-curtain-capstone.html'), 'power-family-intelligence-layer.js', `${lane} Power-Family Capstone HTML`);
  requireText(base('behind-the-curtain-capstone.html'), 'behind-the-curtain-symbolic-capstone.html', `${lane} Power-Family Capstone HTML`);
  rejectText(base('behind-the-curtain-capstone.html'), '<script src="behind-the-curtain-capstone.js"', `${lane} Power-Family Capstone HTML`);
  requireText(base('power-family-intelligence-layer.js'), 'power-family-curated-people.json', `${lane} Power-Family runtime`);
  rejectText(base('power-family-intelligence-layer.js'), 'behind-the-curtain-people-registry.json', `${lane} Power-Family runtime`);
  requireText(base('power-family-intelligence-layer.js'), 'Proximity-to-Power Assessment', `${lane} Power-Family runtime`);
  requireText(base('power-family-intelligence-layer.js'), 'fails closed', `${lane} Power-Family runtime`);

  requireText(base('behind-the-curtain-symbolic-capstone.html'), 'SEPARATE EVIDENCE LANE', `${lane} symbolic annex HTML`);
  requireText(base('behind-the-curtain-symbolic-capstone.html'), 'BLACK NOBILITY IS A HISTORY BEFORE IT IS A THEORY.', `${lane} symbolic annex HTML`);
  requireText(base('behind-the-curtain-symbolic-capstone.html'), 'behind-the-curtain-capstone.js', `${lane} symbolic annex HTML`);
  requireText(base('behind-the-curtain-capstone.js'), 'behind-the-curtain-capstone.json', `${lane} symbolic annex renderer`);
}

if (read(source('behind-the-curtain-access-v2.js')).includes('renderHumanApex')) hard.push('legacy global Top 10 renderer remains in source Pyramid runtime');
if (read(built('behind-the-curtain-access-v2.js')).includes('renderHumanApex')) hard.push('legacy global Top 10 renderer remains in built Pyramid runtime');

const people = parse(source('data/behind-the-curtain-people-registry.json'), 'source broad people registry');
const builtPeople = parse(built('data/behind-the-curtain-people-registry.json'), 'built broad people registry');
const pyramid = parse(source('data/behind-the-curtain-pyramid.json'), 'source Pyramid model');
const builtPyramid = parse(built('data/behind-the-curtain-pyramid.json'), 'built Pyramid model');
const families = parse(source('data/behind-the-curtain-family-access.json'), 'source family access model');
const builtFamilies = parse(built('data/behind-the-curtain-family-access.json'), 'built family access model');
const curated = parse(source('data/power-family-curated-people.json'), 'source curated Power-Family registry');
const builtCurated = parse(built('data/power-family-curated-people.json'), 'built curated Power-Family registry');
const config = parse(source('data/power-family-intelligence-layer.json'), 'source Power-Family configuration');
const builtConfig = parse(built('data/power-family-intelligence-layer.json'), 'built Power-Family configuration');
const symbolic = parse(source('data/behind-the-curtain-capstone.json'), 'source symbolic annex model');
const builtSymbolic = parse(built('data/behind-the-curtain-capstone.json'), 'built symbolic annex model');

function validatePeople(model, label) {
  if (!model) return;
  if (model.schemaVersion !== 1) hard.push(`${label} schema version must be 1`);
  if (!Array.isArray(model.people) || model.people.length < 80) hard.push(`${label} requires at least 80 people`);
  if (new Set((model.people || []).map(item => item.id)).size !== (model.people || []).length) hard.push(`${label} contains duplicate person IDs`);
  const factual = ['public-stage','permanent-system','money-gatekeepers','ownership-infrastructure','intelligence-security','policy-architects','connectors'];
  for (const tier of factual) {
    const count = (model.people || []).filter(person => (person.tierAccess || []).some(access => access.tierId === tier)).length;
    if (count < 10) hard.push(`${label} tier ${tier} has only ${count} people`);
  }
}

function validatePyramid(model, label) {
  if (!model) return;
  if (model.schemaVersion !== 2) hard.push(`${label} schema version must be 2`);
  if (!Array.isArray(model.levels) || model.levels.length !== 12) hard.push(`${label} requires 12 levels`);
  if (!Array.isArray(model.chokePoints) || model.chokePoints.length !== 10) hard.push(`${label} requires 10 choke points`);
  const apex = (model.levels || []).find(item => item.id === 'human-apex');
  if (apex?.memberQuery !== 'cross-system-top-10' || (apex.memberRefs || []).length !== 0) hard.push(`${label} Human Apex must remain dynamic and contain no hard-coded roster`);
  if (!(model.hiddenHandHypotheses || []).some(item => item.classification === 'speculative_hypothesis' && item.notEstablished)) hard.push(`${label} lacks a bounded speculative hidden-hand model`);
}

function validateFamilies(model, label) {
  if (!model) return;
  if (model.schemaVersion !== 1) hard.push(`${label} schema version must be 1`);
  if (!Array.isArray(model.families) || model.families.length < 9) hard.push(`${label} requires at least nine documented family structures`);
  const required = ['house-of-saud','al-nahyan','al-maktoum','al-thani','wallenberg','agnelli-elkann','moller','hoffmann-oeri','heineken'];
  for (const id of required) if (!(model.families || []).some(family => family.id === id)) hard.push(`${label} missing family ${id}`);
  for (const family of model.families || []) {
    if (!family.documentedAccess?.length || !family.constraints?.length || !family.unsupportedClaim || !family.sourceIds?.length) hard.push(`${label} family ${family.id} lacks access, constraints, evidence boundary or source IDs`);
  }
}

function validateCurated(model, familyModel, label) {
  if (!model || !familyModel) return;
  if (model.schemaVersion !== 1) hard.push(`${label} schema version must be 1`);
  if (!Array.isArray(model.people) || model.people.length < 18) hard.push(`${label} requires at least 18 curated living profiles`);
  if (!Array.isArray(model.familyPersonLinks) || model.familyPersonLinks.length < 18) hard.push(`${label} requires at least 18 family-person links`);
  if (!Array.isArray(model.sources) || model.sources.length < 18) hard.push(`${label} requires at least 18 primary-source records`);
  const personIds = new Set((model.people || []).map(person => person.id));
  const familyIds = new Set((familyModel.families || []).map(family => family.id));
  const sourceIds = new Set((model.sources || []).map(item => item.id));
  if (personIds.size !== (model.people || []).length) hard.push(`${label} contains duplicate person IDs`);
  const linkKeys = new Set((model.familyPersonLinks || []).map(link => `${link.familyId}:${link.personId}`));
  if (linkKeys.size !== (model.familyPersonLinks || []).length) hard.push(`${label} contains duplicate links`);
  for (const link of model.familyPersonLinks || []) {
    if (!personIds.has(link.personId)) hard.push(`${label} link references missing person ${link.personId}`);
    if (!familyIds.has(link.familyId)) hard.push(`${label} link references missing family ${link.familyId}`);
    if (!link.relationship || !link.roleType || !link.successionStatus) hard.push(`${label} link ${link.familyId}:${link.personId} lacks typed relationship or succession status`);
  }
  for (const familyId of familyIds) {
    const links = (model.familyPersonLinks || []).filter(link => link.familyId === familyId);
    if (!links.length) hard.push(`${label} family ${familyId} has no living profile`);
    if (!links.some(link => ['family_controller','family_successor','family_operator'].includes(link.roleType))) hard.push(`${label} family ${familyId} lacks a family controller, operator or successor`);
  }
  const gatekeepers = (model.familyPersonLinks || []).filter(link => link.roleType === 'professional_gatekeeper').length;
  if (gatekeepers < 5) hard.push(`${label} has only ${gatekeepers} professional gatekeepers`);
  for (const person of model.people || []) {
    if (!person.name || !person.currentRole || !person.organization || !person.verifiedAt || !person.nextReviewDue) hard.push(`${label} person ${person.id} lacks required identity, role or review fields`);
    if (!person.sourceIds?.length) hard.push(`${label} person ${person.id} lacks source IDs`);
    for (const id of person.sourceIds || []) if (!sourceIds.has(id)) hard.push(`${label} person ${person.id} references unknown source ${id}`);
    if (!person.accessToPower?.length || !person.constraints?.length || !person.notEstablished) hard.push(`${label} person ${person.id} lacks access, constraints or evidence boundary`);
  }
}

function validateConfig(model, label) {
  if (!model) return;
  if (!Array.isArray(model.scoreDimensions) || model.scoreDimensions.length !== 8) hard.push(`${label} requires eight score dimensions`);
  if (!Array.isArray(model.claimClasses) || model.claimClasses.length < 9) hard.push(`${label} requires at least nine claim classes`);
  if (!Array.isArray(model.reviewTriggers) || !model.reviewTriggers.length) hard.push(`${label} lacks review triggers`);
  if (!Array.isArray(model.monitoringTargets) || !model.monitoringTargets.length) hard.push(`${label} lacks monitoring targets`);
}

function validateSymbolic(model, label) {
  if (!model) return;
  if (model.schemaVersion !== 1) hard.push(`${label} schema version must be 1`);
  if (!Array.isArray(model.families) || model.families.length < 13) hard.push(`${label} requires at least 13 historical family files`);
  for (const id of ['orsini','colonna','borghese','chigi','odescalchi','caetani','massimo']) if (!(model.families || []).some(family => family.id === id)) hard.push(`${label} missing historical family ${id}`);
  for (const id of ['baal','moloch','lightbringer','saturn-black-cube']) if (!(model.symbolicApex || []).some(item => item.id === id && item.notEstablished)) hard.push(`${label} missing bounded symbolic dossier ${id}`);
  if (!(model.models || []).some(item => item.classification === 'speculative_hypothesis')) hard.push(`${label} must include an explicitly speculative model`);
  if (!/not established|does not establish|separate speculative/i.test(`${model.editorialBoundary || ''} ${model.historicalFinding || ''}`)) hard.push(`${label} lacks a clear speculation boundary`);
}

validatePeople(people, 'source broad people registry');
validatePeople(builtPeople, 'built broad people registry');
validatePyramid(pyramid, 'source Pyramid model');
validatePyramid(builtPyramid, 'built Pyramid model');
validateFamilies(families, 'source family access model');
validateFamilies(builtFamilies, 'built family access model');
validateCurated(curated, families, 'source curated Power-Family registry');
validateCurated(builtCurated, builtFamilies, 'built curated Power-Family registry');
validateConfig(config, 'source Power-Family configuration');
validateConfig(builtConfig, 'built Power-Family configuration');
validateSymbolic(symbolic, 'source symbolic annex model');
validateSymbolic(builtSymbolic, 'built symbolic annex model');

for (const [label, left, right] of [
  ['broad people registries', people, builtPeople],
  ['Pyramid models', pyramid, builtPyramid],
  ['family access models', families, builtFamilies],
  ['curated Power-Family registries', curated, builtCurated],
  ['Power-Family configurations', config, builtConfig],
  ['symbolic annex models', symbolic, builtSymbolic]
]) if (left && right && JSON.stringify(left) !== JSON.stringify(right)) hard.push(`source and built ${label} differ`);

const report = {
  ok: hard.length === 0,
  checkedAt: new Date().toISOString(),
  hardIssues: hard,
  broadPeopleCount: people?.people?.length || 0,
  pyramidLevels: pyramid?.levels?.length || 0,
  chokePoints: pyramid?.chokePoints?.length || 0,
  documentedFamilies: families?.families?.length || 0,
  curatedLivingProfiles: curated?.people?.length || 0,
  typedFamilyLinks: curated?.familyPersonLinks?.length || 0,
  professionalGatekeepers: curated?.familyPersonLinks?.filter(link => link.roleType === 'professional_gatekeeper').length || 0,
  curatedSources: curated?.sources?.length || 0,
  historicalAnnexFamilies: symbolic?.families?.length || 0,
  symbolicDossiers: symbolic?.symbolicApex?.length || 0
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'behind-the-curtain-production-guard.json'), `${JSON.stringify(report, null, 2)}\n`);
if (hard.length) {
  console.error(`Behind the Curtain production guard failed with ${hard.length} issue(s):`);
  hard.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`Behind the Curtain production guard PASS: ${report.broadPeopleCount} broad profiles, ${report.documentedFamilies} documented families, ${report.curatedLivingProfiles} curated family controllers/gatekeepers/successors, ${report.curatedSources} primary-source records and ${report.symbolicDossiers} separately bounded symbolic dossiers.`);
