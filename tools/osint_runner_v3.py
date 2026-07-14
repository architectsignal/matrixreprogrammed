#!/usr/bin/env python3
"""Matrix OSINT runner v3.

Runs the existing private runner contract while enriching administrator breach reports with
recognisable masked clues. The original values are inspected only in memory and discarded.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

import osint_runner as base

base.VERSION = "3.1.0"

IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
IPV6_RE = re.compile(r"\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\b", re.I)


def walk_with_ancestors(
    value: Any,
    path: tuple[str, ...] = (),
    ancestors: tuple[dict[str, Any], ...] = (),
) -> Iterator[tuple[tuple[str, ...], Any, tuple[dict[str, Any], ...]]]:
    if isinstance(value, dict):
        next_ancestors = ancestors + (value,)
        for key, child in value.items():
            yield from walk_with_ancestors(child, path + (str(key),), next_ancestors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_with_ancestors(child, path + (str(index),), ancestors)
    else:
        yield path, value, ancestors


def mask_mail(value: str) -> str:
    match = base.EMAIL_RE.search(value)
    if not match:
        return "Mailbox identifier present · withheld"
    address = match.group(0)
    local, domain = address.rsplit("@", 1)
    if len(local) <= 2:
        masked = local[:1] + "•"
    else:
        masked = local[:1] + "•" * min(6, len(local) - 2) + local[-1:]
    return f"{masked}@{domain.lower()}"


def mask_tel(value: str) -> str:
    match = base.PHONE_RE.search(value)
    digits = re.sub(r"\D", "", match.group(0) if match else value)
    if len(digits) < 4:
        return "Telephone identifier present · withheld"
    prefix = ""
    if str(value).strip().startswith("+") and len(digits) >= 8:
        prefix = "+" + digits[:2] + " "
    return f"{prefix}••• •• {digits[-4:]}"


def mask_network(value: str) -> str:
    ipv4 = IPV4_RE.search(value)
    if ipv4:
        parts = ipv4.group(0).split(".")
        return f"{parts[0]}.{parts[1]}.xxx.xxx"
    ipv6 = IPV6_RE.search(value)
    if ipv6:
        parts = [part for part in ipv6.group(0).split(":") if part]
        return ":".join(parts[:2]) + ":…"
    return "Network identifier present · withheld"


def mask_name(value: str) -> str:
    words = [word for word in re.split(r"\s+", value.strip()) if word]
    initials = " ".join(word[:1].upper() + "•" * min(4, max(1, len(word) - 1)) for word in words[:4])
    return initials or "Name data present · withheld"


def mask_username(value: str) -> str:
    text = str(value).strip()
    if len(text) <= 4:
        return text[:1] + "•" * max(2, len(text) - 1)
    return text[:2] + "•" * min(8, len(text) - 4) + text[-2:]


def digest_description(value: str) -> str:
    text = str(value).strip()
    lowered = text.lower()
    if lowered.startswith("$2a$") or lowered.startswith("$2b$") or lowered.startswith("$2y$"):
        algorithm = "bcrypt"
    elif lowered.startswith("$argon2"):
        algorithm = "Argon2"
    elif lowered.startswith("$scrypt$"):
        algorithm = "scrypt"
    elif re.fullmatch(r"[0-9a-f]{32}", lowered):
        algorithm = "MD5-like 32-hex digest"
    elif re.fullmatch(r"[0-9a-f]{40}", lowered):
        algorithm = "SHA-1-like 40-hex digest"
    elif re.fullmatch(r"[0-9a-f]{64}", lowered):
        algorithm = "SHA-256-like 64-hex digest"
    else:
        algorithm = "Unclassified digest"
    return f"{algorithm} present · value withheld"


def mask_financial(value: str) -> str:
    digits = re.sub(r"\D", "", str(value))
    return f"Financial identifier ending {digits[-4:]}" if len(digits) >= 4 else "Financial identifier present · withheld"


def recognition_display(category: str, value: Any) -> str:
    text = str(value or "")
    if category == "telephoneData":
        return mask_tel(text)
    if category == "recoveryData":
        if base.EMAIL_RE.search(text):
            return mask_mail(text)
        if base.PHONE_RE.search(text):
            return mask_tel(text)
        return "Recovery element present · value withheld"
    if category == "networkAddressData":
        return mask_network(text)
    if category == "usernameData":
        return mask_username(text)
    if category == "nameData":
        return mask_name(text)
    if category == "dateOfBirthData":
        year = re.search(r"\b(?:19|20)\d{2}\b", text)
        return f"Birth year {year.group(0)}" if year else "Date-of-birth data present · withheld"
    if category == "financialData":
        return mask_financial(text)
    if category == "digestMaterial":
        return digest_description(text)
    if category == "authenticationMaterial":
        return f"Authentication value present · length {len(text)} · withheld"
    if category == "authenticationTokenData":
        return f"Session or access token present · length {len(text)} · withheld"
    if category == "postalAddressData":
        postcode = re.search(r"\b[A-Z0-9][A-Z0-9 -]{2,8}[A-Z0-9]\b", text, re.I)
        return f"Address clue: … {postcode.group(0)[-5:]}" if postcode else "Postal-address data present · withheld"
    return "Sensitive value present · withheld"


def context_label(path: tuple[str, ...]) -> str:
    useful = [part for part in path if not part.isdigit()][-4:]
    return " › ".join(useful)[:160] or "Source record"


def nearest_metadata(ancestors: tuple[dict[str, Any], ...]) -> tuple[str | None, str | None]:
    source: str | None = None
    reported: str | None = None
    for record in reversed(ancestors):
        for key, value in record.items():
            if not isinstance(value, (str, int, float)):
                continue
            key_text = str(key).lower()
            safe = base.clean_text(value, 120)
            if not source and re.search(r"source|service|provider|breach|database|dataset", key_text) and safe:
                source = safe
            if not reported and re.search(r"date|time|created|reported", key_text):
                found = base.DATE_RE.search(str(value))
                if found:
                    reported = found.group(0)
        if source and reported:
            break
    return source, reported


def run_h8mail_enriched(target: str) -> tuple[dict[str, Any], str]:
    if not base.command_exists("h8mail"):
        raise RuntimeError("h8mail is not installed on the private runner")
    started_ns = time.time_ns()
    timeout_seconds = int(os.environ.get("H8MAIL_TIMEOUT_SECONDS", "360"))
    with tempfile.TemporaryDirectory(prefix="matrix-h8mail-") as temp_dir:
        output_path = Path(temp_dir) / "result.json"
        command = ["h8mail", "-t", target, "-j", str(output_path), "--hide"]
        config_path = os.environ.get("H8MAIL_CONFIG", "").strip()
        if config_path:
            command.extend(["-c", config_path])
        completed, timed_out = base.run_command(command, timeout_seconds)
        assert completed is not None
        if not output_path.exists():
            error = base.clean_text(completed.stderr or completed.stdout or "h8mail did not create JSON output")
            raise RuntimeError(error)
        try:
            payload = json.loads(output_path.read_text(encoding="utf-8", errors="ignore"))
        except json.JSONDecodeError as exc:
            raise RuntimeError("h8mail returned invalid JSON") from exc

    breach_names: set[str] = set()
    sources: set[str] = set()
    dates: set[str] = set()
    numeric_counts: Counter[str] = Counter()
    indicators: Counter[str] = Counter()
    stealer_count = 0
    raw_groups: Counter[str] = Counter()
    candidate_hints: list[dict[str, Any]] = []

    leaves = list(walk_with_ancestors(payload))
    for path_parts, value, _ in leaves:
        category = base.classify_sensitive_path(".".join(path_parts).lower())
        if category and value not in (None, "", [], {}):
            raw_groups[hashlib.sha256(str(value).encode("utf-8", errors="ignore")).hexdigest()] += 1

    for path_parts, value, ancestors in leaves:
        path = ".".join(path_parts)
        normal_path = path.lower()
        category = base.classify_sensitive_path(normal_path)
        if category and value not in (None, "", [], {}):
            indicators[category] += 1
            group_key = hashlib.sha256(str(value).encode("utf-8", errors="ignore")).hexdigest()
            source, reported = nearest_metadata(ancestors)
            candidate_hints.append(
                {
                    "kind": category,
                    "display": recognition_display(category, value),
                    "context": context_label(path_parts),
                    "source": source or "Source not labelled",
                    "reportedDate": reported,
                    "occurrences": 1,
                    "sameValueCount": raw_groups[group_key],
                }
            )

        if re.search(r"stealer|infostealer|malware.?log", normal_path):
            if isinstance(value, (int, float)):
                stealer_count += max(0, int(value))
            elif value not in (None, "", False):
                stealer_count += 1

        if isinstance(value, (int, float)) and re.search(r"count|total|found|breach|record|result", normal_path):
            numeric_counts[base.clean_text(path_parts[-1] if path_parts else "count", 80)] += int(value)

        if not isinstance(value, str):
            continue
        safe = base.clean_text(value, 120)
        if not safe or "[redacted" in safe:
            continue
        if re.search(r"breach|database|dataset", normal_path) and len(safe) <= 100:
            breach_names.add(safe)
        if re.search(r"source|service|provider", normal_path) and len(safe) <= 80:
            sources.add(safe)
        if re.search(r"date|time|breach", normal_path):
            dates.update(base.DATE_RE.findall(safe))

    grouped: dict[tuple[str, str, str, str | None], dict[str, Any]] = {}
    for hint in candidate_hints:
        key = (hint["kind"], hint["display"], hint["source"], hint["reportedDate"])
        if key not in grouped:
            grouped[key] = hint
        else:
            grouped[key]["occurrences"] += 1
            grouped[key]["sameValueCount"] = max(grouped[key]["sameValueCount"], hint["sameValueCount"])
    recognition_hints = sorted(
        grouped.values(),
        key=lambda item: (item["kind"], item["source"], item["display"]),
    )[:250]

    breach_list = sorted(breach_names)[:150]
    source_list = sorted(sources)[:100]
    date_list = sorted(dates)
    indicator_counts = {key: int(value) for key, value in indicators.most_common()}
    classes = [key for key, value in indicator_counts.items() if value > 0]
    ai_summary = base.breach_risk(indicator_counts, breach_list, stealer_count)
    rows_observed = base.record_count(payload)
    duration_ms = int((time.time_ns() - started_ns) / 1_000_000)
    breach_results = [
        {
            "source": {"name": name, "date": date_list[index] if index < len(date_list) else None},
            "exposed_data": classes,
        }
        for index, name in enumerate(breach_list[:100])
    ]
    actions = [
        "Change passwords on every affected service and anywhere the same password may have been reused.",
        "Enable multi-factor authentication, preferably with an authenticator application or security key.",
        "Review recovery mailboxes, telephone identifiers, trusted devices, sessions, and forwarding rules.",
        "Revoke unknown sessions and third-party application access.",
        "Contact the provider when a masked clue identifies an old or unfamiliar account you cannot secure directly.",
        "Monitor financial and identity accounts when authentication, telephone, network, or payment categories were detected.",
    ]
    result = {
        "engine": "h8mail",
        "report_version": 3,
        "accounts": [],
        "validator": None,
        "data_breaches": {"amount": len(breach_list), "sources": len(source_list), "results": breach_results},
        "stealer_logs": {"count": stealer_count, "present": stealer_count > 0, "results": []},
        "ai_summary": ai_summary,
        "reportedCounts": dict(numeric_counts.most_common(80)),
        "breachOrDatasetNames": breach_list,
        "servicesReporting": source_list,
        "exposureIndicators": indicator_counts,
        "exposureClasses": classes,
        "sourceRecordCount": rows_observed,
        "exposureDates": {
            "earliest": date_list[0] if date_list else None,
            "latest": date_list[-1] if date_list else None,
            "reported": date_list[:150],
        },
        "recognitionHints": recognition_hints,
        "selfReportCapabilities": [
            "Masked telephone suffixes",
            "Masked mailbox identifiers",
            "Masked network prefixes",
            "Affected usernames and names in masked form",
            "Digest algorithm classification",
            "Authentication-value presence and length",
            "Source, date, occurrence and same-value reuse counts when available",
        ],
        "riskAssessment": {
            "level": ai_summary["risk"],
            "summary": ai_summary["headline"],
            "reason": ai_summary["risk_reason"],
            "actions": actions,
        },
        "recommendedActions": actions,
        "meta": {
            "duration_ms": duration_ms,
            "module_timeout_ms": timeout_seconds * 1000,
            "completed": not timed_out,
            "timed_out": timed_out,
            "lookup_id": base.lookup_id("h8mail", started_ns),
            "version": 3,
        },
        "limitations": [
            "Recognition hints are masked and are shown only when the authenticated member owns the verified target mailbox.",
            "Reusable secret values and complete source rows are discarded after classification.",
            "A source reference does not by itself prove current compromise or current account control.",
        ],
    }
    summary = (
        f"Verified-self exposure review found {len(breach_list)} source references, "
        f"{len(classes)} data categories and {len(recognition_hints)} masked recognition clues."
    )
    return result, summary


base.run_h8mail = run_h8mail_enriched

if __name__ == "__main__":
    raise SystemExit(base.main())
