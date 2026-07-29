'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

const MIN_REMAINING_SECONDS = 30;

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock must produce a valid date');
  return date;
}

function normaliseReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('completedReviews must be an object');
  const result = {};
  for (const field of ['requestWindowReview', 'freshHashReview', 'externalBackupReview', 'restoreRehearsalReview', 'productionOwnerReview']) {
    if (typeof value[field] !== 'boolean') throw new TypeError(`completedReviews.${field} must be boolean`);
    result[field] = value[field];
  }
  return result;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSafeRelativePath(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  const candidate = value.trim();
  if (path.isAbsolute(candidate) || candidate.includes('\\') || candidate.includes('%')
    || /^[a-z][a-z0-9+.-]*:/i.test(candidate) || candidate.startsWith('//')) {
    throw new Error(`${field} must be a safe relative path`);
  }
  const segments = candidate.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error(`${field} contains a hidden or unsafe segment`);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(candidate)) throw new Error(`${field} contains unsupported characters`);
  return candidate;
}

function lstatIfPresent(filePath) {
  try { return fs.lstatSync(filePath); }
  catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertNoSymlinkComponents(root, resolved, field) {
  const relative = path.relative(root, resolved);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    const stat = lstatIfPresent(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`${field} contains a symlink component`);
  }
}

function resolveExternalBackupRoot(repositoryRoot, backupRoot) {
  if (typeof backupRoot !== 'string' || !backupRoot.trim()) throw new TypeError('backupRoot is required for approval');
  const repository = path.resolve(repositoryRoot);
  const root = path.resolve(backupRoot);
  if (isInside(repository, root)) throw new Error('backupRoot must be outside the repository');
  const stat = lstatIfPresent(root);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error('backupRoot must be an existing non-symlink directory');
  return root;
}

function resolveBackupArtifact(backupRoot, relativePath) {
  const safePath = assertSafeRelativePath(relativePath, 'backupArtifactPath');
  const resolved = path.resolve(backupRoot, safePath);
  if (!isInside(backupRoot, resolved)) throw new Error('backupArtifactPath escapes backupRoot');
  assertNoSymlinkComponents(backupRoot, resolved, 'backupArtifactPath');
  const stat = lstatIfPresent(resolved);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error(`Backup artifact is not a regular file: ${safePath}`);
  return { safePath, resolved, stat };
}

function resolveRehearsalRoot(repositoryRoot, restoreRehearsalRoot) {
  if (typeof restoreRehearsalRoot !== 'string' || !restoreRehearsalRoot.trim()) {
    throw new TypeError('restoreRehearsalRoot is required for approval');
  }
  const repository = path.resolve(repositoryRoot);
  const allowedRoot = path.join(repository, '.autonomous-machine', 'restore-rehearsals');
  const resolved = path.resolve(restoreRehearsalRoot);
  if (!isInside(allowedRoot, resolved)) {
    throw new Error('restoreRehearsalRoot must remain inside .autonomous-machine/restore-rehearsals');
  }
  fs.mkdirSync(resolved, { recursive: true });
  assertNoSymlinkComponents(repository, resolved, 'restoreRehearsalRoot');
  return resolved;
}

function verifyExternalBackups(repositoryRoot, backupRoot, backupEntries, freshCandidates) {
  const resolvedRoot = resolveExternalBackupRoot(repositoryRoot, backupRoot);
  if (!Array.isArray(backupEntries) || backupEntries.length !== freshCandidates.length) {
    throw new Error('Approval requires exactly one backup entry per unique candidate');
  }
  const supplied = new Map();
  backupEntries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError(`backupEntries[${index}] must be an object`);
    if (typeof entry.proposedRepositoryPath !== 'string' || !entry.proposedRepositoryPath) {
      throw new TypeError(`backupEntries[${index}] requires proposedRepositoryPath`);
    }
    if (supplied.has(entry.proposedRepositoryPath)) throw new Error(`Duplicate backup entry for ${entry.proposedRepositoryPath}`);
    supplied.set(entry.proposedRepositoryPath, entry);
  });

  const verified = freshCandidates.map((candidate) => {
    const suppliedEntry = supplied.get(candidate.proposedRepositoryPath);
    if (!suppliedEntry) throw new Error(`Missing backup entry for ${candidate.proposedRepositoryPath}`);
    const artifact = resolveBackupArtifact(resolvedRoot, suppliedEntry.backupArtifactPath);
    const backupSha256 = hashFile(artifact.resolved);
    if (backupSha256 !== candidate.currentSha256 || artifact.stat.size !== candidate.currentBytes) {
      throw new Error(`Backup artifact does not match current candidate: ${candidate.proposedRepositoryPath}`);
    }
    return {
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      backupArtifactPath: artifact.safePath,
      backupSha256,
      backupBytes: artifact.stat.size,
      sourceSha256: candidate.currentSha256,
      sourceBytes: candidate.currentBytes,
      verified: true,
      readOnlyVerification: true,
      resolvedBackupPath: artifact.resolved,
    };
  }).sort((left, right) => left.proposedRepositoryPath.localeCompare(right.proposedRepositoryPath));

  if (supplied.size !== verified.length) throw new Error('Backup manifest contains unknown candidate paths');
  return { root: resolvedRoot, entries: verified };
}

function runDisposableRestoreRehearsal(repositoryRoot, restoreRehearsalRoot, verifiedBackups) {
  const root = resolveRehearsalRoot(repositoryRoot, restoreRehearsalRoot);
  const workspace = fs.mkdtempSync(path.join(root, 'phase111-'));
  const entries = [];
  let cleanedUp = false;
  try {
    verifiedBackups.forEach((backup, index) => {
      const restoredPath = path.join(workspace, `${String(index + 1).padStart(3, '0')}.restore`);
      fs.copyFileSync(backup.resolvedBackupPath, restoredPath);
      const restoredSha256 = hashFile(restoredPath);
      const restoredBytes = fs.statSync(restoredPath).size;
      if (restoredSha256 !== backup.sourceSha256 || restoredBytes !== backup.sourceBytes) {
        throw new Error(`Disposable restore rehearsal failed for ${backup.proposedRepositoryPath}`);
      }
      entries.push({
        proposedRepositoryPath: backup.proposedRepositoryPath,
        restoredSha256,
        restoredBytes,
        expectedSha256: backup.sourceSha256,
        verified: true,
      });
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    cleanedUp = !fs.existsSync(workspace);
  }
  if (!cleanedUp) throw new Error('Disposable restore rehearsal workspace could not be removed');
  return {
    required: true,
    mode: 'disposable_restore_rehearsal',
    rootLabel: 'gitignored_runtime_restore_rehearsal',
    filesRestored: entries.length,
    disposableRuntimeWrites: entries.length,
    cleanedUp,
    manifestHash: sha256(stableStringify(entries)),
    allVerified: entries.every((entry) => entry.verified),
    entries,
  };
}

function emptyFreshRecheck() {
  return { required: false, verifiedAt: null, snapshotHash: null, allMatchRequest: false, candidates: [] };
}

function emptyBackupVerification() {
  return { required: false, rootLabel: null, rootOutsideRepository: false, manifestHash: null, allVerified: false, entries: [] };
}

function emptyRestoreRehearsal() {
  return {
    required: false,
    mode: null,
    rootLabel: null,
    filesRestored: 0,
    disposableRuntimeWrites: 0,
    cleanedUp: true,
    manifestHash: null,
    allVerified: false,
    entries: [],
  };
}

module.exports = {
  MIN_REMAINING_SECONDS,
  assertText,
  asDate,
  normaliseReviews,
  assertSafeRelativePath,
  resolveExternalBackupRoot,
  resolveRehearsalRoot,
  verifyExternalBackups,
  runDisposableRestoreRehearsal,
  emptyFreshRecheck,
  emptyBackupVerification,
  emptyRestoreRehearsal,
};
