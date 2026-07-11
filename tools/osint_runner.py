#!/usr/bin/env python3
"""Private Matrix Reprogrammed OSINT runner.

Polls the authenticated Matrix API for encrypted jobs, executes supported open-source
engines locally, and returns only sanitised summaries. Never print target addresses.
"""
from __future__ import annotations

import argparse
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
from typing import Any

import requests

VERSION = "1.0.0"
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"\+?\d[\d ()-]{7,}\d")
DOMAIN_RE = re.compile(r"(?<![@\w.-])(?:https?://)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)", re.I)
BLOCKED_KEYS = re.compile(
    r"password|passwd|credential|secret|token|api.?key|recovery|phone|mobile|salt|raw|cleartext|session|cookie|authorization|target|email|hash|ip(?:address)?",
    re.I,
)


def clean_text(value: Any, limit: int = 700) -> str:
    text = ANSI_RE.sub("", str(value or ""))
    text = EMAIL_RE.sub("[redacted-email]", text)
    text = PHONE_RE.sub("[redacted-phone]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def sanitise(value: Any, key: str = "", depth: int = 0) -> Any:
    if depth > 6:
        return "[depth-limited]"
    if BLOCKED_KEYS.search(str(key or "")):
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, list):
        return [item for item in (sanitise(v, "item", depth + 1) for v in value[:200]) if item is not None]
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for child_key, child_value in list(value.items())[:100]:
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
        self.session.headers.update({
            "authorization": f"Bearer {token}",
            "x-runner-id": runner_id,
            "user-agent": f"MatrixOSINTRunner/{VERSION}",
        })
        self.timeout = timeout

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = self.session.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
        payload: dict[str, Any] = {}
        try:
            payload = response.json()
        except ValueError:
            pass
        response.raise_for_status()
        return payload

    def heartbeat(self, tools: list[str]) -> None:
        self.request("POST", "/api/admin/tools/heartbeat", json={
            "runnerId": self.runner_id,
            "supportedTools": tools,
            "version": VERSION,
            "platform": platform.platform(),
        })

    def next_job(self) -> dict[str, Any] | None:
        return self.request("GET", "/api/admin/tools/jobs/next").get("job")

    def complete(self, job_id: str, result: dict[str, Any], summary: str) -> None:
        self.request("POST", f"/api/admin/tools/jobs/{job_id}/result", json={"result": sanitise(result), "summary": clean_text(summary, 600)})

    def fail(self, job_id: str, error: str) -> None:
        self.request("POST", f"/api/admin/tools/jobs/{job_id}/fail", json={"error": clean_text(error, 700)})


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)


def run_holehe(target: str) -> tuple[dict[str, Any], str]:
    if not command_exists("holehe"):
        raise RuntimeError("Holehe is not installed on the private runner")
    completed = run_command(["holehe", target], timeout=240)
    output = ANSI_RE.sub("", f"{completed.stdout}\n{completed.stderr}")
    registered: list[str] = []
    unavailable: list[str] = []
    checked: set[str] = set()
    for raw_line in output.splitlines():
        line = raw_line.strip()
        match = re.match(r"^\[([+x!\-])\]\s*([^:\s]+)", line)
        if not match:
            continue
        marker, service = match.groups()
        service = clean_text(service, 80).lower()
        if not service:
            continue
        checked.add(service)
        if marker == "+":
            registered.append(service)
        elif marker in {"x", "!"}:
            unavailable.append(service)
    result = {
        "engine": "holehe",
        "servicesChecked": len(checked),
        "registrationSignals": sorted(set(registered))[:200],
        "unavailableOrRateLimited": sorted(set(unavailable))[:200],
        "limitations": [
            "A registration signal may be stale, shared, incorrect or caused by provider behaviour.",
            "No recovery email, phone fragment or raw provider response is returned.",
        ],
    }
    summary = f"Holehe checked {len(checked)} services and returned {len(set(registered))} registration signals."
    return result, summary


def spiderfoot_request(base_url: str, path: str, method: str = "GET", data: dict[str, str] | None = None) -> Any:
    url = f"{base_url.rstrip('/')}{path}"
    response = requests.request(method, url, data=data, timeout=45, headers={"user-agent": f"MatrixOSINTRunner/{VERSION}"})
    response.raise_for_status()
    return response.json()


def run_spiderfoot(target: str) -> tuple[dict[str, Any], str]:
    base_url = os.environ.get("SPIDERFOOT_URL", "").strip()
    if not base_url:
        raise RuntimeError("SPIDERFOOT_URL is not configured on the private runner")
    started = spiderfoot_request(base_url, "/startscan", "POST", {
        "scanname": f"matrix-{int(time.time())}",
        "scantarget": target,
        "modulelist": "",
        "typelist": "",
        "usecase": "passive",
    })
    if not isinstance(started, list) or len(started) < 2 or started[0] != "SUCCESS":
        raise RuntimeError(f"SpiderFoot could not start the passive scan: {clean_text(started)}")
    scan_id = str(started[1])
    deadline = time.time() + int(os.environ.get("SPIDERFOOT_SCAN_TIMEOUT", "600"))
    status = "STARTED"
    while time.time() < deadline:
        scans = spiderfoot_request(base_url, "/scanlist")
        match = next((row for row in scans if isinstance(row, list) and row and str(row[0]) == scan_id), None)
        if match and len(match) > 6:
            status = str(match[6])
        if status in {"FINISHED", "ABORTED", "ERROR-FAILED"}:
            break
        time.sleep(5)
    if status != "FINISHED":
        raise RuntimeError(f"SpiderFoot scan ended with status {clean_text(status)}")
    rows = spiderfoot_request(base_url, "/scaneventresults", "POST", {"id": scan_id, "eventType": "ALL"})
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
    result = {
        "engine": "spiderfoot",
        "scanStatus": status,
        "eventCounts": dict(event_counts.most_common(80)),
        "modulesReporting": sorted(modules)[:100],
        "publicDomainsObserved": sorted(domains)[:150],
        "limitations": [
            "Only passive modules were requested.",
            "Raw event data and personal identifiers are not returned to the browser.",
            "External modules may be unavailable, rate-limited or require separate API keys.",
        ],
    }
    summary = f"SpiderFoot completed a passive scan with {sum(event_counts.values())} sanitised events across {len(event_counts)} event types."
    return result, summary


def iter_values(value: Any, parent_key: str = ""):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from iter_values(child, str(key))
    elif isinstance(value, list):
        for child in value:
            yield from iter_values(child, parent_key)
    else:
        yield parent_key, value


def run_h8mail(target: str) -> tuple[dict[str, Any], str]:
    if not command_exists("h8mail"):
        raise RuntimeError("h8mail is not installed on the private runner")
    with tempfile.TemporaryDirectory(prefix="matrix-h8mail-") as temp_dir:
        output_path = Path(temp_dir) / "result.json"
        command = ["h8mail", "-t", target, "-j", str(output_path), "--hide"]
        config_path = os.environ.get("H8MAIL_CONFIG", "").strip()
        if config_path:
            command.extend(["-c", config_path])
        completed = run_command(command, timeout=360)
        if not output_path.exists():
            error = clean_text(completed.stderr or completed.stdout or "h8mail did not create JSON output")
            raise RuntimeError(error)
        try:
            payload = json.loads(output_path.read_text(encoding="utf-8", errors="ignore"))
        except json.JSONDecodeError as exc:
            raise RuntimeError("h8mail returned invalid JSON") from exc
    breach_names: set[str] = set()
    sources: set[str] = set()
    numeric_counts: Counter[str] = Counter()
    for key, value in iter_values(payload):
        normal_key = str(key or "").lower()
        if isinstance(value, (int, float)) and any(word in normal_key for word in ("count", "total", "found", "breach")):
            numeric_counts[clean_text(key, 80)] += int(value)
        if isinstance(value, str):
            safe = clean_text(value, 120)
            if not safe or "[redacted" in safe:
                continue
            if any(word in normal_key for word in ("breach", "database", "source", "service")):
                if len(safe) <= 100:
                    breach_names.add(safe)
            if any(word in normal_key for word in ("source", "service")) and len(safe) <= 80:
                sources.add(safe)
    result = {
        "engine": "h8mail",
        "reportedCounts": dict(numeric_counts.most_common(50)),
        "breachOrDatasetNames": sorted(breach_names)[:150],
        "servicesReporting": sorted(sources)[:80],
        "limitations": [
            "Administrator-only summary; raw breach rows are discarded.",
            "Passwords, hashes, emails, phone numbers, IP addresses and credentials are never returned.",
            "A breach reference does not prove the current user controls the address or suffered account compromise.",
        ],
    }
    summary = f"h8mail completed an administrator-only exposure review with {len(breach_names)} sanitised breach or dataset names."
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
    parser.add_argument("--poll-seconds", type=int, default=int(os.environ.get("OSINT_POLL_SECONDS", "10")))
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
