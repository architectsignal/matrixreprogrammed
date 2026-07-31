import { AdapterError } from '../adapter-contract.mjs';
import { ApprovedPublicSourceHttpAdapter } from '../datasets/approved-public-source-http.mjs';

function fail(message, code) {
  throw new AdapterError(message, { code });
}

export function assertZeroSpendOpportunityResource(resource = {}) {
  if (resource.billing_enabled !== false) fail('Billing must be disabled', 'BILLING_ENABLED');
  if (Number(resource.monetary_cost_per_unit_eur || 0) !== 0) fail('Resource cost must be exactly EUR 0', 'NON_ZERO_COST');
  if (resource.payment_method_present !== false) fail('Payment methods are forbidden', 'PAYMENT_METHOD_PRESENT');
  if (resource.billing_risk !== 'none') fail('Billing risk must be none', 'BILLING_RISK');
  if (resource.authentication_type !== 'none' || resource.credential_reference) fail('Credentials are forbidden', 'CREDENTIAL_REQUIRED');
  if (resource.quota_verified !== true || Number(resource.free_quota_amount || 0) <= 0) fail('A positive verified free quota is required', 'QUOTA_UNVERIFIED');
  if (resource.approved_for_automation !== true) fail('Automation approval is required', 'AUTOMATION_NOT_APPROVED');
  if (!Array.isArray(resource.approved_data_classes) || !resource.approved_data_classes.includes('public')) fail('Public data approval is required', 'PUBLIC_DATA_NOT_APPROVED');
  for (const restricted of ['internal', 'confidential', 'restricted']) {
    if (!Array.isArray(resource.prohibited_data_classes) || !resource.prohibited_data_classes.includes(restricted)) fail(`Data class ${restricted} must be prohibited`, 'PRIVATE_DATA_BOUNDARY_MISSING');
  }
  if (!Array.isArray(resource.supported_job_types) || !resource.supported_job_types.includes('public-data.fetch')) fail('Only public-data.fetch resources are supported', 'JOB_TYPE_NOT_APPROVED');
  if (!Array.isArray(resource.allowed_hosts) || resource.allowed_hosts.length !== 1) fail('Exactly one official host must be allowlisted', 'HOST_ALLOWLIST_INVALID');
  if (resource.implementation_status !== 'production') fail('Adapter must be production-ready', 'ADAPTER_NOT_READY');
  if (resource.enabled !== true) fail('Resource must be explicitly enabled', 'RESOURCE_DISABLED');
  return true;
}

export class ZeroSpendOpportunityHttpAdapter {
  constructor(options = {}) {
    this.delegate = new ApprovedPublicSourceHttpAdapter(options);
    this.adapter_id = 'zero-spend-opportunity-public-http';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    if (job?.job_type !== 'public-data.fetch') fail('Only public-data.fetch jobs are allowed', 'JOB_TYPE_BLOCKED');
    if (job?.data_class !== 'public') fail('Only public data may be sent externally', 'DATA_CLASS_BLOCKED');
    assertZeroSpendOpportunityResource(resource);
    const result = await this.delegate.execute(job, resource);
    return {
      ...result,
      cost_confirmed_zero: true,
      monetary_cost_eur: 0,
      provenance: {
        ...result.provenance,
        adapter_id: this.adapter_id,
        adapter_version: this.adapter_version
      }
    };
  }
}
