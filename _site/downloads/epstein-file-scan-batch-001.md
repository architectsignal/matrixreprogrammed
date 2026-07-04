# Epstein File Scan Batch 001 — DOJ Library Structure And Court-Record Lanes

Scan date: 2026-07-02

Status: ingested

Mission: scan public Epstein records and convert them into tracker-ready records, tasks, institution lanes, source routes and proof boundaries.

Boundary: Each scan item records what an official or reputable source route shows. It does not infer guilt, relationship type, passenger identity, private victim identity, or wrongdoing beyond the record text.

## Primary sources

- https://www.justice.gov/epstein
- https://www.justice.gov/epstein/doj-disclosures
- https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files

## Records created

1. EFS-001-R001 — DOJ Epstein Library — privacy and search boundary
2. EFS-001-R002 — DOJ Disclosures — Data Sets 1 through 12
3. EFS-001-R003 — DOJ Court Records — consolidated case lane
4. EFS-001-R004 — DOJ FOIA lane — CBP, FBI, BOP and Florida categories
5. EFS-001-R005 — Prior DOJ disclosure lane — first phase, BOP video, Maxwell proffer, memoranda/correspondence
6. EFS-001-R006 — DOJ January 30 production statement — 3 million additional pages and production limits
7. EFS-001-R007 — Court Record lane — Government of the USVI v. JPMorgan Chase Bank, N.A.
8. EFS-001-R008 — Court Record lane — United States v. Epstein, No. 1:19-cr-00490
9. EFS-001-R009 — Court Record lane — United States v. Maxwell, No. 1:20-cr-00330
10. EFS-001-R010 — Data Set 9 file index sample

## New tracker object

- I-011 — JPMorgan Chase Bank, N.A. — banking / compliance / court-record lane. Grade: A for DOJ case-page existence; C for allegations/findings pending file-level review.

## New evidence tasks

- EFT-011 — Review DOJ Data Set 9 page-1 PDFs
- EFT-012 — Review USVI v. JPMorgan DOJ court-record PDFs
- EFT-013 — Review United States v. Epstein DOJ court-record PDFs
- EFT-014 — Review United States v. Maxwell DOJ court-record PDFs
- EFT-015 — Build DOJ disclosure source-route map

## Batch rule

This batch creates source-route records and tasks. It does not make file-level claims until the linked PDFs are opened, classified and converted into verified record cards.
