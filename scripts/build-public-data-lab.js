const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'public-data-lab.json');
const pagePath = path.join(root, 'data-lab.html');
const reportPath = path.join(root, 'downloads', 'public-data-lab-build.json');

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const attr = value => esc(value).replace(/\n/g, ' ');
function replaceBlock(text, start, end, block, anchor) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a !== -1 && b !== -1 && b > a) return `${text.slice(0, a)}${block}${text.slice(b + end.length)}`;
  if (anchor && text.includes(anchor)) return text.replace(anchor, `${block}${anchor}`);
  return `${text}\n${block}\n`;
}

const registry = JSON.parse(read(registryPath));
const datasets = registry.datasets || [];
const presets = registry.presets || [];
const ids = new Set(datasets.map(item => item.id));
if (datasets.length < 4) throw new Error('Public data laboratory requires at least four approved datasets.');
for (const dataset of datasets) {
  if (!/^[a-z][a-z0-9_-]*$/i.test(dataset.id || '')) throw new Error(`Unsafe dataset id: ${dataset.id}`);
  if (!/^[a-z][a-z0-9_]*$/i.test(dataset.table || '')) throw new Error(`Unsafe dataset table: ${dataset.table}`);
  if (!/^downloads\/[a-z0-9._/-]+$/i.test(dataset.path || '')) throw new Error(`Dataset path is not an approved public download: ${dataset.path}`);
  if (dataset.format !== 'csv') throw new Error(`Unsupported dataset format: ${dataset.format}`);
  if (!fs.existsSync(path.join(root, dataset.path))) throw new Error(`Approved public dataset is missing: ${dataset.path}`);
}
for (const preset of presets) for (const id of preset.datasetIds || []) if (!ids.has(id)) throw new Error(`Preset ${preset.id} references missing dataset ${id}`);

const datasetCards = datasets.map(dataset => `
<article class="card data-lab-dataset-card">
  <div class="data-lab-card-top"><span class="label">Approved public dataset</span><span>${Number(dataset.rowEstimate || 0).toLocaleString()} estimated rows</span></div>
  <h3>${esc(dataset.title)}</h3>
  <p>${esc(dataset.description)}</p>
  <p class="data-lab-boundary"><strong>Boundary:</strong> ${esc(dataset.boundary)}</p>
  <p class="figure-caption"><strong>SQL view:</strong> <code>${esc(dataset.table)}</code> · <strong>Format:</strong> ${esc(dataset.format.toUpperCase())}</p>
  <div class="cta-row small">
    <button class="btn" type="button" data-data-lab-dataset="${attr(dataset.id)}">Query this dataset</button>
    <a class="btn alt" href="${attr(dataset.path)}" download>Download CSV</a>
    <a class="btn alt" href="${attr(dataset.provenancePath)}">Open provenance</a>
  </div>
</article>`).join('');

const presetCards = presets.map(preset => `
<article class="card data-lab-preset-card">
  <span class="label">Reproducible query preset</span>
  <h3>${esc(preset.title)}</h3>
  <p>${esc(preset.description)}</p>
  <p class="figure-caption">Uses: ${(preset.datasetIds || []).map(id => `<code>${esc(datasets.find(item => item.id === id)?.table || id)}</code>`).join(' + ')}</p>
  <button class="btn alt" type="button" data-data-lab-preset="${attr(preset.id)}">Run preset</button>
</article>`).join('');

const presetOptions = presets.map(preset => `<option value="${attr(preset.id)}">${esc(preset.title)}</option>`).join('');
const defaultSql = presets[0]?.sql || 'SELECT * FROM entities';
const defaultBoundary = datasets.find(dataset => defaultSql.toLowerCase().includes(dataset.table.toLowerCase()))?.boundary || registry.boundary;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Public Data Laboratory | Matrix Reprogrammed</title>
  <meta name="description" content="Run capped read-only DuckDB-Wasm SQL over approved Matrix public datasets and explore results locally with Perspective." />
  <meta property="og:title" content="Matrix Public Data Laboratory" />
  <meta property="og:description" content="Reproduce entity, relationship, SEC filing and evidence-network analysis directly in the browser without a paid backend." />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="fixes.css" />
  <style>
    .data-lab-boundary{border-left:3px solid #d8b56a;background:rgba(216,181,106,.07);padding:.8rem}.data-lab-warning{border-left:4px solid #d8b56a;background:rgba(216,181,106,.08);padding:1rem 1.15rem;border-radius:10px}
    .data-lab-card-top{display:flex;justify-content:space-between;gap:.7rem;align-items:center;flex-wrap:wrap}.data-lab-card-top>span:last-child{font-size:.75rem;color:#c8b98c}.data-lab-dataset-card,.data-lab-preset-card{display:flex;flex-direction:column}.data-lab-dataset-card .cta-row,.data-lab-preset-card .btn{margin-top:auto}
    .data-lab-workbench{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:1rem;align-items:start}.data-lab-editor,.data-lab-output{border:1px solid rgba(216,181,106,.28);border-radius:14px;background:rgba(5,5,5,.92);padding:1rem}
    .data-lab-editor textarea{width:100%;min-height:230px;box-sizing:border-box;background:#080706;color:#f3e6bd;border:1px solid rgba(216,181,106,.34);border-radius:10px;padding:1rem;font:14px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}.data-lab-toolbar{display:grid;grid-template-columns:minmax(190px,1fr) 120px auto auto;gap:.55rem;align-items:center}.data-lab-toolbar select,.data-lab-toolbar button{min-height:42px}.data-lab-status[data-kind="success"]{color:#8bd9a5}.data-lab-status[data-kind="error"]{color:#ff8b8b}.data-lab-status[data-kind="warning"]{color:#e7c678}
    .data-lab-schema{display:flex;flex-wrap:wrap;gap:.35rem}.data-lab-schema span{border:1px solid rgba(216,181,106,.22);border-radius:999px;padding:.25rem .55rem;font-size:.72rem}.data-lab-schema small{color:#c8b98c}.data-lab-modes{display:flex;flex-wrap:wrap;gap:.45rem}.data-lab-modes button[aria-pressed="true"]{box-shadow:0 0 0 2px #d8b56a}.data-lab-table-scroll{overflow:auto;max-height:680px;border:1px solid rgba(216,181,106,.2);border-radius:10px}.data-lab-table-scroll table{border-collapse:collapse;width:max-content;min-width:100%;font-size:.78rem}.data-lab-table-scroll th,.data-lab-table-scroll td{padding:.55rem .65rem;border-bottom:1px solid rgba(216,181,106,.14);border-right:1px solid rgba(216,181,106,.1);text-align:left;vertical-align:top;max-width:460px;overflow-wrap:anywhere}.data-lab-table-scroll th{position:sticky;top:0;background:#100e09;color:#d8b56a;z-index:2}
    perspective-viewer{display:block;width:100%;height:680px;border:1px solid rgba(216,181,106,.25);border-radius:10px;background:#0a0907}.data-lab-engine-note code{white-space:nowrap}.data-lab-dataset-grid{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
    @media(max-width:960px){.data-lab-workbench{grid-template-columns:1fr}.data-lab-toolbar{grid-template-columns:1fr}.data-lab-table-scroll{max-height:520px}perspective-viewer{height:520px}}
    @media print{canvas,.signal-face,.veil,.topbar,.data-lab-toolbar,.data-lab-modes,.btn{display:none!important}.page,.card,.data-lab-editor,.data-lab-output{background:#fff;color:#000}.card{break-inside:avoid}.data-lab-table-scroll{max-height:none;overflow:visible}}
  </style>
</head>
<body>
  <canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div>
  <div class="page">
    <header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="data-lab.html" aria-current="page">Data Lab</a><a href="research-tools.html">Research Tools</a><a href="evidence-archive.html">Evidence Archive</a><a href="evidence-timeline.html">Timeline</a><a href="search.html">Search</a></nav></header>
    <main>
      <section class="hero wrap">
        <div class="eyebrow">Phase 9 · DuckDB-Wasm · Perspective · zero-cost browser analysis</div>
        <h1>PUBLIC DATA LABORATORY.</h1>
        <p class="lead">Run reproducible read-only SQL over the public entity, relationship, SEC filing and evidence-network exports. The database, joins, aggregations and visual exploration run locally in the reader's browser.</p>
        <p class="data-lab-warning"><strong>Evidence boundary:</strong> ${esc(registry.boundary)}</p>
        <div class="cta-row"><a class="btn" href="#workbench">Open SQL Workbench</a><a class="btn alt" href="#datasets">Approved Datasets</a><a class="btn alt" href="#presets">Reproducible Presets</a></div>
      </section>

      <section class="section wrap">
        <div class="eyebrow">Fail-closed controls</div><h2>WHAT THE BROWSER MAY—and MAY NOT—DO.</h2>
        <div class="grid">
          <article class="card"><h3>Read-only SQL</h3><p>Only one <code>SELECT</code> or <code>WITH</code> statement can run. Writes, attachments, extension loading, direct file readers and remote URLs are blocked.</p></article>
          <article class="card"><h3>Bounded work</h3><p>Every result is wrapped in a hard ${Number(registry.limits.maxRows).toLocaleString()}-row cap, with a ${Math.round(registry.limits.queryTimeoutMs / 1000)}-second browser timeout and a ${Number(registry.limits.maxSqlCharacters).toLocaleString()}-character SQL limit.</p></article>
          <article class="card"><h3>Approved files only</h3><p>The engine receives four same-origin public downloads. Private diagnostics, internal archives, arbitrary URLs and the user's local filesystem are not registered.</p></article>
          <article class="card"><h3>Reproducible—not authoritative</h3><p>Readers can copy SQL, share a query link and download the capped result. The result still inherits every source, review-status and evidence limitation in the underlying records.</p></article>
        </div>
      </section>

      <section class="section wrap" id="workbench">
        <div class="eyebrow">Browser-side investigation workbench</div><h2>QUERY THE PUBLIC RECORDS.</h2>
        <div class="data-lab-workbench">
          <article class="data-lab-editor">
            <div class="data-lab-toolbar">
              <select id="data-lab-preset" aria-label="Choose a reproducible query preset"><option value="">Custom query</option>${presetOptions}</select>
              <select id="data-lab-limit" aria-label="Maximum result rows"><option value="100">100 rows</option><option value="250" selected>250 rows</option><option value="500">500 rows</option><option value="1000">1,000 rows</option></select>
              <button class="btn" id="data-lab-run" type="button">Run Query</button>
              <button class="btn alt" id="data-lab-reset" type="button">Reset</button>
            </div>
            <textarea id="data-lab-query" spellcheck="false" aria-label="Read-only SQL query">${esc(defaultSql)}</textarea>
            <p class="figure-caption">Keyboard: Ctrl/⌘ + Enter. Views: <code>entities</code>, <code>relationships</code>, <code>market_activity</code>, <code>evidence_network</code>.</p>
            <div class="cta-row small"><button class="btn alt" id="data-lab-copy-sql" type="button">Copy SQL</button><button class="btn alt" id="data-lab-copy-link" type="button">Copy Query Link</button><button class="btn alt" id="data-lab-download" type="button" disabled>Download Result CSV</button></div>
            <p id="data-lab-status" class="data-lab-status" aria-live="polite">Loading the browser database engine…</p>
            <div id="data-lab-schema" class="data-lab-schema" aria-label="Active dataset columns"></div>
          </article>
          <aside class="data-lab-output">
            <span class="label">Active evidence boundary</span>
            <p id="data-lab-active-boundary" class="data-lab-boundary">${esc(defaultBoundary)}</p>
            <p id="data-lab-result-meta" class="figure-caption">No query has run.</p>
            <div class="data-lab-modes"><button class="btn alt" id="data-lab-table-mode" type="button" aria-pressed="true">Accessible Table</button><button class="btn alt" id="data-lab-perspective-mode" type="button" aria-pressed="false" disabled>Perspective Explorer</button></div>
          </aside>
        </div>
        <div id="data-lab-table" style="margin-top:1rem"><p class="figure-caption">Run a preset or write a read-only SELECT query.</p></div>
        <perspective-viewer id="data-lab-viewer" hidden></perspective-viewer>
      </section>

      <section class="section wrap" id="datasets"><div class="eyebrow">Public files with provenance attached</div><h2>APPROVED DATASETS.</h2><div class="grid data-lab-dataset-grid">${datasetCards}</div></section>
      <section class="section wrap" id="presets"><div class="eyebrow">Start with reproducible questions</div><h2>QUERY PRESETS.</h2><div class="grid">${presetCards}</div></section>

      <section class="section wrap data-lab-warning data-lab-engine-note">
        <h2>OPEN-SOURCE ENGINE NOTES.</h2>
        <p>DuckDB-Wasm <code>${esc(registry.engines.duckdbWasm)}</code> executes SQL and reads approved CSV files in-browser. Perspective <code>${esc(registry.engines.perspective)}</code> is an optional local result explorer. When either CDN dependency is unavailable, the page retains direct dataset downloads, schema documentation and its accessible interface rather than sending records to a paid backend.</p>
      </section>
    </main>
    <footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — inspect the data, preserve the boundary, publish the query.</p><p class="warning">Aggregations and correlations are leads for verification. They are not proof of causation, guilt, coordination or present fact.</p></footer>
  </div>
  <script src="matrix.js"></script>
  <script type="module" src="data-lab.js"></script>
</body>
</html>`;

write(pagePath, html);

const homeBlock = `<!-- public-data-lab-home:start --><section id="public-data-lab-home" class="section wrap"><div class="eyebrow">Phase 9 · Public Data Laboratory</div><h2>QUERY THE EVIDENCE YOURSELF.</h2><p class="lead">Run read-only DuckDB-Wasm SQL over approved public entities, relationships, SEC disclosures and evidence-network exports, then inspect capped results with Perspective—all in your browser.</p><p><strong>Boundary:</strong> reproducible filters and correlations do not prove causation, intent, identity or wrongdoing.</p><div class="cta-row"><a class="btn" href="data-lab.html">Open Public Data Lab</a><a class="btn alt" href="evidence-archive.html">Evidence Archive</a><a class="btn alt" href="research-tools.html">Research Tools</a></div></section><!-- public-data-lab-home:end -->`;
const indexPath = path.join(root, 'index.html');
let index = read(indexPath);
index = replaceBlock(index, '<!-- public-data-lab-home:start -->', '<!-- public-data-lab-home:end -->', homeBlock, '<!-- osint-tools-home:start -->');
if (!index.includes('href="data-lab.html">Public Data Lab</a>')) index = index.replace('<div class="nav-group"><strong>Evidence & Trust</strong>', '<div class="nav-group"><strong>Evidence & Trust</strong><a href="data-lab.html">Public Data Lab</a>');
write(indexPath, index);

const researchPath = path.join(root, 'research-tools.html');
if (fs.existsSync(researchPath)) {
  let research = read(researchPath);
  const block = `<!-- public-data-lab-research:start --><section class="section wrap" id="public-data-lab-research"><div class="eyebrow">Reproducible Browser Analysis</div><h2>PUBLIC DATA LABORATORY.</h2><p class="lead">Query approved entity, relationship, SEC market and network datasets with capped read-only SQL. Copy the query, share the link and export the result without a paid server.</p><div class="cta-row"><a class="btn" href="data-lab.html">Open Data Lab</a><a class="btn alt" href="evidence-archive.html">Verify Evidence</a></div></section><!-- public-data-lab-research:end -->`;
  research = replaceBlock(research, '<!-- public-data-lab-research:start -->', '<!-- public-data-lab-research:end -->', block, '</main>');
  write(researchPath, research);
}

const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = read(sitemapPath);
  if (!sitemap.includes('/data-lab.html')) sitemap = sitemap.replace('</urlset>', '<url><loc>https://matrixreprogrammed.com/data-lab.html</loc><changefreq>weekly</changefreq><priority>0.9</priority></url></urlset>');
  write(sitemapPath, sitemap);
}
const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = read(llmsPath);
  if (!llms.includes('data-lab.html')) llms += '\n- [Public Data Laboratory](https://matrixreprogrammed.com/data-lab.html): Read-only DuckDB-Wasm SQL and optional Perspective exploration over approved public entity, relationship, SEC market and evidence-network datasets.\n';
  write(llmsPath, llms);
}

write(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  datasets: datasets.length,
  presets: presets.length,
  maxRows: registry.limits.maxRows,
  queryTimeoutMs: registry.limits.queryTimeoutMs,
  engines: registry.engines,
  homepageLinked: read(indexPath).includes('Open Public Data Lab'),
  researchLinked: !fs.existsSync(researchPath) || read(researchPath).includes('public-data-lab-research'),
  boundary: registry.boundary
}, null, 2));

console.log(`Public Data Laboratory built: ${datasets.length} approved datasets, ${presets.length} presets, ${registry.limits.maxRows}-row hard cap.`);
