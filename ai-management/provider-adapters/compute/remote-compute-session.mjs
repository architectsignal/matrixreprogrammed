import { AdapterError } from '../adapter-contract.mjs';
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

export const remoteSessionInternals = { providerId };
