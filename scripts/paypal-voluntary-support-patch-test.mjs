import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchScript = path.join(root, 'scripts', 'patch-paypal-voluntary-support.js');
const canonicalWorker = await fs.readFile(path.join(root, 'src', 'worker-paypal-subscriptions.js'), 'utf8');
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-paypal-support-patch-'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runPatch() {
  const result = spawnSync(process.execPath, [patchScript], { cwd: temporaryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

try {
  await fs.mkdir(path.join(temporaryRoot, 'src'), { recursive: true });
  const expandedWorker = canonicalWorker.replace('parsed>5000)', `parsed>${'5'.padEnd(75, '0')})`);
  assert.notEqual(expandedWorker, canonicalWorker, 'Test fixture did not expand the voluntary support cap');
  const workerPath = path.join(temporaryRoot, 'src', 'worker-paypal-subscriptions.js');
  await fs.writeFile(workerPath, expandedWorker);

  runPatch();
  const repaired = await fs.readFile(workerPath, 'utf8');
  assert.match(repaired, /parsed>5000\)return null;return parsed\.toFixed\(2\)\}/);
  assert.doesNotMatch(repaired, /parsed>\d{5,}\)return null/);
  assert.match(repaired, /maxAmount:'5000\.00'/);
  assert.match(repaired, /paypal_payment_records \([^)]*\bpayment_type\b[^)]*\benvironment\b[^)]*\bstatus\b[^)]*\bgross_amount\b/);

  const firstHash = sha256(repaired);
  runPatch();
  const secondHash = sha256(await fs.readFile(workerPath));
  assert.equal(secondHash, firstHash, 'Repeated patch execution changed the canonical Worker');
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log('PayPal voluntary support patch test passed: canonical EUR 5,000 cap, expanded-cap repair, receipt fields and byte-idempotence.');
