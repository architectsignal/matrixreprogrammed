PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bespoke_investigation_cases (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  service_key TEXT NOT NULL CHECK (service_key IN ('signal_trace','evidence_brief','deep_dossier','command_investigation')),
  subject_type TEXT NOT NULL,
  subject_label TEXT NOT NULL,
  objective TEXT NOT NULL,
  jurisdiction TEXT,
  deadline_at TEXT,
  lawful_purpose TEXT NOT NULL,
  screening_status TEXT NOT NULL DEFAULT 'pending' CHECK (screening_status IN ('pending','needs_information','approved','declined')),
  status TEXT NOT NULL DEFAULT 'screening_pending' CHECK (status IN (
    'screening_pending','needs_information','approved_for_payment','payment_pending','paid','in_progress','awaiting_client',
    'quality_review','delivered','closed','declined','cancelled','refunded'
  )),
  risk_flags_json TEXT NOT NULL DEFAULT '{}',
  scope_summary TEXT NOT NULL DEFAULT '',
  deliverables_json TEXT NOT NULL DEFAULT '[]',
  quoted_amount_minor INTEGER CHECK (quoted_amount_minor IS NULL OR (quoted_amount_minor >= 5000 AND quoted_amount_minor <= 10000000)),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  approved_by TEXT,
  approved_at TEXT,
  payment_due_at TEXT,
  paid_at TEXT,
  delivery_due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bespoke_cases_member_created
  ON bespoke_investigation_cases(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bespoke_cases_status_created
  ON bespoke_investigation_cases(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_bespoke_cases_screening
  ON bespoke_investigation_cases(screening_status, created_at ASC);

CREATE TABLE IF NOT EXISTS bespoke_investigation_status_history (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT,
  note TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES bespoke_investigation_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bespoke_status_case_created
  ON bespoke_investigation_status_history(case_id, created_at ASC);

CREATE TABLE IF NOT EXISTS bespoke_investigation_payments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paypal' CHECK (provider = 'paypal'),
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_capture_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('CREATED','APPROVED','COMPLETED','VOIDED','REFUNDED','REVERSED','FAILED')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 5000 AND amount_minor <= 10000000),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  captured_at TEXT,
  FOREIGN KEY (case_id) REFERENCES bespoke_investigation_cases(id) ON DELETE RESTRICT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bespoke_payments_case_created
  ON bespoke_investigation_payments(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bespoke_payments_member_created
  ON bespoke_investigation_payments(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bespoke_investigation_deliverables (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence_class TEXT CHECK (evidence_class IS NULL OR evidence_class IN ('FACT','ALLEGATION','INFERENCE','SPECULATION','UNRESOLVED')),
  storage_key TEXT,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','quality_review','released','withdrawn','superseded')),
  released_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES bespoke_investigation_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bespoke_deliverables_case_status
  ON bespoke_investigation_deliverables(case_id, status, created_at ASC);
