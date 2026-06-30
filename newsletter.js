(function(){
  const forms = Array.from(document.querySelectorAll('[data-newsletter-form]'));
  const statusNodes = new Map();
  function esc(value){ return String(value || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
  async function parse(res){ const text = await res.text(); try { return JSON.parse(text); } catch { return { error: text || ('HTTP ' + res.status) }; } }
  function statusFor(form){
    let node = form.querySelector('[data-newsletter-status]');
    if (!node) {
      node = document.createElement('p');
      node.className = 'warning';
      node.setAttribute('data-newsletter-status', '');
      form.appendChild(node);
    }
    statusNodes.set(form, node);
    return node;
  }
  async function submit(form){
    const status = statusFor(form);
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.source = payload.source || form.getAttribute('data-source') || location.pathname;
    payload.tags = payload.tags || form.getAttribute('data-tags') || 'weekly,live-intel,black-file';
    payload.consentText = 'I agree to receive the Matrix Reprogrammed weekly signal newsletter and understand I can unsubscribe.';
    status.textContent = 'Saving your email to the persistent newsletter list...';
    try {
      const res = await fetch('/subscribe-newsletter', { method:'POST', cache:'no-store', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify(payload) });
      const data = await parse(res);
      if (!res.ok || data.ok === false || data.persistent !== true) throw new Error(data.error || 'subscription was not saved persistently');
      form.reset();
      status.innerHTML = 'Subscribed. Your weekly Matrix Reprogrammed signal is saved persistently. Open the <a href="download-center.html">Download Center</a> or <a href="live-intel.html">Live Intel</a> next.';
    } catch (error) {
      status.innerHTML = 'Subscription not saved yet: ' + esc(error.message || error) + '. Try again or check <a href="/newsletter-health">newsletter health</a>.';
    }
  }
  forms.forEach(form => {
    statusFor(form);
    form.addEventListener('submit', event => { event.preventDefault(); submit(form); });
  });
})();
