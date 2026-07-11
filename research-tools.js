(() => {
  const authState = document.querySelector('[data-auth-state]');
  const runnerState = document.querySelector('[data-runner-state]');
  const adminCard = document.querySelector('[data-admin-tool]');
  const jobsBody = document.querySelector('[data-jobs-body]');
  const forms = [...document.querySelectorAll('[data-tool-form]')];
  const activePolls = new Map();
  let config = null;

  function setText(node, text, state = '') {
    if (!node) return;
    node.textContent = text;
    if (state) node.dataset.state = state;
  }

  function setFormEnabled(form, enabled) {
    [...form.elements].forEach((element) => {
      element.disabled = !enabled;
    });
  }

  function outputFor(tool) {
    return document.querySelector(`[data-tool-output="${tool}"]`);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
  }

  function renderResult(tool, job) {
    const node = outputFor(tool);
    if (!node || !job) return;
    const lines = [
      `Status: ${job.status}`,
      `Job: ${job.id}`,
      `Target reference: ${job.targetReference || '—'}`,
      `Created: ${formatDate(job.createdAt)}`
    ];
    if (job.summary) lines.push(`Summary: ${job.summary}`);
    if (job.error) lines.push(`Error: ${job.error}`);
    if (job.result) lines.push('', JSON.stringify(job.result, null, 2));
    setText(node, lines.join('\n'), job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : '');
  }

  async function loadJobs() {
    if (!jobsBody || !config) return;
    try {
      const payload = await request('/api/tools/jobs');
      jobsBody.textContent = '';
      if (!payload.jobs?.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'No tool jobs yet.';
        row.appendChild(cell);
        jobsBody.appendChild(row);
        return;
      }
      payload.jobs.forEach((job) => {
        const row = document.createElement('tr');
        const values = [job.tool, job.status, job.targetReference || '—', formatDate(job.createdAt), job.summary || job.error || '—'];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 2) {
            const code = document.createElement('code');
            code.textContent = String(value);
            cell.appendChild(code);
          } else {
            cell.textContent = String(value);
          }
          row.appendChild(cell);
        });
        jobsBody.appendChild(row);
      });
    } catch (error) {
      jobsBody.innerHTML = '<tr><td colspan="5">Unable to load private jobs.</td></tr>';
    }
  }

  function stopPolling(jobId) {
    const timer = activePolls.get(jobId);
    if (timer) clearTimeout(timer);
    activePolls.delete(jobId);
  }

  async function pollJob(jobId, tool, attempt = 0) {
    try {
      const payload = await request(`/api/tools/jobs/${encodeURIComponent(jobId)}`);
      renderResult(tool, payload.job);
      await loadJobs();
      if (['completed', 'failed', 'cancelled'].includes(payload.job.status)) {
        stopPolling(jobId);
        return;
      }
      if (attempt >= 120) {
        setText(outputFor(tool), `Job ${jobId} is still processing. Return to this page later to view it.`, '');
        stopPolling(jobId);
        return;
      }
      const timer = setTimeout(() => pollJob(jobId, tool, attempt + 1), 5000);
      activePolls.set(jobId, timer);
    } catch (error) {
      setText(outputFor(tool), error.message, 'error');
      stopPolling(jobId);
    }
  }

  async function submitTool(form) {
    const tool = form.dataset.toolForm;
    const output = outputFor(tool);
    const data = new FormData(form);
    const payload = {
      tool,
      target: String(data.get('target') || '').trim(),
      purpose: String(data.get('purpose') || '').trim(),
      confirmLawfulUse: data.get('confirmLawfulUse') === 'on',
      confirmNoMinor: data.get('confirmNoMinor') === 'on'
    };
    setFormEnabled(form, false);
    setText(output, 'Submitting encrypted private job…');
    try {
      const response = await request('/api/tools/jobs', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      const job = response.job || { id: response.jobId, status: response.status || 'queued' };
      setText(output, `Accepted. Job ${job.id} is ${job.status}.`);
      await loadJobs();
      pollJob(job.id, tool);
    } catch (error) {
      setText(output, error.message, 'error');
    } finally {
      const allowed = Boolean(config?.tools?.[tool]?.allowed && config?.configured);
      setFormEnabled(form, allowed);
    }
  }

  async function initialise() {
    forms.forEach((form) => {
      setFormEnabled(form, false);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitTool(form);
      });
    });

    try {
      config = await request('/api/tools/config');
      const role = config.member?.role || 'member';
      setText(authState, role === 'admin' ? 'Administrator authenticated' : 'Verified member authenticated');
      const onlineTools = Object.entries(config.tools || {}).filter(([, value]) => value.runnerOnline).map(([key]) => key);
      setText(runnerState, onlineTools.length ? `Private service online: ${onlineTools.join(', ')}` : config.configured ? 'Private service configured; runner currently offline' : 'Private service not configured');
      if (adminCard && role === 'admin') adminCard.hidden = false;
      forms.forEach((form) => {
        const tool = form.dataset.toolForm;
        const toolConfig = config.tools?.[tool];
        const allowed = Boolean(config.configured && toolConfig?.allowed);
        setFormEnabled(form, allowed);
        const output = outputFor(tool);
        if (!toolConfig?.allowed) setText(output, tool === 'h8mail' ? 'Administrator authentication required.' : 'This member account cannot use this tool.', 'error');
        else if (!config.configured) setText(output, 'The private tool service has not been configured yet.', 'error');
        else if (!toolConfig.runnerOnline) setText(output, 'The tool is configured, but the private runner is currently offline. Jobs can be queued and will run when it reconnects.');
        else setText(output, `Ready. Daily limit: ${toolConfig.dailyLimit}.`);
      });
      await loadJobs();
    } catch (error) {
      if (error.status === 401) {
        setText(authState, 'Member login required');
        setText(runnerState, 'Tools locked');
        forms.forEach((form) => setFormEnabled(form, false));
        return;
      }
      setText(authState, 'Membership check failed');
      setText(runnerState, error.message);
    }
  }

  window.addEventListener('beforeunload', () => {
    activePolls.forEach((timer) => clearTimeout(timer));
  });
  initialise();
})();
