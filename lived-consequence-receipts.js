(() => {
  'use strict';

  const form = document.querySelector('[data-lived-receipt-form]');
  const status = document.querySelector('[data-lived-receipt-status]');
  const turnstileHost = document.querySelector('[data-lived-receipt-turnstile]');
  if (!form || !status) return;

  let turnstileWidget = null;
  let turnstileSiteKey = '';
  const recordSelect = form.elements.recordId;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function loadTurnstileScript() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(window.turnstile); return; }
      const existing = document.querySelector('script[data-matrix-turnstile]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.matrixTurnstile = 'true';
      script.addEventListener('load', () => resolve(window.turnstile), { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function configureSecurity() {
    try {
      const response = await fetch('/api/contact/config', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Contact config returned ${response.status}`);
      const config = await response.json();
      turnstileSiteKey = String(config.turnstileSiteKey || '');
      if (!turnstileSiteKey || !turnstileHost) return;
      const turnstile = await loadTurnstileScript();
      turnstileWidget = turnstile.render(turnstileHost, {
        sitekey: turnstileSiteKey,
        theme: 'dark',
        callback: token => { form.elements.turnstileToken.value = token; },
        'expired-callback': () => { form.elements.turnstileToken.value = ''; },
        'error-callback': () => { form.elements.turnstileToken.value = ''; setStatus('Human verification could not load. Try the secure PGP route or try again.', 'error'); }
      });
    } catch {
      setStatus('Secure intake configuration could not be confirmed. The form will fail closed if human verification is required.', 'warning');
    }
  }

  function selectedRecordLabel() {
    return recordSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
  }

  function validate() {
    if (!form.reportValidity()) return false;
    if (!form.elements.lawful.checked || !form.elements.redacted.checked || !form.elements.individualBoundary.checked) {
      setStatus('Confirm lawful submission, redaction and the individual-evidence boundary.', 'error');
      return false;
    }
    if (turnstileSiteKey && !form.elements.turnstileToken.value) {
      setStatus('Complete human verification before submitting.', 'error');
      return false;
    }
    return true;
  }

  function payload() {
    const recordId = String(form.elements.recordId.value || '').trim();
    const recordLabel = selectedRecordLabel();
    const consequenceType = String(form.elements.consequenceType.value || '').trim();
    const summary = String(form.elements.summary.value || '').trim();
    const location = String(form.elements.location.value || '').trim();
    const dateRange = String(form.elements.dateRange.value || '').trim();
    const sourceLinks = String(form.elements.sourceLinks.value || '').trim();
    const boundary = 'Individual receipt only. This submission does not by itself prove a general pattern, policy-wide outcome, causation or wrongdoing.';
    return {
      route: 'evidence',
      website: String(form.elements.website.value || ''),
      name: String(form.elements.name.value || '').trim(),
      email: String(form.elements.email.value || '').trim(),
      subject: `Lived consequence receipt: ${recordLabel || recordId}`.slice(0, 180),
      classification: String(form.elements.classification.value || 'credible-lead'),
      signalBoard: `lived-consequence-receipts:${recordId}`.slice(0, 120),
      message: [
        `Related record: ${recordLabel || recordId}`,
        `Record ID: ${recordId}`,
        `Consequence type: ${consequenceType}`,
        `Broad location: ${location || 'withheld'}`,
        `Date range: ${dateRange || 'withheld'}`,
        '',
        summary,
        '',
        `Submission boundary: ${boundary}`,
        'Submitter confirmed lawful possession and removal of unnecessary personal identifiers.'
      ].join('\n'),
      details: {
        people: '',
        organizations: recordLabel,
        location,
        dateRange,
        sourceLinks,
        challengedUrl: `lived-consequence-receipts.html?record=${encodeURIComponent(recordId)}`,
        supportType: 'lived-consequence-receipt'
      },
      consentReply: form.elements.consentReply.checked,
      consentPublish: form.elements.consentPublish.checked,
      urgent: false,
      turnstileToken: String(form.elements.turnstileToken.value || '')
    };
  }

  function clearSensitiveFields() {
    for (const name of ['summary', 'sourceLinks', 'name', 'email']) {
      const field = form.elements[name];
      if (field) field.value = '';
    }
    form.elements.consentReply.checked = false;
    form.elements.consentPublish.checked = false;
    form.elements.turnstileToken.value = '';
    if (turnstileWidget != null && window.turnstile) window.turnstile.reset(turnstileWidget);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validate()) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus('Submitting to the private review queue…', 'working');
    try {
      const response = await fetch('/api/contact/submit', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload())
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || result.saved !== true) throw new Error(result.error || `Secure intake returned ${response.status}`);
      clearSensitiveFields();
      setStatus(`Receipt stored privately for review. Reference: ${result.reference}. Nothing was published automatically.`, 'success');
    } catch (error) {
      setStatus(String(error?.message || error || 'Receipt could not be stored.').slice(0, 500), 'error');
      if (turnstileWidget != null && window.turnstile) window.turnstile.reset(turnstileWidget);
      form.elements.turnstileToken.value = '';
    } finally {
      submit.disabled = false;
    }
  });

  const recordFromUrl = new URL(location.href).searchParams.get('record') || '';
  if (recordFromUrl && recordSelect) {
    const option = [...recordSelect.options].find(item => item.value === recordFromUrl);
    if (option) recordSelect.value = recordFromUrl;
  }

  configureSecurity();
})();
