const reportOrigin = 'matrix-verified-member-report-delivery';

const toolLabels = {
  holehe: 'Email Account Signals',
  spiderfoot: 'Passive Digital Footprint',
  h8mail: 'Breach Exposure Review'
};

const priorityMeaning = {
  informational: 'Context was returned, but no urgent defensive signal was identified.',
  low: 'No strong positive signal was returned. This does not prove the address is absent from every service or dataset.',
  medium: 'One or more findings should be verified soon. This is a review priority, not proof of compromise or wrongdoing.',
  moderate: 'One or more findings should be verified soon. This is a review priority, not proof of compromise or wrongdoing.',
  high: 'Sensitive exposure or several important signals were reported. Take the defensive actions promptly and verify the sources.',
  critical: 'A serious defensive indicator was reported. Act promptly from a clean device and verify the underlying source.'
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

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringList(value, limit = 20) {
  return array(value)
    .map(item => clean(typeof item === 'string' ? item : item?.name || item?.title || item?.label || '', 180))
    .filter(Boolean)
    .slice(0, limit);
}

function titleCase(value) {
  return clean(value, 160).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function reportSections(tool, result = {}) {
  const risk = object(result.riskAssessment);
  const ai = object(result.ai_summary);
  const level = clean(risk.level || risk.risk || ai.risk || 'informational', 40).toLowerCase();
  const actions = stringList(result.recommendedActions || risk.actions, 12);

  if (tool === 'holehe') {
    const accounts = array(result.accounts).map(record => clean(record?.module?.name_formatted || record?.module?.domain || record?.module?.name || '', 180)).filter(Boolean);
    const possible = accounts.length ? accounts : stringList(result.possibleAccounts || result.registrationSignals, 25);
    const checked = Number(result.servicesChecked || result.counts?.checked || 0);
    const inconclusive = array(result.validator?.inconclusive).length || array(result.inconclusiveServices || result.unavailableOrRateLimited).length;
    return {
      level,
      priorityMeaning: priorityMeaning[level] || priorityMeaning.informational,
      bottomLine: possible.length
        ? `${possible.length} possible account registration signal${possible.length === 1 ? '' : 's'} should be verified first: ${possible.slice(0, 5).join(', ')}${possible.length > 5 ? ' and others' : ''}.`
        : 'No positive account registration signal was returned by this run. A quiet result does not prove that no accounts exist.',
      calculation: `The review priority is based on positive registration signals and the runner assessment. It is not a breach probability. ${checked || 'The configured'} services were attempted and ${inconclusive} were inconclusive.`,
      keyFindings: possible,
      sources: [],
      actions,
      boundary: 'Registration responses do not prove identity, ownership, present use, compromise, intent or wrongdoing.'
    };
  }

  if (tool === 'h8mail') {
    const indicators = object(result.exposureIndicators || result.exposureCategories);
    const categories = Object.entries(indicators)
      .filter(([, count]) => count === true || Number(count) > 0)
      .map(([name, count]) => typeof count === 'boolean' ? titleCase(name) : `${titleCase(name)}: ${Number(count)}`)
      .slice(0, 30);
    const breachRows = array(result?.data_breaches?.results);
    const sources = [
      ...breachRows.map(row => clean(row?.source?.name || row?.name || '', 180)),
      ...stringList(result.breachOrDatasetNames, 25)
    ].filter(Boolean).slice(0, 30);
    const stealer = object(result.stealer_logs);
    return {
      level,
      priorityMeaning: priorityMeaning[level] || priorityMeaning.informational,
      bottomLine: stealer.present
        ? `The configured source reported ${Number(stealer.count || 0)} infostealer-related indicator${Number(stealer.count || 0) === 1 ? '' : 's'}. Change important credentials from a clean device and review active sessions.`
        : categories.length
          ? `${categories.length} sensitive-data categor${categories.length === 1 ? 'y was' : 'ies were'} reported. Underlying secret values were withheld.`
          : 'No sensitive exposure category was returned by the configured sources.',
      calculation: 'The review priority reflects sensitive categories, source references and infostealer indicators. It is not proof of current compromise, misuse or wrongdoing.',
      keyFindings: categories,
      sources,
      actions,
      boundary: 'A dataset reference does not prove current compromise, who used the data, or that the address owner created the associated account.'
    };
  }

  const counts = object(result.eventCounts);
  const findings = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1])).map(([name, count]) => `${titleCase(name)}: ${Number(count)}`).slice(0, 30);
  const domains = stringList(result.publicDomainsObserved, 25);
  return {
    level,
    priorityMeaning: priorityMeaning[level] || priorityMeaning.informational,
    bottomLine: domains.length
      ? `The passive scan observed public associations involving ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? ' and other domains' : ''}. Verify the source and context before using the finding.`
      : 'No public domain association was returned in the sanitised result. A quiet scan does not prove that no footprint exists.',
    calculation: 'The review priority reflects the volume and sensitivity of sanitised passive events. It is not a probability of identity, ownership, guilt or control.',
    keyFindings: findings,
    sources: domains,
    actions,
    boundary: 'A passive public association does not prove ownership, control, current use, intent or wrongdoing.'
  };
}

function htmlList(items, emptyMessage) {
  if (!items.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function textList(title, items, emptyMessage) {
  return `${title}\n${items.length ? items.map(item => `- ${item}`).join('\n') : `- ${emptyMessage}`}`;
}

function buildMessage(row) {
  const result = parseJson(row.result_json, {});
  const sections = reportSections(row.tool, result);
  const toolLabel = toolLabels[row.tool] || clean(row.tool || 'Intelligence Report', 80);
  const subject = `Matrix Reprogrammed report — ${toolLabel}`;
  const secureUrl = 'https://matrixreprogrammed.com/research-tools.html';

  const htmlContent = `<!doctype html><html><body style="background:#050505;color:#f3e6bd;font-family:Arial,sans-serif;padding:28px"><div style="max-width:720px;margin:auto;border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b9aa82">Verified-self decision brief</div><h1 style="color:#d8b56a">${escapeHtml(toolLabel)}</h1><p>Hello ${escapeHtml(row.display_name || 'Reader')},</p><p>Your report completed and the searched mailbox matched your verified Matrix Reprogrammed account.</p><div style="padding:16px;border-left:4px solid #d8b56a;background:#171208;border-radius:10px"><h2 style="margin-top:0">Bottom line</h2><p>${escapeHtml(sections.bottomLine)}</p></div><h2>Review priority: ${escapeHtml(titleCase(sections.level))}</h2><p>${escapeHtml(sections.priorityMeaning)}</p><p><strong>How this was assessed:</strong> ${escapeHtml(sections.calculation)}</p><h2>Key findings</h2>${htmlList(sections.keyFindings, 'No positive key finding was returned.')}<h2>Sources or public associations</h2>${htmlList(sections.sources, 'No named source or public association was returned.')}<h2>Useful next actions</h2>${htmlList(sections.actions, 'Open the secure report and verify any important signal directly with the relevant provider or public source.')}<p style="font-size:13px;color:#b9aa82"><strong>What this does not prove:</strong> ${escapeHtml(sections.boundary)}</p><p style="margin-top:28px"><a href="${secureUrl}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">Open the full secure report</a></p><p style="font-size:12px;color:#8f8467">Report ID: ${escapeHtml(row.id)} · Delivery: ${escapeHtml(reportOrigin)}</p></div></body></html>`;

  const textContent = [
    toolLabel,
    '',
    `Hello ${row.display_name || 'Reader'},`,
    '',
    'Your report completed and the searched mailbox matched your verified Matrix Reprogrammed account.',
    '',
    'BOTTOM LINE',
    sections.bottomLine,
    '',
    `REVIEW PRIORITY: ${titleCase(sections.level)}`,
    sections.priorityMeaning,
    `How this was assessed: ${sections.calculation}`,
    '',
    textList('KEY FINDINGS', sections.keyFindings, 'No positive key finding was returned.'),
    '',
    textList('SOURCES OR PUBLIC ASSOCIATIONS', sections.sources, 'No named source or public association was returned.'),
    '',
    textList('USEFUL NEXT ACTIONS', sections.actions, 'Open the secure report and verify any important signal directly.'),
    '',
    `WHAT THIS DOES NOT PROVE: ${sections.boundary}`,
    '',
    `Open the full secure report: ${secureUrl}`,
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
           m.email,m.display_name,m.email_verified_at,m.status AS member_status,
           COALESCE(e.effective_tier,'registered') AS effective_tier,COALESCE(e.is_admin,0) AS is_admin
    FROM osint_tool_jobs j
    JOIN members m ON m.id=j.member_id
    LEFT JOIN member_effective_entitlements e ON e.member_id=j.member_id
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
  const tierRank = { registered: 1, supporter_3: 2, intelligence_6: 3, research_pro_9: 4 };
  const requiredTier = ['spiderfoot', 'h8mail'].includes(row.tool) ? 'intelligence_6' : 'registered';
  if (!Number(row.is_admin || 0) && Number(tierRank[row.effective_tier] || 0) < Number(tierRank[requiredTier] || 99)) {
    return { queued: false, reason: 'current-membership-tier-required', requiredTier, currentTier: row.effective_tier || 'registered' };
  }

  const memberHash = await sha256(String(row.email).trim().toLowerCase());
  if (!row.target_hash || row.target_hash !== memberHash) {
    return { queued: false, reason: 'report-is-not-verified-self' };
  }

  const message = buildMessage(row);
  const now = new Date().toISOString();
  const outboxId = `email-report-${row.id}`;
  const idempotencyKey = `verified-self-report:${row.id}:v2`;
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
    await audit(env, row.member_id, 'osint.verified_self_report.queued', row.id, { tool: row.tool, delivery: 'brevo-outbox', format: 'decision-brief-v2' });
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
