PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matrix_public_source_adapters (
  adapter_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  official_api_url TEXT NOT NULL,
  official_documentation_url TEXT NOT NULL,
  authentication_required INTEGER NOT NULL DEFAULT 0 CHECK (authentication_required=0),
  monetary_cost_eur REAL NOT NULL DEFAULT 0 CHECK (monetary_cost_eur=0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  maximum_results INTEGER NOT NULL CHECK (maximum_results BETWEEN 1 AND 5),
  evidence_boundary TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matrix_public_source_retrievals (
  retrieval_id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  search_purpose TEXT NOT NULL CHECK (search_purpose IN ('supporting','qualifying')),
  endpoint TEXT,
  query_sha256 TEXT NOT NULL CHECK (length(query_sha256)=64),
  response_sha256 TEXT CHECK (response_sha256 IS NULL OR length(response_sha256)=64),
  status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','EMPTY','FAILED')),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count BETWEEN 0 AND 12),
  response_bytes INTEGER NOT NULL DEFAULT 0 CHECK (response_bytes BETWEEN 0 AND 2000000),
  cost_confirmed_zero INTEGER NOT NULL DEFAULT 1 CHECK (cost_confirmed_zero=1),
  failure TEXT,
  retrieved_at TEXT NOT NULL,
  FOREIGN KEY(investigation_id) REFERENCES matrix_public_investigations(investigation_id) ON DELETE CASCADE,
  FOREIGN KEY(adapter_id) REFERENCES matrix_public_source_adapters(adapter_id),
  UNIQUE(investigation_id,adapter_id,search_purpose)
);

CREATE TABLE IF NOT EXISTS matrix_public_investigation_proofs (
  investigation_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  entities_json TEXT NOT NULL,
  relationships_json TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  qualifying_evidence_search_json TEXT NOT NULL,
  alternative_explanations_json TEXT NOT NULL,
  auditor_json TEXT NOT NULL,
  monitoring_hook_json TEXT NOT NULL,
  fresh_source_count INTEGER NOT NULL DEFAULT 0 CHECK (fresh_source_count >= 0),
  independent_publisher_count INTEGER NOT NULL DEFAULT 0 CHECK (independent_publisher_count >= 0),
  auditor_passed INTEGER NOT NULL DEFAULT 0 CHECK (auditor_passed IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(investigation_id) REFERENCES matrix_public_investigations(investigation_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO matrix_public_source_adapters(adapter_id,provider,official_api_url,official_documentation_url,authentication_required,monetary_cost_eur,enabled,maximum_results,evidence_boundary,updated_at) VALUES
  ('govuk-search-public-v1','GOV.UK','https://www.gov.uk/api/search.json','https://content-api.publishing.service.gov.uk/',0,0,1,4,'Official publication metadata does not by itself prove implementation, effectiveness, motive or causation.',CURRENT_TIMESTAMP),
  ('federal-register-public-v1','U.S. Federal Register','https://www.federalregister.gov/api/v1/documents.json','https://www.federalregister.gov/developers/documentation/api/v1',0,0,1,4,'FederalRegister.gov is an informational rendition; legal research must be checked against the linked official edition.',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ai_feature_flags(flag_name,enabled,value_json,reason,updated_by,updated_at) VALUES
  ('MATRIX_PUBLIC_INVESTIGATION_FRESH_SOURCES_ENABLED',1,'{"official_only":true,"maximum_adapters":4,"maximum_results_per_adapter":5,"maximum_response_bytes":2000000,"zero_cost":true}','Allow bounded read-only retrieval from registered official public-record APIs during Ask Matrix investigations.','migration',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_system_components(component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at) VALUES
  ('fresh-public-investigation','OfficialFreshSourceDirector','ai-management/public-investigation/official-fresh-source-director.mjs','WORKING_NOT_LIVE',1,0.75,'["govuk-public-api","federal-register-public-api","matrix-public-investigation"]','["official-fresh-source-director-test","fresh-public-investigation-worker-integration-test","phase21-migration-rehearsal"]','A production fresh-source investigation receipt and auditor pass are required.',NULL,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO matrix_capability_graph(capability_id,purpose,status,quality,throughput,dependencies_json,models_json,tools_json,resources_json,tests_json,last_success,last_failure,known_limitations_json,human_dependencies_json,upgrade_candidates_json,replacement_candidates_json,capability_expansion_grants_authority,updated_at) VALUES
  ('fresh-public-investigation','Retrieve and audit current official public-record evidence for a new question.','WORKING_NOT_LIVE',75,1,'["matrix-public-investigation"]','[]','["official-fresh-source-director"]','["govuk-public-api","federal-register-public-api"]','["official-fresh-source-director-test","fresh-public-investigation-worker-integration-test"]',NULL,NULL,'["two initial public-source jurisdictions","metadata is not full-document adjudication"]','[]','["additional official API adapters"]','[]',0,CURRENT_TIMESTAMP);
