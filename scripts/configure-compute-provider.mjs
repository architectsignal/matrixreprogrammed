import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'ai-management', 'config', 'compute-providers.json');
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith('--') ? next : true;
}

function required(name) {
  const value = flag(name);
  if (!value || value === true) throw new Error(`--${name} is required`);
  return String(value);
}

function confirmed(name) {
  return flag(name, false) === true;
}

function https(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${name} must not contain credentials`);
  return url.toString().replace(/\/$/, '');
}

function credentialReference(value) {
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(value)) throw new Error('Credential reference must be an uppercase environment variable name');
  if (/SECRET_VALUE|ACTUAL_TOKEN|PASSWORD_VALUE/i.test(value)) throw new Error('Store only the credential binding name, never the credential value');
  return value;
}

function readRegistry() {
  const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!Array.isArray(payload.providers)) throw new Error('Compute provider registry is invalid');
  return payload;
}

function confirmationBoundary() {
  const requiredFlags = [
    'confirm-zero-spend',
    'confirm-automation',
    'confirm-no-payment-method',
    'confirm-hard-stop',
    'confirm-public-only'
  ];
  const missing = requiredFlags.filter(name => !confirmed(name));
  if (missing.length) throw new Error(`Missing explicit confirmations: ${missing.map(name => `--${name}`).join(', ')}`);
}

function adapterMetadata(adapter, providerId) {
  if (adapter === 'kaggle-kernel-cli') {
    return {
      execution_adapter: adapter,
      execution_transport: 'local_cli',
      supported_job_types: ['remote-compute.submit', 'remote-compute.status', 'remote-compute.collect'],
      allowed_task_types: ['public-site-analysis', 'public-site-asset-audit', 'public-site-structure-audit'],
      workspace_path: required('workspace-path'),
      kernel_ref: required('kernel-ref'),
      accelerator_id: flag('accelerator', 'NvidiaTeslaP100')
    };
  }
  if (adapter === 'huggingface-gradio-zerogpu') {
    const endpoint = https(required('endpoint-url'), 'endpoint-url');
    if (!new URL(endpoint).hostname.endsWith('.hf.space')) throw new Error('Hugging Face ZeroGPU endpoint must use an approved .hf.space host');
    const apiName = required('api-name');
    if (!/^\/[a-zA-Z0-9_.-]{1,120}$/.test(apiName)) throw new Error('api-name must look like /predict');
    return {
      execution_adapter: adapter,
      execution_transport: 'https_api',
      supported_job_types: ['remote-compute.execute'],
      allowed_task_types: String(flag('allowed-task-types', 'public-site-analysis')).split(',').map(value => value.trim()).filter(Boolean),
      endpoint_url: endpoint,
      default_api_name: apiName,
      allowed_api_names: [apiName]
    };
  }
  if (adapter === 'owner-http-compute') {
    return {
      execution_adapter: adapter,
      execution_transport: 'https_api',
      supported_job_types: ['remote-compute.execute', 'remote-compute.status', 'remote-compute.cancel'],
      allowed_task_types: String(flag('allowed-task-types', 'public-site-analysis,public-site-asset-audit,public-site-structure-audit')).split(',').map(value => value.trim()).filter(Boolean),
      endpoint_url: https(required('endpoint-url'), 'endpoint-url'),
      routes: {
        execute: flag('execute-route', '/jobs'),
        status: flag('status-route', '/status'),
        cancel: flag('cancel-route', '/cancel')
      },
      maximum_runtime_seconds: Math.max(60, Math.min(Number(flag('maximum-runtime-seconds', 900)), 3600)),
      provider_id: providerId
    };
  }
  throw new Error('Unsupported adapter. Use kaggle-kernel-cli, huggingface-gradio-zerogpu, or owner-http-compute');
}

confirmationBoundary();
const providerId = required('provider');
const adapter = required('adapter');
if (providerId === 'google-colab-free') throw new Error('Google Colab free tier cannot be onboarded for unattended automation');
if (providerId === 'lightning-ai-free-credits') throw new Error('Lightning AI remains blocked until paid-credit spillover can be structurally prevented');
const registry = readRegistry();
const provider = registry.providers.find(item => item.provider_id === providerId);
if (!provider) throw new Error(`Provider not found: ${providerId}`);
const metadata = adapterMetadata(adapter, providerId);
const endpointUrl = metadata.endpoint_url || https(flag('endpoint-url', provider.endpoint_url || provider.official_documentation_url), 'endpoint-url');
const now = new Date();
const revalidateDays = Math.max(1, Math.min(Number(flag('revalidate-days', 7)), 30));
const quota = Number(flag('free-quota', provider.free_quota_amount));
if (!Number.isFinite(quota) || quota <= 0) throw new Error('A positive --free-quota is required');
const quotaUnit = String(flag('free-quota-unit', provider.free_quota_unit || '')).trim();
if (!quotaUnit) throw new Error('--free-quota-unit is required');

Object.assign(provider, {
  access_method: 'automatic_api',
  endpoint_url: endpointUrl,
  owner_onboarding_completed: true,
  automation_permission_verified: true,
  billing_hard_stop_confirmed: true,
  payment_method_present: false,
  zero_spend_verified: true,
  quota_verified: true,
  free_quota_amount: quota,
  free_quota_unit: quotaUnit,
  credential_reference: credentialReference(required('credential-reference')),
  terms_last_verified: now.toISOString(),
  quota_last_verified: now.toISOString(),
  terms_revalidation_due: new Date(now.getTime() + revalidateDays * 86400000).toISOString(),
  metadata: { ...(provider.metadata || {}), ...metadata, provider_id: providerId }
});

registry.updated_at = now.toISOString();
registry.policy = 'Provider entries are verified execution configurations. No secret values are stored. Automatic routing still requires live Scout approval, zero-spend proof, quota margin, current terms, endpoint health and public-data-only adapter checks.';
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  provider_id: providerId,
  adapter,
  endpoint_url: provider.endpoint_url,
  credential_reference: provider.credential_reference,
  owner_onboarding_completed: true,
  zero_spend_verified: true,
  quota_verified: true,
  billing_hard_stop_confirmed: true,
  payment_method_present: false,
  terms_revalidation_due: provider.terms_revalidation_due,
  secret_value_stored: false,
  next: 'Run node scripts/run-autonomous-ai-manager.mjs once. Compute Scout must still approve the provider before any remote job can run.'
}, null, 2));
