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
function matrixIntakeRenderReceipt(form, payload) {
  let box = form.parentElement.querySelector('.intake-receipt');
  if (!box) {
    box = document.createElement('div');
    box.className = 'intake-receipt';
    box.style.cssText = 'margin-top:1rem;border:1px solid rgba(216,181,106,.35);border-radius:18px;padding:1rem;background:rgba(0,0,0,.55)';
    form.parentElement.appendChild(box);
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  box.innerHTML = '<h3>Lead saved locally</h3><p>This source lead has been saved in your browser as a review package. Download it or copy the text if the live submission endpoint is not connected.</p><p><a class="btn" download="matrix-intake-lead.json">Download JSON Lead</a></p><pre style="white-space:pre-wrap;max-height:260px;overflow:auto">' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
  box.querySelector('a').href = url;
}
function matrixAttachIntakeFallback(selector = 'form[action="/submit-forum-post"]') {
  document.querySelectorAll(selector).forEach(form => {
    if (form.dataset.matrixFallbackAttached === 'true') return;
    form.dataset.matrixFallbackAttached = 'true';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const sourceUrl = form.querySelector('[name="sourceUrl"]')?.value || '';
      const note = form.querySelector('[name="note"]')?.value || '';
      const shows = form.querySelector('[name="shows"]')?.value || '';
      const doesNotShow = form.querySelector('[name="doesNotShow"]')?.value || '';
      if (!sourceUrl && !note.trim()) { alert('Add a source link or a clear note before submitting.'); return; }
      if (form.querySelector('[name="shows"]') && (!shows.trim() || !doesNotShow.trim())) { alert('Explain both what the source shows and what it does not show.'); return; }
      const payload = matrixIntakeSaveLead(form);
      matrixIntakeRenderReceipt(form, payload);
      form.reset();
    });
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
document.addEventListener('DOMContentLoaded', () => matrixAttachIntakeFallback());
