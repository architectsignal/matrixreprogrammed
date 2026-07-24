(() => {
  function injectHeroesDeckEntry() {
    if (document.getElementById('heroes-matrix-home-entry')) return;
    const anchor = document.querySelector('.reader-governor-strip') || document.querySelector('header.topbar');
    if (!anchor) return;
    const section = document.createElement('section');
    section.id = 'heroes-matrix-home-entry';
    section.className = 'section wrap';
    section.innerHTML = `
      <style>
        #heroes-matrix-home-entry{position:relative;overflow:hidden;border:1px solid rgba(97,214,180,.44);border-radius:24px;padding:clamp(1rem,3vw,1.7rem);margin-top:1rem;background:radial-gradient(circle at 88% 18%,rgba(97,214,180,.2),transparent 30%),linear-gradient(145deg,rgba(2,28,21,.97),rgba(0,0,0,.97));box-shadow:0 0 34px rgba(97,214,180,.12)}
        #heroes-matrix-home-entry:after{content:'⌘';position:absolute;right:clamp(1rem,4vw,3rem);top:50%;transform:translateY(-50%);font:700 clamp(5rem,14vw,10rem) Georgia,serif;color:rgba(97,214,180,.11);pointer-events:none}
        #heroes-matrix-home-entry .heroes-copy{position:relative;z-index:1;max-width:900px}
        #heroes-matrix-home-entry h2{margin:.45rem 0;font-size:clamp(1.8rem,5vw,3.8rem);line-height:.98}
        #heroes-matrix-home-entry .heroes-boundary{font-size:.88rem;color:#c9d8d3;max-width:880px}
      </style>
      <div class="heroes-copy">
        <div class="eyebrow">New 52-card resistance intelligence deck</div>
        <h2>HEROES FIGHTING THE MATRIX.</h2>
        <p class="lead">Meet the decentralised-internet builders, privacy defenders, whistleblowers, investigative publishers and public challengers who created real routes around censorship, surveillance, secrecy and centralised control.</p>
        <div class="cta-row"><a class="btn" href="heroes-fighting-matrix-deck.html">Open All 52 Cards</a><a class="btn alt" href="heroes-fighting-matrix-research-ledger.html">Research Ledger</a><a class="btn alt" href="deck-expansion-hub.html">Deck Intelligence Hub</a></div>
        <p class="heroes-boundary"><strong>Editorial boundary:</strong> documented public contribution is not total endorsement, moral perfection or a declaration of legal innocence. Allegations, pending cases, criticism and disputed claims remain labelled inside the dossiers.</p>
      </div>`;
    anchor.insertAdjacentElement('afterend', section);
  }

  injectHeroesDeckEntry();

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
