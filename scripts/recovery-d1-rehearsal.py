#!/usr/bin/env python3
"""Rehearse Matrix Reprogrammed D1 migrations and entitlement behaviour locally.

This uses Python's SQLite engine only. It does not contact Cloudflare, Brevo or
PayPal, does not use secrets and does not deploy anything.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "downloads" / "recovery-d1-rehearsal.json"
MIGRATIONS = [
    "migrations/0001_membership_foundation.sql",
    "migrations/0004_forum_persistence.sql",
    "migrations/phase5_member_experience.sql",
    "migrations/phase6_paypal_subscriptions.sql",
    "migrations/phase6_paypal_failure_counter_fix.sql",
    "migrations/phase6_paypal_entitlement_state_guard.sql",
]

checks: dict[str, bool] = {}
failures: list[str] = []


def need(condition: bool, message: str, key: str | None = None) -> None:
    if key:
        checks[key] = bool(condition)
    if not condition:
        failures.append(message)


def apply_file(db: sqlite3.Connection, relative: str) -> None:
    path = ROOT / relative
    if not path.exists():
        raise FileNotFoundError(relative)
    db.executescript(path.read_text(encoding="utf-8"))


def apply_email_schema(db: sqlite3.Connection) -> int:
    source = (ROOT / "src/worker-email-lifecycle.js").read_text(encoding="utf-8")
    statements: list[str] = []
    for match in re.finditer(r"`([^`]+)`", source, re.DOTALL):
        sql = match.group(1).strip()
        if "${" in sql:
            continue
        if sql.startswith("CREATE TABLE IF NOT EXISTS email_") or sql.startswith(
            "CREATE INDEX IF NOT EXISTS idx_email_"
        ):
            statements.append(sql)
    for statement in statements:
        db.execute(statement)
    return len(statements)


def ensure_forum_member_accountability(db: sqlite3.Connection) -> None:
    columns = {row[1] for row in db.execute("PRAGMA table_info(forum_posts)")}
    if "member_id" not in columns:
        db.execute("ALTER TABLE forum_posts ADD COLUMN member_id TEXT NOT NULL DEFAULT ''")
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_forum_posts_member_created "
        "ON forum_posts(member_id, created_at DESC)"
    )


def apply_schema(db: sqlite3.Connection) -> int:
    for migration in MIGRATIONS:
        apply_file(db, migration)
    ensure_forum_member_accountability(db)
    email_statements = apply_email_schema(db)
    db.commit()
    return email_statements


def scalar(db: sqlite3.Connection, sql: str, parameters: tuple = ()):
    row = db.execute(sql, parameters).fetchone()
    return row[0] if row else None


def entitlement(db: sqlite3.Connection, member_id: str) -> tuple[str, int]:
    row = db.execute(
        "SELECT effective_tier,paid_access FROM member_effective_entitlements WHERE member_id=?",
        (member_id,),
    ).fetchone()
    return (row[0], int(row[1])) if row else ("missing", -1)


def insert_member(db: sqlite3.Connection, member_id: str, email: str, stamp: str) -> None:
    db.execute(
        "INSERT INTO members "
        "(id,email,display_name,role,tier,status,marketing_status,source,email_verified_at,created_at,updated_at) "
        "VALUES (?,?,?,'member','free','active','subscribed','recovery-rehearsal',?,?,?)",
        (member_id, email, member_id.replace("-", " ").title(), stamp, stamp, stamp),
    )


def insert_subscription(
    db: sqlite3.Connection,
    member_id: str,
    tier: str,
    suffix: str,
    stamp: str,
    future: str,
) -> None:
    subscription_id = f"sub-{suffix}"
    provider_id = f"I-RECOVERY-{suffix.upper()}"
    db.execute(
        "INSERT INTO subscriptions "
        "(id,member_id,provider,provider_subscription_id,provider_plan_id,tier,status,current_period_end,created_at,updated_at) "
        "VALUES (?,?,'paypal',?,?,?,'active',?,?,?)",
        (subscription_id, member_id, provider_id, f"P-RECOVERY-{suffix.upper()}", tier, future, stamp, stamp),
    )
    db.execute(
        "INSERT INTO paypal_subscription_state "
        "(subscription_id,provider_subscription_id,environment,billing_state,entitlement_active,current_period_start,current_period_end,created_at,updated_at) "
        "VALUES (?,?,'sandbox','active',1,?,?,?,?)",
        (subscription_id, provider_id, stamp, future, stamp, stamp),
    )


def run() -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    stamp = now.isoformat().replace("+00:00", "Z")
    future = (now + timedelta(days=31)).isoformat().replace("+00:00", "Z")
    past = (now - timedelta(days=1)).isoformat().replace("+00:00", "Z")

    with tempfile.TemporaryDirectory(prefix="matrix-d1-rehearsal-") as temp_dir:
        database_path = Path(temp_dir) / "matrix-rehearsal.sqlite"
        db = sqlite3.connect(database_path)
        db.execute("PRAGMA foreign_keys=ON")
        try:
            email_statements = apply_schema(db)
            need(email_statements >= 10, "Email lifecycle schema extraction was incomplete", "emailSchemaExtracted")

            required_tables = {
                "members",
                "magic_links",
                "member_sessions",
                "member_access_grants",
                "forum_posts",
                "forum_reports",
                "paypal_runtime_settings",
                "paypal_plans",
                "paypal_subscription_state",
                "email_preferences",
                "email_outbox",
                "email_events",
                "audit_log",
            }
            actual_tables = {
                row[0]
                for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            need(required_tables.issubset(actual_tables), "One or more required D1 tables are missing", "requiredTables")

            for member_id, email in [
                ("member-free", "free@example.invalid"),
                ("member-support", "support@example.invalid"),
                ("member-intel", "intel@example.invalid"),
                ("member-research", "research@example.invalid"),
            ]:
                insert_member(db, member_id, email, stamp)

            need(entitlement(db, "member-free") == ("registered", 0), "Verified Free Member did not receive registered entitlement", "freeEntitlement")

            valid_hash = "hash-valid"
            expired_hash = "hash-expired"
            db.execute(
                "INSERT INTO magic_links (id,member_id,token_hash,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)",
                ("link-valid", "member-free", valid_hash, "login", future, stamp),
            )
            db.execute(
                "INSERT INTO magic_links (id,member_id,token_hash,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)",
                ("link-expired", "member-free", expired_hash, "login", past, stamp),
            )
            valid_before = scalar(
                db,
                "SELECT COUNT(*) FROM magic_links WHERE token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now')",
                (valid_hash,),
            )
            expired_before = scalar(
                db,
                "SELECT COUNT(*) FROM magic_links WHERE token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now')",
                (expired_hash,),
            )
            db.execute("UPDATE magic_links SET used_at=? WHERE token_hash=?", (stamp, valid_hash))
            valid_after = scalar(
                db,
                "SELECT COUNT(*) FROM magic_links WHERE token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now')",
                (valid_hash,),
            )
            need(valid_before == 1 and expired_before == 0 and valid_after == 0, "Magic-link expiry or one-use behaviour failed", "magicLinks")

            db.execute(
                "INSERT INTO member_sessions (id,member_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)",
                ("session-free", "member-free", "session-hash", future, stamp, stamp),
            )
            active_before = scalar(db, "SELECT COUNT(*) FROM member_sessions WHERE revoked_at IS NULL AND datetime(expires_at)>datetime('now')")
            db.execute("UPDATE member_sessions SET revoked_at=? WHERE id='session-free'", (stamp,))
            active_after = scalar(db, "SELECT COUNT(*) FROM member_sessions WHERE revoked_at IS NULL AND datetime(expires_at)>datetime('now')")
            need(active_before == 1 and active_after == 0, "Session revocation did not remove active access", "sessionRevocation")

            insert_subscription(db, "member-support", "supporter", "support", stamp, future)
            insert_subscription(db, "member-intel", "intelligence", "intel", stamp, future)
            insert_subscription(db, "member-research", "research_pro", "research", stamp, future)
            need(entitlement(db, "member-support") == ("supporter_3", 1), "Supporter subscription entitlement failed", "supporterEntitlement")
            need(entitlement(db, "member-intel") == ("intelligence_6", 1), "Intelligence subscription entitlement failed", "intelligenceEntitlement")
            need(entitlement(db, "member-research") == ("research_pro_9", 1), "Research Pro subscription entitlement failed", "researchEntitlement")

            db.execute("UPDATE paypal_subscription_state SET billing_state='suspended',entitlement_active=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("registered", 0), "Suspended subscription retained paid access", "suspendedFailClosed")
            db.execute("UPDATE paypal_subscription_state SET billing_state='active',entitlement_active=1,refund_hold=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("registered", 0), "Refund hold retained paid access", "refundFailClosed")
            db.execute("UPDATE paypal_subscription_state SET refund_hold=0,reversal_hold=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("registered", 0), "Reversal hold retained paid access", "reversalFailClosed")
            db.execute("UPDATE paypal_subscription_state SET reversal_hold=0,billing_state='past_due',payment_failure_count=1,entitlement_active=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("supporter_3", 1), "First failed payment removed grace-period access", "pastDueGrace")
            db.execute("UPDATE paypal_subscription_state SET payment_failure_count=2,entitlement_active=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("registered", 0), "Second failed payment retained paid access", "pastDueClosed")
            db.execute("UPDATE paypal_subscription_state SET billing_state='cancelled_period_end',payment_failure_count=0,entitlement_active=1 WHERE subscription_id='sub-support'")
            need(entitlement(db, "member-support") == ("supporter_3", 1), "Paid access ended before the current period", "cancelPeriodGrace")
            db.execute("UPDATE subscriptions SET current_period_end=? WHERE id='sub-support'", (past,))
            need(entitlement(db, "member-support") == ("registered", 0), "Expired cancelled subscription retained paid access", "cancelPeriodClosed")

            db.execute(
                "INSERT INTO forum_posts "
                "(id,member_id,board,title,body,category,display_name,source_url,created_at,approved_at,status,storage_origin,updated_at) "
                "VALUES ('post-recovery','member-free','main','Recovery source','Public-record lead','Signal','Free Member','https://example.invalid/source',?,?, 'live','d1-member-submit',?)",
                (stamp, stamp, stamp),
            )
            db.execute(
                "INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES ('audit-post','member-free','forum.post.created','forum_post','post-recovery','{}',?)",
                (stamp,),
            )
            accountable_post = db.execute(
                "SELECT p.member_id,a.action FROM forum_posts p JOIN audit_log a ON a.target_id=p.id WHERE p.id='post-recovery'"
            ).fetchone()
            need(accountable_post == ("member-free", "forum.post.created"), "Forum post lost member accountability or audit trail", "forumAccountability")

            db.execute(
                "INSERT INTO email_preferences (member_id,public_daily_brief,public_weekly_digest,release_notices,updated_at,created_at) VALUES ('member-free',1,1,1,?,?)",
                (stamp, stamp),
            )
            need(scalar(db, "SELECT public_daily_brief FROM email_preferences WHERE member_id='member-free'") == 1, "Email preferences were not persisted", "emailPreferences")

            sandbox_enabled = scalar(db, "SELECT checkout_enabled FROM paypal_runtime_settings WHERE environment='sandbox'")
            live_enabled = scalar(db, "SELECT checkout_enabled FROM paypal_runtime_settings WHERE environment='live'")
            need(sandbox_enabled == 0 and live_enabled == 0, "PayPal runtime defaults are not disabled", "paypalDefaultsClosed")

            counts_before = {
                "members": scalar(db, "SELECT COUNT(*) FROM members"),
                "subscriptions": scalar(db, "SELECT COUNT(*) FROM subscriptions"),
                "forum_posts": scalar(db, "SELECT COUNT(*) FROM forum_posts"),
                "email_preferences": scalar(db, "SELECT COUNT(*) FROM email_preferences"),
            }
            second_email_statements = apply_schema(db)
            counts_after = {
                "members": scalar(db, "SELECT COUNT(*) FROM members"),
                "subscriptions": scalar(db, "SELECT COUNT(*) FROM subscriptions"),
                "forum_posts": scalar(db, "SELECT COUNT(*) FROM forum_posts"),
                "email_preferences": scalar(db, "SELECT COUNT(*) FROM email_preferences"),
            }
            need(second_email_statements == email_statements and counts_after == counts_before, "Repeated schema application changed persisted records", "repeatSafe")
            db.commit()
        finally:
            db.close()

    report = {
        "ok": not failures,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "failures": failures,
        "migrations": MIGRATIONS,
        "emailSchemaStatements": email_statements,
        "externalActions": {
            "cloudflareCalled": False,
            "emailSent": False,
            "paypalCalled": False,
            "productionDeployed": False,
        },
        "boundary": "The rehearsal uses a temporary local SQLite database only. It applies repository migration SQL and the actual email Worker schema statements, then deletes the database.",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if failures:
        print("RECOVERY D1 REHEARSAL FAILED")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print(f"RECOVERY D1 REHEARSAL PASSED: {len(checks)} checks, {email_statements} email schema statements, repeat-safe persisted records.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:  # ensure CI receives a useful report on unexpected failure
        if not REPORT.exists():
            REPORT.parent.mkdir(parents=True, exist_ok=True)
            REPORT.write_text(
                json.dumps(
                    {
                        "ok": False,
                        "generatedAt": datetime.now(timezone.utc).isoformat(),
                        "checks": checks,
                        "failures": failures + [f"{type(error).__name__}: {error}"],
                        "externalActions": {
                            "cloudflareCalled": False,
                            "emailSent": False,
                            "paypalCalled": False,
                            "productionDeployed": False,
                        },
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
        raise
