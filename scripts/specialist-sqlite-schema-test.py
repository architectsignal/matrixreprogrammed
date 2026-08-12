#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def migration(name: str) -> str:
    return (ROOT / "migrations" / name).read_text(encoding="utf-8")


def expect_integrity_error(fn, message: str) -> None:
    try:
        fn()
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)


db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row
db.execute("PRAGMA foreign_keys = ON")

# Phase 14 expects the shared feature-flag table from earlier Matrix migrations.
db.execute(
    """
    CREATE TABLE ai_feature_flags (
      flag_name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      value_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    )
    """
)

for filename in (
    "phase14_self_financing_growth.sql",
    "phase15_specialist_ai_orchestration.sql",
    "phase16_specialist_execution_specs.sql",
):
    db.executescript(migration(filename))

required_tables = {
    "matrix_learning_ledger",
    "matrix_agent_missions",
    "matrix_agent_runs",
    "matrix_agent_handoffs",
    "matrix_agent_execution_specs",
}
found_tables = {
    row["name"]
    for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
}
assert required_tables <= found_tables, required_tables - found_tables

now = "2026-08-12T00:30:00.000Z"
db.execute(
    """
    INSERT INTO matrix_agent_missions(
      mission_id,specialist,objective,priority,status,execution_mode,owner_approval_required,
      evidence_json,result_json,created_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    """,
    (
        "investigate-1",
        "investigator",
        "Analyse public-record evidence",
        "P1",
        "proposed",
        "plan_or_draft_only",
        1,
        json.dumps({"publication_target_id": "dossier/example"}),
        None,
        now,
        now,
        None,
    ),
)

# Failed is a valid terminal mission state and must match the result endpoint contract.
db.execute("UPDATE matrix_agent_missions SET status='failed' WHERE mission_id='investigate-1'")
db.execute("UPDATE matrix_agent_missions SET status='running' WHERE mission_id='investigate-1'")

metrics = {
    "result_digest": "a" * 64,
    "raw_output_persisted": False,
    "cost_confirmed_zero": True,
    "inference_external_network_used": False,
}
db.execute(
    """
    INSERT INTO matrix_agent_runs(
      run_id,mission_id,specialist,model_id,resource_id,input_evidence_ids_json,
      output_evidence_ids_json,metrics_json,cost_eur,external_consequence,policy_bypass_used,
      started_at,completed_at,status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """,
    (
        "run-1",
        "investigate-1",
        "investigator",
        "matrix-test-14b",
        "owner-local-model",
        json.dumps(["ev-1", "ev-2"]),
        json.dumps(["ev-1", "ev-2"]),
        json.dumps(metrics),
        0,
        0,
        0,
        now,
        now,
        "completed",
    ),
)

lesson = db.execute(
    "SELECT * FROM matrix_learning_ledger WHERE lesson_id='specialist-run:run-1'"
).fetchone()
assert lesson is not None
assert lesson["domain"] == "research"
assert lesson["subject_id"] == "investigate-1"
assert lesson["accepted"] == 0
assert lesson["affects_ranking_only"] == 1
assert lesson["policy_mutation_allowed"] == 0
assert lesson["evidence_threshold_mutation_allowed"] == 0
assert lesson["financial_execution_allowed"] == 0
observation = json.loads(lesson["observation_json"])
outcome = json.loads(lesson["outcome_json"])
assert observation["run_id"] == "run-1"
assert observation["metrics"]["raw_output_persisted"] is False
assert outcome["status"] == "completed"
assert outcome["cost_eur"] == 0
assert outcome["external_consequence"] == 0
assert outcome["policy_bypass_used"] == 0

# Hard database boundaries must reject external consequences and paid execution specs.
expect_integrity_error(
    lambda: db.execute(
        """
        INSERT INTO matrix_agent_runs(
          run_id,mission_id,specialist,input_evidence_ids_json,output_evidence_ids_json,metrics_json,
          cost_eur,external_consequence,policy_bypass_used,started_at,status
        ) VALUES('run-bad','investigate-1','investigator','[]','[]','{}',0,1,0,?,'completed')
        """,
        (now,),
    ),
    "matrix_agent_runs accepted an external consequence",
)

expect_integrity_error(
    lambda: db.execute(
        """
        INSERT INTO matrix_agent_execution_specs(
          spec_id,mission_id,specialist,task_profile,fallback_task_profile,context_policy,
          evidence_reference_ids_json,artifact_reference_ids_json,auditor_clearance_ids_json,
          prompt_tokens_estimate,maximum_output_tokens,prompt_material_in_cloud_payload,
          local_prompt_resolution_required,cost_ceiling_eur,paid_fallback_allowed,
          external_network_inference_allowed,evidence_gate_bypass_allowed,production_deployment_allowed,
          status,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            "paid-spec",
            "investigate-1",
            "investigator",
            "reasoning",
            None,
            "reference_ids_only",
            "[]",
            "[]",
            "[]",
            100,
            100,
            0,
            1,
            1.0,
            0,
            0,
            0,
            0,
            "planned",
            now,
            now,
        ),
    ),
    "matrix_agent_execution_specs accepted a non-zero cost ceiling",
)

print(
    "Specialist SQLite schema tests passed: migrations apply together, run receipts feed the shared learning ledger, "
    "learning starts unaccepted/ranking-only, and external-consequence/paid-execution constraints fail closed."
)
