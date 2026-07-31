import fs from 'node:fs';
import path from 'node:path';
import { AdapterError } from '../adapter-contract.mjs';
import {
  assertRemoteComputeJob,
  collectPublicInputUrls,
  computeProvenance,
  resolveCredential,
  resolveWithinRoot,
  runCommandBounded
} from './compute-adapter-guard.mjs';

const JOB_TYPES = [
  'remote-compute.submit',
  'remote-compute.status',
  'remote-compute.collect',
  'remote-compute.reserve',
  'remote-compute.release'
];
const KERNEL_REF = /^[a-z0-9][a-z0-9_-]{1,63}\/[a-z0-9][a-z0-9_-]{1,79}$/i;
const FILE_PATTERN = /^[a-zA-Z0-9_.*+?^$()[\]{}|\\/-]{1,200}$/;

function requestedOperation(job) {
  if (job.job_type === 'remote-compute.reserve') return String(job.payload.operation || 'submit');
  if (job.job_type === 'remote-compute.release') return String(job.payload.operation || 'collect');
  return job.job_type.replace('remote-compute.', '');
}

function kernelReference(payload, metadata = {}) {
  const reference = String(payload.kernel_ref || metadata.id || '').trim();
  if (!KERNEL_REF.test(reference)) throw new AdapterError('Kaggle kernel reference must be owner/kernel-slug', { code: 'KAGGLE_KERNEL_REF_INVALID' });
  return reference;
}

function readKernelMetadata(workspace) {
  const file = path.join(workspace, 'kernel-metadata.json');
  if (!fs.existsSync(file)) throw new AdapterError('Kaggle workspace is missing kernel-metadata.json', { code: 'KAGGLE_METADATA_MISSING' });
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new AdapterError('Kaggle kernel metadata is invalid JSON', { code: 'KAGGLE_METADATA_INVALID' }); }
  if (!metadata || typeof metadata !== 'object') throw new AdapterError('Kaggle kernel metadata must be an object', { code: 'KAGGLE_METADATA_INVALID' });
  const sourceFiles = fs.readdirSync(workspace).filter(name => /\.(?:py|ipynb|Rmd)$/i.test(name));
  if (!sourceFiles.length) throw new AdapterError('Kaggle workspace contains no runnable source file', { code: 'KAGGLE_SOURCE_MISSING' });
  return metadata;
}

export class KaggleKernelCliAdapter {
  constructor({
    execFile,
    environment = process.env,
    workspaceRoot = path.join(process.cwd(), 'ai-management', 'remote-jobs', 'kaggle'),
    outputRoot = path.join(process.cwd(), 'downloads', 'remote-compute', 'kaggle'),
    command = 'kaggle',
    clock = () => new Date()
  } = {}) {
    this.execFile = execFile;
    this.environment = environment;
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.outputRoot = path.resolve(outputRoot);
    this.command = command;
    this.clock = clock;
    this.adapter_id = 'kaggle-kernel-cli';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    assertRemoteComputeJob(job, resource, JOB_TYPES);
    const token = resolveCredential(resource, this.environment);
    const operation = requestedOperation(job);
    const environment = { ...this.environment, KAGGLE_API_TOKEN: token, PYTHONUTF8: '1' };
    const timeoutMs = Math.max(30_000, Math.min(Number(job.requirements?.maximum_latency_ms || 15 * 60 * 1000), 60 * 60 * 1000));
    let commandResult;
    let reference;
    let outputDirectory = null;

    if (operation === 'submit') {
      const workspace = resolveWithinRoot(this.workspaceRoot, job.payload.workspace_path, { directory: true });
      const metadata = readKernelMetadata(workspace);
      reference = kernelReference(job.payload, metadata);
      if (metadata.id && metadata.id !== reference) throw new AdapterError('Requested Kaggle kernel does not match kernel-metadata.json', { code: 'KAGGLE_KERNEL_REF_MISMATCH' });
      if (metadata.is_private === true) throw new AdapterError('Remote compute workspaces must remain public-data only; private Kaggle kernels are not accepted by this adapter', { code: 'KAGGLE_PRIVATE_KERNEL_BLOCKED' });
      const accelerator = String(job.payload.accelerator || resource.metadata?.accelerator_id || 'NvidiaTeslaP100');
      if (!/^[A-Za-z0-9_-]{2,80}$/.test(accelerator)) throw new AdapterError('Kaggle accelerator identifier is invalid', { code: 'KAGGLE_ACCELERATOR_INVALID' });
      const runTimeout = Math.max(60, Math.min(Number(job.payload.run_timeout_seconds || 3600), 12 * 60 * 60));
      commandResult = await runCommandBounded(this.command, [
        'kernels', 'push', '-p', workspace,
        '--accelerator', accelerator,
        '--timeout', String(runTimeout)
      ], { execFile: this.execFile, cwd: workspace, env: environment, timeoutMs });
    } else if (operation === 'status') {
      reference = kernelReference(job.payload);
      commandResult = await runCommandBounded(this.command, ['kernels', 'status', reference], {
        execFile: this.execFile, env: environment, timeoutMs: Math.min(timeoutMs, 120_000)
      });
    } else if (operation === 'collect') {
      reference = kernelReference(job.payload);
      const requested = job.payload.output_path || reference.replace('/', '-');
      outputDirectory = resolveWithinRoot(this.outputRoot, requested, { mustExist: false });
      fs.mkdirSync(outputDirectory, { recursive: true });
      const args = ['kernels', 'output', reference, '-p', outputDirectory, '-o', '-q'];
      if (job.payload.file_pattern) {
        const pattern = String(job.payload.file_pattern);
        if (!FILE_PATTERN.test(pattern)) throw new AdapterError('Kaggle output file pattern is invalid', { code: 'KAGGLE_FILE_PATTERN_INVALID' });
        args.push('--file-pattern', pattern);
      }
      commandResult = await runCommandBounded(this.command, args, {
        execFile: this.execFile, cwd: outputDirectory, env: environment, timeoutMs
      });
    } else {
      throw new AdapterError(`Unsupported Kaggle operation: ${operation}`, { code: 'KAGGLE_OPERATION_BLOCKED' });
    }

    const retrievedAt = this.clock().toISOString();
    const sourceUrl = `https://www.kaggle.com/code/${reference}`;
    return {
      ok: true,
      output: {
        provider: 'kaggle',
        operation,
        kernel_ref: reference,
        source_url: sourceUrl,
        output_directory: outputDirectory,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        command_output_hash: commandResult.output_hash,
        cost_confirmed_zero: true
      },
      provenance: computeProvenance({
        resource,
        adapterId: this.adapter_id,
        adapterVersion: this.adapter_version,
        operation,
        sourceUrls: [sourceUrl, resource.official_documentation_url, ...collectPublicInputUrls(job.payload)],
        retrievedAt,
        contentHash: commandResult.output_hash
      })
    };
  }
}

export const kaggleAdapterInternals = { JOB_TYPES, KERNEL_REF, FILE_PATTERN, requestedOperation, kernelReference, readKernelMetadata };
