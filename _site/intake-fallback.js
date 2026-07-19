function matrixIntakeSaveLead(form, prefix = 'matrix-intake') {
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    ok: true,
    id: prefix + '-' + Date.now(),
    createdAt: new Date().toISOString(),
    page: location.pathname,
    data
  };
  const key = 'matrixReprogrammedIntakeLeads';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.unshift(payload);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
  return payload;
}
function matrixIntakeReceiptBox(form) {
  let box = form.parentElement.querySelector('.intake-receipt');
  if (!box) {
    box = document.createElement('div');
    box.className = 'intake-receipt';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = 'margin-top:1rem;border:1px solid rgba(216,181,106,.35);border-radius:18px;padding:1rem;background:rgba(0,0,0,.55)';
    form.parentElement.appendChild(box);
  }
  return box;
}
function matrixIntakeRenderReceipt(form, payload) {
  const box = matrixIntakeReceiptBox(form);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  box.innerHTML = '<h3>Lead saved locally</h3><p>The live review endpoint was unavailable, so this source lead was preserved in your browser. Download the review package and try again later.</p><p><a class="btn" download="matrix-intake-lead.json">Download JSON Lead</a></p><pre style="white-space:pre-wrap;max-height:260px;overflow:auto">' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
  box.querySelector('a').href = url;
}
function matrixIntakeRenderSubmitted(form, data) {
  const box = matrixIntakeReceiptBox(form);
  const reference = data?.post?.id || data?.id || data?.reference || '';
  box.innerHTML = '<h3>Submitted for pending review</h3><p>The public-source lead reached the review system. It is not treated as evidence or a site conclusion until checked.</p>' + (reference ? '<p><strong>Reference:</strong> ' + escapeHtml(reference) + '</p>' : '');
}
function matrixIntakeValidate(form) {
  const sourceUrl = form.querySelector('[name="sourceUrl"]')?.value || '';
  const note = form.querySelector('[name="note"]')?.value || '';
  const shows = form.querySelector('[name="shows"]')?.value || '';
  const doesNotShow = form.querySelector('[name="doesNotShow"]')?.value || '';
  if (!sourceUrl && !note.trim()) { alert('Add a source link or a clear note before submitting.'); return false; }
  if (form.querySelector('[name="shows"]') && (!shows.trim() || !doesNotShow.trim())) { alert('Explain both what the source shows and what it does not show.'); return false; }
  return true;
}
async function matrixIntakeSubmit(form) {
  const submit = form.querySelector('[type="submit"]');
  const originalLabel = submit?.textContent || '';
  if (submit) { submit.disabled = true; submit.textContent = 'Submitting…'; }
  try {
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) body.append(key, value);
    const response = await fetch(form.action || '/submit-forum-post', {
      method: String(form.method || 'post').toUpperCase(),
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' },
      body: body.toString(),
      credentials: 'same-origin'
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok || data?.ok === false || data?.saved === false) throw new Error(data?.error || `Submission endpoint returned HTTP ${response.status}`);
    matrixIntakeRenderSubmitted(form, data || {});
    form.reset();
  } catch (error) {
    const payload = matrixIntakeSaveLead(form);
    payload.liveSubmission = { ok: false, error: String(error?.message || error || 'unknown error') };
    matrixIntakeRenderReceipt(form, payload);
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = originalLabel; }
  }
}
function matrixAttachIntakeFallback(selector = 'form[action="/submit-forum-post"]') {
  document.querySelectorAll(selector).forEach(form => {
    if (form.dataset.matrixFallbackAttached === 'true') return;
    form.dataset.matrixFallbackAttached = 'true';
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!matrixIntakeValidate(form)) return;
      matrixIntakeSubmit(form);
    });
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
document.addEventListener('DOMContentLoaded', () => matrixAttachIntakeFallback());
