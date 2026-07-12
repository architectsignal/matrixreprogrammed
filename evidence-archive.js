import { renderSourceChangeDiff } from './source-change-diff.js';
import { formatCitation, downloadBibliography } from './evidence-citation.js';

const elements = {
  search: document.querySelector('#archive-search'),
  list: document.querySelector('#archive-list'),
  stage: document.querySelector('#archive-stage'),
  label: document.querySelector('#archive-status-label'),
  title: document.querySelector('#archive-title'),
  meta: document.querySelector('#archive-meta'),
  hash: document.querySelector('#archive-hash'),
  established: document.querySelector('#archive-established'),
  notEstablished: document.querySelector('#archive-not-established'),
  live: document.querySelector('#archive-live'),
  verify: document.querySelector('#archive-verify'),
  cite: document.querySelector('#archive-cite'),
  verificationStatus: document.querySelector('#archive-verification-status'),
  integritySummary: document.querySelector('#integrity-summary'),
  copyVerify: document.querySelector('#copy-verify-command'),
  changeSelect: document.querySelector('#change-select'),
  diffMode: document.querySelector('#diff-mode'),
  diffOutput: document.querySelector('#diff-output'),
  diffBoundary: document.querySelector('#diff-boundary'),
  citationStyle: document.querySelector('#citation-style'),
  citationOutput: document.querySelector('#citation-output'),
  copyCitation: document.querySelector('#copy-citation'),
  downloadBibliography: document.querySelector('#download-bibliography')
};

const state = { archives: [], changes: [], activeArchive: null, activeChange: null, integrity: null };
const params = new URLSearchParams(location.search);
const normalize = value => String(value || '').toLowerCase().trim();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(error);
    return fallback;
  }
}

function renderArchiveList() {
  const query = normalize(elements.search.value);
  const rows = state.archives.filter(archive => !query || normalize([archive.title, archive.sourceId, archive.lane, archive.authority, archive.capturedAt, archive.sha256].join(' ')).includes(query));
  elements.list.innerHTML = rows.length ? rows.map(archive => `<button type="button" data-archive-id="${esc(archive.id)}" aria-current="${state.activeArchive?.id === archive.id ? 'true' : 'false'}"><strong>${esc(archive.title)}</strong><br/><small>${esc(String(archive.capturedAt || '').slice(0, 10))} · ${Math.round(Number(archive.bytes || 0) / 1024)} KiB · ${esc(archive.authority || 'public source')}</small></button>`).join('') : '<p>No replayable approved capture matches this filter.</p>';
  elements.list.querySelectorAll('[data-archive-id]').forEach(button => button.addEventListener('click', () => selectArchive(button.dataset.archiveId)));
}

function updateUrl() {
  const next = new URLSearchParams();
  if (state.activeArchive) next.set('id', state.activeArchive.id);
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
}

function mountReplay(archive) {
  elements.stage.innerHTML = '';
  const replay = document.createElement('replay-web-page');
  replay.setAttribute('source', new URL(archive.replayUrl, location.href).href);
  replay.setAttribute('url', archive.sourceUrl);
  replay.setAttribute('replayBase', '/replay/');
  replay.setAttribute('embed', 'replay-with-info');
  replay.setAttribute('deepLink', 'true');
  replay.setAttribute('noCache', 'true');
  replay.setAttribute('hideOffscreen', 'true');
  replay.style.width = '100%';
  replay.style.height = '620px';
  elements.stage.appendChild(replay);
}

async function selectArchive(id) {
  const archive = state.archives.find(item => item.id === id);
  if (!archive) return;
  state.activeArchive = archive;
  elements.label.textContent = `${archive.format || 'WACZ'} · ${archive.engine || 'Browsertrix'} ${archive.engineVersion || ''}`;
  elements.title.textContent = archive.title;
  elements.meta.textContent = [archive.sourceId, archive.capturedAt ? `Captured ${archive.capturedAt}` : '', archive.lane, `${Number(archive.bytes || 0).toLocaleString()} bytes`].filter(Boolean).join(' · ');
  elements.hash.textContent = archive.sha256;
  elements.established.textContent = archive.established;
  elements.notEstablished.textContent = archive.notEstablished;
  elements.live.href = archive.sourceUrl;
  elements.verificationStatus.textContent = 'Replay is browser-side. Hash verification runs only when requested.';
  mountReplay(archive);
  renderArchiveList();
  updateUrl();
  await createCitation();
}

async function verifyArchive() {
  const archive = state.activeArchive;
  if (!archive) return;
  elements.verify.disabled = true;
  elements.verificationStatus.textContent = 'Downloading the preserved WACZ and calculating SHA-256 in this browser…';
  try {
    const response = await fetch(archive.replayUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const matches = actual === archive.sha256;
    elements.verificationStatus.className = matches ? 'figure-caption status-good' : 'figure-caption status-warn';
    elements.verificationStatus.textContent = matches ? `Integrity verified locally: ${actual}` : `Integrity mismatch. Expected ${archive.sha256}; received ${actual}. Do not rely on this copy.`;
  } catch (error) {
    elements.verificationStatus.className = 'figure-caption status-warn';
    elements.verificationStatus.textContent = `Verification unavailable: ${error.message}`;
  } finally { elements.verify.disabled = false; }
}

async function loadIntegrity() {
  state.integrity = await fetchJson('data/evidence-integrity-manifest.json', null);
  if (!state.integrity) { elements.integritySummary.textContent = 'Integrity manifest unavailable.'; return; }
  let bundleValidShape = false;
  try {
    const response = await fetch('data/evidence-integrity-manifest.sigstore.json', { cache: 'no-store' });
    if (response.ok) {
      const bundle = await response.json();
      bundleValidShape = Boolean(bundle.mediaType || bundle.verificationMaterial || bundle.dsseEnvelope || bundle.messageSignature);
    }
  } catch {}
  const signing = state.integrity.signing || {};
  elements.integritySummary.innerHTML = `<strong>${state.integrity.files?.length || 0}</strong> protected file hashes · SHA-256 · Sigstore status: <span class="${bundleValidShape ? 'status-good' : 'status-warn'}">${bundleValidShape ? 'signed bundle published' : esc(signing.status || 'awaiting workflow signature')}</span> · generated ${esc(state.integrity.generatedAt || 'unknown')}.`;
}

function verificationCommand() {
  const signing = state.integrity?.signing || {};
  return `cosign verify-blob --bundle data/evidence-integrity-manifest.sigstore.json --certificate-identity-regexp '${signing.certificateIdentityRegexp || '^https://github.com/architectsignal/matrixreprogrammed/.github/workflows/evidence-archive-verification.yml@refs/heads/main$'}' --certificate-oidc-issuer '${signing.certificateOidcIssuer || 'https://token.actions.githubusercontent.com'}' data/evidence-integrity-manifest.json`;
}

async function copyText(value, messageNode, message) {
  try { await navigator.clipboard.writeText(value); if (messageNode) messageNode.textContent = message; }
  catch { prompt('Copy:', value); }
}

function populateChanges() {
  elements.changeSelect.innerHTML = '<option value="">Choose a recorded change</option>' + state.changes.map(change => `<option value="${esc(change.id)}">${esc(String(change.detectedAt || '').slice(0, 10))} · ${esc(change.sourceLabel || change.title || change.id)}</option>`).join('');
}

async function showChange() {
  state.activeChange = state.changes.find(change => change.id === elements.changeSelect.value) || null;
  elements.diffOutput.innerHTML = await renderSourceChangeDiff(state.activeChange, elements.diffMode.value);
  elements.diffBoundary.textContent = state.activeChange?.notEstablished || 'Recorded additions and removals are transparency observations, not automatic proof of concealment or wrongdoing.';
}

async function createCitation() {
  if (!state.activeArchive) return;
  elements.citationOutput.value = await formatCitation(state.activeArchive, elements.citationStyle.value);
}

async function init() {
  const [archiveManifest, changes] = await Promise.all([
    fetchJson('data/evidence-archive-manifest.json', { archives: [] }),
    fetchJson('data/source-change-public.json', { changes: [] })
  ]);
  state.archives = archiveManifest.archives || [];
  state.changes = changes.changes || [];
  renderArchiveList();
  populateChanges();
  await loadIntegrity();
  const requested = params.get('id') || state.archives[0]?.id;
  if (requested) await selectArchive(requested);
  else {
    elements.list.innerHTML = '<p>No deployable approved WACZ capture is currently published. The scheduled Browsertrix workflow remains ready and fail-closed.</p>';
    elements.verificationStatus.textContent = 'No capture is available yet.';
  }
}

elements.search?.addEventListener('input', renderArchiveList);
elements.verify?.addEventListener('click', verifyArchive);
elements.cite?.addEventListener('click', createCitation);
elements.citationStyle?.addEventListener('change', createCitation);
elements.copyCitation?.addEventListener('click', () => copyText(elements.citationOutput.value, elements.verificationStatus, 'Citation copied.'));
elements.downloadBibliography?.addEventListener('click', () => downloadBibliography(state.archives, elements.citationStyle.value));
elements.copyVerify?.addEventListener('click', () => copyText(verificationCommand(), elements.integritySummary, 'Cosign verification command copied.'));
elements.changeSelect?.addEventListener('change', showChange);
elements.diffMode?.addEventListener('change', showChange);

init();
