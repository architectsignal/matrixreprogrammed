# Public Record Intake Manifest

Updated: 2026-07-04

Matrix Reprogrammed now has a source-first intake layer. The machine should ingest records before claims and should never upgrade a signal into a finding without a primary record route.

## Core rule

A feed route is not proof by itself. It tells the machine where to look. Every item must be graded as proven, charged, documented, conflict, allegation, hypothesis, unsupported claim, or signal only.

## Intake lanes

1. Federal Register policy and rulemaking feed — rules, proposed rules, notices, emergency powers, identity systems, financial rules, security policy and health policy.
2. SEC EDGAR filings — company filings, ownership disclosures, risk factors, material events, subsidiaries, contracts and XBRL facts.
3. CourtListener legal records — lawsuits, opinions, dockets, parties, legal filings and follow-up record requests.
4. USAspending federal awards — contracts, grants, recipients, agencies, awards, emergency spending and public-private control routes.
5. Regulations.gov dockets — agency dockets, public comments, supporting documents and influence campaigns.
6. FEC campaign finance — donors, committees, candidates, independent expenditures and political money routes.
7. Lobbying disclosure — clients, registrants, issue codes, spending totals and policy pressure routes.
8. OFAC sanctions — sanctioned entities, aliases, programs, identifiers and money-control routes.
9. EU TED procurement — tenders, awards, buyers, suppliers, border systems, security contracts and digital infrastructure.
10. UK Companies House — companies, directors, persons with significant control, filings and network routes.
11. World Bank projects — development finance, sectors, implementing agencies, projects and procurement.
12. News signal lane — early warning only. News triggers primary-record searches but does not prove claims alone.

## Daily pull order

1. Policy and emergency power.
2. Money, companies and contracts.
3. Courts, disclosure and sanctions.
4. Political money and lobbying.
5. Global institutional money.
6. Narrative early warning.

## Output routes

- Daily Brain Brief
- Global Risk Clocks
- Power Entity Engine
- Evidence Vault
- Outcome Briefings
- Search V2
- Record Intake Queue
- Black File

## Machine command

Feed records into the system. Separate evidence from hypothesis. Turn missing documents into watch triggers. Turn repeated people and institutions into entity files. Turn entity files into relationship maps. Turn relationship maps into outcome briefings.
