import { ApprovedPublicSourceHttpAdapter } from '../datasets/approved-public-source-http.mjs';
import { AdapterError } from '../adapter-contract.mjs';

function assertAutonomousOpportunityResource(resource = {}) {
  const failures = [];
  if (!resource.resource_id) failures.push('resource-id-missing');
  if (resource.billing_enabled !== false) failures.push('billing-not-disabled');
  if (resource.payment_method_present !== false) failures.push('payment-method-present-or-unknown');
  if (resource.billing_risk !== 'none') failures.push('billing-risk-not-none');
  if (Number(resource.monetary_cost_per_unit_eur) !== 0) failures.push('non-zero-cost');
  if (resource.quota_verified !== true) failures.push('quota-not-verified');
  if (resource.approved_for_automation !== true) failures.push('automation-not-approved');
  if (resource.authentication_type !== 'none') failures.push('authentication-required');
  if (resource.credential_reference) failures.push('credential-reference-present');
  if (!Array.isArray(resource.approved_data_classes) || !resource.approved_data_classes.includes('public')) failures.push('public-data-not-approved');
  if (!Array.isArray(resource.prohibited_data_classes) || !['internal', 'confidential', 'restricted'].every(value => resource.prohibited_data_classes.includes(value))) failures.push('non-public-data-not-prohibited');
  if (!Array.isArray(resource.allowed_hosts) || resource.allowed_hosts.length !== 1) failures.push('single-allowed-host-required');
  if (resource.enabled !== true) failures.push('resource-not-enabled');
  if (resource.implementation_status !== 'production') failures.push('adapter-not-production-ready');
  if (failures.length) {
    throw new AdapterError('Autonomously discovered resource failed zero-cost admission', {
      code: 'OPPORTUNITY_RESOURCE_NOT_ADMISSIBLE',
      details: { failures }
    });
  }
}

export class ZeroCostOfficialHttpAdapter extends ApprovedPublicSourceHttpAdapter {
  constructor(options = {}) {
    super({ ...options, userAgent: options.userAgent || 'MatrixReprogrammedOpportunityBroker/1.0' });
    this.adapter_id = 'zero-cost-official-http';
    this.adapter_version = '1.0.0';
  }

  async execute(job, resource) {
    assertAutonomousOpportunityResource(resource);
    if (job?.job_type !== 'public-data.fetch') {
      throw new AdapterError('Opportunity adapter only supports public-data.fetch', { code: 'JOB_TYPE_BLOCKED' });
    }
    if (job?.data_class !== 'public') {
      throw new AdapterError('Opportunity adapter only accepts public data', { code: 'DATA_CLASS_BLOCKED' });
    }
    const result = await super.execute(job, resource);
    return {
      ...result,
      cost: { currency: 'EUR', amount: 0, billing_possible: false },
      policy: {
        zero_spend_verified: true,
        credentials_used: false,
        payment_method_present: false,
        data_class: 'public',
        allowed_hosts: [...resource.allowed_hosts]
      }
    };
  }
}

export const zeroCostOpportunityAdapterInternals = { assertAutonomousOpportunityResource };
