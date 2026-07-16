# Matrix Reprogrammed Site Intelligence Pipeline Audit

Updated: 2026-07-16T06:00:33.987Z
Overall: working-with-gaps
Green: 40 · Amber: 3 · Red: 0

## Checks

- **GREEN · Collect · collect-latest-drops:** Curated current-source intake exists.
- **GREEN · Collect · collect-seven-day:** Seven-day news intake exists.
- **GREEN · Collect · collect-record-events:** Normalized public-record event feed exists.
- **GREEN · Collect · collect-source-pulls:** Source-pull index exists.
- **AMBER · Collect · freshness-curated-drops:** Curated source file age: 7 day(s). Fix: Run the current-source updater daily and fail the homepage build when the curated source set exceeds seven days.
- **AMBER · Collect · freshness-seven-day-feed:** Seven-day feed file age: 7 day(s). Fix: Run RSS/public-source intake every day and archive items automatically after seven days.
- **GREEN · Collect · fresh-current-news:** 25 news item(s) are inside the active seven-day window. Fix: Keep the homepage empty rather than showing stale news when this count reaches zero.
- **GREEN · Classify · classification-system:** Information-gathering operating model exists.
- **GREEN · Grade · interpretation-standard:** Reader score and evidence interpretation standard exists.
- **GREEN · Grade · source-registry:** Master evidence source registry exists.
- **GREEN · Classify · pipeline-completeness:** 8 collection-to-review pipeline step(s) are declared. Fix: Require collect, classify, grade, cross-check, connect, conclude, publish and review stages.
- **GREEN · Grade · evidence-levels:** 6 evidence/implementation level(s) are declared. Fix: Ensure implementation, convergence and lock-in cannot be inferred from source volume alone.
- **GREEN · Connect · relationship-graph:** Evidence-weighted relationship graph exists.
- **GREEN · Connect · graph-population:** Relationship graph contains 120 node(s) and 172 edge(s). Fix: Rebuild the graph and reject empty deployments.
- **AMBER · Connect · graph-boundaries:** 172 relationship edge(s) lack an explicit grade or boundary field. Fix: Require source IDs, relationship type, evidence grade and association-not-guilt boundary on every edge.
- **GREEN · Conclude · daily-conclusions:** Daily power conclusions exists.
- **GREEN · Conclude · conclusion-engine:** Conclusion engine exists.
- **GREEN · Conclude · daily-command-json:** Daily Command Brief data exists.
- **GREEN · Publish · brief-standard:** Site-wide brief mission standard exists.
- **GREEN · Conclude · daily-missionConclusion:** Daily Command Brief contains its mission conclusion. Fix: Generate mission conclusion from current evidence and canonical timers on every build.
- **GREEN · Conclude · daily-speculativeTrajectory:** Daily Command Brief contains its labelled speculation. Fix: Generate labelled speculation from current evidence and canonical timers on every build.
- **GREEN · Conclude · daily-counterpoint:** Daily Command Brief contains its counterpoint. Fix: Generate counterpoint from current evidence and canonical timers on every build.
- **GREEN · Conclude · daily-practicalMeaning:** Daily Command Brief contains its practical meaning. Fix: Generate practical meaning from current evidence and canonical timers on every build.
- **GREEN · Conclude · daily-conclusionBoundary:** Daily Command Brief contains its claim boundary. Fix: Generate claim boundary from current evidence and canonical timers on every build.
- **GREEN · Publish · brief-coverage:** 107 brief page(s) received the mission interpretation layer. Fix: Apply the final mission lens after all legacy brief generators and audit every brief route.
- **GREEN · Conclude · conclusion-engine-population:** 5 conclusion-engine item(s) exist. Fix: Do not publish an empty conclusion engine.
- **GREEN · Clocks · clock-source:** Canonical risk-clock source exists.
- **GREEN · Clocks · clock-wall:** Evidence-fed clock synthesis exists.
- **GREEN · Clocks · timer-page:** Clean timer page exists.
- **GREEN · Clocks · clock-score-integrity:** 0 clock score mismatch(es) exist between canonical source and visual synthesis. Fix: Never add display bonuses or recalculate scores in the presentation layer.
- **GREEN · Clocks · clock-depth:** 0 clock(s) lack movement, mission relevance, boundary or direct evidence input. Fix: Keep the card clean but require the deeper tab to contain those fields.
- **GREEN · Clocks · source-to-clock-links:** 7 timer-link slug(s) are present in current drops; 0 do not resolve. Fix: Reject source drops that reference a nonexistent clock slug.
- **GREEN · Publish · homepage-command-data:** Homepage command-surface data exists.
- **GREEN · Publish · homepage:** Homepage exists.
- **GREEN · Publish · homepage-clock-sync:** Homepage displays 1 critical clock(s); canonical synthesis requires 1. Fix: Build the homepage from data/clock-wall.json only and use a strict greater-than-90 threshold.
- **GREEN · Publish · homepage-news-freshness:** 0 stale homepage news item(s) exist. Fix: Show only items published inside seven days; show an empty-state message rather than stale content.
- **GREEN · Publish · homepage-conclusion-layer:** Homepage evidence conclusion, labelled speculation and counterpoint are checked together. Fix: Block homepage publication if any of these three fields is missing.
- **GREEN · Automate · build-order-build-mission-brief-conclusions.js:** build-mission-brief-conclusions.js is included in the authoritative build path. Fix: Add build-mission-brief-conclusions.js after legacy generators and before Cloudflare output.
- **GREEN · Automate · build-order-build-homepage-command-surface.js:** build-homepage-command-surface.js is included in the authoritative build path. Fix: Add build-homepage-command-surface.js after legacy generators and before Cloudflare output.
- **GREEN · Automate · build-order-site-intelligence-pipeline-audit.js:** site-intelligence-pipeline-audit.js is included in the authoritative build path. Fix: Add site-intelligence-pipeline-audit.js after legacy generators and before Cloudflare output.
- **GREEN · Automate · build-order-patch-login-email-delivery.js:** patch-login-email-delivery.js is included in the authoritative build path. Fix: Add patch-login-email-delivery.js after legacy generators and before Cloudflare output.
- **GREEN · Automate · daily-automation:** 89 workflow file(s) scanned for daily scheduling. Fix: Keep one canonical daily intake/conclusion/clock workflow and retire overlapping legacy schedules.
- **GREEN · Automate · weekly-automation:** Workflow files were scanned for weekly synthesis scheduling. Fix: Add a weekly delta report that compares score movement, new entities, new contracts, new missing records and downgraded conclusions.

## New Clock Ideas

- **Digital Identity Integration Clock:** Track when identity wallets, biometrics and credentials become required across banking, benefits, health, travel, age verification and online access.
- **Public-Private Governance Clock:** Track when private vendors, foundations, forums and contractors gain operational roles in public policy or essential services.
- **Global Standards Harmonisation Clock:** Track model laws, treaties and standards moving from guidance into domestic law, procurement or technical mandates.
- **Payment Access Control Clock:** Track financial exclusion, identity-linked wallets, programmable compliance, de-banking and platform-payment coupling.
- **Emergency Powers Permanence Clock:** Track temporary war, health, cyber or security powers becoming permanent governance infrastructure.
- **AI Government Dependency Clock:** Track government reliance on a small number of AI, cloud, data and analytics vendors for decisions and public services.
- **Information Gatekeeping Clock:** Track convergence of search, media, moderation, advertising, identity and payment controls.
- **Asset Manager Voting Power Clock:** Track concentration of proxy voting, stewardship mandates and ownership influence among major asset managers.
- **Contractor State Dependency Clock:** Track government dependence on intelligence, defense, logistics, consulting, security and data contractors.
- **Food, Water and Land Control Clock:** Track ownership concentration, traceability mandates, carbon-linked controls and access conditions across essentials.
- **Biometric Border and Mobility Clock:** Track biometric travel, border databases and movement permissions merging with national identity and security systems.
- **Institutional Religion Convergence Clock:** Track direct institutional movement toward shared religious governance or mandatory ethical doctrine while separating dialogue from control.