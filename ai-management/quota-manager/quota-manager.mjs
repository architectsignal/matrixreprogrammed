function reservationId() {
  return `quota-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export class QuotaUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'QuotaUnavailableError';
    this.code = 'ZERO_COST_QUOTA_UNAVAILABLE';
    this.details = details;
  }
}

export class InMemoryQuotaManager {
  constructor() {
    this.states = new Map();
    this.reservations = new Map();
  }

  state(resource) {
    if (!this.states.has(resource.resource_id)) {
      this.states.set(resource.resource_id, {
        remaining: resource.quota_unlimited ? null : Number(resource.quota_remaining || 0),
        reserved: Number(resource.quota_reserved || 0),
        hardStop: Number(resource.hard_stop_threshold || 0),
        unlimited: Boolean(resource.quota_unlimited)
      });
    }
    return this.states.get(resource.resource_id);
  }

  async reserve(resource, job, amount = 1) {
    const units = Math.max(0.000001, Number(amount || 1));
    const state = this.state(resource);
    const before = state.remaining;
    if (!state.unlimited && state.remaining - state.reserved - state.hardStop < units) {
      throw new QuotaUnavailableError('The verified free quota safety margin would be crossed', {
        resource_id: resource.resource_id,
        remaining: state.remaining,
        reserved: state.reserved,
        hard_stop_threshold: state.hardStop,
        requested: units
      });
    }
    state.reserved += units;
    const reservation = {
      reservation_id: reservationId(),
      resource_id: resource.resource_id,
      job_id: job.job_id,
      amount: units,
      quota_before: before,
      status: 'reserved',
      created_at: new Date().toISOString()
    };
    this.reservations.set(reservation.reservation_id, reservation);
    return { ...reservation };
  }

  async commit(reservation) {
    const stored = this.reservations.get(reservation.reservation_id);
    if (!stored || stored.status !== 'reserved') return stored ? { ...stored } : null;
    const state = this.states.get(stored.resource_id);
    state.reserved = Math.max(0, state.reserved - stored.amount);
    if (!state.unlimited) state.remaining = Math.max(0, state.remaining - stored.amount);
    stored.status = 'committed';
    stored.quota_after = state.remaining;
    stored.updated_at = new Date().toISOString();
    return { ...stored };
  }

  async release(reservation) {
    const stored = this.reservations.get(reservation.reservation_id);
    if (!stored || stored.status !== 'reserved') return stored ? { ...stored } : null;
    const state = this.states.get(stored.resource_id);
    state.reserved = Math.max(0, state.reserved - stored.amount);
    stored.status = 'released';
    stored.quota_after = state.remaining;
    stored.updated_at = new Date().toISOString();
    return { ...stored };
  }
}

export class D1QuotaManager {
  constructor(database) {
    if (!database?.prepare) throw new TypeError('A D1 database binding is required');
    this.database = database;
  }

  async reserve(resource, job, amount = 1) {
    const units = Math.max(0.000001, Number(amount || 1));
    const before = resource.quota_remaining;
    if (!resource.quota_unlimited) {
      const update = await this.database.prepare(`UPDATE ai_resources
        SET quota_reserved=quota_reserved+?, updated_at=?
        WHERE resource_id=? AND quota_verified=1 AND billing_enabled=0 AND payment_method_present=0
          AND quota_remaining-quota_reserved-hard_stop_threshold>=?`)
        .bind(units, new Date().toISOString(), resource.resource_id, units).run();
      if (Number(update?.meta?.changes || 0) !== 1) {
        throw new QuotaUnavailableError('D1 did not confirm an atomic free-quota reservation', { resource_id: resource.resource_id });
      }
    }
    const reservation = {
      reservation_id: reservationId(), resource_id: resource.resource_id, job_id: job.job_id,
      amount: units, quota_before: before, status: 'reserved', created_at: new Date().toISOString()
    };
    await this.database.prepare(`INSERT INTO ai_quota_reservations
      (reservation_id,resource_id,job_id,amount,status,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
      reservation.reservation_id, resource.resource_id, job.job_id, units, 'reserved',
      new Date(Date.now() + 300000).toISOString(), reservation.created_at, reservation.created_at
    ).run();
    return reservation;
  }

  async commit(reservation) {
    const at = new Date().toISOString();
    await this.database.prepare(`UPDATE ai_resources SET
      quota_reserved=MAX(0,quota_reserved-?),
      quota_remaining=CASE WHEN quota_unlimited=1 THEN quota_remaining ELSE MAX(0,quota_remaining-?) END,
      updated_at=? WHERE resource_id=?`).bind(reservation.amount, reservation.amount, at, reservation.resource_id).run();
    await this.database.prepare(`UPDATE ai_quota_reservations SET status='committed',updated_at=?
      WHERE reservation_id=? AND status='reserved'`).bind(at, reservation.reservation_id).run();
    const row = await this.database.prepare('SELECT quota_remaining FROM ai_resources WHERE resource_id=?').bind(reservation.resource_id).first();
    return { ...reservation, status: 'committed', quota_after: row?.quota_remaining ?? null, updated_at: at };
  }

  async release(reservation) {
    const at = new Date().toISOString();
    await this.database.prepare('UPDATE ai_resources SET quota_reserved=MAX(0,quota_reserved-?),updated_at=? WHERE resource_id=?')
      .bind(reservation.amount, at, reservation.resource_id).run();
    await this.database.prepare(`UPDATE ai_quota_reservations SET status='released',updated_at=?
      WHERE reservation_id=? AND status='reserved'`).bind(at, reservation.reservation_id).run();
    return { ...reservation, status: 'released', updated_at: at };
  }
}
