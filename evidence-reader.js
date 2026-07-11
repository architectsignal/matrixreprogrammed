const PDFJS_VERSION = '4.10.38';
const PDFJS_MODULE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

const elements = {
  list: document.querySelector('#reader-document-list'),
  documentSearch: document.querySelector('#reader-document-search'),
  stage: document.querySelector('#reader-stage'),
  title: document.querySelector('#reader-title'),
  source: document.querySelector('#reader-source'),
  grade: document.querySelector('#reader-grade'),
  hash: document.querySelector('#reader-hash'),
  established: document.querySelector('#reader-established'),
  notEstablished: document.querySelector('#reader-not-established'),
  page: document.querySelector('#reader-page'),
  pageCount: document.querySelector('#reader-page-count'),
  prev: document.querySelector('#reader-prev'),
  next: document.querySelector('#reader-next'),
  zoom: document.querySelector('#reader-zoom'),
  textSearch: document.querySelector('#reader-text-search'),
  find: document.querySelector('#reader-find'),
  copy: document.querySelector('#reader-copy-link'),
  original: document.querySelector('#reader-original'),
  status: document.querySelector('#reader-status')
};

let manifest = { documents: [] };
let activeDocument = null;
let pdfDocument = null;
let pdfjs = null;
let currentPage = 1;
let renderToken = 0;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const normalize = value => String(value || '').toLowerCase().trim();
const params = new URLSearchParams(location.search);

function approvedUrl(documentRecord) {
  if (!documentRecord || !documentRecord.url) return null;
  const url = new URL(documentRecord.url, location.href);
  if (url.origin !== location.origin) return null;
  if (!/\.pdf(?:$|\?)/i.test(url.pathname + url.search)) return null;
  return url;
}

function updateUrl() {
  const next = new URLSearchParams();
  if (activeDocument) next.set('id', activeDocument.id);
  next.set('page', String(currentPage));
  history.replaceState(null, '', `${location.pathname}?${next.toString()}`);
}

function renderDocumentList() {
  const query = normalize(elements.documentSearch?.value);
  const rows = (manifest.documents || []).filter(documentRecord => {
    const haystack = normalize([documentRecord.title, documentRecord.source, documentRecord.filename, documentRecord.evidenceGrade].join(' '));
    return !query || haystack.includes(query);
  });
  elements.list.innerHTML = rows.length ? rows.map(documentRecord => `<button type="button" data-document-id="${escapeHtml(documentRecord.id)}" aria-current="${activeDocument?.id === documentRecord.id ? 'true' : 'false'}"><strong>${escapeHtml(documentRecord.title)}</strong><br/><small>Grade ${escapeHtml(documentRecord.evidenceGrade || '—')} · ${escapeHtml(documentRecord.source || 'Unknown source')}</small></button>`).join('') : '<p>No approved PDF matches this filter.</p>';
  elements.list.querySelectorAll('[data-document-id]').forEach(button => button.addEventListener('click', () => selectDocument(button.dataset.documentId, 1)));
}

async function ensurePdfJs() {
  if (pdfjs) return pdfjs;
  elements.status.textContent = `Loading PDF.js ${PDFJS_VERSION}…`;
  pdfjs = await import(PDFJS_MODULE);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return pdfjs;
}

function setMetadata(documentRecord) {
  elements.title.textContent = documentRecord.title || documentRecord.filename || 'Evidence document';
  elements.grade.textContent = `GRADE ${documentRecord.evidenceGrade || '—'} · ${documentRecord.factualStatus || 'public evidence document'}`;
  const sourceText = [documentRecord.source, documentRecord.publicationDate ? `Published ${documentRecord.publicationDate}` : '', documentRecord.retrievalDate ? `Retrieved ${documentRecord.retrievalDate}` : ''].filter(Boolean).join(' · ');
  elements.source.textContent = sourceText;
  elements.hash.textContent = documentRecord.sha256 || '—';
  elements.established.textContent = documentRecord.established || '—';
  elements.notEstablished.textContent = documentRecord.notEstablished || '—';
  elements.original.href = documentRecord.url;
}

async function renderPage(pageNumber = currentPage) {
  if (!pdfDocument || !activeDocument) return;
  const token = ++renderToken;
  currentPage = Math.min(Math.max(1, Number(pageNumber) || 1), pdfDocument.numPages);
  elements.page.value = String(currentPage);
  elements.pageCount.textContent = `of ${pdfDocument.numPages}`;
  elements.prev.disabled = currentPage <= 1;
  elements.next.disabled = currentPage >= pdfDocument.numPages;
  elements.status.textContent = `Rendering page ${currentPage}…`;
  const page = await pdfDocument.getPage(currentPage);
  if (token !== renderToken) return;
  const scale = Math.min(3, Math.max(0.5, Number(elements.zoom.value) || 1));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  elements.stage.replaceChildren(canvas);
  await page.render({ canvasContext: context, viewport }).promise;
  if (token !== renderToken) return;
  elements.status.textContent = `Page ${currentPage} of ${pdfDocument.numPages} · PDF.js ${PDFJS_VERSION}`;
  updateUrl();
}

function fallbackViewer(documentRecord, message) {
  const url = approvedUrl(documentRecord);
  elements.stage.innerHTML = url ? `<iframe title="${escapeHtml(documentRecord.title)}" src="${escapeHtml(url.toString())}#page=${currentPage}" style="width:100%;height:75vh;border:0;background:white"></iframe>` : '<p>The approved document URL is unavailable.</p>';
  elements.status.textContent = `${message} Browser PDF fallback active.`;
  updateUrl();
}

async function selectDocument(id, requestedPage = 1) {
  const documentRecord = (manifest.documents || []).find(item => item.id === id);
  const url = approvedUrl(documentRecord);
  if (!documentRecord || !url) {
    elements.status.textContent = 'The requested document is not present in the approved manifest.';
    return;
  }
  activeDocument = documentRecord;
  currentPage = Math.max(1, Number(requestedPage) || Number(documentRecord.pageHint) || 1);
  pdfDocument = null;
  setMetadata(documentRecord);
  renderDocumentList();
  elements.stage.innerHTML = '<p>Loading approved evidence document…</p>';
  try {
    const library = await ensurePdfJs();
    pdfDocument = await library.getDocument({ url: url.toString(), withCredentials: false }).promise;
    currentPage = Math.min(currentPage, pdfDocument.numPages);
    await renderPage(currentPage);
  } catch (error) {
    console.error('PDF.js reader failed', error);
    fallbackViewer(documentRecord, 'PDF.js could not render this file.');
  }
}

async function findText() {
  const term = normalize(elements.textSearch.value);
  if (!term || !pdfDocument) return;
  elements.find.disabled = true;
  elements.status.textContent = `Searching ${pdfDocument.numPages} pages for “${term}”…`;
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = normalize(content.items.map(item => item.str || '').join(' '));
      if (text.includes(term)) {
        await renderPage(pageNumber);
        elements.status.textContent = `First match for “${term}” found on page ${pageNumber}.`;
        return;
      }
    }
    elements.status.textContent = `No text match for “${term}”. Scanned or redacted pages may not contain searchable text.`;
  } finally {
    elements.find.disabled = false;
  }
}

async function copyPageLink() {
  if (!activeDocument) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('id', activeDocument.id);
  url.searchParams.set('page', String(currentPage));
  try {
    await navigator.clipboard.writeText(url.toString());
    elements.status.textContent = `Copied citation link for page ${currentPage}.`;
  } catch {
    prompt('Copy this page-specific citation link:', url.toString());
  }
}

async function init() {
  try {
    const response = await fetch('data/evidence-reader-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    manifest = await response.json();
    renderDocumentList();
    const requestedId = params.get('id') || manifest.documents?.[0]?.id;
    const requestedPage = Number(params.get('page') || 1);
    if (requestedId) await selectDocument(requestedId, requestedPage);
    else elements.status.textContent = 'No approved public PDFs are currently available.';
  } catch (error) {
    elements.status.textContent = `Evidence manifest unavailable: ${error.message}`;
    elements.list.innerHTML = '<p>No approved document list could be loaded.</p>';
  }
}

elements.documentSearch?.addEventListener('input', renderDocumentList);
elements.prev?.addEventListener('click', () => renderPage(currentPage - 1));
elements.next?.addEventListener('click', () => renderPage(currentPage + 1));
elements.page?.addEventListener('change', () => renderPage(elements.page.value));
elements.zoom?.addEventListener('change', () => renderPage(currentPage));
elements.find?.addEventListener('click', findText);
elements.textSearch?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); findText(); } });
elements.copy?.addEventListener('click', copyPageLink);

init();
