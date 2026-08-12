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
if capability_count != 6:
    raise SystemExit(f"Expected six truthful capability seeds, found {capability_count}")

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

print("Phase 13 migration rehearsal passed: 10 tables, two executions, three missions and six truthful capability seeds.")
