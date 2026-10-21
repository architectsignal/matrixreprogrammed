'use strict';

const fs = require('node:fs');
const path = require('node:path');

class RateLimitStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('RateLimitStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.save({ version: 1, events: [] });
  }

  load() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed.events)) throw new Error('Rate-limit store must contain an events array');
    return parsed;
  }

  save(store) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }

  consume(source, at = new Date()) {
    if (!source || typeof source.id !== 'string') throw new TypeError('rate limit requires a source');
    if (!Number.isInteger(source.rateLimitPerHour) || source.rateLimitPerHour < 1) {
      throw new Error(`Invalid rate limit for source: ${source.id}`);
    }
    const timestamp = at instanceof Date ? at : new Date(at);
    if (!Number.isFinite(timestamp.getTime())) throw new TypeError('rate-limit timestamp is invalid');

    const cutoff = timestamp.getTime() - 60 * 60 * 1000;
    const store = this.load();
    const retained = store.events.filter((event) => {
      const eventTime = new Date(event.at).getTime();
      return Number.isFinite(eventTime) && eventTime > cutoff;
    });
    const sourceEvents = retained.filter((event) => event.sourceId === source.id);
    if (sourceEvents.length >= source.rateLimitPerHour) {
      throw new Error(`Rate limit reached for source: ${source.id}`);
    }
    retained.push({ sourceId: source.id, at: timestamp.toISOString() });
    this.save({ version: 1, events: retained });
    return {
      sourceId: source.id,
      used: sourceEvents.length + 1,
      limit: source.rateLimitPerHour,
      remaining: source.rateLimitPerHour - sourceEvents.length - 1,
    };
  }
}

module.exports = { RateLimitStore };
