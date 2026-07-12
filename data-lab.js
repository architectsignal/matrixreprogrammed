import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.0/+esm';

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
const state = {
  manifest: null,
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

async function initialiseDuckDB() {
  setStatus('Loading DuckDB-Wasm in this browser…');
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
  const conn = await db.connect();
  for (const dataset of state.manifest.datasets) {
    const url = new URL(dataset.path, window.location.href).href;
    await db.registerFileURL(dataset.fileName, url, duckdb.DuckDBDataProtocol.HTTP, false);
    const table = identifier(dataset.table);
    if (dataset.format === 'csv') {
      await conn.query(`CREATE VIEW ${table} AS SELECT * FROM read_csv_auto('${dataset.fileName.replaceAll("'", "''")}', header = true, all_varchar = true, sample_size = -1, ignore_errors = true)`);
    } else {
      throw new Error(`Unsupported public dataset format: ${dataset.format}`);
    }
  }
  state.db = db;
  state.conn = conn;
  state.engineReady = true;
  setStatus(`Ready: ${state.manifest.datasets.length} approved datasets loaded as read-only views.`, 'success');
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
    els.schema.textContent = `Schema unavailable: ${error.message}`;
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
    setStatus(`Perspective could not load; the accessible result table remains available. ${error.message}`, 'warning');
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
    setStatus('The browser SQL engine is not ready. Reload the page or use the direct dataset downloads.', 'error');
    return;
  }
  let sql;
  try { sql = validateSql(els.query?.value); }
  catch (error) { setStatus(error.message, 'error'); return; }
  state.running = true;
  els.run?.setAttribute('disabled', '');
  const started = performance.now();
  setStatus('Running a capped, read-only browser query…');
  updateBoundary(sql);
  try {
    const timeoutMs = state.manifest.limits.queryTimeoutMs;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Query exceeded the ${Math.round(timeoutMs / 1000)} second browser limit.`)), timeoutMs));
    const result = await Promise.race([state.conn.query(wrapQuery(sql)), timeout]);
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
    setStatus(`Query failed: ${error.message}`, 'error');
    if (els.resultMeta) els.resultMeta.textContent = 'No result produced.';
  } finally {
    state.running = false;
    els.run?.removeAttribute('disabled');
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
  try {
    const response = await fetch('data/public-data-lab.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}.`);
    state.manifest = await response.json();
    bind();
    restoreFromUrl();
    await initialiseDuckDB();
    if (!els.query?.value && state.manifest.presets.length) applyPreset(state.manifest.presets[0].id, false);
  } catch (error) {
    setStatus(`Data laboratory unavailable: ${error.message}. Direct dataset downloads remain available below.`, 'error');
  }
}

boot();
