# BEHIND THE CURTAIN — Living Access-Holders

## Permanent mission

The Living Access-Holders system identifies the ten living people with the strongest **current, documented ability to reach major structural controls**. It is subordinate to the structural-power and continuity models: people are temporary; offices, ownership rights, appointment systems, archives, security commands, legal jurisdictions and infrastructure can outlast them.

The ranking is never a claim that ten people secretly rule the world. It is a transparent estimate of current access based on identifiable mechanisms.

## Eligibility

A person may enter only when authoritative evidence confirms both:

1. a current role, office, ownership right or enforceable authority; and
2. a mechanism connecting that person to one or more structural power systems.

Fame, wealth, family name, club membership, religion, nationality, philanthropy, social contact or media attention are never sufficient.

## Score

The Living Access Score totals 100:

| Dimension | Weight |
|---|---:|
| Formal authority | 20 |
| Coercive or security command | 15 |
| Appointment and removal power | 15 |
| Capital allocation authority | 15 |
| Infrastructure or chokepoint control | 10 |
| Privileged information access | 10 |
| Cross-border reach | 10 |
| Continuity leverage | 5 |

Each entry must also show the role, verification date, next review date, structures reached, mechanism, constraints, strongest counterargument, removal triggers and bounded source ledger.

## Evolving operation

The engine reads `data/behind-the-curtain-living-access-intake.json`. Only entries marked `reviewStatus: approved` may alter the public ranking.

Supported changes include:

- role confirmation;
- role or office change;
- bounded score adjustment;
- resignation, removal, death or loss of authority;
- reactivation after verified appointment;
- addition of a newly evidenced candidate;
- source correction or retraction.

Each approved change requires an HTTPS source that states what it establishes and what it does not establish.

## Automatic removal

A person must leave or be suspended from the public Top 10 when evidence establishes:

- the relevant role ended;
- resignation or removal;
- death or incapacity ending the authority;
- transfer of command, voting rights or appointment power;
- source retraction that destroys the evidence basis;
- verification expiry without renewed authoritative evidence.

No person remains because of past fame or prior rank.

## Historical archive

`data/behind-the-curtain-living-access-history.json` preserves every published change. A new snapshot is appended whenever membership, order, role, score or status changes.

A snapshot records:

- date;
- reason;
- rank;
- person;
- current role;
- access score;
- status.

Historical records are never overwritten to make the present conclusion appear inevitable.

## Relationship to families and continuity

The living ranking must be displayed beside:

- the family and dynasty Access Index;
- the ten long-duration continuity mechanisms;
- formal controllers of each structural power system;
- evidence that weakens claims of unified command.

The public conclusion must explain both **who can reach the controls now** and **what mechanism will remain after those people are gone**.

## Red-team boundary

Every ranked person requires the strongest credible counterargument. The system must distinguish:

- formal authority from informal influence;
- institutional assets from personal ownership;
- committee leadership from unilateral command;
- access to information from control of information;
- benefit from causation;
- family continuity from coordinated family rule.

The ranking must change when the evidence changes, including when evidence disproves the site's prior assessment.

## Production boundary

This is a Git-only intelligence product while the production freeze is active. It may rebuild data, page assets and historical records, but it must not invoke Wrangler, Cloudflare deployment or production-dispatch workflows.
