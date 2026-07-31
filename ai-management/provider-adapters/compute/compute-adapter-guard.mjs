import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { AdapterError } from '../adapter-contract.mjs';
import { sha256 } from '../../core/jobs.mjs';

const execFileDefault = promisify(execFileCallback);
const SENSITIVE_KEY = /^(?:prompt|prompts|messages?|system|assistant|content|document|documents|private|secret|password|token|api[_-]?key|authorization|cookie|session|email|phone|address|payment|paypal|member|auth)$/i;
const PUBLIC_URL_PROTOCOLS = new Set(['https:']);

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function encodedBytes(value) {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value ?? null)).byteLength;
}

export function assertNoSensitivePayload(value, location = 'payload', depth = 0) {
  if (depth > 12) throw new AdapterError('Remote compute payload is nested too deeply', { code: 'PAYLOAD_DEPTH_EXCEEDED' });
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertNoSensitivePayload(value[index], `${location}[${index}]`, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new AdapterError(`Sensitive or prompt-shaped field is forbidden for remote compute: ${location}.${key}`, {
        code: 'REMOTE_PAYLOAD_FIELD_BLOCKED',
        details: { field: `${location}.${key}` }
      });
    }
    assertNoSensitivePayload(child, `${location}.${key}`, depth + 1);
  }
}

export function assertZeroSpendRemoteResource(resource, now = new Date()) {
  const reasons = [];
  if (!resource?.metadata?.remote_compute) reasons.push('not-remote-compute');
  if (resource?.metadata?.public_workloads_only !== true) reasons.push('public-only-boundary-missing');
  if (resource?.metadata?.prompt_transfer_allowed !== false) reasons.push('prompt-transfer-boundary-missing');
  if (resource?.metadata?.owner_onboarding_completed !== true) reasons.push('owner-onboarding-incomplete');
  if (resource?.metadata?.automation_permission_verified !== true) reasons.push('automation-permission-unverified');
  if (resource?.metadata?.billing_hard_stop_confirmed !== true) reasons.push('billing-hard-stop-unverified');
  if (resource?.billing_enabled !== false) reasons.push('billing-enabled-or-unknown');
  if (resource?.payment_method_present !== false) reasons.push('payment-method-present-or-unknown');
  if (resource?.billing_risk !== 'none') reasons.push('billing-risk-not-zero');
  if (Number(resource?.monetary_cost_per_unit_eur ?? 0) !== 0) reasons.push('non-zero-cost');
  if (resource?.quota_verified !== true) reasons.push('quota-unverified');
  if (!resource?.quota_unlimited) {
    const remaining = Number(resource?.quota_remaining ?? -1);
    const threshold = Number(resource?.hard_stop_threshold || 0);
    if (!Number.isFinite(remaining) || remaining <= threshold) reasons.push('quota-hard-stop-reached');
  }
  for (const [field, value] of [
    ['terms-revalidation', resource?.terms_revalidation_due],
    ['compute-session', resource?.metadata?.expires_at]
  ]) {
    if (value) {
      const time = Date.parse(value);
      if (!Number.isFinite(time) || time <= now.getTime()) reasons.push(`${field}-expired`);
    }
  }
  if (reasons.length) {
    throw new AdapterError('Remote compute resource failed the zero-spend execution boundary', {
      code: 'REMOTE_COMPUTE_RESOURCE_BLOCKED',
      details: { resource_id: resource?.resource_id || null, reasons }
    });
  }
}

export function assertRemoteComputeJob(job, resource, allowedJobTypes = []) {
  if (job?.data_class !== 'public') throw new AdapterError('Remote compute accepts public workloads only', { code: 'DATA_CLASS_BLOCKED' });
  if (!allowedJobTypes.includes(job?.job_type)) {
    throw new AdapterError(`Unsupported remote compute job type: ${job?.job_type || 'missing'}`, {
      code: 'REMOTE_JOB_TYPE_BLOCKED', details: { allowed_job_types: allowedJobTypes }
    });
  }
  if (!isObject(job?.payload)) throw new AdapterError('Remote compute payload must be an object', { code: 'INVALID_REMOTE_PAYLOAD' });
  if (encodedBytes(job.payload) > Math.min(Number(resource?.maximum_payload || 1024 * 1024), 1024 * 1024)) {
    throw new AdapterError('Remote compute payload exceeds the bounded manifest limit', { code: 'REMOTE_PAYLOAD_TOO_LARGE' });
  }
  assertNoSensitivePayload(job.payload);
  assertZeroSpendRemoteResource(resource);
}

export function resolveCredential(resource, environment = process.env, { optional = false } = {}) {
  const reference = String(resource?.credential_reference || '').trim();
  if (!reference) {
    if (optional) return null;
    throw new AdapterError('Remote compute credential binding is missing', { code: 'CREDENTIAL_BINDING_MISSING' });
  }
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(reference)) {
    throw new AdapterError('Remote compute credential binding name is invalid', { code: 'CREDENTIAL_BINDING_INVALID' });
  }
  const value = String(environment?.[reference] || '');
  if (!value) {
    if (optional) return null;
    throw new AdapterError(`Remote compute credential ${reference} is not available`, {
      code: 'CREDENTIAL_BINDING_UNAVAILABLE', details: { credential_reference: reference }
    });
  }
  return value;
}

export function resolveWithinRoot(root, requestedPath, { mustExist = true, directory = null } = {}) {
  const base = path.resolve(String(root || process.cwd()));
  const resolved = path.resolve(base, String(requestedPath || ''));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new AdapterError('Remote compute path escapes the approved workspace', { code: 'WORKSPACE_PATH_BLOCKED' });
  }
  if (mustExist && !fs.existsSync(resolved)) throw new AdapterError('Remote compute workspace does not exist', { code: 'WORKSPACE_MISSING' });
  if (directory === true && mustExist && !fs.statSync(resolved).isDirectory()) throw new AdapterError('Remote compute workspace must be a directory', { code: 'WORKSPACE_NOT_DIRECTORY' });
  if (directory === false && mustExist && !fs.statSync(resolved).isFile()) throw new AdapterError('Remote compute input must be a file', { code: 'WORKSPACE_NOT_FILE' });
  return resolved;
}

export function assertHttpsEndpoint(value, allowedHosts = []) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new AdapterError('Remote compute endpoint is invalid', { code: 'INVALID_COMPUTE_ENDPOINT' }); }
  if (!PUBLIC_URL_PROTOCOLS.has(url.protocol)) throw new AdapterError('Remote compute endpoint must use HTTPS', { code: 'HTTPS_REQUIRED' });
  if (url.username || url.password) throw new AdapterError('Credentials are forbidden in remote compute URLs', { code: 'CREDENTIAL_IN_URL' });
  const host = url.hostname.toLowerCase();
  const allowed = (allowedHosts || []).map(item => String(item).toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(host)) throw new AdapterError('Remote compute endpoint host is not allowlisted', { code: 'HOST_NOT_ALLOWLISTED', details: { host } });
  return url;
}

export async function runCommandBounded(command, args, {
  execFile = execFileDefault,
  cwd,
  env = process.env,
  timeoutMs = 15 * 60 * 1000,
  maximumOutputBytes = 512 * 1024
} = {}) {
  try {
    const result = await execFile(command, args, {
      cwd,
      env,
      timeout: Math.max(1000, Math.min(Number(timeoutMs || 0), 60 * 60 * 1000)),
      maxBuffer: maximumOutputBytes,
      windowsHide: true
    });
    const stdout = String(result?.stdout || '').slice(0, maximumOutputBytes);
    const stderr = String(result?.stderr || '').slice(0, maximumOutputBytes);
    return { stdout, stderr, output_hash: await sha256(`${stdout}\n${stderr}`) };
  } catch (error) {
    const stdout = String(error?.stdout || '').slice(0, maximumOutputBytes);
    const stderr = String(error?.stderr || '').slice(0, maximumOutputBytes);
    const message = String(error?.message || error).slice(0, 1000);
    throw new AdapterError(message, {
      code: error?.killed ? 'REMOTE_COMMAND_TIMEOUT' : 'REMOTE_COMMAND_FAILED',
      retryable: Boolean(error?.killed),
      details: { exit_code: error?.code ?? null, stdout, stderr }
    });
  }
}

export async function readResponseBounded(response, maximumBytes = 2 * 1024 * 1024) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new AdapterError('Remote compute response is too large', { code: 'REMOTE_RESPONSE_TOO_LARGE' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new AdapterError('Remote compute response is too large', { code: 'REMOTE_RESPONSE_TOO_LARGE' });
  const text = new TextDecoder().decode(bytes);
  return { bytes: bytes.byteLength, text, hash: await sha256(text) };
}

export function computeProvenance({ resource, adapterId, adapterVersion, operation, sourceUrls = [], retrievedAt = new Date().toISOString(), contentHash = null }) {
  return {
    source_urls: sourceUrls.filter(Boolean),
    retrieved_at: retrievedAt,
    adapter_id: adapterId,
    adapter_version: adapterVersion,
    resource_id: resource.resource_id,
    provider_name: resource.provider_name,
    operation,
    content_hash: contentHash,
    cost_confirmed_zero: true,
    data_class: 'public'
  };
}

export const computeGuardInternals = { SENSITIVE_KEY, isObject, encodedBytes, execFileDefault };
