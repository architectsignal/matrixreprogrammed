import { MATRIX_EVENT_TYPES, safeJson } from './matrix-synergy-core.js';

function clean(value, maximum = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function emitMatrixSystemEvent(env, input = {}) {
  const eventType = clean(input.eventType, 100);
  const auditIdentifier = clean(input.auditIdentifier, 180);
  if (!env?.MEMBERS_DB?.prepare || !MATRIX_EVENT_TYPES.includes(eventType) || !auditIdentifier) return { emitted: false, reason: 'invalid-or-unavailable' };
  const timestamp = clean(input.timestamp || new Date().toISOString(), 50);
  const eventId = `system-event-${(await sha256(auditIdentifier)).slice(0, 32)}`;
  try {
    const result = await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO matrix_events(
      event_id,event_type,timestamp,origin,source,evidence_class,actor,affected_entities_json,affected_pages_json,
      confidence,review_state,audit_identifier,propagation_json,payload_json,created_at
    ) VALUES(?,?,?,?,?,'VERIFIED',?,?,?,100,'automatically-verified',?,?,?,?)`).bind(
      eventId,
      eventType,
      timestamp,
      clean(input.origin || 'matrix-system', 120),
      clean(input.source, 1500) || null,
      clean(input.actor || 'matrix-automation', 180),
      safeJson(input.affectedEntities || []),
      safeJson(input.affectedPages || []),
      auditIdentifier,
      safeJson([{ target: 'machine_readable_outputs', action: 'refresh-from-event' }]),
      safeJson(input.payload || {}),
      timestamp
    ).run();
    return { emitted: Number(result?.meta?.changes || 0) > 0, event_id: eventId };
  } catch (error) {
    return { emitted: false, reason: clean(error?.message || error, 300) };
  }
}
