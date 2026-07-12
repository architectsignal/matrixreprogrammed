const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = process.cwd();
const seedPath = path.join(root, 'data', 'geographic-power-atlas-seed.json');
const geojsonPath = path.join(root, 'data', 'geographic-power-atlas.geojson');
const manifestPath = path.join(root, 'data', 'geographic-power-atlas.json');
const csvPath = path.join(root, 'downloads', 'geographic-power-atlas.csv');
const reportPath = path.join(root, 'downloads', 'geographic-power-atlas-build.json');
const pagePath = path.join(root, 'geographic-power-atlas.html');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function ensure(dir) { fs.mkdirSync(dir, { recursive:true }); }
function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function csvCell(value) {
  const text = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
function hostFromUrl(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function domainMatches(host, domain) {
  const clean = String(domain || '').toLowerCase().replace(/^www\./, '');
  return host === clean || host.endsWith(`.${clean}`);
}
function collectEvidenceRecords() {
  const records = [];
  const entities = readJson(path.join(root, 'data', 'entity-registry.json'), {});
  for (const entity of entities.entities || []) {
    for (const ref of entity.evidenceRefs || []) {
      if (!ref.sourceUrl) continue;
      records.push({
        kind:'entity-evidence', id:entity.id, name:entity.name, sourceId:ref.sourceId || '', sourceTitle:ref.sourceTitle || '', sourceUrl:ref.sourceUrl,
        evidenceGrade:ref.evidenceGrade || '', factualStatus:ref.factualStatus || '', reviewStatus:ref.reviewStatus || entity.reviewStatus || '',
        date:ref.publicationDate || ref.retrievalDate || entity.lastSeen || entity.firstSeen || ''
      });
    }
  }
  const relationships = readJson(path.join(root, 'data', 'relationship-registry.json'), {});
  for (const rel of relationships.relationships || []) {
    const source = rel.source || rel.evidence || {};
    const sourceUrl = rel.sourceUrl || source.sourceUrl || source.url || '';
    if (!sourceUrl) continue;
    records.push({
      kind:'relationship', id:rel.id, name:rel.type || '', sourceId:rel.sourceId || source.sourceId || '', sourceTitle:rel.sourceTitle || source.sourceTitle || '', sourceUrl,
      evidenceGrade:rel.evidenceGrade || source.evidenceGrade || '', factualStatus:rel.factualStatus || source.factualStatus || '', reviewStatus:rel.reviewStatus || source.reviewStatus || '',
      date:rel.publicationDate || rel.retrievalDate || source.publicationDate || source.retrievalDate || ''
    });
  }
  const timeline = readJson(path.join(root, 'data', 'evidence-timeline.json'), {});
  for (const event of timeline.events || []) {
    if (!event.sourceUrl) continue;
    records.push({kind:'timeline', id:event.id, name:event.title || '', sourceId:'', sourceTitle:event.source || '', sourceUrl:event.sourceUrl,
      evidenceGrade:event.evidenceGrade || '', factualStatus:event.factualStatus || '', reviewStatus:event.reviewStatus || '', date:event.date || ''});
  }
  return records;
}
function patchBetween(file, start, end, content, beforePattern) {
  if (!fs.existsSync(file)) return false;
  let text = fs.readFileSync(file, 'utf8');
  const block = `${start}\n${content}\n${end}`;
  const regex = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`, 'g');
  if (regex.test(text)) text = text.replace(regex, block);
  else if (beforePattern.test(text)) text = text.replace(beforePattern, `${block}\n$&`);
  else text += `\n${block}\n`;
  fs.writeFileSync(file, text);
  return true;
}

const seed = readJson(seedPath);
if (!seed || !Array.isArray(seed.locations)) throw new Error('Invalid geographic atlas seed registry.');
const evidenceRecords = collectEvidenceRecords();
const precision = seed.precisionClasses || {};
const categories = new Set();
const countries = new Set();
const allMatchedIds = new Set();

const features = seed.locations.map(location => {
  categories.add(location.category);
  countries.add(location.country);
  const matched = evidenceRecords.filter(record => {
    const host = hostFromUrl(record.sourceUrl);
    return (location.sourceDomains || []).some(domain => domainMatches(host, domain));
  });
  matched.forEach(record => allMatchedIds.add(`${record.kind}:${record.id}:${record.sourceUrl}`));
  const grades = matched.reduce((acc, record) => { const key = record.evidenceGrade || 'ungraded'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const sourceIds = [...new Set(matched.map(record => record.sourceId).filter(Boolean))].slice(0, 30);
  const dates = matched.map(record => record.date).filter(Boolean).sort();
  const p = precision[location.precision] || {};
  const properties = {
    id:location.id, name:location.name, category:location.category, role:location.role, country:location.country, city:location.city,
    precision:location.precision, precisionLabel:p.label || location.precision, maximumUncertaintyMetres:p.maximumUncertaintyMetres || null,
    sourceUrl:location.sourceUrl, sourceTitle:location.sourceTitle, sourceDomains:location.sourceDomains || [], evidenceGrade:location.evidenceGrade || 'B',
    reviewStatus:location.reviewStatus || 'registry-defined', recordCount:matched.length, gradeA:grades.A || 0, gradeB:grades.B || 0,
    ungraded:grades.ungraded || 0, sourceIds, firstRecordDate:dates[0] || '', lastRecordDate:dates[dates.length-1] || '',
    establishes:`The cited public source supports the registered ${p.label || location.precision} location for ${location.name}. Matching Matrix records show source-domain representation, not physical presence.`,
    doesNotEstablish:'The point does not prove control, coordination, ownership, wrongdoing, attendance, operational activity, or a relationship with nearby points.'
  };
  return {type:'Feature', id:location.id, geometry:{type:'Point',coordinates:location.coordinates}, properties};
});

const geojson = {type:'FeatureCollection', name:'Matrix Geographic Power Atlas', generatedAt:new Date().toISOString(), evidenceBoundary:seed.evidenceBoundary, features};
const manifest = {
  ok:true, version:1, generatedAt:geojson.generatedAt, engines:seed.engines, basemap:seed.basemap, evidenceBoundary:seed.evidenceBoundary,
  policy:seed.generatedPolicy, precisionClasses:precision, counts:{locations:features.length,categories:categories.size,countries:countries.size,matchedEvidenceRecords:allMatchedIds.size},
  categories:[...categories].sort(), countries:[...countries].sort(), pmtilesSources:(seed.pmtilesSources || []).filter(source => source && source.enabled)
};
ensure(path.dirname(geojsonPath)); ensure(path.dirname(csvPath));
fs.writeFileSync(geojsonPath, JSON.stringify(geojson, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const headers = ['id','name','category','role','country','city','longitude','latitude','precision','maximum_uncertainty_metres','record_count','grade_a','grade_b','source_domains','source_url','review_status'];
const rows = features.map(feature => {
  const p = feature.properties; const [lng,lat] = feature.geometry.coordinates;
  return [p.id,p.name,p.category,p.role,p.country,p.city,lng,lat,p.precision,p.maximumUncertaintyMetres,p.recordCount,p.gradeA,p.gradeB,p.sourceDomains,p.sourceUrl,p.reviewStatus].map(csvCell).join(',');
});
fs.writeFileSync(csvPath, `${headers.map(csvCell).join(',')}\n${rows.join('\n')}\n`);

const categoryOptions = ['<option value="">All categories</option>', ...manifest.categories.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value.replace(/-/g,' '))}</option>`)].join('');
const countryOptions = ['<option value="">All countries</option>', ...manifest.countries.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join('');
const precisionOptions = ['<option value="">All precision levels</option>', ...Object.entries(precision).map(([key,value]) => `<option value="${escapeHtml(key)}">${escapeHtml(value.label || key)}</option>`)].join('');
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Geographic Power Atlas | Matrix Reprogrammed</title><meta name="description" content="Evidence-led geographic mapping of public institutions, regulators, courts, intelligence bodies, financial authorities and infrastructure with explicit location precision."><meta property="og:title" content="Geographic Power Atlas"><meta property="og:description" content="Map public power structures without turning proximity into proof."><meta property="og:type" content="website"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.0.0-20/dist/maplibre-gl.css"><style>
.power-atlas-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.45fr);gap:1rem;align-items:start}.power-atlas-map{height:72vh;min-height:560px;border:1px solid rgba(216,181,106,.3);border-radius:14px;overflow:hidden;background:#080706}.power-atlas-controls{display:grid;grid-template-columns:1.5fr repeat(3,minmax(145px,.7fr)) auto;gap:.55rem;margin-bottom:1rem}.power-atlas-controls input,.power-atlas-controls select{padding:.72rem;background:#090806;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:8px}.power-atlas-list{max-height:72vh;overflow:auto}.power-atlas-item{cursor:pointer}.power-atlas-item[hidden]{display:none!important}.power-atlas-item:focus{outline:2px solid #d8b56a}.atlas-boundary{border-left:4px solid #d8b56a;background:rgba(216,181,106,.08);padding:1rem;border-radius:10px}.atlas-badges{display:flex;flex-wrap:wrap;gap:.35rem}.atlas-badges span{border:1px solid rgba(216,181,106,.28);border-radius:999px;padding:.22rem .5rem;font-size:.72rem}.atlas-legend{display:grid;gap:.45rem}.atlas-legend div{display:flex;gap:.6rem;align-items:center}.atlas-dot{width:.8rem;height:.8rem;border-radius:50%;border:1px solid #f3e6bd}.maplibregl-popup-content{background:#0a0907;color:#f3e6bd;border:1px solid rgba(216,181,106,.4);max-width:360px}.maplibregl-popup-tip{border-top-color:#0a0907!important;border-bottom-color:#0a0907!important}.maplibregl-popup-close-button{color:#f3e6bd}.atlas-noscript{padding:1rem;background:#140b08;border-left:4px solid #b71919}@media(max-width:1050px){.power-atlas-layout{grid-template-columns:1fr}.power-atlas-list{max-height:none}.power-atlas-controls{grid-template-columns:1fr 1fr}.power-atlas-map{height:62vh;min-height:430px}}@media(max-width:650px){.power-atlas-controls{grid-template-columns:1fr}.power-atlas-map{min-height:390px}}@media print{canvas,.signal-face,.veil,.topbar,.power-atlas-map,.power-atlas-controls,.btn{display:none!important}.page,.card{background:#fff;color:#000}.power-atlas-layout{display:block}.power-atlas-list{max-height:none}}
</style><style id="public-internal-visibility">.internal-only,[data-internal-only="true"]{display:none!important}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="geographic-power-atlas.html" aria-current="page">Power Atlas</a><a href="data-lab.html">Data Lab</a><a href="evidence-network-map.html">Network Map</a><a href="evidence-timeline.html">Timeline</a><a href="search.html">Search</a></nav></header><main>
<section class="hero wrap"><div class="eyebrow">Phase 10 · MapLibre · PMTiles-ready · evidence-led geography</div><h1>GEOGRAPHIC POWER ATLAS.</h1><p class="lead">Place public institutions, regulators, courts, intelligence bodies, financial authorities and infrastructure into geographic context while preserving the source, precision and limitation attached to every point.</p><p class="atlas-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(seed.evidenceBoundary)}</p><div class="cta-row"><a class="btn" href="#atlas-map">Open the atlas</a><a class="btn alt" href="data/geographic-power-atlas.geojson">Download GeoJSON</a><a class="btn alt" href="downloads/geographic-power-atlas.csv">Download CSV</a></div></section>
<section class="section wrap"><div class="grid"><article class="card"><h3>${features.length} registered locations</h3><p>Only explicitly reviewed coordinates enter the map. No automatic geocoder is used.</p></article><article class="card"><h3>${manifest.counts.matchedEvidenceRecords} matched records</h3><p>Evidence volume is aggregated by official source domain, not inferred physical presence.</p></article><article class="card"><h3>${manifest.categories.length} functional categories</h3><p>Regulation, finance, justice, intelligence, oversight, multilateral governance and logistics remain separately filterable.</p></article><article class="card"><h3>PMTiles-ready</h3><p>Same-origin PMTiles layers can be activated when a reviewed large geographic dataset is approved.</p></article></div></section>
<section class="section wrap" id="atlas-map"><div class="power-atlas-controls"><input id="atlas-search" type="search" placeholder="Search institution, city, country or role"><select id="atlas-category">${categoryOptions}</select><select id="atlas-country">${countryOptions}</select><select id="atlas-precision">${precisionOptions}</select><button class="btn alt" id="atlas-reset" type="button">Reset view</button></div><p id="atlas-status" class="figure-caption">Loading geographic evidence…</p><div class="power-atlas-layout"><div id="power-atlas-map" class="power-atlas-map" role="application" aria-label="Interactive geographic power atlas"></div><aside class="card power-atlas-list"><h2>Accessible location list</h2><div id="power-atlas-list"></div></aside></div><noscript><p class="atlas-noscript">JavaScript is required for the interactive map. The downloadable GeoJSON and CSV remain available.</p></noscript></section>
<section class="section wrap split"><article class="card"><h2>PRECISION IS PART OF THE EVIDENCE.</h2><div class="atlas-legend"><div><span class="atlas-dot"></span><span><strong>Public campus:</strong> a publicly documented institutional campus, with uncertainty kept within the stated radius.</span></div><div><span class="atlas-dot"></span><span><strong>City-level:</strong> the institution is represented by its publicly stated city or area, not a sensitive entrance or building coordinate.</span></div><div><span class="atlas-dot"></span><span><strong>Jurisdiction-level:</strong> the point represents a broad port, region or operating jurisdiction rather than a single facility.</span></div></div></article><article class="card"><h2>WHAT THE MAP DOES NOT SHOW.</h2><p>Nearby points are not evidence of collaboration. A source-domain count is not evidence that staff, money or decisions moved through a headquarters. The map does not expose private addresses, personal homes, covert sites, operational routes or inferred locations.</p><p><a href="evidence-archive.html">Verify preserved sources</a> · <a href="data-lab.html">Reproduce the underlying counts</a></p></article></section>
</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — geographic context with precision and evidence boundaries attached.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script><script type="module" src="geographic-power-atlas.js"></script></body></html>`;
fs.writeFileSync(pagePath, page);

const homeBlock = `<section class="section wrap" id="geographic-power-atlas-home"><div class="eyebrow">Geographic Power Atlas</div><h2>MAP WHERE PUBLIC POWER IS LOCATED.</h2><p class="lead">Explore regulators, courts, intelligence bodies, financial institutions, multilateral organisations and infrastructure with precision labels and evidence boundaries attached.</p><div class="cta-row"><a class="btn" href="geographic-power-atlas.html">Open Geographic Power Atlas</a><a class="btn alt" href="data-lab.html">Open Data Laboratory</a></div></section>`;
patchBetween(path.join(root,'index.html'),'<!-- geographic-power-atlas:start -->','<!-- geographic-power-atlas:end -->',homeBlock,/<footer\b/i);
const toolsBlock = `<section class="section wrap" id="geographic-power-atlas-tools"><div class="eyebrow">Evidence geography</div><h2>GEOGRAPHIC POWER ATLAS.</h2><p>Map explicitly registered public locations, filter by function and precision, inspect source-domain evidence volume and export the reviewed dataset.</p><div class="cta-row"><a class="btn" href="geographic-power-atlas.html">Open Atlas</a><a class="btn alt" href="data/geographic-power-atlas.geojson">GeoJSON</a><a class="btn alt" href="downloads/geographic-power-atlas.csv">CSV</a></div></section>`;
patchBetween(path.join(root,'research-tools.html'),'<!-- geographic-power-atlas:start -->','<!-- geographic-power-atlas:end -->',toolsBlock,/<footer\b/i);

const sitemap = path.join(root,'sitemap.xml');
if (fs.existsSync(sitemap)) {
  let xml = fs.readFileSync(sitemap,'utf8');
  if (!xml.includes('/geographic-power-atlas.html')) xml = xml.replace('</urlset>', '  <url><loc>https://matrixreprogrammed.com/geographic-power-atlas.html</loc></url>\n</urlset>');
  fs.writeFileSync(sitemap,xml);
}
patchBetween(path.join(root,'llms.txt'),'<!-- geographic-power-atlas:start -->','<!-- geographic-power-atlas:end -->','- Geographic Power Atlas: geographic-power-atlas.html\n- Geographic atlas GeoJSON: data/geographic-power-atlas.geojson',/$/);

const report = {ok:true,generatedAt:geojson.generatedAt,locations:features.length,categories:manifest.categories.length,countries:manifest.countries.length,matchedEvidenceRecords:manifest.counts.matchedEvidenceRecords,outputs:['geographic-power-atlas.html','data/geographic-power-atlas.json','data/geographic-power-atlas.geojson','downloads/geographic-power-atlas.csv']};
fs.writeFileSync(reportPath, JSON.stringify(report,null,2));
console.log(`Geographic Power Atlas built: ${features.length} locations and ${manifest.counts.matchedEvidenceRecords} matched evidence records.`);
