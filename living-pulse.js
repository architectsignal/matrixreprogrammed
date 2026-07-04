(() => {
  const targets = document.querySelectorAll('[data-living-pulse]');
  if (!targets.length) return;
  const fallback = {
    topConclusions: [
      'Disclosure pressure is a top exposure lane because withheld records reveal the structure of protection and omission.',
      'Policy-system convergence remains the strongest system-level pattern; the key test is whether access becomes mandatory, centralized or vendor-controlled.',
      'Gold reserves must be tracked through ownership and custody separately because reported tonnes do not prove physical location or encumbrance status.'
    ],
    tomorrowWatchList: [
      'New filing, redaction explanation, or changed document index.',
      'Any access system changing from optional to mandatory.',
      'Any major infrastructure contract involving public systems.'
    ]
  };
  function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function render(data) {
    const conclusions = (data.topConclusions || fallback.topConclusions).slice(0, 3);
    const watch = (data.tomorrowWatchList || fallback.tomorrowWatchList).slice(0, 3);
    const updated = data.updated ? new Date(data.updated).toLocaleString() : 'latest build';
    const html = `<div class="card redline"><span class="label">MACHINE PULSE</span><h3>What the brain sees now</h3><p class="muted">Updated: ${esc(updated)}</p><ul>${conclusions.map(x => `<li>${esc(x)}</li>`).join('')}</ul><h3>Watch next</h3><ul>${watch.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="cta-row small"><a class="btn" href="daily-brain-brief.html">Daily Brain Brief</a><a class="btn alt" href="control-structure.html">Control Map</a><a class="btn alt" href="evidence-vault.html">Evidence</a></div></div>`;
    targets.forEach(t => { t.innerHTML = html; });
  }
  fetch('data/daily-brain-brief.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : fallback).then(render).catch(() => render(fallback));
})();
