#!/usr/bin/env python3
"""Validate the additive Phase 4 email schema entirely in memory.

This script never opens or mutates Cloudflare D1. It creates a minimal compatible
membership schema, applies the migration candidate plus portability correction,
runs lifecycle fixtures, then emits deterministic JSON reports.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "downloads" / "phase4-email-schema-validation"
MIGRATIONS = [
    ROOT / "migrations" / "phase4_email_lifecycle.sql",
    ROOT / "migrations" / "phase4_email_lifecycle_portability.sql",
]
CONTRACT = ROOT / "data" / "phase4-email-schema-contract.json"


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def write_json(name: str, value: object) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / name).write_text(stable_json(value), encoding="utf-8")


def scalar(connection: sqlite3.Connection, sql: str, parameters: tuple = ()):
    row = connection.execute(sql, parameters).fetchone()
    return row[0] if row else None


def seed_existing_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE members (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'member',
          tier TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'pending',
          marketing_status TEXT NOT NULL DEFAULT 'pending',
          source TEXT NOT NULL DEFAULT '',
          email_verified_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT
        );
        CREATE TABLE email_consents (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          consent_type TEXT NOT NULL,
          granted INTEGER NOT NULL,
          wording_version TEXT NOT NULL,
          source_page TEXT NOT NULL,
          granted_at TEXT,
          withdrawn_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        );
        CREATE TABLE magic_links (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          purpose TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        );
        CREATE TABLE member_sessions (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          session_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          revoked_at TEXT,
          FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        );
        CREATE TABLE subscriptions (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          provider TEXT,
          provider_subscription_id TEXT,
          provider_plan_id TEXT,
          tier TEXT,
          status TEXT,
          next_billing_at TEXT,
          current_period_end TEXT,
          cancel_at_period_end INTEGER DEFAULT 0,
          updated_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        );
        CREATE TABLE audit_log (
          id TEXT PRIMARY KEY,
          actor_id TEXT,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        """
    )


def apply_migrations(connection: sqlite3.Connection) -> list[dict]:
    results: list[dict] = []
    for migration in MIGRATIONS:
        sql = migration.read_text(encoding="utf-8")
        connection.executescript(sql)
        results.append(
            {
                "file": str(migration.relative_to(ROOT)).replace("\\", "/"),
                "sha256": hashlib.sha256(sql.encode()).hexdigest(),
                "applied": True,
            }
        )
    return results


def run_fixtures(connection: sqlite3.Connection) -> list[dict]:
    now = "2026-07-13T11:30:00.000Z"
    fixtures: list[dict] = []

    connection.execute(
        "INSERT INTO members (id,email,display_name,role,tier,status,marketing_status,source,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("member-1", "verified@example.com", "Verified", "member", "free", "active", "subscribed", "fixture", now, now, now),
    )
    connection.execute(
        "INSERT INTO email_preferences (member_id,public_daily_brief,public_weekly_digest,release_notices,updated_at,created_at) VALUES (?,?,?,?,?,?)",
        ("member-1", 1, 1, 1, now, now),
    )
    eligible = scalar(connection, "SELECT COUNT(*) FROM email_eligible_members WHERE member_id='member-1'")
    fixtures.append({"name": "verified-subscribed-member-is-eligible", "passed": eligible == 1, "actual": eligible})

    connection.execute(
        "INSERT INTO email_segment_memberships (segment_id,member_id,state,source,eligible_at,activated_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
        ("segment-public-daily", "member-1", "active", "fixture", now, now, now, now),
    )
    candidate = scalar(connection, "SELECT COUNT(*) FROM email_campaign_recipient_candidates WHERE member_id='member-1' AND segment_key='public_daily_brief'")
    fixtures.append({"name": "active-segment-member-is-campaign-candidate", "passed": candidate == 1, "actual": candidate})

    connection.execute(
        "INSERT INTO email_suppressions (id,member_id,recipient_email_hash,scope,reason,source,active,suppressed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        ("suppression-1", "member-1", "hash-member-1", "all_marketing", "unsubscribe", "fixture", 1, now, now),
    )
    suppressed = scalar(connection, "SELECT COUNT(*) FROM email_eligible_members WHERE member_id='member-1'")
    suppressed_candidate = scalar(connection, "SELECT COUNT(*) FROM email_campaign_recipient_candidates WHERE member_id='member-1'")
    fixtures.append({"name": "active-suppression-removes-eligibility", "passed": suppressed == 0 and suppressed_candidate == 0, "actual": {"eligible": suppressed, "candidate": suppressed_candidate}})

    connection.execute(
        "UPDATE email_suppressions SET active=0,cleared_at=?,cleared_by_consent_id=?,updated_at=? WHERE id='suppression-1'",
        (now, "consent-resubscribe-1", now),
    )
    connection.execute(
        "INSERT INTO email_consents (id,member_id,consent_type,granted,wording_version,source_page,granted_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
        ("consent-resubscribe-1", "member-1", "marketing_email", 1, "phase4-fixture", "fixture", now, now),
    )
    reeligible = scalar(connection, "SELECT COUNT(*) FROM email_eligible_members WHERE member_id='member-1'")
    fixtures.append({"name": "explicit-new-consent-can-clear-suppression", "passed": reeligible == 1, "actual": reeligible})

    connection.execute(
        "INSERT INTO email_campaign_content_versions (id,campaign_kind,subject,html_content,text_content,content_hash,evidence_checkpoint_at,fact_speculation_boundary_verified,reviewed_by,reviewed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("content-1", "daily", "Daily Brief", "<p>Evidence-bounded brief</p>", "Evidence-bounded brief", "content-hash-1", now, 1, "fixture-reviewer", now, now),
    )
    connection.execute(
        "INSERT INTO email_campaigns (id,campaign_key,kind,segment_id,content_version_id,status,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
        ("campaign-1", "daily-2026-07-13", "daily", "segment-public-daily", "content-1", "review", now, now),
    )
    connection.execute(
        "INSERT INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("outbox-1", "member-1", "campaign-1", "daily", "hash-member-1", "{}", "campaign-1:member-1", "pending", now, now, now),
    )
    duplicate_outbox_blocked = False
    try:
        connection.execute(
            "INSERT INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            ("outbox-2", "member-1", "campaign-1", "daily", "hash-member-1", "{}", "campaign-1:member-1", "pending", now, now, now),
        )
    except sqlite3.IntegrityError:
        duplicate_outbox_blocked = True
    fixtures.append({"name": "outbox-idempotency-key-blocks-duplicate-send", "passed": duplicate_outbox_blocked})

    connection.execute(
        "INSERT INTO email_deliveries (id,campaign_id,member_id,recipient_email_hash,provider_message_id,status,queued_at,sent_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        ("delivery-1", "campaign-1", "member-1", "hash-member-1", "provider-message-1", "sent", now, now, now),
    )
    connection.execute(
        "INSERT INTO email_events (id,provider,provider_event_id,provider_message_id,campaign_id,member_id,event_type,event_at,payload_hash,payload_json,processed_at,processing_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("event-1", "brevo", "provider-event-1", "provider-message-1", "campaign-1", "member-1", "delivered", now, "payload-hash-1", "{}", now, "processed", now),
    )
    duplicate_event_blocked = False
    try:
        connection.execute(
            "INSERT INTO email_events (id,provider,provider_event_id,event_type,event_at,payload_hash,payload_json,processing_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("event-2", "brevo", "provider-event-1", "delivered", now, "payload-hash-2", "{}", "received", now),
        )
    except sqlite3.IntegrityError:
        duplicate_event_blocked = True
    fixtures.append({"name": "provider-event-idempotency-blocks-duplicate-webhook-event", "passed": duplicate_event_blocked})

    connection.execute(
        "UPDATE email_deliveries SET status='delivered',delivered_at=?,last_event_at=?,updated_at=? WHERE id='delivery-1'",
        (now, now, now),
    )
    metric = connection.execute("SELECT delivery_rows,delivered_or_better FROM email_delivery_metrics WHERE campaign_id='campaign-1'").fetchone()
    fixtures.append({"name": "delivery-metrics-view-aggregates-events", "passed": tuple(metric or ()) == (1, 1), "actual": tuple(metric or ())})

    connection.execute(
        "INSERT INTO email_provider_contacts (member_id,provider,sync_status,local_state_hash,updated_at,created_at) VALUES (?,?,?,?,?,?)",
        ("member-1", "brevo", "pending", "state-hash-1", now, now),
    )
    reconciliation = scalar(connection, "SELECT reconciliation_status FROM email_provider_reconciliation WHERE member_id='member-1'")
    fixtures.append({"name": "provider-reconciliation-identifies-sync-required", "passed": reconciliation == "provider-sync-required", "actual": reconciliation})

    connection.execute(
        "INSERT INTO email_webhook_receipts (id,provider,request_id,signature_valid,payload_hash,event_count,processing_status,received_at) VALUES (?,?,?,?,?,?,?,?)",
        ("receipt-1", "brevo", "request-1", 1, "receipt-hash-1", 1, "processed", now),
    )
    duplicate_receipt_blocked = False
    try:
        connection.execute(
            "INSERT INTO email_webhook_receipts (id,provider,request_id,signature_valid,payload_hash,event_count,processing_status,received_at) VALUES (?,?,?,?,?,?,?,?)",
            ("receipt-2", "brevo", "request-1", 1, "receipt-hash-2", 1, "processed", now),
        )
    except sqlite3.IntegrityError:
        duplicate_receipt_blocked = True
    fixtures.append({"name": "webhook-request-idempotency-blocks-replay", "passed": duplicate_receipt_blocked})

    connection.commit()
    return fixtures


def main() -> int:
    if OUTPUT.exists():
        for child in OUTPUT.iterdir():
            if child.is_file():
                child.unlink()
    OUTPUT.mkdir(parents=True, exist_ok=True)

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.create_function("sha3", 2, lambda value, bits: hashlib.sha256(str(value).encode()).digest())
    seed_existing_schema(connection)
    migration_results = apply_migrations(connection)
    # Apply the additive files a second time to prove idempotent DDL and seed statements.
    apply_migrations(connection)

    schema_objects = [
        dict(row)
        for row in connection.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name LIKE 'email_%' ORDER BY type,name"
        ).fetchall()
    ]
    actual_tables = {row["name"] for row in schema_objects if row["type"] == "table"}
    actual_views = {row["name"] for row in schema_objects if row["type"] == "view"}
    expected_tables = set(contract["tables"])
    expected_views = set(contract["requiredViews"])
    missing_tables = sorted(expected_tables - actual_tables)
    missing_views = sorted(expected_views - actual_views)
    fixtures = run_fixtures(connection)
    failed_fixtures = [fixture for fixture in fixtures if not fixture.get("passed")]
    foreign_key_violations = [tuple(row) for row in connection.execute("PRAGMA foreign_key_check").fetchall()]
    segment_keys = [row[0] for row in connection.execute("SELECT segment_key FROM email_segments ORDER BY segment_key").fetchall()]
    expected_segments = sorted(contract["tables"]["email_segments"]["seedKeys"])

    report = {
        "ok": not missing_tables and not missing_views and not failed_fixtures and not foreign_key_violations and segment_keys == expected_segments,
        "mode": "in-memory-validation-only",
        "version": contract["version"],
        "migrationExecutedAgainstD1": False,
        "workerMutation": False,
        "providerMutation": False,
        "subscriberMutation": False,
        "liveEmailSend": False,
        "campaignScheduling": False,
        "paymentActivation": False,
        "summary": {
            "expectedTables": len(expected_tables),
            "actualTables": len(actual_tables),
            "expectedViews": len(expected_views),
            "actualViews": len(actual_views),
            "indexes": sum(1 for row in schema_objects if row["type"] == "index"),
            "fixtures": len(fixtures),
            "failedFixtures": len(failed_fixtures),
            "foreignKeyViolations": len(foreign_key_violations),
            "seedSegments": len(segment_keys),
        },
        "migrationFiles": migration_results,
        "missingTables": missing_tables,
        "missingViews": missing_views,
        "segmentKeys": segment_keys,
        "fixtures": fixtures,
        "failedFixtures": failed_fixtures,
        "foreignKeyViolations": foreign_key_violations,
        "schemaObjects": schema_objects,
        "boundary": "Validation used an in-memory SQLite database with a minimal existing membership schema. No Cloudflare D1 database, Brevo contact, subscriber, campaign or production Worker was changed.",
    }
    write_json("schema-validation.json", report)
    write_json("fixture-results.json", {"ok": not failed_fixtures, "recordCount": len(fixtures), "records": fixtures})
    write_json("schema-objects.json", {"ok": not missing_tables and not missing_views, "recordCount": len(schema_objects), "records": schema_objects})
    write_json("manifest.json", {
        "ok": report["ok"],
        "mode": report["mode"],
        "version": report["version"],
        "fileHashes": {
            file.name: hashlib.sha256(file.read_bytes()).hexdigest()
            for file in sorted(OUTPUT.iterdir())
            if file.name != "manifest.json"
        },
        "migrationExecutedAgainstD1": False,
        "liveEmailSend": False,
        "providerMutation": False,
        "subscriberMutation": False,
        "paymentActivation": False,
        "boundary": report["boundary"],
    })
    print(
        f"PHASE 4 EMAIL SCHEMA: {len(actual_tables)} tables, {len(actual_views)} views, "
        f"{len(fixtures) - len(failed_fixtures)}/{len(fixtures)} fixtures passed."
    )
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
