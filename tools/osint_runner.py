#!/usr/bin/env python3
"""Private Matrix Reprogrammed email-intelligence runner.

The public website creates encrypted, access-controlled jobs. This runner polls for one
job at a time, executes the selected open-source engine locally, classifies the results,
and returns only sanitised intelligence. It never prints or returns the target address,
passwords, digests, recovery values, telephone numbers, network addresses, credentials,
or raw breach rows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

import requests

VERSION = "2.0.0"
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"\+?\d[\d ()-]{7,}\d")
DOMAIN_RE = re.compile(r"(?<![@\w.-])(?:https?://)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)", re.I)
DATE_RE = re.compile(r"\b(?:19|20)\d{2}(?:[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)?\b")
BLOCKED_KEYS = re.compile(
    r"password|passwd|credential|secret|token|api.?key|recovery|phone|mobile|salt|raw|"
    r"cleartext|session|cookie|authorization|target|email|hash|digest|ip(?:address)?",
    re.I,
)
GENERIC_SERVICE_LABELS = {"email", "account", "exists", "registered", "result", "service"}
SERVICE_TYPES = {
    "github.com": "Developer",
    "gitlab.com": "Developer",
    "office365.com": "Productivity",
    "microsoft.com": "Productivity",
    "google.com": "Identity",
    "twitter.com": "Social",
    "x.com": "Social",
    "instagram.com": "Social",
    "facebook.com": "Social",
    "linkedin.com": "Professional",
    "paypal.com": "Financial",
    "venmo.com": "Financial",
    "amazon.com": "Commerce",
}


def clean_text(value: Any, limit: int = 700) -> str:
    text = ANSI_RE.sub("", str(value or ""))
    text = EMAIL_RE.sub("[redacted-email]", text)
    text = PHONE_RE.sub("[redacted-phone]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def sanitise(value: Any, key: str = "", depth: int = 0) -> Any:
    if depth > 7:
        return "[depth-limited]"
    if BLOCKED_KEYS.search(str(key or "")):
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, list):
        return [
            item
            for item in (sanitise(child, "item", depth + 1) for child in value[:250])
            if item is not None
        ]
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for child_key, child_value in list(value.items())[:150]:
            safe = sanitise(child_value, str(child_key), depth + 1)
            if safe is not None:
                output[clean_text(child_key, 80)] = safe
        return output
    return clean_text(value)


class MatrixClient:
    def __init__(self, base_url: str, token: str, runner_id: str, timeout: int = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.runner_id = runner_id
        self.session = requests.Session()
        self.session.headers.update(
            {
                "authorization": f"Bearer {token}",
                "x-runner-id": runner_id,
                "user-agent": f"MatrixOSINTRunner/{VERSION}",
            }
        )
        self.timeout = timeout

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = self.session.request(
            method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs
        )
        payload: dict[str, Any] = {}
        try:
            payload = response.json()
        except ValueError:
            pass
        response.raise_for_status()
        return payload

    def heartbeat(self, tools: list[str]) -> None:
        self.request(
            "POST",
            "/api/admin/tools/heartbeat",
            json={
                "runnerId": self.runner_id,
                "supportedTools": tools,
                "version": VERSION,
                "platform": platform.platform(),
            },
        )

    def next_job(self) -> dict[str, Any] | None:
        return self.request("GET", "/api/admin/tools/jobs/next").get("job")

    def complete(self, job_id: str, result: dict[str, Any], summary: str) -> None:
        self.request(
            "POST",
            f"/api/admin/tools/jobs/{job_id}/result",
            json={"result": sanitise(result), "summary": clean_text(summary, 600)},
        )

    def fail(self, job_id: str, error: str) -> None:
        self.request(
            "POST",
            f"/api/admin/tools/jobs/{job_id}/fail",
            json={"error": clean_text(error, 700)},
        )


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(command: list[str], timeout: int) -> tuple[subprocess.CompletedProcess[str] | None, bool]:
    try:
        return (
            subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            ),
            False,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode(errors="ignore") if isinstance(exc.stdout, bytes) else str(exc.stdout or "")
        stderr = exc.stderr.decode(errors="ignore") if isinstance(exc.stderr, bytes) else str(exc.stderr or "")
        return subprocess.CompletedProcess(command, 124, stdout, stderr), True


def lookup_id(tool: str, started_ns: int) -> str:
    seed = f"{tool}|{started_ns}|{os.urandom(12).hex()}"
    return hashlib.sha256(seed.encode()).hexdigest()[:24]


def normalise_service(value: str) -> str:
    service = clean_text(value, 100).lower().strip(" .:;[]()")
    service = service.removeprefix("www.")
    return service


def service_from_line(line: str) -> tuple[str, bool]:
    domains = DOMAIN_RE.findall(line)
    if domains:
        return normalise_service(domains[0]), False
    cleaned = re.sub(r"^\[[+x!\-*]\]\s*", "", line).strip()
    candidate = re.split(r"[:\s]", cleaned, maxsplit=1)[0]
    candidate = normalise_service(candidate)
    if not candidate or candidate in GENERIC_SERVICE_LABELS:
        return clean_text(cleaned, 120), True
    return candidate, False


def formatted_service(service: str) -> str:
    stem = service.split(".", 1)[0].replace("-", " ").strip()
    if not stem:
        return service
    special = {"office365": "Office 365", "github": "GitHub", "gitlab": "GitLab"}
    return special.get(stem, stem.title())


def account_record(service: str) -> dict[str, Any]:
    return {
        "module": {
            "id": service.split(".", 1)[0],
            "name": service,
            "name_formatted": formatted_service(service),
            "domain": service if "." in service else "",
            "type": 1,
            "type_name": SERVICE_TYPES.get(service, "Online Service"),
        },
        "data": {
            "fields": [],
            "evidence": "Provider response was consistent with an existing account.",
        },
        "confidence": "possible",
    }


def account_risk(possible: list[str]) -> dict[str, Any]:
    high_value_set = {
        "google.com",
        "microsoft.com",
        "office365.com",
        "apple.com",
        "github.com",
        "dropbox.com",
        "paypal.com",
        "venmo.com",
        "amazon.com",
        "twitter.com",
    }
    high_value = sorted(set(possible).intersection(high_value_set))
    level = "medium" if len(possible) >= 8 or high_value else "low"
    bullets = []
    if high_value:
        bullets.append("Possible high-value account associations: " + ", ".join(high_value[:8]) + ".")
    bullets.append(f"{len(possible)} provider response(s) were consistent with an account.")
    return {
        "headline": f"{len(possible)} possible account association(s) identified.",
        "bullets": bullets,
        "risk": level,
        "risk_reason": (
            "High-value identity, cloud, financial, or social services require direct verification."
            if high_value
            else "Account signals were limited and remain unverified."
        ),
        "generated_by": "deterministic-risk-engine",
    }


def run_holehe(target: str) -> tuple[dict[str, Any], str]:
    if not command_exists("holehe"):
        raise RuntimeError("Holehe is not installed on the private runner")
    started_ns = time.time_ns()
    timeout_seconds = int(os.environ.get("HOLEHE_TIMEOUT_SECONDS", "240"))
    completed, timed_out = run_command(["holehe", target], timeout_seconds)
    assert completed is not None
    output = ANSI_RE.sub("", f"{completed.stdout}\n{completed.stderr}")
    possible: list[str] = []
    absent: list[str] = []
    inconclusive: list[str] = []
    anomalies: list[str] = []
    checked: set[str] = set()
    for raw_line in output.splitlines():
        line = raw_line.strip()
        match = re.match(r"^\[([+x!\-*])\]\s*(.+)$", line)
        if not match:
            continue
        marker = match.group(1)
        service, anomalous = service_from_line(line)
        if anomalous:
            if service:
                anomalies.append(service)
            continue
        if not service:
            continue
        checked.add(service)
        if marker == "+":
            possible.append(service)
        elif marker == "-":
            absent.append(service)
        else:
            inconclusive.append(service)

    possible = sorted(set(possible))[:250]
    absent = sorted(set(absent))[:250]
    inconclusive = sorted(set(inconclusive))[:250]
    anomalies = sorted(set(anomalies))[:100]
    ai_summary = account_risk(possible)
    duration_ms = int((time.time_ns() - started_ns) / 1_000_000)
    result = {
        "engine": "holehe",
        "report_version": 2,
        "accounts": [account_record(service) for service in possible],
        "validator": {
            "registered": [
                {"name": service, "name_formatted": formatted_service(service)}
                for service in possible
            ],
            "unregistered": [
                {"name": service, "name_formatted": formatted_service(service)}
                for service in absent
            ],
            "inconclusive": [
                {"name": service, "name_formatted": formatted_service(service)}
                for service in inconclusive
            ],
            "parser_anomalies": anomalies,
        },
        "data_breaches": None,
        "stealer_logs": None,
        "ai_summary": ai_summary,
        "servicesChecked": len(checked),
        "possibleAccounts": possible,
        "noAccountSignals": absent,
        "inconclusiveServices": inconclusive,
        "parserAnomalies": anomalies,
        "registrationSignals": possible,
        "unavailableOrRateLimited": inconclusive,
        "riskAssessment": {
            "level": ai_summary["risk"],
            "summary": ai_summary["headline"],
            "actions": [
                "Verify important signals through each provider's official sign-in or recovery page.",
                "Enable multi-factor authentication on confirmed email, cloud, financial, and social accounts.",
                "Close unused accounts and remove obsolete third-party application access.",
                "Use a unique password for every confirmed account.",
            ],
        },
        "recommendedActions": [
            "Verify important signals through each provider's official sign-in or recovery page.",
            "Enable multi-factor authentication on confirmed email, cloud, financial, and social accounts.",
            "Close unused accounts and remove obsolete third-party application access.",
            "Use a unique password for every confirmed account.",
        ],
        "meta": {
            "duration_ms": duration_ms,
            "module_timeout_ms": timeout_seconds * 1000,
            "completed": not timed_out,
            "timed_out": timed_out,
            "lookup_id": lookup_id("holehe", started_ns),
            "version": 2,
        },
        "limitations": [
            "A registration signal may be stale, shared, incorrect, or caused by provider behaviour.",
            "An inconclusive provider result does not indicate whether an account exists.",
            "No account-recovery response, telephone fragment, or raw provider response is returned.",
        ],
    }
    summary = (
        f"Holehe checked {len(checked)} services and returned {len(possible)} possible account "
        f"signals; {len(inconclusive)} providers were inconclusive."
    )
    return result, summary


def spiderfoot_request(
    base_url: str, path: str, method: str = "GET", data: dict[str, str] | None = None
) -> Any:
    url = f"{base_url.rstrip('/')}{path}"
    response = requests.request(
        method,
        url,
        data=data,
        timeout=45,
        headers={"user-agent": f"MatrixOSINTRunner/{VERSION}"},
    )
    response.raise_for_status()
    return response.json()


def run_spiderfoot(target: str) -> tuple[dict[str, Any], str]:
    base_url = os.environ.get("SPIDERFOOT_URL", "").strip()
    if not base_url:
        raise RuntimeError("SPIDERFOOT_URL is not configured on the private runner")
    started_ns = time.time_ns()
    scan_timeout = int(os.environ.get("SPIDERFOOT_SCAN_TIMEOUT", "600"))
    started = spiderfoot_request(
        base_url,
        "/startscan",
        "POST",
        {
            "scanname": f"matrix-{int(time.time())}",
            "scantarget": target,
            "modulelist": "",
            "typelist": "",
            "usecase": "passive",
        },
    )
    if not isinstance(started, list) or len(started) < 2 or started[0] != "SUCCESS":
        raise RuntimeError(f"SpiderFoot could not start the passive scan: {clean_text(started)}")
    scan_id = str(started[1])
    deadline = time.time() + scan_timeout
    status = "STARTED"
    while time.time() < deadline:
        scans = spiderfoot_request(base_url, "/scanlist")
        match = next(
            (row for row in scans if isinstance(row, list) and row and str(row[0]) == scan_id),
            None,
        )
        if match and len(match) > 6:
            status = str(match[6])
        if status in {"FINISHED", "ABORTED", "ERROR-FAILED"}:
            break
        time.sleep(5)
    timed_out = status not in {"FINISHED", "ABORTED", "ERROR-FAILED"}
    if status != "FINISHED":
        raise RuntimeError(f"SpiderFoot scan ended with status {clean_text(status)}")

    rows = spiderfoot_request(
        base_url, "/scaneventresults", "POST", {"id": scan_id, "eventType": "ALL"}
    )
    event_counts: Counter[str] = Counter()
    modules: set[str] = set()
    domains: set[str] = set()
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, list):
            continue
        event_type = clean_text(row[10] if len(row) > 10 else "UNKNOWN", 100)
        module = clean_text(row[3] if len(row) > 3 else "", 100)
        data = str(row[1] if len(row) > 1 else "")
        source = str(row[2] if len(row) > 2 else "")
        event_counts[event_type] += 1
        if module:
            modules.add(module)
        for candidate in DOMAIN_RE.findall(f"{data} {source}"):
            candidate = candidate.lower().strip(".")
            if candidate and "[redacted" not in candidate:
                domains.add(candidate)

    total_events = sum(event_counts.values())
    duration_ms = int((time.time_ns() - started_ns) / 1_000_000)
    result = {
        "engine": "spiderfoot",
        "report_version": 2,
        "scanStatus": status,
        "eventCounts": dict(event_counts.most_common(100)),
        "modulesReporting": sorted(modules)[:150],
        "publicDomainsObserved": sorted(domains)[:200],
        "accounts": [],
        "validator": None,
        "data_breaches": None,
        "stealer_logs": None,
        "ai_summary": {
            "headline": f"{total_events} sanitised passive events observed.",
            "bullets": [
                f"{len(event_counts)} event categories.",
                f"{len(domains)} public domains observed.",
            ],
            "risk": "informational",
            "risk_reason": "Passive public-data events require source-by-source verification.",
            "generated_by": "deterministic-risk-engine",
        },
        "riskAssessment": {
            "level": "informational",
            "summary": f"{total_events} sanitised passive events were observed.",
            "actions": [
                "Review unexpected public domains and remove obsolete public profiles where appropriate.",
                "Confirm important findings against the original public source.",
                "Reduce unnecessary public exposure and enable multi-factor authentication on related accounts.",
            ],
        },
        "recommendedActions": [
            "Review unexpected public domains and remove obsolete public profiles where appropriate.",
            "Confirm important findings against the original public source.",
            "Reduce unnecessary public exposure and enable multi-factor authentication on related accounts.",
        ],
        "meta": {
            "duration_ms": duration_ms,
            "module_timeout_ms": scan_timeout * 1000,
            "completed": not timed_out,
            "timed_out": timed_out,
            "lookup_id": lookup_id("spiderfoot", started_ns),
            "version": 2,
        },
        "limitations": [
            "Only passive modules were requested.",
            "Source event values and personal identifiers are not returned to the browser.",
            "External modules may be unavailable, rate-limited, or require separate API keys.",
        ],
    }
    summary = (
        f"SpiderFoot completed a passive scan with {total_events} sanitised events "
        f"across {len(event_counts)} event types."
    )
    return result, summary


def walk_values(value: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[tuple[str, ...], Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk_values(child, path + (str(key),))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_values(child, path + (str(index),))
    else:
        yield path, value


def record_count(payload: Any) -> int:
    candidates: list[int] = []
    if isinstance(payload, list):
        candidates.append(len(payload))
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, list) and re.search(r"result|record|breach|data|entry|hit", str(key), re.I):
                candidates.append(len(value))
    return max(candidates, default=0)


def classify_sensitive_path(path: str) -> str | None:
    tests = [
        ("authenticationMaterial", r"password|passwd|credential|cleartext|secret"),
        ("digestMaterial", r"hash|digest|salt"),
        ("recoveryData", r"recovery|security.?question|backup.?code"),
        ("telephoneData", r"phone|mobile|telephone|msisdn"),
        ("networkAddressData", r"\bip\b|ip.?address|ipv4|ipv6"),
        ("usernameData", r"user.?name|login|handle"),
        ("nameData", r"full.?name|first.?name|last.?name|display.?name"),
        ("postalAddressData", r"street|postal|postcode|zip|address"),
        ("dateOfBirthData", r"birth|dob"),
        ("financialData", r"card|bank|iban|payment|billing"),
        ("authenticationTokenData", r"token|session|cookie|api.?key"),
    ]
    for label, pattern in tests:
        if re.search(pattern, path, re.I):
            return label
    return None


def breach_risk(indicators: dict[str, int], breaches: list[str], stealer_count: int) -> dict[str, Any]:
    authentication = indicators.get("authenticationMaterial", 0) + indicators.get("digestMaterial", 0)
    if stealer_count > 0:
        level = "critical"
        reason = "Infostealer-related records were reported."
    elif authentication > 0:
        level = "high"
        reason = "Authentication or digest material was reported in source data."
    elif breaches:
        level = "medium"
        reason = "Historical breach or dataset references were reported."
    else:
        level = "low"
        reason = "No breach reference was identified by the configured sources."
    bullets = []
    if breaches:
        bullets.append(f"{len(breaches)} sanitised breach or dataset reference(s).")
    detected = [key for key, count in indicators.items() if count > 0]
    if detected:
        bullets.append("Sensitive categories detected: " + ", ".join(detected[:8]) + ".")
    if stealer_count:
        bullets.append(f"{stealer_count} infostealer-related record indicator(s).")
    return {
        "headline": f"{level.title()} email exposure risk.",
        "bullets": bullets,
        "risk": level,
        "risk_reason": reason,
        "generated_by": "deterministic-risk-engine",
    }


def run_h8mail(target: str) -> tuple[dict[str, Any], str]:
    if not command_exists("h8mail"):
        raise RuntimeError("h8mail is not installed on the private runner")
    started_ns = time.time_ns()
    timeout_seconds = int(os.environ.get("H8MAIL_TIMEOUT_SECONDS", "360"))
    with tempfile.TemporaryDirectory(prefix="matrix-h8mail-") as temp_dir:
        output_path = Path(temp_dir) / "result.json"
        command = ["h8mail", "-t", target, "-j", str(output_path), "--hide"]
        config_path = os.environ.get("H8MAIL_CONFIG", "").strip()
        if config_path:
            command.extend(["-c", config_path])
        completed, timed_out = run_command(command, timeout_seconds)
        assert completed is not None
        if not output_path.exists():
            error = clean_text(
                completed.stderr or completed.stdout or "h8mail did not create JSON output"
            )
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

    for path_parts, value in walk_values(payload):
        path = ".".join(path_parts)
        normal_path = path.lower()
        category = classify_sensitive_path(normal_path)
        if category and value not in (None, "", [], {}):
            indicators[category] += 1

        if re.search(r"stealer|infostealer|malware.?log", normal_path):
            if isinstance(value, (int, float)):
                stealer_count += max(0, int(value))
            elif value not in (None, "", False):
                stealer_count += 1

        if isinstance(value, (int, float)) and re.search(
            r"count|total|found|breach|record|result", normal_path
        ):
            numeric_counts[clean_text(path_parts[-1] if path_parts else "count", 80)] += int(value)

        if not isinstance(value, str):
            continue

        safe = clean_text(value, 120)
        if not safe or "[redacted" in safe:
            continue

        if re.search(r"breach|database|dataset", normal_path) and len(safe) <= 100:
            breach_names.add(safe)
        if re.search(r"source|service|provider", normal_path) and len(safe) <= 80:
            sources.add(safe)
        if re.search(r"date|time|breach", normal_path):
            dates.update(DATE_RE.findall(safe))

    breach_list = sorted(breach_names)[:150]
    source_list = sorted(sources)[:100]
    date_list = sorted(dates)
    indicator_counts = {key: int(value) for key, value in indicators.most_common()}
    classes = [key for key, value in indicator_counts.items() if value > 0]
    ai_summary = breach_risk(indicator_counts, breach_list, stealer_count)
    rows_observed = record_count(payload)
    duration_ms = int((time.time_ns() - started_ns) / 1_000_000)
    breach_results = [
        {
            "source": {"name": name, "date": date_list[index] if index < len(date_list) else None},
            "exposed_data": classes,
        }
        for index, name in enumerate(breach_list[:50])
    ]
    actions = [
        "Change passwords on affected services and anywhere the same password may have been reused.",
        "Enable multi-factor authentication, preferably with an authenticator application or security key.",
        "Review recovery email addresses, telephone numbers, trusted devices, sessions, and forwarding rules.",
        "Revoke unknown sessions and third-party application access.",
        "Monitor financial and identity accounts if authentication, telephone, or network data categories were detected.",
    ]
    result = {
        "engine": "h8mail",
        "report_version": 2,
        "accounts": [],
        "validator": None,
        "data_breaches": {
            "amount": len(breach_list),
            "sources": len(source_list),
            "results": breach_results,
        },
        "stealer_logs": {
            "count": stealer_count,
            "present": stealer_count > 0,
            "results": [],
        },
        "ai_summary": ai_summary,
        "reportedCounts": dict(numeric_counts.most_common(50)),
        "breachOrDatasetNames": breach_list,
        "servicesReporting": source_list,
        "exposureIndicators": indicator_counts,
        "exposureClasses": classes,
        "sourceRecordCount": rows_observed,
        "exposureDates": {
            "earliest": date_list[0] if date_list else None,
            "latest": date_list[-1] if date_list else None,
            "reported": date_list[:100],
        },
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
            "lookup_id": lookup_id("h8mail", started_ns),
            "version": 2,
        },
        "limitations": [
            "Sensitive categories are reported, but their underlying values are discarded.",
            "Passwords, digests, recovery values, telephone numbers, network addresses, credentials, and raw breach rows are never returned.",
            "A breach reference does not prove the current user controls the address or currently has a compromised account.",
        ],
    }
    summary = (
        f"h8mail completed an administrator-only exposure review with {len(breach_list)} "
        f"sanitised breach or dataset references and {len(classes)} sensitive-data categories."
    )
    return result, summary


def supported_tools() -> list[str]:
    tools: list[str] = []
    if command_exists("holehe"):
        tools.append("holehe")
    if os.environ.get("SPIDERFOOT_URL", "").strip():
        tools.append("spiderfoot")
    if command_exists("h8mail"):
        tools.append("h8mail")
    return tools


def run_job(job: dict[str, Any]) -> tuple[dict[str, Any], str]:
    tool = str(job.get("tool") or "")
    target = str(job.get("target") or "")
    if not EMAIL_RE.fullmatch(target):
        raise RuntimeError("Runner received an invalid single-email target")
    if tool == "holehe":
        return run_holehe(target)
    if tool == "spiderfoot":
        return run_spiderfoot(target)
    if tool == "h8mail":
        return run_h8mail(target)
    raise RuntimeError("Unsupported tool")


def main() -> int:
    parser = argparse.ArgumentParser(description="Private Matrix Reprogrammed OSINT tool runner")
    parser.add_argument("--once", action="store_true", help="Process at most one job and exit")
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=int(os.environ.get("OSINT_POLL_SECONDS", "10")),
    )
    args = parser.parse_args()
    base_url = os.environ.get("MATRIX_OSINT_BASE_URL", "https://matrixreprogrammed.com")
    token = os.environ.get("MATRIX_OSINT_RUNNER_TOKEN", "")
    runner_id = os.environ.get("MATRIX_OSINT_RUNNER_ID", platform.node() or "private-runner")
    if not token:
        raise SystemExit("MATRIX_OSINT_RUNNER_TOKEN is required")
    client = MatrixClient(base_url, token, runner_id)
    tools = supported_tools()
    if not tools:
        raise SystemExit("No supported OSINT tools are configured on this runner")
    while True:
        try:
            client.heartbeat(tools)
            job = client.next_job()
            if not job:
                if args.once:
                    return 0
                time.sleep(max(5, args.poll_seconds))
                continue
            job_id = str(job.get("id") or "")
            try:
                result, summary = run_job(job)
                client.complete(job_id, result, summary)
            except Exception as exc:  # runner must report safely and continue
                client.fail(job_id, str(exc))
            if args.once:
                return 0
        except requests.RequestException as exc:
            if args.once:
                raise SystemExit(f"Runner API request failed: {exc}") from exc
            time.sleep(max(10, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())