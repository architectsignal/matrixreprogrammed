import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function text(value, maximum = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function validHash(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function publicSourceUrl(value) {
  try {
    const url = new URL(text(value, 1500));
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:api.?key|token|secret|credential|password|authorization)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}

export function buildSourceEvents(state = {}) {
  return Object.entries(state || {}).map(([sourceId, source]) => ({ sourceId, source: source || {} }))
    .filter(({ source }) => source.changed === true || !['fetched', 'skipped-optional-missing-env'].includes(String(source.status || '')))
    .slice(0, 100)
    .map(({ sourceId, source }) => {
      const fetched = source.status === 'fetched';
      const sourceUrl = publicSourceUrl(source.finalUrl || source.url);
      const retrievedAt = /^\d{4}-\d{2}-\d{2}T/.test(String(source.checkedAt || '')) ? source.checkedAt : new Date().toISOString();
      return {
        eventType: fetched ? 'source.changed' : 'source.failed',
        auditIdentifier: `investigation-source:${text(sourceId, 100)}:${text(source.bodyHash || source.checkedAt || source.status, 100)}:${text(source.status, 60)}`,
        origin: 'github-investigation-machine',
        source: sourceUrl,
        actor: 'matrix-investigation-bot',
        affectedEntities: [],
        affectedPages: ['investigation-source-ledger.html', 'source-changes.html', 'answer-engine.html'],
        evidence: {
          directlyVerifiable: fetched && validHash(source.bodyHash),
          attributable: Boolean(source.label && sourceUrl),
          authenticated: fetched && /^https:\/\//i.test(sourceUrl),
          sourceKind: 'authoritative',
          sourceUrl,
          retrievedAt,
          contentSha256: validHash(source.bodyHash) ? source.bodyHash : ''
        },
        payload: {
          change_summary: fetched
            ? `${text(source.label || sourceId, 240)} changed at its monitored authoritative source.`
            : `${text(source.label || sourceId, 240)} failed its latest monitored source check.`,
          source_id: text(sourceId, 120),
          label: text(source.label, 240),
          lane: text(source.lane, 120),
          authority: text(source.authority, 120),
          status: text(source.status, 80),
          status_code: Number(source.statusCode || 0) || null,
          body_hash: validHash(source.bodyHash) ? source.bodyHash : null,
          item_count: Number(source.itemCount || 0),
          resource_id: text(source.resourceId, 180) || null,
          cost_confirmed_zero: source.costConfirmedZero === true,
          error: source.error ? 'source-check-failed' : null
        }
      };
    });
}

async function readJson(response) {
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { raw: text(body, 300) }; }
  if (!response.ok) throw new Error(`${response.status} ${parsed.error || parsed.message || parsed.raw || 'request failed'}`);
  return parsed;
}

const CANONICAL_WORKER_HOST = 'matrixreprogrammed.njmgroupfrance.workers.dev';

function normalizedBase(value) {
  try {
    const url = new URL(text(value, 1000));
    if (url.protocol !== 'https:') return '';
    url.username = '';
    url.password = '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function canonicalFallbackBase(value) {
  const base = normalizedBase(value);
  if (!base) return '';
  return new URL(base).hostname.toLowerCase() === CANONICAL_WORKER_HOST ? base : '';
}

async function knownCloudflareChallenge(response) {
  if (!response || response.status !== 403) return false;
  if (String(response.headers?.get?.('cf-mitigated') || '').toLowerCase() === 'challenge') return true;
  let body = '';
  try { body = await response.clone().text(); } catch { return false; }
  return /<title>\s*just a moment(?:\.\.\.)?\s*<\/title>/i.test(body) && /cloudflare/i.test(body);
}

async function fetchWithChallengeFallback({ base, fallbackBase, route, options, fetchImpl, transportFallbacks }) {
  let response = await fetchImpl(`${base}${route}`, options);
  if (fallbackBase && fallbackBase !== base && await knownCloudflareChallenge(response)) {
    transportFallbacks.push({
      route,
      status: response.status,
      from: base,
      to: fallbackBase,
      reason: 'known-cloudflare-challenge'
    });
    response = await fetchImpl(`${fallbackBase}${route}`, options);
  }
  return response;
}

export async function publishInvestigationMatrixEvents({ state, siteUrl, fallbackSiteUrl, token, fetchImpl = fetch } = {}) {
  const base = text(siteUrl || 'https://matrixreprogrammed.com', 1000).replace(/\/+$/, '');
  const fallbackBase = canonicalFallbackBase(fallbackSiteUrl);
  const secret = text(token, 1000);
  if (!secret) return { ok: false, skipped: true, reason: 'admin-token-unavailable' };
  const transportFallbacks = [];
  const request = (route, options) => fetchWithChallengeFallback({ base, fallbackBase, route, options, fetchImpl, transportFallbacks });
  const availability = await request('/api/matrix/evolution', { headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
  if (availability.status === 404) return { ok: false, skipped: true, reason: 'living-matrix-not-deployed', transportFallbacks };
  await readJson(availability);
  const events = buildSourceEvents(state);
  const outcomes = [];
  for (const event of events) {
    const response = await request('/api/matrix/admin/events', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-admin-token': secret },
      body: JSON.stringify(event)
    });
    const result = await readJson(response);
    outcomes.push({ audit_identifier: event.auditIdentifier, event_id: result.eventId, created: result.created === true });
  }
  const cycle = await readJson(await request('/api/matrix/admin/living-cycle', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-admin-token': secret },
    body: '{}'
  }));
  return { ok: true, skipped: false, candidates: events.length, created: outcomes.filter(item => item.created).length, reused: outcomes.filter(item => !item.created).length, outcomes, cycle_id: cycle.report?.cycle_id || null, transportFallbacks };
}

async function main() {
  const statePath = path.resolve(process.cwd(), process.env.MATRIX_SOURCE_STATE_PATH || 'data/investigation-source-state.json');
  if (!fs.existsSync(statePath)) throw new Error(`Investigation source state is unavailable: ${statePath}`);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const result = await publishInvestigationMatrixEvents({
    state,
    siteUrl: process.env.SITE_URL || 'https://matrixreprogrammed.com',
    fallbackSiteUrl: process.env.SITE_FALLBACK_URL || '',
    token: process.env.AI_MANAGEMENT_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(`Living Matrix source-event publication failed: ${text(error?.message || error, 1000)}`);
    process.exitCode = 1;
  });
}
