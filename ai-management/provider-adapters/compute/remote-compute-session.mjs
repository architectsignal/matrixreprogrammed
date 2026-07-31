import { AdapterError } from '../adapter-contract.mjs';
import { collectPublicInputUrls } from './compute-adapter-guard.mjs';
import { KaggleKernelCliAdapter } from './kaggle-kernel-cli.mjs';
import { HuggingFaceGradioZeroGpuAdapter } from './huggingface-gradio-zerogpu.mjs';
import { OwnerHttpComputeAdapter } from './owner-http-compute.mjs';

function providerId(resource = {}) {
  return String(resource.metadata?.provider_id || resource.resource_id || '')
    .replace(/^remote-compute-/, '')
    .toLowerCase();
}

export function adapterKeyForResource(resource = {}) {
  const explicit = String(resource.metadata?.execution_adapter || '').trim();
  if (explicit) return explicit;
  const id = providerId(resource);
  if (id.includes('kaggle')) return 'kaggle-kernel-cli';
  if (id.includes('hugging-face') || id.includes('huggingface') || id.includes('zerogpu')) return 'huggingface-gradio-zerogpu';
  if (id.startsWith('owner-') || id.includes('donated') || id.includes('community')) return 'owner-http-compute';
  return '';
}

function assertRemoteProvenance(result, adapter, job) {
  const provenance = result?.provenance;
  if (!result || result.ok === false || !provenance || !Array.isArray(provenance.source_urls) || !provenance.source_urls.length || !provenance.retrieved_at || !provenance.content_hash) {
    throw new AdapterError('Remote compute adapter returned incomplete provenance', {
      code: 'REMOTE_COMPUTE_PROVENANCE_MISSING',
      details: { adapter_id: adapter?.adapter_id || null }
    });
  }
  if (provenance.cost_confirmed_zero !== true || provenance.data_class !== 'public') {
    throw new AdapterError('Remote compute adapter failed the returned zero-spend or public-data proof', {
      code: 'REMOTE_COMPUTE_RESULT_BOUNDARY_FAILED',
      details: { adapter_id: adapter?.adapter_id || null }
    });
  }
  const returnedSources = new Set(provenance.source_urls.map(value => {
    try { return new URL(value).toString(); } catch { return ''; }
  }).filter(Boolean));
  const missingSources = collectPublicInputUrls(job?.payload || {}).filter(value => !returnedSources.has(value));
  if (missingSources.length) {
    throw new AdapterError('Remote compute result provenance does not cover every public input', {
      code: 'REMOTE_COMPUTE_INPUT_PROVENANCE_MISSING',
      details: { adapter_id: adapter?.adapter_id || null, missing_source_urls: missingSources }
    });
  }
}

export class RemoteComputeSessionAdapter {
  constructor(options = {}) {
    const adapters = options.adapters || [
      new KaggleKernelCliAdapter(options.kaggle || options),
      new HuggingFaceGradioZeroGpuAdapter(options.huggingFace || options),
      new OwnerHttpComputeAdapter(options.ownerHttp || options)
    ];
    this.adapters = new Map(adapters.map(adapter => [adapter.adapter_id, adapter]));
    this.adapter_id = 'remote-compute-session';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource, context = {}) {
    const key = adapterKeyForResource(resource);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new AdapterError('No approved execution adapter exists for this remote compute provider', {
        code: 'REMOTE_COMPUTE_PROVIDER_ADAPTER_MISSING',
        details: { provider_id: providerId(resource), requested_adapter: key || null }
      });
    }
    const result = await adapter.execute(job, resource, context);
    assertRemoteProvenance(result, adapter, job);
    return {
      ...result,
      output: {
        ...result.output,
        session_adapter: this.adapter_id,
        execution_adapter: adapter.adapter_id
      }
    };
  }
}

export function createComputeAdapters(options = {}) {
  const kaggle = new KaggleKernelCliAdapter(options.kaggle || options);
  const huggingFace = new HuggingFaceGradioZeroGpuAdapter(options.huggingFace || options);
  const ownerHttp = new OwnerHttpComputeAdapter(options.ownerHttp || options);
  const session = new RemoteComputeSessionAdapter({ adapters: [kaggle, huggingFace, ownerHttp] });
  return [session, kaggle, huggingFace, ownerHttp];
}

export const remoteSessionInternals = { providerId, assertRemoteProvenance };
