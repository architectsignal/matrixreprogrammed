const DUCKDB_VERSION = '1.30.0';
const DUCKDB_PROVIDERS = [
  {
    name: 'jsDelivr',
    module: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm',
    base: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/dist/'
  },
  {
    name: 'esm.sh with UNPKG assets',
    module: 'https://esm.sh/@duckdb/duckdb-wasm@1.30.0',
    base: 'https://unpkg.com/@duckdb/duckdb-wasm@1.30.0/dist/'
  }
];
const ENGINE_STARTUP_TIMEOUT_MS = 60000;

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
const state = {
  manifest: null,
  duckdb: null,
  provider: null,
  worker: null,
  db: null,
  conn: null,
  rows: [],
  columns: [],
  perspectiveWorker: null,
  perspectiveTable: null,
  engineReady: false,
  running: false
};

const els = {
  status: q('#data-lab-status'),
  query: q('#data-lab-query'),
  run: q('#data-lab-run'),
  reset: q('#data-lab-reset'),
  limit: q('#data-lab-limit'),
  preset: q('#data-lab-preset'),
  resultMeta: q('#data-lab-result-meta'),
  table: q('#data-lab-table'),
  viewer: q('#data-lab-viewer'),
  tableMode: q('#data-lab-table-mode'),
  perspectiveMode: q('#data-lab-perspective-mode'),
  download: q('#data-lab-download'),
  copySql: q('#data-lab-copy-sql'),
  copyLink: q('#data-lab-copy-link'),
  schema: q('#data-lab-schema'),
  boundary: q('#data-lab-active-boundary')
};

function setStatus(message, kind = 'info') {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.dataset.kind = kind;
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Unknown error');
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normaliseValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if (typeof value.toJSON === 'function') return value.toJSON();
    try { return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item)); }
    catch { return String(value); }
  }
  return value ?? '';
}

function identifier(value) {
  if (!/^[a-z][a-z0-9_]*$/i.test(value || '')) throw new Error('Unsafe table identifier in registry.');
  return `"${value}"`;
}

function stripComments(sql) {
  return String(sql || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n\r]*/g, ' ');
}

function validateSql(raw) {
  const max = state.manifest?.limits?.maxSqlCharacters || 6000;
  let sql = String(raw || '').trim();
  if (!sql) throw new Error('Enter a SELECT query or choose a preset.');
  if (sql.length > max) throw new Error(`Query is longer than the ${max.toLocaleString()} character limit.`);
  sql = sql.replace(/;+\s*$/, '').trim();
  const checked = stripComments(sql);
  if (!/^(SELECT|WITH)\b/i.test(checked)) throw new Error('Only SELECT and WITH queries are allowed.');
  if (checked.includes(';')) throw new Error('Only one SQL statement is allowed.');
  const forbidden = /\b(ALTER|ATTACH|CALL|COPY|CREATE|DELETE|DETACH|DROP|EXPORT|IMPORT|INSERT|INSTALL|LOAD|MERGE|PRAGMA|REPLACE|SET|TRUNCATE|UPDATE|VACUUM)\b/i;
  if (forbidden.test(checked)) throw new Error('This is a read-only laboratory. The query contains a blocked statement.');
  const sourceFunctions = /\b(read_csv|read_csv_auto|read_json|read_json_auto|read_ndjson|read_parquet|parquet_scan|sqlite_scan|glob)\s*\(/i;
  if (sourceFunctions.test(checked)) throw new Error('Direct file readers are blocked. Query only the approved dataset views.');
  if (/(?:https?|s3|file|ftp):\/\//i.test(checked)) throw new Error('Remote and local file URLs are blocked inside user queries.');
  return sql;
}

function selectedLimit() {
  const configured = state.manifest?.limits?.maxRows || 1000;
  const requested = Number.parseInt(els.limit?.value || state.manifest?.limits?.defaultRows || 250, 10);
  return Math.max(1, Math.min(configured, Number.isFinite(requested) ? requested : 250));
}

function wrapQuery(sql) {
  return `SELECT * FROM (${sql}) AS matrix_public_query LIMIT ${selectedLimit()}`;
}

function setEngineControlsReady(ready) {
  state.engineReady = ready;
  if (els.run) els.run.disabled = !ready;
  qa('[data-data-lab-preset], [data-data-lab-dataset]').forEach(button => { button.disabled = !ready; });
}

async function loadDuckDBModule() {
  const failures = [];
  for (const provider of DUCKDB_PROVIDERS) {
    setStatus(`Loading DuckDB-Wasm ${DUCKDB_VERSION} from ${provider.name}…`);
    try {
      const duckdb = await withTimeout(import(provider.module), 20000, `${provider.name} module load`);
      if (!duckdb?.AsyncDuckDB || !duckdb?.selectBundle) throw new Error('Module loaded without the DuckDB browser API.');
      return { duckdb, provider };
    } catch (error) {
      failures.push(`${provider.name}: ${errorMessage(error)}`);
    }
  }
  throw new Error(`DuckDB-Wasm could not load from either CDN. ${failures.join(' | ')}`);
}

function providerBundles(provider) {
  return {
    mvp: {
      mainModule: `${provider.base}duckdb-mvp.wasm`,
      mainWorker: `${provider.base}duckdb-browser-mvp.worker.js`
    },
    eh: {
      mainModule: `${provider.base}duckdb-eh.wasm`,
      mainWorker: `${provider.base}duckdb-browser-eh.worker.js`
    }
  };
}

async function fetchDataset(dataset, index, total) {
  setStatus(`Loading approved dataset ${index + 1}/${total}: ${dataset.title}…`);
  const url = new URL(dataset.path, window.location.href);
  url.searchParams.set('v', state.manifest.updated || 'current');
  const response = await withTimeout(fetch(url, { cache: 'no-store' }), 30000, `${dataset.title} download`);
  if (!response.ok) throw new Error(`${dataset.title} returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2) throw new Error(`${dataset.title} returned an empty file.`);
  return bytes;
}

async function initialiseDuckDB() {
  setEngineControlsReady(false);
  const loaded = await loadDuckDBModule();
  const duckdb = loaded.duckdb;
  const provider = loaded.provider;
  const bundle = await withTimeout(duckdb.selectBundle(providerBundles(provider)), 10000, 'DuckDB bundle selection');
  if (!bundle?.mainModule || !bundle?.mainWorker) throw new Error('No compatible DuckDB-Wasm bundle was selected for this browser.');

  setStatus(`Starting DuckDB-Wasm with ${provider.name}…`);
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
  let worker;
  try {
    worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await withTimeout(db.instantiate(bundle.mainModule, bundle.pthreadWorker), ENGINE_STARTUP_TIMEOUT_MS, 'DuckDB WebAssembly startup');
    const conn = await withTimeout(db.connect(), 15000, 'DuckDB connection');

    for (let index = 0; index < state.manifest.datasets.length; index += 1) {
      const dataset = state.manifest.datasets[index];
      const bytes = await fetchDataset(dataset, index, state.manifest.datasets.length);
      await db.registerFileBuffer(dataset.fileName, bytes);
      const table = identifier(dataset.table);
      if (dataset.format !== 'csv') throw new Error(`Unsupported public dataset format: ${dataset.format}`);
      await conn.query(`CREATE VIEW ${table} AS SELECT * FROM read_csv_auto('${dataset.fileName.replaceAll("'", "''")}', header = true, all_varchar = true, sample_size = -1, ignore_errors = true)`);
    }

    state.duckdb = duckdb;
    state.provider = provider;
    state.worker = worker;
    state.db = db;
    state.conn = conn;
    setEngineControlsReady(true);
    setStatus(`Ready: ${state.manifest.datasets.length} approved datasets loaded through ${provider.name}.`, 'success');
  } catch (error) {
    worker?.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

function currentPreset() {
  return state.manifest?.presets?.find(item => item.id === els.preset?.value) || null;
}

function currentDatasetForSql(sql) {
  const lowered = String(sql || '').toLowerCase();
  return state.manifest?.datasets?.find(dataset => new RegExp(`\\b${dataset.table.toLowerCase()}\\b`).test(lowered)) || null;
}

async function showSchema(dataset) {
  if (!dataset || !state.conn || !els.schema) return;
  try {
    const result = await state.conn.query(`DESCRIBE SELECT * FROM ${identifier(dataset.table)}`);
    const rows = result.toArray().map(row => ({ column: normaliseValue(row.column_name), type: normaliseValue(row.column_type) }));
    els.schema.innerHTML = rows.map(row => `<span><strong>${escapeHtml(row.column)}</strong> <small>${escapeHtml(row.type)}</small></span>`).join('');
  } catch (error) {
    els.schema.textContent = `Schema unavailable: ${errorMessage(error)}`;
  }
}

function updateBoundary(sql) {
  const dataset = currentDatasetForSql(sql);
  if (els.boundary) els.boundary.textContent = dataset?.boundary || state.manifest?.boundary || '';
  if (dataset) showSchema(dataset);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function arrowToRows(result) {
  const columns = result.schema.fields.map(field => field.name);
  const rows = result.toArray().map(row => {
    const output = {};
    for (const name of columns) output[name] = normaliseValue(row[name]);
    return output;
  });
  return { columns, rows };
}

function renderAccessibleTable(columns, rows) {
  if (!els.table) return;
  if (!columns.length) {
    els.table.innerHTML = '<p class="figure-caption">The query returned no columns.</p>';
    return;
  }
  const head = columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('');
  const body = rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(typeof row[column] === 'object' ? JSON.stringify(row[column]) : row[column])}</td>`).join('')}</tr>`).join('');
  els.table.innerHTML = `<div class="data-lab-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function renderPerspective(rows, preset) {
  if (!els.viewer) return;
  setStatus('Loading the optional Perspective explorer…');
  try {
    const perspectiveModule = await import('https://cdn.jsdelivr.net/npm/@finos/perspective@4.5.2/+esm');
    await import('https://cdn.jsdelivr.net/npm/@finos/perspective-viewer@4.5.2/+esm');
    await import('https://cdn.jsdelivr.net/npm/@finos/perspective-viewer-datagrid@4.5.2/+esm');
    await import('https://cdn.jsdelivr.net/npm/@finos/perspective-viewer-d3fc@4.5.2/+esm');
    const perspective = perspectiveModule.default || perspectiveModule;
    if (!state.perspectiveWorker) state.perspectiveWorker = await perspective.worker();
    if (state.perspectiveTable?.delete) await state.perspectiveTable.delete();
    state.perspectiveTable = await state.perspectiveWorker.table(rows);
    await els.viewer.load(state.perspectiveTable);
    if (preset?.plugin) {
      try { await els.viewer.restore({ plugin: preset.plugin }); } catch { /* datagrid remains the safe fallback */ }
    }
    els.viewer.hidden = false;
    els.table.hidden = true;
    setMode('perspective');
    setStatus('Perspective explorer ready. All processing remains in this browser.', 'success');
  } catch (error) {
    els.viewer.hidden = true;
    els.table.hidden = false;
    setMode('table');
    setStatus(`Perspective could not load; the accessible result table remains available. ${errorMessage(error)}`, 'warning');
  }
}

function setMode(mode) {
  const perspective = mode === 'perspective';
  if (els.table) els.table.hidden = perspective;
  if (els.viewer) els.viewer.hidden = !perspective;
  els.tableMode?.setAttribute('aria-pressed', String(!perspective));
  els.perspectiveMode?.setAttribute('aria-pressed', String(perspective));
}

async function runQuery() {
  if (state.running) return;
  if (!state.engineReady || !state.conn) {
    setStatus('The browser SQL engine is still loading. Use the direct dataset downloads if it cannot start.', 'error');
    return;
  }
  let sql;
  try { sql = validateSql(els.query?.value); }
  catch (error) { setStatus(errorMessage(error), 'error'); return; }
  state.running = true;
  if (els.run) els.run.disabled = true;
  const started = performance.now();
  setStatus('Running a capped, read-only browser query…');
  updateBoundary(sql);
  try {
    const timeoutMs = state.manifest.limits.queryTimeoutMs;
    const result = await withTimeout(state.conn.query(wrapQuery(sql)), timeoutMs, 'Query');
    const converted = arrowToRows(result);
    state.columns = converted.columns;
    state.rows = converted.rows;
    renderAccessibleTable(state.columns, state.rows);
    setMode('table');
    const elapsed = Math.round(performance.now() - started);
    if (els.resultMeta) els.resultMeta.textContent = `${state.rows.length.toLocaleString()} row${state.rows.length === 1 ? '' : 's'} · ${state.columns.length} columns · ${elapsed.toLocaleString()} ms · capped at ${selectedLimit().toLocaleString()}`;
    els.download?.removeAttribute('disabled');
    els.perspectiveMode?.removeAttribute('disabled');
    setStatus('Query complete. Results are derived locally from the approved public files.', 'success');
  } catch (error) {
    setStatus(`Query failed: ${errorMessage(error)}`, 'error');
    if (els.resultMeta) els.resultMeta.textContent = 'No result produced.';
  } finally {
    state.running = false;
    if (els.run) els.run.disabled = !state.engineReady;
  }
}

function rowsToCsv(columns, rows) {
  const cell = value => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\n');
}

function downloadResults() {
  if (!state.rows.length || !state.columns.length) return;
  const blob = new Blob([rowsToCsv(state.columns, state.rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `matrix-data-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(value, success) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(success, 'success');
  } catch {
    window.prompt('Copy:', value);
  }
}

function applyPreset(id, run = false) {
  const preset = state.manifest?.presets?.find(item => item.id === id);
  if (!preset) return;
  if (els.preset) els.preset.value = preset.id;
  if (els.query) els.query.value = preset.sql;
  updateBoundary(preset.sql);
  if (run) runQuery();
}

function resetQuery() {
  const first = state.manifest?.presets?.[0];
  if (first) applyPreset(first.id, false);
  state.rows = [];
  state.columns = [];
  if (els.table) els.table.innerHTML = '<p class="figure-caption">Run a preset or write a read-only SELECT query.</p>';
  if (els.resultMeta) els.resultMeta.textContent = 'No query has run.';
  if (els.viewer) els.viewer.hidden = true;
  els.download?.setAttribute('disabled', '');
  els.perspectiveMode?.setAttribute('disabled', '');
  setMode('table');
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset');
  const sql = params.get('sql');
  if (preset && state.manifest.presets.some(item => item.id === preset)) applyPreset(preset, false);
  if (sql && sql.length <= state.manifest.limits.maxSqlCharacters && els.query) els.query.value = sql;
  updateBoundary(els.query?.value || '');
}

function bind() {
  els.run?.addEventListener('click', runQuery);
  els.reset?.addEventListener('click', resetQuery);
  els.preset?.addEventListener('change', event => applyPreset(event.target.value, false));
  els.query?.addEventListener('input', event => updateBoundary(event.target.value));
  els.query?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runQuery();
  });
  els.download?.addEventListener('click', downloadResults);
  els.copySql?.addEventListener('click', () => copyText(els.query?.value || '', 'SQL copied.'));
  els.copyLink?.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.search = '';
    const preset = currentPreset();
    if (preset && preset.sql.trim() === (els.query?.value || '').trim()) url.searchParams.set('preset', preset.id);
    else url.searchParams.set('sql', els.query?.value || '');
    copyText(url.href, 'Shareable query link copied.');
  });
  els.tableMode?.addEventListener('click', () => setMode('table'));
  els.perspectiveMode?.addEventListener('click', () => renderPerspective(state.rows, currentPreset()));
  qa('[data-data-lab-preset]').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.dataLabPreset, true)));
  qa('[data-data-lab-dataset]').forEach(button => button.addEventListener('click', () => {
    const dataset = state.manifest.datasets.find(item => item.id === button.dataset.dataLabDataset);
    if (!dataset) return;
    if (els.query) els.query.value = dataset.defaultSql;
    if (els.preset) els.preset.value = '';
    updateBoundary(dataset.defaultSql);
    runQuery();
  }));
}

async function boot() {
  setEngineControlsReady(false);
  bind();
  try {
    const response = await withTimeout(fetch('data/public-data-lab.json', { cache: 'no-store' }), 15000, 'Dataset registry load');
    if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}.`);
    state.manifest = await response.json();
    restoreFromUrl();
    await initialiseDuckDB();
    if (!els.query?.value && state.manifest.presets.length) applyPreset(state.manifest.presets[0].id, false);
    await runQuery();
  } catch (error) {
    setEngineControlsReady(false);
    setStatus(`Data laboratory unavailable: ${errorMessage(error)} Direct dataset downloads remain available below.`, 'error');
    if (els.resultMeta) els.resultMeta.textContent = 'Engine startup failed; no query was run.';
  }
}

window.addEventListener('pagehide', () => {
  try { state.conn?.close?.(); } catch { /* best effort */ }
  try { state.db?.terminate?.(); } catch { /* best effort */ }
  try { state.worker?.terminate?.(); } catch { /* best effort */ }
});

boot();
