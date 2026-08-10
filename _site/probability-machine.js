(() => {
  'use strict';

  const form = document.getElementById('probability-form');
  if (!form) return;

  const question = document.getElementById('scenario-question');
  const status = document.getElementById('probability-status');
  const result = document.getElementById('probability-result');
  const detail = document.getElementById('result-detail');
  const signalControls = document.getElementById('signal-controls');
  const health = document.getElementById('engine-health');

  const signals = [
    ['identity_infrastructure', 'Identity infrastructure'],
    ['observation_infrastructure', 'Observation infrastructure'],
    ['data_integration', 'Cross-system data integration'],
    ['legal_capability', 'Legal and administrative capability'],
    ['algorithmic_enforcement', 'Algorithmic enforcement capacity'],
    ['financial_traceability', 'Financial traceability pressure'],
    ['institutional_counterweights', 'Courts, rights enforcement and practical redress']
  ];

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function empty(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function list(node, items, emptyLabel) {
    empty(node);
    const values = Array.isArray(items) ? items : [];
    if (!values.length) {
      const item = document.createElement('li');
      item.textContent = emptyLabel;
      node.appendChild(item);
      return;
    }
    values.forEach(value => {
      const item = document.createElement('li');
      if (typeof value === 'string') item.textContent = value;
      else item.textContent = `${value.label}${Number.isFinite(value.impactPoints) ? ` (${value.impactPoints > 0 ? '+' : ''}${value.impactPoints} points)` : ''}`;
      node.appendChild(item);
    });
  }

  function verdict(probability, band, confidence) {
    if (confidence < 35) return `The ${band.toLowerCase()} estimate is weakly supported. The machine is publishing a wide range because the evidence and calibration ledger are still thin.`;
    if (probability >= 60) return 'The defined threshold is not inevitable, but the ensemble finds a material path toward it. Watch the leading indicators and the counter-forces rather than the headline alone.';
    if (probability >= 40) return 'The future remains contested. Several enabling systems are present or developing, but counterweights and unresolved dependencies still matter.';
    return 'The defined threshold is currently less likely than not. That conclusion should change if the enabling systems accelerate or legal counterweights weaken.';
  }

  function renderComponents(components) {
    const container = document.getElementById('result-components');
    empty(container);
    (components || []).forEach(component => {
      const card = document.createElement('article');
      card.className = 'component-card';
      const label = document.createElement('span');
      label.textContent = component.name.replace(/([A-Z])/g, ' $1').trim();
      const score = document.createElement('strong');
      score.textContent = `${component.probability}%`;
      const weight = document.createElement('small');
      weight.textContent = `ensemble weight ${Math.round(component.weight * 100)}%`;
      card.append(label, score, weight);
      container.appendChild(card);
    });
  }

  function render(payload) {
    const probability = Number(payload.probability.central || 0);
    result.hidden = false;
    detail.hidden = false;
    result.setAttribute('aria-busy', 'false');
    document.getElementById('probability-dial').style.setProperty('--probability-score', probability);
    text('result-probability', `${probability}%`);
    text('result-band', payload.probability.band);
    text('result-model-mode', payload.modelMode === 'private-runtime' ? 'private calibration' : 'research preview');
    text('result-range', `${payload.probability.lower}%–${payload.probability.upper}%`);
    text('result-confidence', `${payload.confidence.score}/100 · ${payload.confidence.band}`);
    text('result-disagreement', `${payload.modelDisagreement} points`);
    text('result-proposition', payload.scenario.proposition);
    text('result-verdict', verdict(probability, payload.probability.band, payload.confidence.score));
    list(document.getElementById('result-drivers'), payload.drivers, 'No positive driver cleared the publication threshold.');
    list(document.getElementById('result-counter-drivers'), payload.counterDrivers, 'No counter-force cleared the publication threshold.');
    list(document.getElementById('result-missing'), payload.missingEvidence, 'No missing-evidence record returned.');
    list(document.getElementById('result-falsifiers'), payload.falsificationConditions, 'No falsification condition returned.');
    list(document.getElementById('result-warnings'), payload.warnings, 'No additional warning.');
    renderComponents(payload.components);
    text('result-run-id', payload.forecastRunId);
    text('result-engine', payload.engineVersion);
    text('result-generated', new Date(payload.generatedAt).toLocaleString());
    text('result-calibration', payload.calibrationStatus);
    text('result-boundary', payload.boundary);
  }

  function collectSignals() {
    const values = {};
    signalControls.querySelectorAll('input[type="range"]').forEach(input => {
      if (input.dataset.changed === 'true') values[input.name] = Number(input.value);
    });
    return values;
  }

  signals.forEach(([id, label]) => {
    const row = document.createElement('div');
    row.className = 'signal-control';
    const fieldLabel = document.createElement('label');
    fieldLabel.htmlFor = `signal-${id}`;
    fieldLabel.textContent = label;
    const input = document.createElement('input');
    input.id = `signal-${id}`;
    input.name = id;
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = '0.5';
    input.dataset.changed = 'false';
    const output = document.createElement('output');
    output.htmlFor = input.id;
    output.value = 'seed';
    output.textContent = 'seed';
    input.addEventListener('input', () => {
      input.dataset.changed = 'true';
      output.value = input.value;
      output.textContent = Number(input.value).toFixed(2);
    });
    row.append(fieldLabel, input, output);
    signalControls.appendChild(row);
  });

  document.querySelectorAll('[data-example]').forEach(button => {
    button.addEventListener('click', () => {
      question.value = button.dataset.example || '';
      question.focus();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    result.setAttribute('aria-busy', 'true');
    status.textContent = 'Compiling the scenario, running independent models and measuring disagreement…';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch('/api/public/probability/forecast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.value, signals: collectSignals() }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'Forecast failed safely.');
      render(payload);
      status.textContent = `Forecast complete: ${payload.forecastRunId}.`;
      result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      result.setAttribute('aria-busy', 'false');
      status.textContent = error.name === 'AbortError'
        ? 'The engine timed out without publishing a score.'
        : `No score published: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });

  fetch('/api/public/probability/health', { headers: { accept: 'application/json' } })
    .then(response => response.json())
    .then(payload => {
      health.textContent = payload.ok
        ? `Engine online · ${payload.engineVersion} · ${payload.modelMode} · stateless · external AI disabled.`
        : 'Engine health did not verify.';
    })
    .catch(() => { health.textContent = 'Engine health is unavailable; no forecast should be trusted until the Worker route verifies.'; });
})();
