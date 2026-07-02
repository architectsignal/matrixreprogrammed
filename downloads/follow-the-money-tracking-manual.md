# Follow The Money Tracking Manual

Updated: 2026-07-02

## Purpose

This manual defines how Matrix Reprogrammed tracks businesses, billionaires, contractors, foundations, asset managers, AI/surveillance companies, lobbyists, public agencies, and revolving-door people.

The goal is not to accuse. The goal is to map public-record power routes.

## Evidence boundary

A tracker record means a source trail exists. It does not mean wrongdoing. Every entry must be labelled by source strength.

### Evidence grades

- A — official contract, procurement notice, SEC filing, annual report, company filing, regulator release, official government page.
- B — court record, parliamentary record, sworn testimony, regulator action, sanctions notice, lobbying disclosure, campaign-finance record.
- C — credible journalism, specialist trade publication, analyst note, investor call coverage.
- D — commentary, analysis, inference, network map, symbolic interpretation.
- X — unsupported, rejected, unverifiable or deliberately excluded claim.

## Business tracker fields

Use this structure for Palantir, contractors, AI companies, asset managers, pharma, media groups, cloud companies, banks and major private firms.

### Identity

- Company name
- Website
- Ticker / exchange if public
- Headquarters
- Founding date
- Founders
- CEO / chair / CFO / CTO
- Board members
- Major subsidiaries
- Parent company
- Key partners
- Key investors
- Major customers

### Money trail

- Revenue
- Government revenue
- Commercial revenue
- Segment revenue
- Contract awards
- Contract ceiling
- Option years
- Prime or subcontractor status
- Procurement vehicle
- Grant funding
- Tax credits / subsidies
- PPP or public-private partnership route
- Related acquisition / merger / spin-off
- Stock movement after news
- Insider sales / purchases

### Contract trail

- Contract title
- Awarding body
- Contract number if available
- Award date
- Start date
- End date
- Ceiling value
- Obligated value
- Description
- Data touched
- Operational use
- Prime contractor
- Subcontractors
- Competing bidders
- Procurement controversy
- Protest / lawsuit
- Renewal risk
- Vendor lock-in risk

### Power route

- Defence capability
- Intelligence capability
- Police capability
- Border / migration capability
- Health data access
- Education data access
- Benefits / welfare data access
- Agriculture / food supply access
- Cloud / compute dependency
- AI model dependency
- Identity / biometrics dependency
- Media / narrative influence
- Financial infrastructure influence

### Risk tags

- defence AI
- surveillance
- data integration
- public health data
- migration / border control
- police analytics
- targeting support
- predictive analytics
- social-media monitoring
- lobbying
- revolving door
- vendor lock-in
- public-private partnership
- foundation influence
- asset-manager ownership
- national security
- sanctions / regulator
- court record
- monopoly / antitrust

## Person tracker fields

Use this structure for billionaires, executives, founders, board members, lobbyists, politicians, advisers, agency officials, foundation heads and revolving-door operators.

### Identity

- Name
- Current role
- Former roles
- Companies founded
- Boards
- Advisory roles
- Citizenship / jurisdiction
- Family office / trust routes when public
- Foundation links
- University / think-tank links

### Wealth and ownership

- Estimated net worth
- Source of wealth
- Public holdings
- Private holdings
- Voting control
- Family/foundation ownership
- Recent stake changes
- Major asset sales
- Stock pledges / margin risk if public
- Dividends
- Major acquisitions

### Influence trail

- Political donations
- PAC / super PAC links
- Lobbying links
- Meetings with public officials
- Policy statements
- Public-private partnership roles
- Foundation grants
- Media ownership
- Platform ownership
- University funding
- Think-tank funding
- NGO funding
- Court / regulator / sanctions records

### Industry exposure

- AI
- defence
- satellites / space
- cloud infrastructure
- health / pharma
- media
- banking / finance
- housing / real estate
- energy
- logistics
- education
- agriculture / food supply
- social media

## Daily update triggers

Create or update a record when any of the following happens:

- New contract or procurement award
- Contract ceiling increase
- Option year activated
- Major partnership announcement
- Government deployment
- Agency migration to a platform
- Court/regulator filing
- Lobbying disclosure
- Political donation or PAC funding
- Foundation grant
- Board appointment
- Executive departure
- Stock movement tied to contract/policy news
- Earnings call revealing government/customer concentration
- Data breach, protest, FOI dispute, parliamentary hearing or investigation
- Major billionaire net-worth movement tied to public holdings
- New public-private partnership
- New AI, surveillance, border, defence or health-data deployment

## Daily update record template

```json
{
  "date": "YYYY-MM-DD",
  "watchLane": "palantir-watch | billionaire-watch | contractor-watch | ai-surveillance-watch | asset-manager-watch | foundation-ngo-watch | revolving-door-watch",
  "entity": "Company or person",
  "event": "What changed",
  "moneyValue": "Amount / ceiling / estimate / unknown",
  "sourceType": "contract | filing | court | regulator | lobbying | campaign finance | credible reporting | commentary",
  "sourceUrl": "https://...",
  "people": ["Names"],
  "counterparties": ["Agencies / firms / foundations"],
  "riskTags": ["defence AI", "health data"],
  "evidenceGrade": "A | B | C | D | X",
  "whyItMatters": "Short explanation",
  "readerRoute": "follow-the-money.html | palantir-watch.html | billionaire-watch.html | evidence-vault.html | power-atlas.html"
}
```

## Palantir-specific capture checklist

- Contract title and agency
- Award ceiling and obligated value
- Product: Gotham, Foundry, AIP, Maven, custom platform or other
- Data touched: defence, health, agriculture, police, border, tax, welfare or other
- Deployment status: pilot, prototype, program of record, enterprise agreement, renewal
- People: Alex Karp, Peter Thiel, Stephen Cohen, Joe Lonsdale, Shyam Sankar, David Glazer and relevant public officials
- Partner firms: cloud provider, consultant, prime/subcontractor, integrator
- Public controversy: privacy, civil liberties, patient data, targeting, border enforcement, vendor lock-in
- Source grade and source link

## Billionaire-specific capture checklist

- Name and wealth-source estimate
- Forbes/Bloomberg movement and date
- Main public holdings
- Control rights / voting power
- Foundation or family office route
- Political donations / PAC activity
- Lobbying or public-policy intervention
- AI / defence / cloud / media / pharma / space / banking exposure
- Contracts involving companies they control or materially influence
- Court/regulator/public controversy signal
- Evidence grade and source link

## Output routes

Every record should route to at least one of:

- Follow The Money hub
- Palantir Watch
- Billionaire Watch
- Evidence Vault
- Power Atlas
- Network Maps
- Live Intel
- Daily Drop
- Black File
- Relevant book page
- Rumble/video script angle

## Reader warning

This tracker maps publicly visible relationships and money routes. It must not claim secret control, criminal conduct or guilt unless supported by high-grade evidence. Where evidence is weak, label it weak.
