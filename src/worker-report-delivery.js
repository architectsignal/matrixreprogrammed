const reportOrigin = 'matrix-verified-member-report-delivery';

const toolLabels = {
  holehe: 'Email Account Exposure',
  spiderfoot: 'Passive Digital Footprint',
  h8mail: 'Breach Exposure Review'
};

function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
}

function clean(value, max = 1000) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

async function first(statement) {
  try { return await statement.first(); } catch { return null; }
}

async function all(statement) {
  try {
    const result = await statement.all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch { return []; }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function stringList(value, limit = 20) {
  return (Array.isArray(value) ? value : [])
    .map(item => clean(typeof item === 'string' ? item : item?.name || item?.title || item?.label || '', 180))
    .filter(Boolean)
    .slice(0, limit);
}

function reportSections(result = {}) {
  const risk = result.riskAssessment || result.ai_summary || {};
  const accounts = (Array.isArray(result.accounts) ? result.accounts : [])
    .map(record => clean(record?.module?.name_formatted || record?.module?.domain || record?.module?.name || '', 180))
    .filter(Boolean)
    .slice(0, 25);

  const indicators = result.exposureIndicators || result.exposureCategories || {};
  const exposure = Object.entries(indicators)
    .filter(([, count]) => Number(count) > 0)
    .map(([name, count]) => `${clean(name.replace(/([a-z])([A-Z])/g, '$1 $2'), 120)}: ${Number(count)}`)
    .slice(0, 30);

  const breachRows = Array.isArray(result?.data_breaches?.results) ? result.data_breaches.results : [];
  const sources = [
    ...breachRows.map(row => clean(row?.source?.name || row?.name || '', 180)),
    ...stringList(result.breachOrDatasetNames, 25),
    ...stringList(result.sources, 25)
  ].filter(Boolean).slice(0, 30);

  const actions = stringList(result.recommendedActions || risk.actions, 20);
  return {
    riskLevel: clean(risk.level || risk.risk || 'informational', 40),
    summary: clean(risk.summary || risk.headline || risk.reason || result.summary || 'The report completed with sanitised, evidence-bounded findings.', 900),
    accounts,
    exposure,
    sources,
    actions
  };
}

function listHtml(items, emptyMessage) {
  if (!items.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function listText(title, items, emptyMessage) {
  return `${title}\n${items.length ? items.map(item => `- ${item}`).join('\n') : `- ${emptyMessage}`}`;
}

function buildMessage(row) {
  const result = parseJson(row.result_json, {});
  const sections = reportSections(result);
  const toolLabel = toolLabels[row.tool] || clean(row.tool || 'Intelligence Report', 80);
  const subject = `Matrix Reprogrammed in-depth report — ${toolLabel}`;
  const secureUrl = 'https://matrixreprogrammed.com/research-tools.html';
  const evidenceBoundary = 'This report contains sanitised investigative signals. Association is not proof of identity, ownership, compromise, motive or wrongdoing.';

  const htmlContent = `<!doctype html><html><body style="background:#050505;color:#f3e6bd;font-family:Arial,sans-serif;padding:28px"><div style="max-width:720px;margin:auto;border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b9aa82">Verified member intelligence delivery</div><h1 style="color:#d8b56a">${escapeHtml(toolLabel)}</h1><p>Hello ${escapeHtml(row.display_name || 'Reader')},</p><p>Your verified-self report has completed. The searched mailbox matched your verified Matrix Reprogrammed member account.</p><h2>Assessment</h2><p><strong>Risk level:</strong> ${escapeHtml(sections.riskLevel)}</p><p>${escapeHtml(sections.summary)}</p><h2>Possible account associations</h2>${listHtml(sections.accounts, 'No positive account-association signal was returned.')}<h2>Exposure categories</h2>${listHtml(sections.exposure, 'No sensitive exposure category was returned.')}<h2>Sources and datasets</h2>${listHtml(sections.sources, 'No named source or dataset was returned.')}<h2>Recommended defensive actions</h2>${listHtml(sections.actions, 'Review the secure report and verify findings directly with the relevant providers.')}<p style="margin-top:28px"><a href="${secureUrl}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">Open the secure report</a></p><p style="font-size:13px;color:#b9aa82"><strong>Evidence boundary:</strong> ${escapeHtml(evidenceBoundary)}</p><p style="font-size:12px;color:#8f8467">Report ID: ${escapeHtml(row.id)} · Delivery: ${escapeHtml(reportOrigin)}</p></div></body></html>`;

  const textContent = [
    toolLabel,
    '',
    `Hello ${row.display_name || 'Reader'},`,
    '',
    'Your verified-self report has completed. The searched mailbox matched your verified Matrix Reprogrammed member account.',
    '',
    `Risk level: ${sections.riskLevel}`,
    sections.summary,
    '',
    listText('Possible account associations', sections.accounts, 'No positive account-association signal was returned.'),
    '',
    listText('Exposure categories', sections.exposure, 'No sensitive exposure category was returned.'),
    '',
    listText('Sources and datasets', sections.sources, 'No named source or dataset was returned.'),
    '',
    listText('Recommended defensive actions', sections.actions, 'Review the secure report and verify findings directly with the relevant providers.'),
    '',
    `Open the secure report: ${secureUrl}`,
    '',
    `Evidence boundary: ${evidenceBoundary}`,
    `Report ID: ${row.id}`
  ].join('\n');

  return { subject, htmlContent, textContent };
}

async function audit(env, memberId, action, reportId, metadata = {}) {
  if (!hasD1(env)) return;
  await env.MEMBERS_DB.prepare(
    'INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(
    `audit-${crypto.randomUUID()}`,
    memberId,
    action,
    'osint_tool_job',
    reportId,
    JSON.stringify(metadata),
    new Date().toISOString()
  ).run().catch(() => null);
}

async function reportRow(env, jobId) {
  return first(env.MEMBERS_DB.prepare(`
    SELECT j.id,j.member_id,j.tool,j.status,j.target_hash,j.result_summary,j.result_json,j.completed_at,
           m.email,m.display_name,m.email_verified_at,m.status AS member_status
    FROM osint_tool_jobs j
    JOIN members m ON m.id=j.member_id
    WHERE j.id=? LIMIT 1
  `).bind(jobId));
}

export async function queueVerifiedSelfReport(env, jobId) {
  if (!hasD1(env)) return { queued: false, reason: 'members-db-unavailable' };
  const row = await reportRow(env, jobId);
  if (!row || row.status !== 'completed') return { queued: false, reason: 'report-not-completed' };
  if (row.member_status !== 'active' || !row.email_verified_at || !row.email) {
    return { queued: false, reason: 'verified-active-member-required' };
  }

  const memberHash = await sha256(String(row.email).trim().toLowerCase());
  if (!row.target_hash || row.target_hash !== memberHash) {
    return { queued: false, reason: 'report-is-not-verified-self' };
  }

  const message = buildMessage(row);
  const now = new Date().toISOString();
  const outboxId = `email-report-${row.id}`;
  const idempotencyKey = `verified-self-report:${row.id}:v1`;
  const payload = {
    to: { email: row.email, name: row.display_name || 'Reader' },
    subject: message.subject,
    htmlContent: message.htmlContent,
    textContent: message.textContent
  };

  const result = await env.MEMBERS_DB.prepare(`
    INSERT OR IGNORE INTO email_outbox
      (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at)
    VALUES (?,?,NULL,'verified_self_intelligence_report',?,?,?,'pending',?,?,?)
  `).bind(
    outboxId,
    row.member_id,
    memberHash,
    JSON.stringify(payload),
    idempotencyKey,
    now,
    now,
    now
  ).run();

  const inserted = Number(result?.meta?.changes || 0) > 0;
  if (inserted) {
    await audit(env, row.member_id, 'osint.verified_self_report.queued', row.id, { tool: row.tool, delivery: 'brevo-outbox' });
  }
  return { queued: inserted, alreadyQueued: !inserted, memberId: row.member_id, reportId: row.id, tool: row.tool };
}

export async function queuePendingVerifiedSelfReports(env, { limit = 50 } = {}) {
  if (!hasD1(env)) return { queued: 0, checked: 0, reason: 'members-db-unavailable' };
  const rows = await all(env.MEMBERS_DB.prepare(`
    SELECT j.id
    FROM osint_tool_jobs j
    JOIN members m ON m.id=j.member_id
    WHERE j.status='completed'
      AND m.status='active'
      AND m.email_verified_at IS NOT NULL
    ORDER BY j.completed_at DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(250, Number(limit || 50)))));

  let queued = 0;
  for (const row of rows) {
    const result = await queueVerifiedSelfReport(env, row.id);
    if (result.queued) queued += 1;
  }
  return { queued, checked: rows.length };
}
