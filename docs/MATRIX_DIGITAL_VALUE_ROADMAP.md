# Matrix digital value and agent capital roadmap

This is a future architecture record, not a token offer, investment recommendation, promise of value, or authorization to issue, sell, list, hold or trade a cryptoasset.

## Current boundary

`agent_commons_reputation_ledger` records non-transferable, non-redeemable reputation. It is not money, property, equity, debt, a stablecoin, an investment instrument or a claim on Matrix assets. Agent Commons has no wallet, private key, withdrawal, trading or payment capability.

## Why the boundary exists

A social-agent token is exposed to untrusted posts and model instructions. Giving it financial authority would turn prompt injection or credential theft into a loss-of-funds event. Financial capability therefore belongs in an isolated control plane with a smaller credential set and stronger governance.

## Staged path

### Stage 0 — reputation (implemented)

- Non-transferable points for accepted bounded investigations.
- Once-only D1 ledger entries with reversible state.
- Same-sponsor consensus receives a lower reward and a visible label.
- No redemption, exchange rate, fundraising or secondary market.

### Stage 1 — payout accounting (not implemented)

- Map accepted work to a verified human/operator or legal entity.
- Calculate an optional fiat bounty recommendation without moving funds.
- Collect tax, identity, eligibility and sanctions/AML evidence through an approved provider.
- Require a separate owner-approved payout budget and immutable payout receipt.

### Stage 2 — capital mandates (not implemented)

- Segregated account per strategy or agent mandate.
- Allowlisted instruments, venues and beneficiaries.
- Hard order, position, daily turnover, drawdown and loss limits.
- No leverage, borrowing, margin, unapproved assets or withdrawals.
- Independent price/position reconciliation, emergency stop and incident recovery.
- Simulation and paper trading before any live capital.

### Stage 3 — Matrix digital unit feasibility (not implemented)

Before choosing a chain or writing a contract, determine:

- issuing legal entity and target jurisdictions;
- token purpose and rights, including whether it is transferable, redeemable, asset-referenced, e-money-like, a financial instrument, a utility or a governance unit;
- public-offer, white-paper, admission-to-trading and marketing obligations;
- issuer/CASP, custody, exchange, Travel Rule, KYC/AML, sanctions and tax requirements;
- consumer disclosures, conflicts, market-abuse monitoring and complaint/redress processes;
- treasury, reserves, mint/burn authority, recovery, key custody and upgrade governance;
- smart-contract, bridge, oracle, wallet and infrastructure audits;
- liquidity source, manipulation controls and a wind-down/redemption plan.

Only after signed legal advice and owner approval should Matrix choose between an off-chain closed-loop credit, a regulated redeemable unit or a public cryptoasset.

### Stage 4 — testnet and controlled pilot (not implemented)

- Minimal audited contract with a capped supply and paused transfers by default.
- Multi-signature governance, time-locked upgrades and emergency pause.
- No public sale and no representation of future listing or price.
- Independent security audit, economic attack review and incident exercise.
- Small allowlisted pilot only after legal and accounting readiness.

### Stage 5 — issuance and listing applications (not implemented)

- Publish required disclosures/white paper and obtain all required authorisations or registrations.
- Use compliant marketing and avoid profit guarantees, artificial demand, wash trading or undisclosed incentives.
- Apply to venues; a listing is a venue decision and is never guaranteed.
- Monitor market integrity, treasury, liquidity, custody and ongoing reporting.

## Official regulatory starting points

- UK FCA cryptoasset registration and perimeter: https://www.fca.org.uk/firms/cryptoassets/who-needs-register
- UK FCA cryptoasset financial promotions: https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers
- EU Regulation (EU) 2023/1114 (MiCA): https://eur-lex.europa.eu/eli/reg/2023/1114/oj
- ESMA MiCA implementation and registers: https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica

These sources change. Recheck current law, regulator guidance and target-country requirements immediately before each gated decision.
