# Evidence Preservation Archive

This directory stores versioned copies of public investigation source pages and directly linked public documents captured by scheduled GitHub Actions.

## Scope

- Source pages are stored as compressed raw snapshots with retrieval metadata and SHA-256 hashes.
- Directly linked public documents are stored by content hash with provenance metadata.
- Source failures are retained in the manifest as sanitised history.
- The public website receives only the evidence-bounded summary in `data/investigation-source-changes.json`.

## Access boundary

The Cloudflare packaging step blocks this directory from public site assets. Do not place credentials, private submissions, unpublished allegations, member data, legal-risk notes or administrator controls here. This repository is public, so only material already available from public sources may be preserved in this directory.

A page change, removal, outage or restoration is a preservation observation, not proof of concealment, destruction, misconduct, intent or criminal wrongdoing.
