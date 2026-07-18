const fs = require('fs');
const path = require('path');

const root = process.cwd();
const generatorPath = path.join(root, 'scripts', 'build-entity-exposure-index.js');
if (!fs.existsSync(generatorPath)) throw new Error('build-entity-exposure-index.js is missing');

let source = fs.readFileSync(generatorPath, 'utf8');
const before = source;

const oldClean = "function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }";
const newClean = `function scalarText(value, depth = 0){
  if (value == null || depth > 5) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name','label','title','display_name','displayName','entity','value','text','description']) {
      const candidate = scalarText(value[key], depth + 1);
      if (candidate) return candidate;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function clean(value = ''){ return scalarText(value).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }`;
if (source.includes(oldClean)) source = source.replace(oldClean, newClean);
if (!source.includes('function scalarText(value, depth = 0)')) throw new Error('Scalar normalizer was not installed');

source = source.replace(
  "  if (!label || label.length < 2) return null;",
  "  if (!label || label.length < 2 || label === '[object Object]' || label === 'object Object') return null;"
);

const oldBriefLoop = `for (const brief of arr(briefFeed.briefs)) {
  const entity = ensureEntity(brief.name);
  if (!entity) continue;
  maybeUpgradeGrade(entity, brief.evidence_grade || 'documented association');
  entity.missing_records = uniq([...entity.missing_records, ...(brief.missing_records || [])]);
  entity.watch_next = uniq([...entity.watch_next, ...(brief.watch_next || [])]);
  for (const route of arr(brief.source_routes)) {
    const text = \`${'${brief.name}'} ${'${brief.evidence_grade}'} ${'${brief.plain_english_judgement}'} ${'${route.title}'} ${'${route.grade}'}\`;
    const hits = classifyText(text, route.grade || brief.evidence_grade || 'documented association');
    const top = hits[0];
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    entity.records.push({ title: route.title || brief.name, url: route.url || 'entity-daily-briefs.html', grade: top.grade, category: top.label, matched_terms: top.matched_terms });
    maybeUpgradeGrade(entity, top.grade);
  }
}`;
const newBriefLoop = `for (const brief of arr(briefFeed.briefs)) {
  const briefName = clean(brief.name);
  const entity = ensureEntity(briefName);
  if (!entity) continue;
  maybeUpgradeGrade(entity, clean(brief.evidence_grade) || 'documented association');
  entity.missing_records = uniq([...entity.missing_records, ...(brief.missing_records || [])]);
  entity.watch_next = uniq([...entity.watch_next, ...(brief.watch_next || [])]);
  for (const route of arr(brief.source_routes)) {
    const routeTitle = clean(route.title) || briefName;
    const routeGrade = clean(route.grade) || clean(brief.evidence_grade) || 'documented association';
    const text = \`${'${briefName}'} ${'${clean(brief.evidence_grade)}'} ${'${clean(brief.plain_english_judgement)}'} ${'${routeTitle}'} ${'${routeGrade}'}\`;
    const hits = classifyText(text, routeGrade);
    const top = hits[0];
    entity.exposure_score += top.score;
    entity.exposure_categories = uniq([...entity.exposure_categories, top.label]);
    entity.records.push({ title: routeTitle, url: typeof route.url === 'string' ? route.url : 'entity-daily-briefs.html', grade: top.grade, category: top.label, matched_terms: top.matched_terms });
    maybeUpgradeGrade(entity, top.grade);
  }
}`;
if (source.includes(oldBriefLoop)) source = source.replace(oldBriefLoop, newBriefLoop);
if (!source.includes('const briefName = clean(brief.name);')) throw new Error('Brief-name normalization was not installed');

const oldRelationshipLoop = `for (const rel of arr(relationshipFeed.relationships)) {
  for (const name of [rel.from, rel.to]) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    const score = Math.max(5, Math.round(Number(rel.score || 0) / 2));
    entity.exposure_score += score;
    entity.relationships.push({ with: rel.from === name ? rel.to : rel.from, score: rel.score, type: rel.relationship_type, boundary: rel.boundary });
    entity.exposure_categories = uniq([...entity.exposure_categories, 'Relationship candidate for review']);
  }
}`;
const newRelationshipLoop = `for (const rel of arr(relationshipFeed.relationships)) {
  const from = clean(rel.from);
  const to = clean(rel.to);
  if (!from || !to || from === '[object Object]' || to === '[object Object]') continue;
  for (const name of [from, to]) {
    const entity = ensureEntity(name);
    if (!entity) continue;
    const score = Math.max(5, Math.round(Number(rel.score || 0) / 2));
    entity.exposure_score += score;
    entity.relationships.push({ with: from === name ? to : from, score: rel.score, type: clean(rel.relationship_type), boundary: clean(rel.boundary) });
    entity.exposure_categories = uniq([...entity.exposure_categories, 'Relationship candidate for review']);
  }
}`;
if (source.includes(oldRelationshipLoop)) source = source.replace(oldRelationshipLoop, newRelationshipLoop);
if (!source.includes('const from = clean(rel.from);')) throw new Error('Relationship normalization was not installed');

source = source.replace(
  "const profiles = [...entities.values()].map(entity => ({",
  "const profiles = [...entities.values()].filter(entity => entity.name && entity.name !== '[object Object]' && entity.name !== 'object Object').map(entity => ({"
);
if (!source.includes("entity.name !== '[object Object]'")) throw new Error('Invalid profile filter was not installed');

if (source !== before) fs.writeFileSync(generatorPath, source);
console.log(`Entity exposure object-name repair ${source === before ? 'already current' : 'installed'}.`);
