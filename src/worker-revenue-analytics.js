const EVENT_ROUTES = new Set(['/track-event', '/.netlify/functions/track-event']);
const STORED_EVENTS = new Set([
  'revenue_offer_view',
  'revenue_offer_click',
  'revenue_offer_cycle',
  'revenue_signal_dismiss',
  'revenue_explicit_signal',
  'amazon_click',
  'black_file_click',
  'email_submit',
  'signal_path_click'
]);

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Content-Type-Options': 'nosniff',
  'X-Matrix-Origin': 'cloudflare-worker-revenue-analytics'
};

let schemaReady;

function clean(value, max = 80) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function noContent(extra = {}) {
  return new Response(null, { status: 204, headers: { ...responseHeaders, ...extra } });
}

async function ensureSchema(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  if (!schemaReady) {
    schemaReady = env.MEMBERS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS revenue_signal_daily (
        day TEXT NOT NULL,
        event_name TEXT NOT NULL,
        offer_id TEXT NOT NULL DEFAULT '',
        offer_lane TEXT NOT NULL DEFAULT '',
        variant TEXT NOT NULL DEFAULT '',
        top_lane TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        event_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (day, event_name, offer_id, offer_lane, variant, top_lane, source)
      )
    `).run().then(() => true).catch((error) => {
      schemaReady = undefined;
      console.log('MR_REVENUE_ANALYTICS_SCHEMA_ERROR', clean(error?.message || error, 240));
      return false;
    });
  }
  return schemaReady;
}

async function recordAggregate(env, payload) {
  if (!(await ensureSchema(env))) return false;
  const now = new Date();
  const record = {
    day: dayKey(now),
    eventName: clean(payload.name, 80),
    offerId: clean(payload.offer_id, 80),
    offerLane: clean(payload.offer_lane || payload.lane, 40),
    variant: clean(payload.variant, 20),
    topLane: clean(payload.top_lane, 40),
    source: clean(payload.source, 80),
    updatedAt: now.toISOString()
  };

  await env.MEMBERS_DB.prepare(`
    INSERT INTO revenue_signal_daily (
      day, event_name, offer_id, offer_lane, variant, top_lane, source, event_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(day, event_name, offer_id, offer_lane, variant, top_lane, source)
    DO UPDATE SET event_count = event_count + 1, updated_at = excluded.updated_at
  `).bind(
    record.day,
    record.eventName,
    record.offerId,
    record.offerLane,
    record.variant,
    record.topLane,
    record.source,
    record.updatedAt
  ).run();

  return true;
}

export function isRevenueAnalyticsRoute(path) {
  return EVENT_ROUTES.has(String(path || ''));
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return noContent();
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 16384) {
      return new Response(JSON.stringify({ ok: false, error: 'Payload too large' }), {
        status: 413,
        headers: { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const eventName = clean(payload?.name, 80);
    if (!STORED_EVENTS.has(eventName)) return noContent({ 'X-Matrix-Analytics': 'ignored' });

    const task = recordAggregate(env, payload).catch((error) => {
      console.log('MR_REVENUE_ANALYTICS_WRITE_ERROR', clean(error?.message || error, 240));
      return false;
    });

    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;

    return noContent({ 'X-Matrix-Analytics': 'accepted' });
  }
};
