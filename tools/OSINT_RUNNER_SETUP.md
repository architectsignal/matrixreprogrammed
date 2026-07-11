# Matrix Reprogrammed Private OSINT Runner

The public website does not execute Holehe, SpiderFoot or h8mail inside Cloudflare. It creates encrypted, access-controlled D1 jobs. This private runner polls for one job at a time, executes the selected open-source engine locally and returns a sanitised result.

## Access policy

- Holehe: verified members, five jobs per rolling 24 hours.
- SpiderFoot: verified members, two jobs per rolling 24 hours.
- h8mail: authenticated members whose D1 `role` is `admin`, ten jobs per rolling 24 hours.
- Single email target only.
- Lawful-use and no-minor confirmations required.
- No raw recovery data, passwords, hashes, phone numbers, IP addresses, credentials or breach rows are returned.

## Activation status

The website page, member/admin gates, encrypted D1 queue and private-runner API can deploy before the local runner is online. The tools become operational only after both Worker secrets are configured and this private runner sends a recent heartbeat. The page reports that state truthfully.

## Required Cloudflare secrets

Set these on the `matrixreprogrammed` Worker:

- `OSINT_DATA_KEY`: a long random encryption secret used for AES-GCM target encryption.
- `OSINT_RUNNER_TOKEN`: a long random bearer token shared only with the private runner.

Keep these out of GitHub, browser JavaScript and public logs.

## Install the runner

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r tools/osint-requirements.txt
```

SpiderFoot is intentionally separate because it is a larger application. Run the open-source SpiderFoot service privately, for example from its official Docker image or repository, and bind it to localhost or a private network. Do not expose an unauthenticated SpiderFoot interface to the public internet.

## Environment

```bash
export MATRIX_OSINT_BASE_URL="https://matrixreprogrammed.com"
export MATRIX_OSINT_RUNNER_TOKEN="the-same-secret-as-the-worker"
export MATRIX_OSINT_RUNNER_ID="matrix-private-runner-1"
export SPIDERFOOT_URL="http://127.0.0.1:5001"
# Optional administrator h8mail API configuration file:
export H8MAIL_CONFIG="/private/path/h8mail_config.ini"
```

## Start

```bash
python tools/osint_runner.py
```

For a single polling cycle:

```bash
python tools/osint_runner.py --once
```

The runner sends a heartbeat every polling cycle. The member page reports a tool as online only when a compatible runner has checked in during the previous five minutes.

## Administrator role

The h8mail form appears only when the authenticated member row has `role='admin'`. Set that role directly through the protected D1 administration process. Never expose a public role-upgrade endpoint.

## Evidence boundary

A registration, footprint or breach signal is an investigative lead. It does not establish identity, account ownership, current use, compromise, intent, wrongdoing or criminal conduct. Important conclusions require an independent source and human review.
