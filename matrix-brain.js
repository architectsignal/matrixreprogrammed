(() => {
  const input = document.getElementById('matrix-brain-query');
  const output = document.getElementById('matrix-brain-answer');
  if (!input || !output) return;

  const normalise = value => String(value || '').toLowerCase();
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const tokenize = value => normalise(value).split(/[^a-z0-9]+/).filter(term => term.length > 2);

  function score(item, terms) {
    const hay = normalise([item.title, item.summary, item.type, item.boundary, ...(item.tags || [])].join(' '));
    return terms.reduce((total, term) => total + (hay.includes(term) ? 1 : 0), 0);
  }

  function fallbackAnswer(query) {
    const q = normalise(query);
    if (/cbdc|money|bank|payment|cash|currency|token/.test(q)) return { title: 'Programmable Money / Financial Control', route: 'control-system-tracker.html#programmable-money', type: 'policy', boundary: 'Treat as a policy-convergence lane. Look for pilots, procurement, mandates, integration and lock-in.' };
    if (/digital id|identity|biometric|wallet|age verification|passport/.test(q)) return { title: 'Digital ID / Biometrics', route: 'control-system-tracker.html#digital-id', type: 'policy', boundary: 'Identity systems are not automatically abuse. Track mandate, biometric scope, interoperability and links to money, speech, travel or benefits.' };
    if (/agenda|2030|governance|treaty|world government|global/.test(q)) return { title: 'Agenda 2030 / Global Standards', route: 'control-system-tracker.html#agenda-2030-and-global-standards', type: 'policy', boundary: 'Global coordination is not automatically a verdict. Track domestic mandate adoption, funding conditions and enforceability.' };
    if (/epstein|maxwell|flight|island|wexner|clinton|trump|jpmorgan|deutsche/.test(q)) return { title: 'Epstein Public-Record Tracker', route: 'epstein-files.html', type: 'epstein', boundary: 'A name, flight, email, meeting or property link is not proof of criminal conduct. Follow the record lane.' };
    if (/frazzle|pizzagate|adreno|blue beam|ufo|occult|mkultra|ritual/.test(q)) return { title: 'Dark Speculation Lab', route: 'dark-speculation-lab.html', type: 'speculation', boundary: 'Speculation is allowed when labelled. Classify claim-history, motif, hypothesis, open question or debunk lane before belief.' };
    if (/war|nato|cyber|emergency|security|contractor/.test(q)) return { title: 'War / Security / Emergency Powers', route: 'control-system-tracker.html#security-and-war-powers', type: 'policy', boundary: 'Threats can be real. Track whether response becomes permanent security architecture.' };
    return { title: 'Search the Signal', route: 'search.html', type: 'search', boundary: 'No direct match. Use the full archive search and classify the source before drawing conclusions.' };
  }

  let graph = { knowledge: [] };
  fetch('downloads/site-intelligence-graph.json')
    .then(response => response.ok ? response.json() : graph)
    .then(data => { graph = data || graph; })
    .catch(() => {});

  function answer() {
    const query = input.value.trim();
    if (!query) {
      output.textContent = 'Type a signal to classify it.';
      return;
    }
    const terms = tokenize(query);
    const ranked = (graph.knowledge || [])
      .map(item => ({ item, score: score(item, terms) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const best = ranked.length ? ranked[0].item : fallbackAnswer(query);
    const related = ranked.slice(1).map(row => `<li><a href="${esc(row.item.route || 'search.html')}">${esc(row.item.title)}</a> <span class="pill">${esc(row.item.type)}</span></li>`).join('');
    output.innerHTML = `<strong>Classification:</strong> ${esc(best.type || 'signal')}\n<strong>Best lane:</strong> ${esc(best.title)}\n<strong>Boundary:</strong> ${esc(best.boundary || 'Source first, claim second.')}\n<p><a class="btn" href="${esc(best.route || 'search.html')}">Open source route</a></p>${related ? `<p><strong>Related lanes:</strong></p><ul>${related}</ul>` : ''}`;
  }

  input.addEventListener('input', answer);
})();
