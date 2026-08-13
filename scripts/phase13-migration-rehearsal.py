from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    "migrations/0001_membership_foundation.sql",
    "migrations/phase5_member_experience.sql",
    "migrations/phase13_member_entitlement_datetime_fix.sql",
    "migrations/phase9_ai_resource_orchestration.sql",
    "migrations/phase10_ai_autonomy.sql",
    "migrations/phase11_local_job_queue.sql",
    "migrations/phase12_opportunity_hunter.sql",
    "migrations/phase13_matrix_synergy.sql",
    "migrations/public_investigation_api.sql",
    "migrations/phase14_living_matrix.sql",
    "migrations/phase15_matrix_value_hunter.sql",
    "migrations/phase16_permissionless_value_harvester.sql",
]
REQUIRED = {
    "matrix_events",
    "matrix_missions",
    "matrix_contributions",
    "matrix_impact_trail",
    "matrix_rewards",
    "matrix_human_actions",
    "matrix_models",
    "matrix_model_benchmarks",
    "matrix_capabilities",
    "matrix_learning_ledger",
    "matrix_living_cycles",
    "matrix_event_dispatches",
    "matrix_living_projections",
    "matrix_page_dependencies",
    "matrix_value_jurisdictions",
    "matrix_value_sources",
    "matrix_value_claimants",
    "matrix_value_destinations",
    "matrix_value_mandates",
    "matrix_value_objectives",
    "matrix_value_opportunities",
    "matrix_value_entitlement_evidence",
    "matrix_value_claim_queue",
    "matrix_value_operations",
    "matrix_value_receipts",
    "matrix_value_audit",
    "matrix_value_improvement_proposals",
    "matrix_value_cycles",
    "matrix_value_learning",
    "matrix_permissionless_protocols",
    "matrix_permissionless_markets",
    "matrix_permissionless_opportunities",
    "matrix_permissionless_simulations",
    "matrix_permissionless_execution_intents",
    "matrix_permissionless_receipts",
    "matrix_permissionless_workers",
    "matrix_permissionless_strategy_statistics",
    "matrix_permissionless_cycles",
}

database = sqlite3.connect(":memory:")
for pass_number in (1, 2):
    for migration in MIGRATIONS:
        database.executescript((ROOT / migration).read_text(encoding="utf-8"))
    database.commit()
    print(f"Completed migration pass {pass_number}")

present = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
missing = REQUIRED - present
if missing:
    raise SystemExit(f"Missing Matrix synergy tables: {sorted(missing)}")

mission_count = database.execute("SELECT COUNT(*) FROM matrix_missions").fetchone()[0]
if mission_count != 3:
    raise SystemExit(f"Expected three idempotent seed missions, found {mission_count}")
capability_count = database.execute("SELECT COUNT(*) FROM matrix_capabilities").fetchone()[0]
if capability_count != 9:
    raise SystemExit(f"Expected nine truthful capability seeds, found {capability_count}")

entitlement_view = database.execute(
    "SELECT sql FROM sqlite_master WHERE type='view' AND name='member_effective_entitlements'"
).fetchone()[0]
if "datetime(g.starts_at)" not in entitlement_view or "datetime(g.expires_at)" not in entitlement_view:
    raise SystemExit("Entitlement view does not normalize ISO-8601 access-grant timestamps")

contribution_schema = database.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='matrix_contributions'"
).fetchone()[0]
human_action_schema = database.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='matrix_human_actions'"
).fetchone()[0]
if "'VERIFIED','SPECULATION','SECURITY_QUARANTINE'" not in contribution_schema:
    raise SystemExit("Matrix contribution evidence classes are not structurally enforced")
if "editorial" in human_action_schema.lower():
    raise SystemExit("Human action queue must not become an editorial fallback")

target = database.execute("SELECT target_net_minor FROM matrix_value_objectives WHERE objective_id='value-milestone-eur-10000'").fetchone()
if not target or target[0] != 1000000:
    raise SystemExit("Value Hunter EUR 10,000 net objective is missing")

private_columns = {
    row[1].lower()
    for table in ("matrix_value_claimants", "matrix_value_destinations", "matrix_value_operations")
    for row in database.execute(f"PRAGMA table_info({table})")
}
if private_columns & {"private_key", "seed_phrase", "mnemonic", "recovery_phrase"}:
    raise SystemExit("Value Hunter schema must not persist signing secrets")

print("Living Matrix, Value Hunter and Permissionless Harvester migrations passed twice with strict value classes, safe intents and nine truthful capability seeds.")
