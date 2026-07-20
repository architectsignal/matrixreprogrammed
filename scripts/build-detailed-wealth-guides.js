const fs = require('fs');
const path = require('path');

const root = process.cwd();
const full = rel => path.join(root, rel);
const ensure = rel => fs.mkdirSync(full(rel), { recursive: true });
const read = rel => { try { return fs.readFileSync(full(rel), 'utf8'); } catch { return ''; } };
const readJson = rel => { try { return JSON.parse(read(rel)); } catch { return null; } };
const write = (rel, value) => { ensure(path.dirname(rel)); fs.writeFileSync(full(rel), value); };
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const today = new Date().toISOString().slice(0, 10);
const generatedAt = new Date().toISOString();

const S = (title, lines) => ({ title, lines });
const C = text => `[ ] ${text}`;
const N = (n, text) => `${n}. ${text}`;
const clean = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, ' - ')
  .replace(/\u2192/g, ' -> ')
  .replace(/\u2022/g, ' - ')
  .replace(/\u20AC/g, 'EUR ')
  .replace(/\u00A0/g, ' ')
  .replace(/[^\x20-\x7E\n]/g, '')
  .replace(/[ \t]+/g, ' ')
  .trim();
const pdfEscape = value => clean(value).replace(/[\\()]/g, char => `\\${char}`);
const wrap = (value, width = 86) => {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
};

const official = {
  amfChecks: ['AMF - Verify an authorisation', 'https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/faire-les-verifications'],
  amfBlacklists: ['AMF - Blacklists and warnings', 'https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-noires-et-mises-en-garde'],
  regafi: ['REGAFI - Regulated financial firms register', 'https://www.regafi.fr/'],
  orias: ['ORIAS - Intermediary register', 'https://www.orias.fr/'],
  serviceBusiness: ['Entreprendre.Service-Public.fr - Business creation', 'https://entreprendre.service-public.fr/'],
  franceFormalities: ['French business formalities portal', 'https://formalites.entreprises.gouv.fr/'],
  bpifrance: ['Bpifrance Creation', 'https://bpifrance-creation.fr/'],
  micro2026: ['French Economy Ministry - Micro-enterprise 2026', 'https://www.economie.gouv.fr/entreprises/gerer-sa-micro-entreprise/comment-creer-une-micro-entreprise'],
  microTax2026: ['French Economy Ministry - Micro-enterprise income declarations', 'https://www.economie.gouv.fr/entreprises/gerer-sa-micro-entreprise/micro-entrepreneurs-comment-declarer-vos-revenus'],
  microSocial2026: ['French Economy Ministry - Micro social contributions 2026', 'https://www.economie.gouv.fr/entreprises/gerer-sa-micro-entreprise/micro-entreprises-quel-est-le-montant-de-vos-cotisations-sociales'],
  impotsPea: ['impots.gouv.fr - Assurance-vie and PEA', 'https://www.impots.gouv.fr/particulier/lassurance-vie-et-le-pea-0'],
  impotsCapital: ['impots.gouv.fr - Investment income', 'https://www.impots.gouv.fr/particulier/les-revenus-mobiliers'],
  bofipBands: ['BOFiP - French income tax bands', 'https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407'],
  sec: ['SEC EDGAR', 'https://www.sec.gov/edgar/search/'],
  esma: ['ESMA investor information', 'https://www.esma.europa.eu/investor-corner'],
  ecb: ['European Central Bank statistics', 'https://data.ecb.europa.eu/'],
  eurostat: ['Eurostat', 'https://ec.europa.eu/eurostat/'],
  oecdEmployment: ['OECD Employment', 'https://www.oecd.org/employment/'],
  ieaInvestment: ['IEA World Energy Investment', 'https://www.iea.org/reports/world-energy-investment-2026'],
  ieaGrid: ['IEA Electricity 2026 - Grids', 'https://www.iea.org/reports/electricity-2026/grids'],
  stanfordAi: ['Stanford AI Index 2026', 'https://hai.stanford.edu/ai-index/2026-ai-index-report'],
  insee: ['INSEE', 'https://www.insee.fr/'],
  banqueFrance: ['Banque de France', 'https://www.banque-france.fr/']
};

function sourceLines(entries) {
  return entries.map(([name, url], index) => `${index + 1}. ${name} - ${url}`);
}

const commonSections = guide => [
  S('How to use this guide', [
    `Purpose: ${guide.outcome}`,
    `Best reader: ${guide.audience}`,
    'Read the guide once without taking action. On the second pass, complete the checklists and write down the evidence supporting each decision.',
    'Replace every example number with your own verified amount, date, fee, tax treatment, contract term or source document.',
    'Do not treat a checklist tick as proof. Keep copies of the underlying statements, quotations, filings, contracts and calculations.',
    'For major decisions, use this guide to prepare better questions for a regulated adviser, accountant, lawyer, lender or insurer.'
  ]),
  S('Evidence standard', [
    'Tier 1: law, regulator, tax authority, court, audited accounts, official product document or signed contract.',
    'Tier 2: recognised institutional research that states its methodology, date and limitations.',
    'Tier 3: reputable reporting used to identify questions, not to replace primary evidence.',
    'Tier 4: marketing, social posts, testimonials, screenshots and anonymous claims. Treat these as unverified leads.',
    'Write the source date beside every changing figure. A correct figure without a date can become misleading.',
    'Separate facts, estimates, assumptions and scenarios. Never allow a scenario to be presented as a forecast or guarantee.',
    'A company, fund, adviser, trust, structure, transaction or association is not proof of misconduct.'
  ]),
  S('Decision record worksheet', [
    C('State the decision in one sentence.'),
    C('State the desired result and deadline.'),
    C('List the three strongest pieces of supporting evidence.'),
    C('List the three strongest reasons the decision may fail.'),
    C('Record the maximum acceptable loss of money, time and flexibility.'),
    C('Record the smallest reversible test.'),
    C('Name the person responsible for checking legal, tax or regulatory consequences.'),
    C('Set the next review date and the evidence that would cause you to stop.')
  ]),
  S('Professional advice triggers', [
    'Seek regulated investment advice when product suitability, risk capacity, pensions, insurance or a large portfolio decision is unclear.',
    'Seek tax advice before changing residence, extracting company cash, transferring assets, using trusts, gifting substantial sums or entering cross-border arrangements.',
    'Seek legal advice before signing guarantees, shareholder agreements, acquisition contracts, complex leases, loan security or beneficiary arrangements.',
    'Seek accounting advice when turnover, VAT, payroll, inventory, multiple activities or company-group transactions become material.',
    'Use a defined written question. Paying for broad reassurance without documents or calculations rarely produces a useful answer.'
  ]),
  S('Subject focus map', [
    'Use the following subject anchors as named checkpoints. For each checkpoint, record the fact, source, date, assumption, decision and next review date.',
    ...guide.markers.map(subjectMarker => `${subjectMarker}: define what this checkpoint means for this guide, what evidence supports it, and what result would cause you to change course.`),
    'Do not mark a checkpoint complete because an action was taken. Mark it complete only when the result and supporting evidence have been recorded.',
    'Where a checkpoint depends on another person, institution, platform or contract, record that dependency and a fallback route.',
    'Rank checkpoints by potential harm if ignored, not by how interesting or easy they appear.',
    'At the end of each review, choose one checkpoint to advance and one risk to reduce before adding a new objective.'
  ]),
  S('Worked decision case', [
    'Write a real decision from your own situation at the top of a blank page. Examples include changing work, launching an offer, choosing an account, buying an asset, restructuring a business or rejecting a proposal.',
    'Baseline: state the current cash, income, liabilities, commitments, ownership, legal position and time available. Use documents rather than memory where possible.',
    'Desired result: describe the measurable outcome, deadline and reason. Remove vague language such as more, better, passive, safe or guaranteed.',
    'Options: include the proposed action, a smaller reversible test, a diversified alternative, delaying the action and doing nothing.',
    'Evidence: attach at least three independent sources. Identify which evidence is official, contractual, audited, estimated, promotional or missing.',
    'Economics: show setup cost, recurring cost, cash timing, fees, tax reserve, downside loss, opportunity cost and the point at which the decision becomes worthwhile.',
    'Risk: identify concentration, liquidity, legal, operational, fraud, health, relationship and behavioural risks. Name the risk that could create irreversible harm.',
    'Professional review: write the exact question that requires an accountant, lawyer, regulated adviser, lender, insurer or technical specialist.',
    'Decision: state proceed, test, delay or reject. Record the maximum commitment and the evidence required before any further commitment.',
    'Review: set a dated checkpoint. Write the result that would confirm the decision, the result that would require adjustment and the result that would trigger an immediate stop.'
  ]),
  S('90-day implementation workbook', [
    'Week 1 - Establish the baseline. Reconcile the relevant accounts, contracts, statements, fees, tax records, responsibilities and deadlines.',
    'Week 2 - Define the result. Choose one measurable outcome and remove actions that do not directly support it or protect an essential risk.',
    'Week 3 - Gather primary evidence. Use official registers, filings, signed terms, current quotations and dated institutional data.',
    'Week 4 - Compare alternatives. Include a lower-cost option, a lower-risk option, a reversible test and the option to wait.',
    'Week 5 - Model the economics. Build downside, base and upside cases while treating every uncertain input as an assumption.',
    'Week 6 - Verify identity and authority. Confirm who owns, controls, advises, holds money, signs contracts and bears liability.',
    'Week 7 - Run the smallest useful test. Limit money, time and legal commitment while collecting evidence about real demand or performance.',
    'Week 8 - Reconcile actual results. Compare promised, expected and actual cost, time, cash flow, quality, risk and customer or counterparty behaviour.',
    'Week 9 - Repair the constraint. Improve the single factor currently limiting income, retention, safety, liquidity, delivery or evidence quality.',
    'Week 10 - Install controls. Add calendar reminders, approval limits, account separation, written procedures, backups and review ownership.',
    'Week 11 - Decide whether to scale. Increase commitment only when the test produced measurable value and the downside remains affordable.',
    'Week 12 - Complete the evidence file. Store the decision record, sources, calculations, contracts, results, lessons and next review date.',
    'Day 90 - Write a one-page conclusion: what was established, what remains uncertain, what changed, what will continue and what will stop.'
  ]),
  S('Review, escalation and stop rules', [
    'Review monthly when the decision affects recurring cash, debt, customer commitments, investment contributions or essential protection.',
    'Review immediately after a material legal change, tax notice, contract change, security incident, missed payment, large loss, health event or relationship change.',
    'Escalate to a qualified professional when the facts cross jurisdictions, involve regulated products, create personal guarantees, affect beneficiaries or cannot be reversed cheaply.',
    'Pause when required documents are missing, identities cannot be independently verified, costs are unclear or the counterparty resists reasonable due diligence.',
    'Stop when the action requires deception, undeclared income, false invoices, hidden beneficial ownership, unaffordable leverage or essential-living money.',
    'Stop when actual cash use, delivery time or loss exceeds the written limit.',
    'Stop when the central evidence is corrected, withdrawn, contradicted by a stronger source or no longer current.',
    'Do not move a stop limit merely because money, pride or time has already been committed. Sunk cost is not evidence that continuing is rational.',
    'Record every exception to the plan, who approved it and why. Repeated exceptions indicate the plan or control is not working.',
    'A stopped action can still be a successful decision when it prevents a larger loss and preserves the ability to act later.'
  ]),
  S('Evidence and legal boundary', [
    'This is educational information, not personalised financial, investment, legal, accounting or tax advice.',
    'Investments can fall in value. Businesses can fail. Debt, leverage, illiquidity, tax and legal obligations can create losses greater than the expected benefit.',
    'Rules and thresholds change. Verify the current official position on the date of action.',
    'Never use false invoices, hidden ownership, undeclared income, sham transactions, misleading applications or borrowed essential-living money.',
    'No return, saving, valuation, tax outcome or business result is guaranteed.'
  ]),
  S('Official research routes', sourceLines(guide.sources))
];

const guides = [
  {
    slug: 'start-from-zero',
    title: 'Start From Zero - 30-Day Wealth Creation Sprint',
    subtitle: 'A day-by-day system to stabilise cash, create an offer, make first sales and build the first reserve.',
    audience: 'A reader with little or no investable capital who needs reliable surplus cash before investing.',
    outcome: 'Finish 30 days with a complete cash map, one tested income offer, a repeatable outreach process and a protected first reserve.',
    markers: ['DAY 1', 'FIRST PAID TEST', 'SURVIVAL NUMBER', '30-DAY SCORECARD'],
    sources: [official.serviceBusiness, official.bpifrance, official.oecdEmployment, official.insee, official.banqueFrance],
    sections: [
      S('The zero-capital rule', [
        'When investable capital is zero, the immediate objective is not a speculative return. It is dependable positive monthly cash flow.',
        'Protect housing, food, energy, transport, health, essential insurance and minimum debt obligations before optional spending.',
        'Do not buy courses, equipment, stock or advertising until a real customer problem and a credible payment route have been tested.',
        'Use existing skills, tools, relationships and local demand before creating a capital-heavy plan.',
        'Measure progress in conversations, offers, paid tests, delivery quality and retained cash - not followers or vague interest.'
      ]),
      S('Days 1-3 - Calculate the survival number', [
        N(1, 'List every source of cash available today and its access restrictions.'),
        N(2, 'List essential monthly costs and the date each leaves the account.'),
        N(3, 'List every debt balance, interest rate, minimum payment and arrears consequence.'),
        N(4, 'Calculate the survival number: essential monthly costs plus minimum contractual payments.'),
        N(5, 'Calculate the cash gap: survival number minus dependable after-tax income.'),
        C('Cancel, pause or renegotiate one cost that does not protect health, security or earning ability.'),
        C('Create separate spaces for bills, tax, operating cash and emergency savings.')
      ]),
      S('Days 4-6 - Build the skill and asset inventory', [
        'List work completed successfully, problems solved, equipment owned, licences held, languages spoken and local access advantages.',
        'Ask: what result can be delivered within seven days without buying material stock?',
        'Rank possible offers by urgent demand, proof of ability, delivery speed, gross margin and legal simplicity.',
        'Reject offers requiring regulated advice, unsafe work, unlicensed activity or hidden upfront costs.',
        C('Choose one primary offer and one backup offer.'),
        C('Write one proof statement using a real result, qualification, work sample or demonstration.')
      ]),
      S('Day 7 - Write the first offer', [
        'Offer formula: I help [specific buyer] achieve [specific result] within [time] for [clear price or pricing method].',
        'Define what is included, what is excluded, delivery date, payment timing, cancellation rule and customer responsibility.',
        'Create a small paid test that is valuable on its own and does not depend on future upselling.',
        'Price from labour, materials, travel, platform fees, tax reserve, rework risk and target contribution - not from fear.',
        C('A stranger can understand the offer in 20 seconds.'),
        C('The buyer can say yes without signing a complex long-term commitment.')
      ]),
      S('Week 2 - The first 50 conversations', [
        'Build a named list of 50 buyers, employers, partners or referrers who genuinely fit the offer.',
        'Contact ten per working day using a short personal message tied to a visible need.',
        'Outreach structure: observation, relevant result, small offer, clear question, easy refusal.',
        'Track sent, opened, replied, conversation, quote, sale and reason lost.',
        'Follow up twice with new information. Do not repeatedly pressure a silent prospect.',
        C('Complete at least five real discovery conversations.'),
        C('Ask what the buyer currently does, what it costs and what would make change worthwhile.')
      ]),
      S('The first paid test', [
        'Collect the agreed payment or deposit through a documented method before committing significant delivery cost.',
        'Confirm scope in writing and record changes before doing extra work.',
        'Deliver exactly what was promised, then record actual hours, expenses, defects and customer questions.',
        'Ask for permission to use a factual testimonial or anonymised result.',
        'Request one introduction to a similar buyer only after successful delivery.',
        'If the test loses money, identify whether the problem was price, scope, process, demand or customer selection.'
      ]),
      S('Week 3 - Turn work into a system', [
        'Create a delivery checklist that another competent person could follow.',
        'Create reusable quotation, invoice, onboarding, reminder and completion templates.',
        'Identify the constraint: leads, conversion, delivery capacity, quality, collection or margin.',
        'Improve only the current constraint rather than adding unrelated services.',
        'Set a maximum number of simultaneous jobs to protect quality and cash.',
        C('Record one standard operating procedure.'),
        C('Remove one task that adds cost but no customer value or compliance protection.')
      ]),
      S('Week 4 - Create the first reserve', [
        'Separate tax and social-charge money immediately; it is not spendable profit.',
        'Direct the first retained surplus toward a starter reserve before speculative investing.',
        'A practical first target is the smaller of one essential monthly bill cycle or a clearly defined emergency amount.',
        'Attack expensive debt where the guaranteed interest saving exceeds realistic low-risk alternatives, subject to contract terms.',
        'Only begin investing after essential bills, urgent arrears and basic liquidity are protected.',
        C('Set an automatic transfer on income day.'),
        C('Write a rule for when the reserve may be used and how it will be rebuilt.')
      ]),
      S('30-day scorecard', [
        'Cash map completed: yes/no.',
        'Costs cancelled or renegotiated: number and monthly saving.',
        'Named prospects contacted: target 50 or more.',
        'Discovery conversations: target 5 or more.',
        'Written offers sent: target 3 or more.',
        'Paid tests completed: target at least 1.',
        'Actual contribution after direct costs: record the amount.',
        'Tax reserve created: yes/no.',
        'Emergency reserve balance: record the amount.',
        'Next 30-day constraint: choose one.'
      ]),
      S('Stop and change direction when', [
        'The activity is unlawful, unsafe, uninsured where insurance is required, or outside your competence.',
        'Customers consistently value the result below the true delivery cost.',
        'The offer depends on deception, spam, false scarcity or unprovable claims.',
        'Payment delays make the cash cycle impossible to finance safely.',
        'After a defined number of qualified conversations, the same objection shows the problem is weak or badly targeted.'
      ])
    ]
  },
  {
    slug: 'wealth-roadmap',
    title: 'The 12-Stage Wealth Creation Roadmap',
    subtitle: 'A stage-gated operating system from earning power to transfer, governance and reinvestment.',
    audience: 'Anyone who wants to diagnose the next correct wealth-building stage instead of copying an advanced strategy too early.',
    outcome: 'Identify the current stage, pass its evidence gate and build a sequenced 12-month plan.',
    markers: ['STAGE 1 - EARN', 'STAGE 12 - GIVE OR REINVEST', 'STAGE GATE', 'WEALTH OPERATING SYSTEM'],
    sources: [official.banqueFrance, official.eurostat, official.oecdEmployment, official.amfChecks, official.serviceBusiness],
    sections: [
      S('The stage-gate principle', [
        'Wealth strategies fail when the reader jumps to investing, structures or tax optimisation before income, cash control and resilience exist.',
        'A stage is passed by evidence: a measured surplus, funded reserve, controlled debt, written policy or verified legal arrangement.',
        'You may work on several stages at once, but one stage should be the current constraint.',
        'The roadmap is cyclical. A job loss, business failure, divorce, illness or market loss may move a household back to an earlier stage.'
      ]),
      S('Stage 1 - Earn', [
        'Objective: increase dependable after-tax cash inflow through employment, skills, sales, services or business.',
        'Core metric: dependable monthly income and its concentration by employer or customer.',
        'Stage gate: income reliably covers essential costs and minimum contractual obligations.',
        'Next action: choose one measurable route to improve income within 90 days.'
      ]),
      S('Stage 2 - Keep', [
        'Objective: reduce avoidable fees, interest, penalties, waste and lawful tax leakage.',
        'Core metric: retained cash as a percentage of gross cash inflow.',
        'Stage gate: every recurring outflow has a purpose, owner, review date and cancellation route.',
        'Next action: complete the Money Leakage Audit and recover the three largest controllable leaks.'
      ]),
      S('Stage 3 - Save', [
        'Objective: create liquidity that prevents ordinary shocks from becoming expensive debt.',
        'Core metric: months of essential expenditure held in appropriate accessible reserves.',
        'Stage gate: a starter emergency reserve is funded and contributions occur automatically.',
        'Next action: separate emergency money from spending and investment money.'
      ]),
      S('Stage 4 - Protect', [
        'Objective: transfer catastrophic risks that the household or business cannot absorb.',
        'Core metric: uncovered exposure to health, liability, property, disability, death, cyber and business interruption.',
        'Stage gate: essential insurance, beneficiaries, emergency access and key documents have been reviewed.',
        'Next action: build a one-page risk map before buying additional products.'
      ]),
      S('Stage 5 - Invest', [
        'Objective: own diversified productive assets matched to a goal and time horizon.',
        'Core metric: contribution rate, total cost, diversification and deviation from written policy.',
        'Stage gate: emergency cash and expensive debt are controlled; the investor understands product, custody, fees and loss capacity.',
        'Next action: write a one-page investment policy before selecting a product.'
      ]),
      S('Stage 6 - Own', [
        'Objective: increase ownership of equity, business systems, property or intellectual property rather than relying only on labour income.',
        'Core metric: percentage of net worth represented by productive assets and the cash flow they can support.',
        'Stage gate: ownership records, liabilities, valuation method and exit constraints are documented.',
        'Next action: identify one productive asset that fits available time, capital and competence.'
      ]),
      S('Stage 7 - Build', [
        'Objective: create repeatable products, processes, customer acquisition and recurring value.',
        'Core metric: contribution margin, repeat sales, retention, capacity and owner dependence.',
        'Stage gate: delivery is documented and the economics remain positive after realistic owner labour.',
        'Next action: systemise the highest-frequency profitable process.'
      ]),
      S('Stage 8 - Scale', [
        'Objective: grow a proven model without destroying cash, quality or control.',
        'Core metric: growth-adjusted cash runway, customer acquisition payback, working capital and defect rate.',
        'Stage gate: the base model is profitable, measured and operationally stable before new fixed cost is added.',
        'Next action: define one scaling experiment with a loss limit.'
      ]),
      S('Stage 9 - Diversify', [
        'Objective: reduce dependence on one employer, customer, asset, bank, supplier, country or legal structure.',
        'Core metric: largest concentration as a percentage of income, profit, assets and liquidity.',
        'Stage gate: catastrophic single points of failure are identified and actively reduced.',
        'Next action: diversify the risk that could force a sale or destroy essential income.'
      ]),
      S('Stage 10 - Compound', [
        'Objective: reinvest gains, raise contributions, control turnover and allow time to work.',
        'Core metric: reinvestment rate, contribution growth, fee drag, tax drag and years maintained.',
        'Stage gate: a written rule determines reinvestment, withdrawals and rebalancing.',
        'Next action: increase the dependable contribution before seeking more risk.'
      ]),
      S('Stage 11 - Transfer', [
        'Objective: make ownership, authority, beneficiaries and succession executable rather than assumed.',
        'Core metric: percentage of assets with current ownership records, beneficiary instructions and accessible documentation.',
        'Stage gate: wills, nominations, mandates, company records and emergency instructions have been professionally reviewed where needed.',
        'Next action: create an asset and access register without exposing sensitive credentials.'
      ]),
      S('Stage 12 - Give or reinvest', [
        'Objective: direct surplus toward family security, philanthropy, new ventures or long-term productive capital.',
        'Core metric: allocation of surplus against a written purpose and risk budget.',
        'Stage gate: giving or reinvestment does not impair essential liquidity, tax compliance or existing obligations.',
        'Next action: write the purpose, amount, evidence standard and review process.'
      ]),
      S('Annual wealth operating system', [
        'Monthly: reconcile cash, debt, contributions and unusual transactions.',
        'Quarterly: review income concentration, business economics, portfolio allocation and next-stage constraint.',
        'Annually: update net worth, insurance, tax planning, beneficiaries, fees, structures and professional advice questions.',
        'After major life events: rerun all 12 stage gates immediately.',
        C('Name the current stage.'), C('Name the blocking evidence.'), C('Name the next 90-day action.')
      ])
    ]
  },
  {
    slug: 'where-money-is-going',
    title: 'Where the Money Is Going - Capital Flow Field Guide',
    subtitle: 'How to trace public and private capital without confusing investment themes with investment returns.',
    audience: 'Readers researching sectors, careers, businesses or investments influenced by major capital expenditure and policy flows.',
    outcome: 'Build a dated capital-flow dashboard and translate it into research questions rather than automatic buy signals.',
    markers: ['CAPITAL FLOW STACK', 'FLOW IS NOT RETURN', 'GRID BOTTLENECK', 'CAPITAL-FLOW DASHBOARD'],
    sources: [official.ieaInvestment, official.ieaGrid, official.stanfordAi, official.ecb, official.eurostat, official.sec],
    sections: [
      S('Flow is not return', [
        'Capital entering a sector can create revenue, jobs and infrastructure while investors still receive poor returns because valuation, competition or financing costs are excessive.',
        'Separate money committed, money spent, revenue recognised, free cash flow generated and investor return realised.',
        'A government announcement is not the same as an appropriated budget, awarded contract, completed project or paid invoice.',
        'A fund inflow may reflect passive index mechanics rather than new fundamental conviction.'
      ]),
      S('The capital flow stack', [
        'Level 1 - Policy: laws, tax credits, procurement targets, guarantees, sanctions and industrial strategy.',
        'Level 2 - Financing: public budgets, bank lending, bond issuance, venture funding, private equity and project finance.',
        'Level 3 - Orders: signed contracts, equipment orders, grid connections, leases and customer commitments.',
        'Level 4 - Build: factories, data centres, grids, mines, pipelines, software deployment and workforce training.',
        'Level 5 - Economics: utilisation, pricing, margins, cash conversion, maintenance and replacement demand.',
        'Level 6 - Ownership return: dividends, buybacks, debt reduction, dilution, valuation and exit price.'
      ]),
      S('AI compute and data centres', [
        'Track hyperscaler capital expenditure, semiconductor supply, networking, cooling, data-centre construction and power contracts.',
        'Ask whether revenue growth and utilisation justify the capital intensity.',
        'Map second-order beneficiaries: electrical equipment, engineering, land, fibre, cooling, backup power and security.',
        'Primary risks: overbuild, rapid chip obsolescence, customer concentration, energy constraints and valuation.'
      ]),
      S('Electricity grids, storage and transformers', [
        'Track regulated utility capital plans, connection queues, transformer lead times, permitting and financing costs.',
        'Grid spending can be durable but returns depend on regulatory frameworks, allowed returns and execution.',
        'Distinguish generation capacity from deliverable power at the required location and time.',
        'Primary risks: project delay, political pricing, interest rates, supply bottlenecks and cost overruns.'
      ]),
      S('Energy security and domestic capacity', [
        'Track long-term power contracts, strategic reserves, nuclear life extensions, renewable auctions, gas infrastructure and domestic manufacturing.',
        'Identify who bears construction, commodity and policy risk.',
        'Do not assume energy security policy removes commodity cycles or project failure.',
        'Map skilled trades, engineering and local service demand as well as securities.'
      ]),
      S('Cybersecurity, identity and verification', [
        'Track regulatory requirements, insurance conditions, breach costs, recurring revenue, retention and platform consolidation.',
        'Distinguish essential security spend from crowded product categories.',
        'Look for renewal rates, net retention, customer concentration and sales efficiency.',
        'Primary risks: product obsolescence, platform bundling, valuation and reputational failure.'
      ]),
      S('Robotics and industrial automation', [
        'Track orders, backlog, deployment time, service revenue, productivity evidence and customer payback.',
        'Separate demonstrations from reliable production deployments.',
        'Map components: sensors, motion, machine vision, software, integration, maintenance and safety.',
        'Primary risks: long sales cycles, capex sensitivity, integration failure and weak unit economics.'
      ]),
      S('Healthcare, ageing and resilient infrastructure', [
        'Track demographics, reimbursement, capacity shortages, public budgets, clinical evidence and workforce constraints.',
        'Healthcare demand can be structural while individual biotechnology investments remain binary and high risk.',
        'Infrastructure themes require evidence of funding, procurement and execution rather than need alone.',
        'Primary risks: regulation, reimbursement, patent expiry, litigation and political price control.'
      ]),
      S('Translate flows into personal opportunity', [
        'Career route: identify scarce skills required across several projects rather than one employer.',
        'Business route: identify recurring operational problems created by the investment wave.',
        'Supplier route: map procurement requirements, qualification, insurance and payment cycles.',
        'Investment route: compare diversified exposure, valuation, fees, concentration and time horizon.',
        'Local route: map land, construction, housing, transport and service demand without assuming every boom is durable.'
      ]),
      S('Capital-flow dashboard', [
        C('Policy source and effective date recorded.'),
        C('Financing committed versus spent separated.'),
        C('Named contracts or orders identified.'),
        C('Capacity under construction versus operating separated.'),
        C('Revenue, margin and free cash flow trend recorded.'),
        C('Valuation and financing risk recorded.'),
        C('What would falsify the thesis written in advance.'),
        C('Next source-update date scheduled.')
      ])
    ]
  },
  {
    slug: 'opportunity-radar',
    title: 'Opportunity Radar - Research Before You Invest',
    subtitle: 'A complete evidence funnel for sectors, companies, funds, property and private opportunities.',
    audience: 'A reader evaluating an opportunity who needs a disciplined research memo before committing money.',
    outcome: 'Produce a sourced opportunity memo containing thesis, valuation, risks, alternatives, loss capacity and stop conditions.',
    markers: ['OPPORTUNITY FUNNEL', 'PRE-MORTEM', 'VALUATION IS A CONDITION', 'INVESTMENT MEMO'],
    sources: [official.amfChecks, official.esma, official.sec, official.ecb, official.eurostat, official.banqueFrance],
    sections: [
      S('The opportunity funnel', [
        'Screen broadly, investigate narrowly and commit only after the opportunity survives evidence, suitability, valuation and fraud checks.',
        'Separate an attractive theme from an attractive security, property, business or contract.',
        'Define the opportunity in one sentence without promotional language.',
        'State the expected economic mechanism: who pays whom, why, when and from what cash source.'
      ]),
      S('Step 1 - Suitability before excitement', [
        'State goal, time horizon, liquidity need, tax position, existing concentration and maximum tolerable loss.',
        'Reject any opportunity that requires essential cash, emergency reserves or unaffordable leverage.',
        'Record whether the asset can be valued and exited under stress.',
        'Compare the opportunity with doing nothing, repaying debt and a diversified alternative.'
      ]),
      S('Step 2 - Evidence hierarchy', [
        'Start with official product documents, audited accounts, regulator records, contracts, title records or tax documents.',
        'Reconcile promotional claims against cash flow, balance sheet and legal rights.',
        'Record missing documents as missing evidence, not as evidence of fraud or safety.',
        'Verify identity, authorisation, custody and bank details independently.'
      ]),
      S('Step 3 - Sector and demand', [
        'Define customer, problem, market size method, growth drivers, substitutes and cyclicality.',
        'Ask whether demand is discretionary, regulated, subsidised, contractual or essential.',
        'Identify the bottleneck and whether the opportunity truly owns or solves it.',
        'Look for capacity expansion that may destroy pricing despite rising demand.'
      ]),
      S('Step 4 - Business and cash economics', [
        'Trace revenue to gross profit, operating cash flow, capital expenditure, debt service and free cash flow.',
        'Identify dilution, off-balance-sheet commitments, working-capital dependence and customer concentration.',
        'For property, model vacancy, works, tax, insurance, finance and exit costs.',
        'For private business, reconcile accounts to bank evidence and tax filings.'
      ]),
      S('Step 5 - Management, control and incentives', [
        'Map voting control, board independence, compensation, related-party transactions and capital allocation history.',
        'Do not infer competence from charisma or wealth.',
        'Check whether management benefits when ordinary owners lose through dilution, fees or preferential rights.',
        'Record key-person risk and succession.'
      ]),
      S('Step 6 - Valuation is a condition', [
        'A good asset can be a poor purchase at an excessive price.',
        'Use more than one valuation lens and show assumptions rather than presenting a single precise answer.',
        'Stress revenue, margin, financing cost, exit multiple and time delay.',
        'Compare expected return with a lower-cost diversified alternative after fees and tax.'
      ]),
      S('Step 7 - Risk map', [
        'Market, credit, liquidity, operational, legal, tax, regulatory, technology, concentration, fraud and behavioural risk must be separate.',
        'Rate probability, impact, detectability and mitigation for each material risk.',
        'Identify risks that cannot be diversified or insured.',
        'Write the maximum position or commitment consistent with loss capacity.'
      ]),
      S('Pre-mortem and falsification', [
        'Assume the opportunity failed. Write the five most plausible causes.',
        'For each cause, identify an early warning indicator and source.',
        'Write what evidence would disprove the central thesis.',
        'Set review dates based on information arrival, not price movement alone.'
      ]),
      S('Investment memo template', [
        C('One-sentence opportunity and economic mechanism.'),
        C('Goal, horizon, liquidity and maximum loss.'),
        C('Three primary sources.'),
        C('Demand, competition and bottleneck.'),
        C('Cash economics and balance-sheet risk.'),
        C('Control, incentives and governance.'),
        C('Valuation range and stress case.'),
        C('Fraud and authorisation checks.'),
        C('Alternatives considered.'),
        C('Entry, monitoring, exit and stop rules.')
      ])
    ]
  },
  {
    slug: 'investing-basics',
    title: 'How to Invest - Beginner Evidence Guide',
    subtitle: 'A safe sequence for goals, risk, products, diversification, fees, custody and annual review.',
    audience: 'A first-time investor who needs to understand process before choosing a fund, share, bond, property or platform.',
    outcome: 'Create a one-page investment policy and a verified first-investment checklist.',
    markers: ['INVESTMENT POLICY', 'CUSTODY', 'DIVERSIFICATION', 'FEE DRAG'],
    sources: [official.amfChecks, official.amfBlacklists, official.regafi, official.esma, official.impotsPea, official.banqueFrance],
    sections: [
      S('Investing comes after financial stability', [
        'Investing is ownership or lending for future return; it is not a substitute for emergency cash.',
        'Protect essential bills, near-term obligations and expensive debt before accepting market risk.',
        'Do not invest money required on a fixed short date into volatile assets.',
        'Define whether the goal is retirement, home purchase, education, income, capital preservation or another objective.'
      ]),
      S('Risk capacity, tolerance and requirement', [
        'Capacity is the financial ability to absorb loss without damaging essential plans.',
        'Tolerance is the emotional ability to remain disciplined during decline.',
        'Requirement is the return needed to reach the goal. An unrealistic required return means the goal, contribution or deadline must change.',
        'Use the lowest risk capable of meeting a realistic plan.'
      ]),
      S('Understand the asset classes', [
        'Cash and short-term instruments prioritise access and stability but face inflation and institution risk.',
        'Bonds are loans exposed to issuer credit, interest rates, inflation and duration.',
        'Shares are ownership claims exposed to business, valuation and market risk.',
        'Property combines use, rent, leverage, maintenance, tax and illiquidity.',
        'Funds pool assets; the label does not remove underlying risk, fees or concentration.',
        'Alternative and private assets may be illiquid, opaque, highly leveraged or difficult to value.'
      ]),
      S('Diversification', [
        'Diversification reduces dependence on one issuer, sector, country, currency, customer or outcome.',
        'Owning many securities does not guarantee diversification when they share the same economic driver.',
        'Diversify at the portfolio level, including employment, business and property exposure.',
        'Concentration may create wealth but also creates ruin risk; beginners should not copy billionaire concentration blindly.'
      ]),
      S('Funds, ETFs and index exposure', [
        'Read the objective, index, holdings, domicile, replication method, currency exposure, distribution policy and lending policy.',
        'Compare ongoing charge, trading spread, platform fee, custody fee and tax treatment.',
        'A popular index can be concentrated in a small number of companies.',
        'Past performance and star ratings do not establish future suitability.'
      ]),
      S('Shares and company research', [
        'Understand how the company earns cash, its balance sheet, competitive position and capital needs.',
        'Read annual reports and regulator filings rather than relying on influencer summaries.',
        'Separate company quality from purchase valuation.',
        'Use a position size that accepts the possibility of permanent loss.'
      ]),
      S('Broker, platform and custody checks', [
        'Verify the legal company name and authorisation in official registers, not only the brand name.',
        'Confirm who legally holds the assets, how client money is separated and what compensation scheme applies.',
        'Check withdrawal process, transfer-out fee, account closure, data security and treatment if the platform fails.',
        'Independently confirm website domain, phone number and bank details because authorised firms can be impersonated.'
      ]),
      S('Fees and tax drag', [
        'Record product charge, platform fee, advice fee, trading spread, transaction charge, FX cost and performance fee.',
        'A small annual percentage compounds into a large difference over long periods.',
        'Tax wrappers can improve outcomes but should not justify an unsuitable investment.',
        'Compare total after-fee, after-tax outcome under reasonable scenarios.'
      ]),
      S('Contributions and portfolio construction', [
        'Choose a strategic allocation tied to goal and risk capacity.',
        'Use automatic contributions when appropriate; avoid treating frequent trading as research.',
        'Set maximum concentration limits and rules for new money.',
        'Document why each holding exists and what role it serves.'
      ]),
      S('Behaviour and market decline', [
        'Expect volatility before investing. Write the response to a 10%, 20% and 40% decline.',
        'Do not increase risk because of recent gains or abandon a sound policy because of recent losses.',
        'Limit news and price checking to a schedule aligned with the decision horizon.',
        'Fraud, leverage and panic become more dangerous when the investor has no written plan.'
      ]),
      S('One-page investment policy', [
        C('Goal and target date.'), C('Emergency cash requirement.'), C('Contribution amount and frequency.'),
        C('Strategic asset allocation.'), C('Maximum single holding and sector exposure.'), C('Allowed products and prohibited products.'),
        C('Maximum total annual cost.'), C('Rebalancing rule.'), C('Review frequency.'), C('Conditions requiring regulated advice.')
      ])
    ]
  },
  {
    slug: 'copy-the-rich',
    title: 'Copy the Rich - Principles You Can Adapt',
    subtitle: 'What can be copied from large fortunes, what requires scale and access, and what should never be imitated.',
    audience: 'A reader seeking practical ownership and capital-allocation lessons without celebrity worship or reckless concentration.',
    outcome: 'Choose accessible versions of proven wealth principles while rejecting scale-dependent or destructive tactics.',
    markers: ['CREATE VS PRESERVE', 'OWNERSHIP', 'LIQUIDITY', 'DO NOT COPY'],
    sources: [official.sec, official.serviceBusiness, official.bpifrance, official.amfChecks, official.impotsPea],
    sections: [
      S('Create wealth versus preserve wealth', [
        'Large fortunes are often created through concentrated ownership in one enterprise and preserved through diversification, liquidity and governance.',
        'A beginner should not copy the mature portfolio of someone whose original wealth came from business equity.',
        'Separate the engine that created wealth from the system that protects it.',
        'The accessible lesson is disciplined ownership and reinvestment, not blind concentration.'
      ]),
      S('Principle 1 - Retain ownership', [
        'Equity can scale beyond wages because the owner participates in enterprise value and future cash flow.',
        'Accessible versions include a small business, diversified shares, profit participation or intellectual property.',
        'Ownership also carries downside, dilution, liability and illiquidity.',
        'Do not confuse being self-employed with owning a transferable system.'
      ]),
      S('Principle 2 - Build distribution', [
        'Brands, networks, marketplaces, sales systems and recurring customer access often matter as much as the product.',
        'Accessible version: own a customer list with permission, referral network, local partnerships or searchable expertise.',
        'Do not depend entirely on one platform that can change access or fees.',
        'Measure conversion, retention and customer concentration.'
      ]),
      S('Principle 3 - Reinvest at high returns', [
        'Successful owners reinvest where the expected return on incremental capital remains attractive and measurable.',
        'Accessible version: reinvest in skills, proven marketing, equipment with contracted demand or diversified assets.',
        'Stop reinvesting when growth consumes cash without improving contribution or durable value.',
        'Record the return hypothesis before spending.'
      ]),
      S('Principle 4 - Use leverage selectively', [
        'Wealthy owners may borrow against durable assets or predictable cash flows, but leverage magnifies error and can force sales.',
        'Accessible version: use debt only when repayment remains safe under conservative stress.',
        'Never copy complex leverage without understanding covenants, variable rates, guarantees and liquidity.',
        'Borrowing to speculate can turn a temporary decline into permanent loss.'
      ]),
      S('Principle 5 - Control taxes and fees legally', [
        'Large fortunes use specialists, long holding periods, eligible wrappers and deliberate transaction timing.',
        'Accessible version: keep records, claim lawful expenses, use appropriate accounts and minimise unnecessary turnover.',
        'Tax reduction is not a reason to buy a poor asset or create an uneconomic company.',
        'Avoid promoters selling secrecy, artificial losses or guaranteed tax outcomes.'
      ]),
      S('Principle 6 - Maintain liquidity', [
        'Liquidity prevents forced sales, supports negotiation and creates optionality during stress.',
        'Accessible version: emergency cash, business runway, sinking funds and unused borrowing capacity that is not required for survival.',
        'Too little liquidity creates fragility; too much unplanned cash may lose purchasing power.',
        'Define the purpose and time horizon of each cash reserve.'
      ]),
      S('Principle 7 - Buy expertise and governance', [
        'Professionals and boards can reduce blind spots when their incentives, competence and scope are clear.',
        'Accessible version: pay for a focused legal, tax, accounting or technical review at decision points.',
        'Verify adviser regulation, conflicts, compensation and deliverables.',
        'Keep decision rights and understand the advice rather than outsourcing responsibility.'
      ]),
      S('Principle 8 - Concentrate effort, diversify survival', [
        'Career and business effort may be focused while personal survival assets remain diversified and liquid.',
        'Do not allow employer equity, home, pension and future income to depend on one company without recognising concentration.',
        'Set explicit concentration limits as wealth grows.',
        'Diversify after the value-creation engine is proven, not by launching many weak projects at once.'
      ]),
      S('What not to copy', [
        'Do not copy political access, opaque related-party transactions, aggressive tax schemes or regulatory arbitrage.',
        'Do not copy illiquid private deals you cannot evaluate or exit.',
        'Do not copy billionaire consumption before building the underlying cash engine.',
        'Do not copy public holdings without knowing purchase price, hedges, tax position, liabilities or total portfolio.',
        'Do not assume wealth proves ethics, skill in every field or future investment success.'
      ]),
      S('Personal adaptation plan', [
        C('Choose one ownership asset to build or acquire.'), C('Choose one distribution asset to strengthen.'),
        C('Define the reinvestment rule.'), C('Define the liquidity minimum.'), C('Define the maximum leverage.'),
        C('Define the concentration limit.'), C('Name the next professional review.'), C('Write one tactic you will not copy.')
      ])
    ]
  },
  {
    slug: 'income-creation',
    title: 'Income Creation Playbook',
    subtitle: 'A practical ladder from earning power to recurring revenue, products, intellectual property and ownership income.',
    audience: 'A reader who needs to create or diversify income rather than rely on one salary or one customer.',
    outcome: 'Build a ranked income portfolio and a 90-day sales pipeline for one primary route.',
    markers: ['INCOME LADDER', 'SALES PIPELINE', 'PRICING FLOOR', 'CAPACITY MAP'],
    sources: [official.oecdEmployment, official.eurostat, official.serviceBusiness, official.bpifrance, official.insee],
    sections: [
      S('The income ladder', [
        'Level 1: employment and skill premium.', 'Level 2: overtime, contract work and freelance services.',
        'Level 3: recurring service packages.', 'Level 4: products, courses, software or licensed intellectual property.',
        'Level 5: business equity and managed systems.', 'Level 6: investment income after stable surplus and reserves exist.',
        'Move upward by proving demand and retaining ownership, not by abandoning dependable income too early.'
      ]),
      S('Income inventory', [
        C('List every current income source and after-tax amount.'), C('Record hours required and schedule constraints.'),
        C('Record payer concentration and contract security.'), C('Record skills, equipment and licences required.'),
        C('Record growth ceiling and main failure risk.'), C('Identify the source with the best combination of reliability, margin and learning.')
      ]),
      S('Employment and skill premium', [
        'Document measurable outcomes rather than duties.', 'Benchmark target roles using several current sources.',
        'Build a visible work sample for the next responsibility level.', 'Negotiate scope, compensation, flexibility and review date together.',
        'Use employer-paid training where it creates transferable value.', 'Avoid resigning before understanding replacement-income probability and runway.'
      ]),
      S('Service income', [
        'Choose a buyer with a costly, frequent and visible problem.', 'Define a fixed result, scope, price and delivery time.',
        'Sell a small paid test before buying equipment or premises.', 'Track travel, administration, rework, payment delay and tax reserve.',
        'Turn successful delivery into a checklist and referral request.', 'Raise price after evidence of demand and quality, not before.'
      ]),
      S('Recurring income', [
        'Recurring revenue requires a recurring customer problem, not simply monthly billing.',
        'Define activation, ongoing value, service limit, renewal and cancellation.',
        'Track retention, churn, support cost, payment failure and customer concentration.',
        'Test the service manually before automating.', 'Do not lock customers into an offer that no longer delivers value.'
      ]),
      S('Product and intellectual-property income', [
        'Create from verified demand, not from personal enthusiasm alone.', 'Clarify ownership, licences, third-party material and platform terms.',
        'Model refunds, support, fulfilment, royalties, tax and piracy.', 'Use a minimum version to test willingness to pay.',
        'Build direct customer contact so one platform does not control the entire asset.'
      ]),
      S('Pricing floor', [
        'Pricing floor = direct materials + direct labour + travel + platform fees + expected rework + tax reserve + required contribution.',
        'Separate price from payment terms; a profitable invoice can still create a cash crisis when paid late.',
        'Offer tiers only when each tier has a clear customer and delivery difference.',
        'Discount in exchange for a real economic benefit such as prepayment, volume or reduced scope - not discomfort.'
      ]),
      S('Sales pipeline', [
        'Define stages: named prospect, contacted, replied, qualified, discovery, proposal, won, delivered, collected, referred.',
        'Track conversion rate and average days in each stage.', 'Qualify authority, need, budget and timing before writing complex proposals.',
        'Follow up with useful information and a clear close-the-file option.', 'Measure cash collected, not only contracts signed.'
      ]),
      S('Capacity map', [
        'Calculate available delivery hours after sales, administration and recovery time.', 'Identify tasks that require the owner and tasks that can be templated or delegated.',
        'Set a quality-protection limit before accepting more work.', 'Do not add fixed payroll or premises until recurring demand supports it under stress.',
        'Track backlog, lead time, defect rate and customer satisfaction.'
      ]),
      S('90-day income plan', [
        'Days 1-7: choose one route, one buyer and one offer.', 'Days 8-30: complete 50 qualified contacts and at least one paid test.',
        'Days 31-60: improve price, scope and delivery from actual results.', 'Days 61-90: create repeat business, referrals or a second acquisition channel.',
        C('Primary income target.'), C('Weekly activity target.'), C('Cash reserve target.'), C('Stop rule.')
      ])
    ]
  },
  {
    slug: 'business-builder',
    title: 'Business Creation Engine',
    subtitle: 'A complete system from problem selection and first sale to cash control, operations and responsible scaling.',
    audience: 'A founder, sole trader or small team testing a new business or rebuilding an unprofitable one.',
    outcome: 'Produce a 90-day launch plan with customer evidence, unit economics, legal checks and cash runway.',
    markers: ['PROBLEM INTERVIEW', 'UNIT ECONOMICS', 'CASH RUNWAY', '90-DAY BUILD'],
    sources: [official.serviceBusiness, official.franceFormalities, official.bpifrance, official.micro2026, official.microSocial2026],
    sections: [
      S('Problem before product', [
        'Describe the customer, problem, current workaround, economic cost and urgency.',
        'Interview potential buyers without leading them toward your proposed solution.',
        'Ask for examples of recent behaviour and spending, not hypothetical interest.',
        'A painful problem without budget or decision authority may not support a business.'
      ]),
      S('Problem interview script', [
        'When did this problem last occur?', 'What did you do?', 'What did it cost in money, time, risk or lost revenue?',
        'Who decides whether to fix it?', 'What alternatives have been tried?', 'What evidence would justify switching?',
        'Would the buyer commit to a paid pilot, deposit, letter of intent or introduction?'
      ]),
      S('Offer design', [
        'Specify result, scope, exclusions, delivery time, evidence of completion and price.',
        'Reduce buyer risk with a small paid pilot rather than unsupported guarantees.',
        'Choose one customer segment and one core offer until the sales process is understood.',
        'Avoid custom promises that destroy delivery repeatability.'
      ]),
      S('Unit economics', [
        'Contribution per sale = price minus variable costs directly caused by the sale.',
        'Break-even volume = fixed costs divided by contribution per sale.',
        'Include refunds, rework, card fees, commissions, bad debt and owner labour.',
        'Track gross margin, contribution margin and cash collection separately.',
        'A high-margin sale can still be unprofitable after customer acquisition and support.'
      ]),
      S('Customer acquisition', [
        'Choose channels where the target buyer already searches, gathers or buys.',
        'Start with direct conversations and partnerships to learn language and objections.',
        'Measure cost per qualified conversation, proposal, customer and cash collected.',
        'Do not scale paid advertising before conversion and delivery economics are proven.'
      ]),
      S('Cash runway and working capital', [
        'Runway = available operating cash divided by conservative monthly net cash outflow.',
        'Model deposit timing, supplier terms, inventory, VAT, payroll and customer payment delay.',
        'Separate tax and customer deposits from available operating profit.',
        'Maintain a downside case with lower sales and slower collection.',
        'Growth can consume cash faster than a stable small business.'
      ]),
      S('Legal and compliance foundation', [
        'Choose legal form based on liability, partners, tax, social contributions, financing and administration.',
        'Complete required registration through official channels.', 'Use written terms, invoices, privacy notices and sector licences where required.',
        'Review insurance, health and safety, consumer rights, employment law and data protection.',
        'Do not copy internet contracts without checking jurisdiction and actual business process.'
      ]),
      S('Operations and quality', [
        'Document the order-to-cash process.', 'Define acceptance criteria and defect handling.', 'Maintain supplier alternatives and critical inventory rules.',
        'Track lead time, on-time delivery, defects, refunds and customer concentration.',
        'Create backups, access controls and incident procedures for essential data and systems.'
      ]),
      S('Hiring and delegation', [
        'Hire only after the role, workload, output and cash support are clear.',
        'Distinguish employee, contractor and supplier under applicable law.', 'Delegate outcomes with documented authority and controls.',
        'Protect payroll and tax obligations before owner distributions.', 'Avoid solving weak demand by adding people.'
      ]),
      S('Responsible scaling', [
        'Scale one proven constraint at a time.', 'Use experiments with a budget, owner, target, deadline and stop rule.',
        'Monitor quality and cash as volume increases.', 'Diversify customers and suppliers before concentration becomes existential.',
        'Do not expand premises, inventory or debt because revenue alone is growing.'
      ]),
      S('90-day build', [
        'Days 1-14: 20 problem interviews, written offer, legal screen and unit-economics model.',
        'Days 15-30: sell and deliver paid pilots; reconcile actual time and cost.',
        'Days 31-60: standardise delivery, pricing and collection; remove unprofitable scope.',
        'Days 61-90: create repeat sales, referral channels and a conservative scaling decision.',
        C('First customer evidence.'), C('Break-even volume.'), C('Runway.'), C('Primary risk.'), C('Next experiment.')
      ])
    ]
  },
  {
    slug: 'legal-tax-efficiency',
    title: 'Keep More Legally - Tax Efficiency Checklist',
    subtitle: 'A lawful framework for records, wrappers, entities, timing, fees and professional review.',
    audience: 'Individuals and small-business owners who want to reduce avoidable leakage without evasion or artificial schemes.',
    outcome: 'Create a documented annual tax-efficiency review and a list of questions for a qualified professional.',
    markers: ['LEGAL ONLY', 'TOTAL TAX COST', 'RECORDS', 'ADVISER QUESTION'],
    sources: [official.bofipBands, official.impotsPea, official.impotsCapital, official.microTax2026, official.serviceBusiness],
    sections: [
      S('Legal only', [
        'Tax planning changes the timing, form or location of lawful activity within the rules; evasion hides or falsifies facts.',
        'Reject false invoices, undeclared cash, sham residence, nominee ownership, artificial losses and backdated documents.',
        'A structure must have commercial, family, investment or governance purpose beyond a tax slogan.',
        'Written professional advice does not protect false facts supplied by the client.'
      ]),
      S('Start with accurate records', [
        'Reconcile bank, platform, payroll, sales, purchases, debt, investments and asset disposals.',
        'Keep invoices, receipts, contracts, mileage or travel evidence and allocation methods.',
        'Separate personal and business transactions.', 'Record acquisition cost and improvements for assets where future gain calculations may depend on them.',
        'Missing records often cost more than advanced planning saves.'
      ]),
      S('Map the total tax cost', [
        'Include income tax, social contributions, payroll charges, corporate tax, VAT, property taxes, capital-gains tax and compliance cost where relevant.',
        'Compare after-tax cash available personally, cash retained in a business and future extraction tax.',
        'Model more than one year because a short-term saving can create a later cost.',
        'Do not compare legal forms using one headline rate.'
      ]),
      S('Lawful allowances and expenses', [
        'Claim only expenses permitted for the activity and supported by evidence.',
        'Document mixed-use allocation for home, vehicle, phone or equipment.',
        'Compare simplified allowances with actual-expense regimes where permitted.',
        'A deductible expense still costs money; do not spend one euro merely to save a fraction in tax.'
      ]),
      S('Account and investment wrappers', [
        'Identify eligible retirement, savings and investment wrappers in the jurisdiction.',
        'Compare contribution limits, access restrictions, investment range, fees and tax on withdrawal.',
        'A wrapper does not make the underlying asset safe or suitable.',
        'Record beneficiary and succession treatment as well as annual tax treatment.'
      ]),
      S('Business form and compensation', [
        'Compare individual business, micro regime and company forms using realistic profit, costs, social protection and administration.',
        'Model salary, dividends, retained profit, pension contributions and benefits only under current rules.',
        'Protect working capital and solvency before extracting cash.',
        'Related-party payments must reflect real services, legal authority and documentation.'
      ]),
      S('VAT and indirect tax', [
        'Determine registration, threshold, place-of-supply and invoicing obligations before quoting prices.',
        'Separate collected VAT from revenue.', 'Check cross-border goods and digital services carefully.',
        'Late registration, incorrect invoices and unrecorded imports can create penalties larger than expected profit.'
      ]),
      S('Timing and realisation', [
        'Tax may depend on payment, invoice, disposal, vesting, distribution, residence or ownership dates.',
        'Do not manipulate dates or documentation; plan future lawful transactions before they occur.',
        'Compare realising a gain, using losses, donating, transferring or holding under current rules and non-tax objectives.',
        'Maintain liquidity for the tax due; a taxable gain may not produce equivalent cash.'
      ]),
      S('Cross-border warning', [
        'Residence, source, permanent establishment, social security, withholding, reporting and treaty rules can conflict.',
        'Citizenship, residence, domicile and company registration are not interchangeable concepts.',
        'Do not move assets or create foreign entities based on online claims of zero tax.',
        'Obtain advice in every relevant jurisdiction and ensure advisers coordinate assumptions.'
      ]),
      S('Annual checklist', [
        C('Records reconciled.'), C('Allowances and deadlines checked on official sources.'), C('Entity remains suitable.'),
        C('Investment and pension wrappers reviewed.'), C('Fees and interest quantified.'), C('VAT and payroll reviewed.'),
        C('Capital gains and losses recorded.'), C('Beneficiaries and estate consequences reviewed.'), C('Tax cash reserve funded.'),
        C('Defined adviser question prepared.')
      ]),
      S('Adviser question sheet', [
        'What exact facts and documents does the conclusion depend on?', 'Which law, guidance or case supports it?',
        'What changes if income, residence, turnover or ownership changes?', 'What are the setup, annual and exit costs?',
        'What reporting is required and who is responsible?', 'What is the non-tax commercial or family purpose?',
        'What is the downside if the authority disagrees?'
      ])
    ]
  },
  {
    slug: 'financial-leakage',
    title: 'Money Leakage Audit',
    subtitle: 'A line-by-line recovery system for debt interest, fees, subscriptions, insurance, tax penalties and operating waste.',
    audience: 'A household or small business that earns money but retains too little.',
    outcome: 'Quantify annual leakage, recover the largest controllable losses and install prevention controls.',
    markers: ['LEAKAGE REGISTER', 'ANNUAL COST', 'RECOVERY ACTION', 'PREVENTION CONTROL'],
    sources: [official.banqueFrance, official.amfChecks, official.impotsCapital, official.insee, official.serviceBusiness],
    sections: [
      S('Build the leakage register', [
        'Export at least three months of bank, card, loan, platform and investment transactions.',
        'Classify each outflow as essential, productive, protective, optional, avoidable or unknown.',
        'Convert monthly and quarterly costs to annual amounts.', 'Record the contract end date, cancellation route and owner.',
        'Investigate unknown charges before assuming fraud or legitimacy.'
      ]),
      S('Debt interest leakage', [
        'List balance, rate, fees, remaining term, early-repayment terms and security.',
        'Prioritise arrears consequences and high guaranteed interest cost.',
        'Compare refinancing using total cost, not payment alone.',
        'Stop adding new revolving debt while repaying old balances.',
        'Never move secured debt or guarantees without understanding the new risk.'
      ]),
      S('Banking, FX and payment leakage', [
        'Measure account fees, overdraft, card charges, merchant fees, transfer fees and foreign-exchange spread.',
        'Check whether multi-currency activity needs a better operational process.',
        'Reconcile small recurring payment failures and duplicate merchant services.',
        'Do not switch providers until deposit protection, access and service reliability are checked.'
      ]),
      S('Investment leakage', [
        'Add product charges, platform fees, advice fees, spreads, transaction charges, FX and performance fees.',
        'Measure turnover and tax consequences caused by unnecessary trading.',
        'Identify cash drag, duplicate funds and unintended concentration.',
        'Compare total cost with a suitable lower-cost alternative, not simply the cheapest product.'
      ]),
      S('Insurance leakage', [
        'List every policy, insured risk, limit, excess, exclusions, beneficiary and renewal date.',
        'Find duplicate coverage and missing catastrophic coverage separately.',
        'Compare policy value, not premium alone.',
        'Cancel only after replacement coverage is active when the risk is essential.'
      ]),
      S('Subscription and lifestyle leakage', [
        'Identify subscriptions unused for 30, 60 and 90 days.', 'Separate intentional quality-of-life spending from forgotten spending.',
        'Create waiting periods for new recurring commitments.', 'Use annual cost in the purchase decision.',
        'Lifestyle choices are not automatically waste; the audit asks whether spending matches a deliberate priority.'
      ]),
      S('Tax and penalty leakage', [
        'Record late fees, missed allowances, poor records, incorrect regimes and unclaimed legitimate expenses.',
        'Calendar filing, payment, renewal and evidence deadlines.', 'Fund tax cash separately.',
        'Do not use aggressive schemes to recover ordinary administrative leakage.'
      ]),
      S('Housing, energy and transport leakage', [
        'Compare finance, insurance, maintenance, energy, tax and opportunity cost - not one monthly payment.',
        'Measure underused space, avoidable journeys, vehicle downtime and contract mismatch.',
        'Prioritise safety and reliability before lowest cost.', 'Model switching cost and disruption before changing essential services.'
      ]),
      S('Business operating leakage', [
        'Measure unbilled work, scope creep, late payment, defects, returns, stock loss, unused software and idle equipment.',
        'Track gross margin by customer, product and channel.', 'Set approval limits and purchase ownership.',
        'Recover cash from slow stock, deposits, supplier terms and invoice follow-up without harming essential relationships.'
      ]),
      S('Fraud and control leakage', [
        'Use multi-factor authentication, payment verification and separation of duties where possible.',
        'Independently verify changed bank details.', 'Review account access and former staff permissions.',
        'Treat unexpected urgency and secrecy as risk indicators.', 'Report suspected fraud promptly through the relevant bank, platform and authorities.'
      ]),
      S('30-day recovery plan', [
        'Week 1: build register and stop unknown or clearly unused costs.', 'Week 2: negotiate debt, insurance, banking and supplier terms.',
        'Week 3: fix investment fees, tax records and business collection.', 'Week 4: install calendars, approval rules and monthly review.',
        C('Annual leakage identified.'), C('Annual leakage recovered.'), C('One-off recovery cost.'), C('Prevention control owner.')
      ])
    ]
  },
  {
    slug: 'wealth-structures',
    title: 'Companies, Holdings, Trusts and Wealth Structures',
    subtitle: 'A purpose-led map of legal ownership, liability, governance, tax, succession and reporting.',
    audience: 'A reader deciding whether a company, holding structure, property vehicle, trust, foundation or family arrangement solves a real problem.',
    outcome: 'Create a structure decision memo and reject complexity without a documented purpose.',
    markers: ['STRUCTURE PURPOSE', 'BENEFICIAL OWNERSHIP', 'GOVERNANCE', 'EXIT COST'],
    sources: [official.serviceBusiness, official.franceFormalities, official.bofipBands, official.impotsCapital, official.sec],
    sections: [
      S('Structure follows purpose', [
        'Begin with the legal, commercial, financing, family or governance problem - not the structure name.',
        'List assets, liabilities, owners, beneficiaries, decision rights, cash needs and jurisdictions.',
        'Compare the simplest lawful arrangement capable of solving the problem.',
        'Include setup, annual compliance, professional fees, banking friction and exit cost.'
      ]),
      S('Personal ownership and individual business', [
        'Personal ownership may be simple and transparent but can expose the owner to concentration, succession and liability issues.',
        'An individual business can reduce administration while remaining unsuitable for partners, outside investment or certain risks.',
        'Understand which assets and liabilities are legally separate under current law.',
        'Keep business and personal records operationally separate even where the legal form is simple.'
      ]),
      S('Operating company', [
        'An operating company contracts, employs, invoices, owns assets and bears business risk.',
        'Review share rights, director authority, distributions, payroll, solvency and reporting.',
        'A company does not remove personal guarantees, director duties or unlawful conduct.',
        'Retained profit belongs to the company, not automatically to the shareholder personally.'
      ]),
      S('Holding company', [
        'A holding company may own subsidiaries, investments or intellectual property and allocate capital between them where lawful.',
        'Potential purposes include risk separation, reinvestment, acquisition, governance and succession.',
        'Model tax on contributions, dividends, sales, interest, management charges and extraction.',
        'Document real services and avoid artificial circular transactions.'
      ]),
      S('Property company or SPV', [
        'A special-purpose vehicle may isolate one property or project for lenders and partners.',
        'Compare financing, tax, transfer cost, personal guarantees, accounting and exit flexibility with direct ownership.',
        'A company wrapper does not remove vacancy, maintenance, title or planning risk.',
        'Decide ownership and exit before acquisition, not after value has increased.'
      ]),
      S('Trust', [
        'A trust separates legal control and beneficial interests under duties defined by applicable law and documents.',
        'Potential purposes include succession, vulnerable beneficiaries, long-term stewardship and conditional distributions.',
        'Trust recognition, taxation, disclosure and control vary sharply by jurisdiction.',
        'A trust is not a secrecy device and may create extensive reporting obligations.',
        'Assess trustee competence, independence, fees, powers, removal and dispute process.'
      ]),
      S('Foundation and charitable structures', [
        'Foundations can pursue charitable or defined long-term purposes under specific legal regimes.',
        'Family, charitable and operating foundations have different governance and tax treatment.',
        'Assets dedicated to a purpose may no longer be available for personal use.',
        'Document grant policy, conflicts, investment governance and public reporting.'
      ]),
      S('Pension and retirement wrappers', [
        'Retirement structures may provide tax treatment, creditor protection or employer contributions subject to access rules.',
        'Compare investment options, fees, beneficiary rules, transfer rights and withdrawal tax.',
        'Do not place short-term liquidity into inaccessible arrangements.',
        'Keep beneficiary nominations and address details current.'
      ]),
      S('Beneficial ownership and transparency', [
        'Identify legal owner, beneficial owner, controller, director, trustee, protector, settlor and beneficiary accurately.',
        'Maintain required registers and filings.', 'Do not use nominees or layered entities to mislead banks, authorities or counterparties.',
        'Assume banks, tax authorities and regulators may require full source-of-funds and ownership evidence.'
      ]),
      S('Governance', [
        'Define reserved decisions, voting thresholds, conflicts, distributions, valuation, death, disability, divorce and exit.',
        'Create access and continuity plans for key documents and accounts without exposing credentials.',
        'Use independent review where one person controls valuation, custody and reporting.',
        'Test whether the structure still works when relationships deteriorate.'
      ]),
      S('Structure decision memo', [
        C('Problem being solved.'), C('Assets and liabilities involved.'), C('Owners, controllers and beneficiaries.'),
        C('Jurisdictions and reporting.'), C('Setup and annual cost.'), C('Tax at entry, during life and exit.'),
        C('Financing and guarantee impact.'), C('Governance and dispute process.'), C('Succession and incapacity.'),
        C('Simpler alternative.'), C('Exit cost and unwind process.'), C('Professional opinions obtained.')
      ])
    ]
  },
  {
    slug: 'start-today',
    title: 'What To Do Today - Quick Start Guide',
    subtitle: 'A focused two-hour reset followed by a seven-day and 30-day execution plan.',
    audience: 'A reader overwhelmed by money decisions who needs a safe sequence of concrete actions today.',
    outcome: 'Complete the essential financial snapshot, one income action, one leakage action and a scheduled review.',
    markers: ['FIRST 15 MINUTES', 'TWO-HOUR RESET', 'SEVEN-DAY PLAN', 'NEXT REVIEW'],
    sources: [official.banqueFrance, official.amfChecks, official.serviceBusiness, official.insee],
    sections: [
      S('First 15 minutes - protect access', [
        C('Confirm access to primary bank, email and phone accounts.'), C('Enable multi-factor authentication where available.'),
        C('Check for unknown transactions or changed contact details.'), C('Do not share passwords, one-time codes or remote access.'),
        C('Write emergency bank and card contact routes from official sources.')
      ]),
      S('Minutes 15-35 - cash snapshot', [
        'Write current cash, expected income before the next pay date and essential payments due.',
        'List minimum debt payments and any arrears deadlines.', 'Calculate the amount available after essentials.',
        'Do not rely on an available credit limit as cash.', 'If essentials cannot be covered, prioritise early contact with creditors and official support routes.'
      ]),
      S('Minutes 35-55 - stop one leak', [
        'Open the last month of transactions and identify one unused or low-value recurring cost.',
        'Cancel, pause or renegotiate through the documented route.', 'Record annual rather than monthly saving.',
        'Do not cancel essential insurance or protection without understanding the risk and replacement timing.'
      ]),
      S('Minutes 55-80 - choose one 90-day target', [
        'Choose one target: income increase, emergency reserve, debt reduction, business cash, investment setup or tax records.',
        'Define the amount, deadline and reason.', 'Choose one weekly behaviour that directly affects the target.',
        'Reject targets that depend mainly on market prediction or luck.'
      ]),
      S('Minutes 80-105 - create one income action', [
        'Write one offer or employment request tied to a measurable result.', 'Name ten buyers, employers, partners or referrers.',
        'Send the first three messages today.', 'Schedule the remaining seven contacts.',
        'Record replies and objections instead of interpreting silence emotionally.'
      ]),
      S('Minutes 105-120 - install the money review', [
        'Schedule a 30-minute monthly reconciliation and a longer annual review.',
        'Create a folder for statements, tax records, contracts, insurance and investment documents.',
        'Set one automatic transfer or debt payment that is affordable under the downside case.',
        'Write the next review date and the evidence to collect before it.'
      ]),
      S('Seven-day plan', [
        'Day 1: complete snapshot and access security.', 'Day 2: build debt and recurring-cost register.',
        'Day 3: create income offer or career case.', 'Day 4: contact ten people.',
        'Day 5: compare one bank, insurance, investment or business cost using official documents.',
        'Day 6: organise tax and legal records.', 'Day 7: review results and choose the next constraint.'
      ]),
      S('30-day plan', [
        'Week 1: stabilise and secure.', 'Week 2: increase qualified income conversations.',
        'Week 3: complete one paid test, salary discussion or cost recovery.', 'Week 4: automate the reserve and document the next stage.',
        C('Cash gap reduced.'), C('Leakage recovered.'), C('Income action completed.'), C('Reserve or debt milestone completed.')
      ]),
      S('Do not do today', [
        'Do not open a leveraged trading account because of urgency.', 'Do not transfer money to an unverified adviser or recovery firm.',
        'Do not create a company or trust solely from a social-media tax claim.', 'Do not buy inventory before validating demand and landed cost.',
        'Do not cancel protection or default silently when an early conversation may create options.'
      ]),
      S('Quick-start record', [
        C('Essential monthly cost.'), C('Cash available.'), C('Debt priority.'), C('Leak stopped.'),
        C('90-day target.'), C('First three contacts.'), C('Automatic action.'), C('Next review date.')
      ])
    ]
  },
  {
    slug: 'future-of-money',
    title: 'The Future of Making Money - Scenario Map',
    subtitle: 'A signal-based map of AI, energy, automation, cyber, ageing, climate adaptation and trusted human work.',
    audience: 'A reader planning skills, business or investment research under technological and policy uncertainty.',
    outcome: 'Create a scenario dashboard with triggers, opportunities, failure conditions and no-regret actions.',
    markers: ['SCENARIO NOT FORECAST', 'TRIGGER', 'NO-REGRET ACTION', 'FAILURE CONDITION'],
    sources: [official.stanfordAi, official.ieaInvestment, official.ieaGrid, official.oecdEmployment, official.eurostat],
    sections: [
      S('Scenario, not forecast', [
        'A scenario describes a plausible path and the evidence that would strengthen or weaken it.',
        'Do not assign false precision to probability.', 'Separate direction confidence from confidence in specific winners.',
        'A correct theme can produce poor returns when entry valuation, competition or capital intensity is ignored.'
      ]),
      S('AI infrastructure becomes an energy and construction story', [
        'Possible path: spending broadens from models and chips into networking, cooling, land, data centres, grids and generation.',
        'Triggers: hyperscaler capex, power contracts, connection queues, utilisation and hardware supply.',
        'Opportunities: engineering, electrical trades, security, cooling, software operations and diversified infrastructure research.',
        'Failure conditions: overbuild, falling utilisation, financing stress, regulation or rapid obsolescence.',
        'No-regret action: build skills that transfer across several infrastructure owners.'
      ]),
      S('The grid becomes the bottleneck', [
        'Possible path: generation and large loads connect faster than networks can expand.',
        'Triggers: utility capital plans, transformer lead times, permitted projects and allowed regulatory returns.',
        'Opportunities: equipment, maintenance, planning, storage, demand response and regulated infrastructure.',
        'Failure conditions: political price caps, delays, debt costs and supply shortages.',
        'No-regret action: understand local grid projects and qualification requirements.'
      ]),
      S('Energy security outranks single-technology ideology', [
        'Possible path: countries finance mixed systems including nuclear, renewables, storage, gas resilience and efficiency.',
        'Triggers: guarantees, auctions, long-term contracts, fuel supply and domestic manufacturing policy.',
        'Opportunities: operations, maintenance, compliance, components and diversified energy exposure.',
        'Failure conditions: cost overruns, policy reversal, commodity shock and public opposition.',
        'No-regret action: focus on reliability, safety and measurable economics.'
      ]),
      S('Automation spreads into physical work', [
        'Possible path: robotics, sensors and AI agents move from demonstrations into logistics, manufacturing, healthcare administration and field service.',
        'Triggers: deployment payback, repeat orders, safety approvals, service revenue and labour constraints.',
        'Opportunities: integration, maintenance, workflow redesign, training and specialised components.',
        'Failure conditions: unreliable performance, long installation, weak payback or liability.',
        'No-regret action: learn process mapping and human-machine quality control.'
      ]),
      S('Cybersecurity and identity become essential infrastructure', [
        'Possible path: synthetic content and connected systems increase demand for authentication, provenance, auditing and incident response.',
        'Triggers: regulation, insurance requirements, breach losses and enterprise budgets.',
        'Opportunities: security skills, managed services, identity systems and compliance operations.',
        'Failure conditions: platform bundling, privacy backlash, fragmented standards and commoditisation.',
        'No-regret action: strengthen verified security competence and documentation.'
      ]),
      S('Ageing and care reshape labour and capital', [
        'Possible path: ageing populations increase healthcare, home adaptation, care coordination and productivity needs.',
        'Triggers: demographic data, reimbursement, labour shortages and public budgets.',
        'Opportunities: clinical and nonclinical services, assistive technology, housing adaptation and logistics.',
        'Failure conditions: reimbursement pressure, labour constraints and regulation.',
        'No-regret action: focus on trust, safety and essential service quality.'
      ]),
      S('Climate adaptation becomes ordinary infrastructure', [
        'Possible path: water, heat, flood, wildfire and resilience spending becomes embedded in property and public budgets.',
        'Triggers: insurance availability, building codes, municipal plans and infrastructure funding.',
        'Opportunities: engineering, inspection, water, materials, maintenance and risk data.',
        'Failure conditions: unfunded mandates, slow procurement and political delay.',
        'No-regret action: identify locally unavoidable adaptation work.'
      ]),
      S('Trusted human work gains value', [
        'Possible path: abundant synthetic output raises the value of verified identity, judgement, accountability and physical execution.',
        'Triggers: fraud losses, professional liability, customer willingness to pay and regulation.',
        'Opportunities: regulated expertise, skilled trades, sales, care, investigation, auditing and relationship-led services.',
        'Failure conditions: weak credential quality, platform capture or customer price resistance.',
        'No-regret action: combine domain skill, evidence, communication and accountable delivery.'
      ]),
      S('Scenario dashboard', [
        C('Scenario and date.'), C('Three measurable triggers.'), C('Three failure conditions.'), C('Potential career route.'),
        C('Potential business route.'), C('Potential diversified investment research route.'), C('Valuation or financing risk.'),
        C('No-regret action.'), C('Next evidence review date.')
      ])
    ]
  },
  {
    slug: 'scam-protection',
    title: 'Investment Scam Protection Checklist',
    subtitle: 'A verification and incident-response system for impersonation, false platforms, recovery scams and high-pressure offers.',
    audience: 'Any investor, saver or family member approached with an investment, trading, crypto, property or recovery offer.',
    outcome: 'Verify authorisation, identity, custody, documents and payment instructions before money moves.',
    markers: ['INDEPENDENT VERIFICATION', 'AUTHORISATION', 'CUSTODY', 'RECOVERY SCAM'],
    sources: [official.amfChecks, official.amfBlacklists, official.regafi, official.orias, official.esma],
    sections: [
      S('Fraud works through urgency and trust', [
        'Scammers create authority, scarcity, secrecy, social proof or fear of missing out.',
        'Professional design, a copied registration number or a familiar name does not prove identity.',
        'Victims can include experienced people because fraud targets normal decision shortcuts.',
        'Slow the process and verify through independent channels before discussing payment.'
      ]),
      S('Independent identity verification', [
        'Find the legal entity name in the offer and compare it with official registers.',
        'Use contact details obtained independently from the regulator or established official site.',
        'Check domain spelling, registration history, email suffix and physical address.',
        'Call the authorised firm through its official switchboard to confirm the individual and offer.',
        'Beware of clone firms using a real company name with different contact details.'
      ]),
      S('Authorisation and product permission', [
        'Confirm the firm is authorised for the specific service and jurisdiction.',
        'Check warnings and blacklists, but absence from a blacklist is not proof of safety.',
        'Crowdfunding, insurance, credit, investment advice and crypto services may use different registers.',
        'Ask the regulator when the status is unclear rather than accepting the promoter explanation.'
      ]),
      S('Custody and payment', [
        'Identify the regulated custodian, account owner and legal treatment of client assets.',
        'Never pay to a personal account, unrelated company, crypto wallet or newly changed bank instruction without independent confirmation.',
        'Confirm withdrawal rights, transfer restrictions and insolvency treatment.',
        'Test the payment route with the bank fraud team when concern exists.'
      ]),
      S('Return and risk claims', [
        'Guaranteed high return, low risk and immediate liquidity rarely coexist.',
        'Ask for the precise source of return and who bears loss.',
        'Reject screenshots, testimonials and account dashboards as independent evidence.',
        'Check whether returns depend mainly on recruiting new participants or continuously rising prices.',
        'Do not borrow, release home equity or use essential money because the offer is time-limited.'
      ]),
      S('Document review', [
        'Read issuer, product, fee, risk, cancellation, custody and complaint documents.',
        'Check names, registration numbers, addresses and bank details across documents.',
        'Look for copied text, inconsistent jurisdiction, missing audited accounts and impossible claims.',
        'Have complex contracts reviewed before payment, not after a dispute.'
      ]),
      S('Crypto and trading-platform risks', [
        'A visible balance may be a fake interface with no underlying asset.',
        'Small early withdrawals can be allowed to build trust before larger deposits are blocked.',
        'Requests for tax, insurance or unlocking payments before withdrawal are major red flags.',
        'Remote-access software can expose banking and identity information.',
        'Leverage, derivatives and unregulated offshore platforms can create legitimate losses as well as fraud risk.'
      ]),
      S('Recovery scams', [
        'Victims are frequently targeted again by supposed lawyers, regulators, investigators or asset-recovery firms.',
        'No legitimate recovery is guaranteed.', 'Verify identity and authority independently.',
        'Be extremely cautious with upfront fees, secrecy, crypto payment or claims of hacked funds.',
        'Share evidence only through secure official channels.'
      ]),
      S('If money has been sent', [
        'Contact the bank or payment provider immediately and request the fraud process.',
        'Preserve emails, messages, phone numbers, domains, wallet addresses, receipts and account details.',
        'Change compromised passwords and secure email and phone accounts.',
        'Report through the relevant police, regulator and platform routes.',
        'Do not continue paying to unlock or recover funds.',
        'Seek emotional and practical support; shame delays action and benefits the fraudster.'
      ]),
      S('Pre-payment checklist', [
        C('Legal entity verified independently.'), C('Specific authorisation verified.'), C('Official contact confirmed the offer.'),
        C('Custody and client-money treatment understood.'), C('Bank account owner matches the verified entity.'),
        C('Risk and fee documents read.'), C('Return mechanism explained without guarantees.'), C('Withdrawal process tested or documented.'),
        C('No urgency, secrecy or remote access.'), C('A trusted independent person reviewed the evidence.')
      ])
    ]
  },
  {
    slug: 'france-wealth-tax',
    title: 'France 2026 Wealth and Tax Primer',
    subtitle: 'A current official-source orientation to income tax, micro-enterprise, investment wrappers, records and adviser questions.',
    audience: 'A France-based reader preparing tax, business and investment questions for 2026.',
    outcome: 'Build a France-specific fact file and identify which decisions require current professional advice.',
    markers: ['FRANCE 2026', '203,100', '83,600', 'PEA', 'ASSURANCE-VIE'],
    sources: [official.bofipBands, official.micro2026, official.microTax2026, official.microSocial2026, official.impotsPea, official.impotsCapital, official.serviceBusiness, official.franceFormalities],
    sections: [
      S('France 2026 boundary', [
        'This primer is an orientation to official research routes, not a personal tax calculation.',
        'Tax depends on household composition, income type, residence, ownership, business form, dates and elections.',
        'Use the official 2026 position and retain a dated copy or reference.',
        'Do not rely on a threshold without confirming which income year, filing year and activity it applies to.'
      ]),
      S('Income-tax framework', [
        'French income tax uses progressive bands and household quotient rules subject to current law and individual facts.',
        'Identify salary, pension, business, property, investment and exceptional income separately.',
        'Record withholding and prepayments but reconcile them with final liability.',
        'Use BOFiP and impots.gouv.fr for the current bands and treatment, then confirm personal application.'
      ]),
      S('Micro-enterprise 2026 turnover thresholds', [
        'Official 2026 guidance states a EUR 203,100 annual turnover ceiling for qualifying sales activities.',
        'Official 2026 guidance states a EUR 83,600 annual turnover ceiling for qualifying services and relevant accommodation activities.',
        'For mixed activity, total turnover and the services sub-limit must both be monitored.',
        'Thresholds may be prorated for a partial year and differ from VAT thresholds.',
        'Turnover is not profit; the micro regime generally uses standard allowances rather than actual-cost deduction.'
      ]),
      S('Micro social contributions and declarations', [
        'The micro-social system calculates contributions as a percentage of declared turnover under the applicable activity rate.',
        'Declarations are required on the chosen schedule, including zero-turnover periods where required.',
        'Classify the activity correctly because rates and tax categories can differ.',
        'Maintain invoices, turnover records and bank evidence even under a simplified regime.',
        'Compare micro simplicity with actual costs and future growth before assuming it is optimal.'
      ]),
      S('Individual business and company choices', [
        'Compare EI, micro, EURL, SARL, SASU and SAS using liability, partners, social protection, tax, payroll, dividends, finance and administration.',
        'A company is not automatically more tax efficient and may increase annual cost.',
        'Use the official business formalities portal for registrations and changes.',
        'Model how cash reaches the owner and what remains available to the business.',
        'Obtain advice before restructuring an existing profitable activity.'
      ]),
      S('VAT', [
        'VAT thresholds and rules are separate from micro-enterprise turnover eligibility.',
        'Check current thresholds, activity, customer location and place-of-supply rules.',
        'Collected VAT is not business revenue.',
        'Cross-border goods, digital services, imports and mixed activities require extra care.',
        'Invoice wording and records must match the applicable status.'
      ]),
      S('PEA', [
        'The PEA is a French investment wrapper with eligibility, contribution, asset and withdrawal rules.',
        'Tax treatment depends on the age of the plan and the nature of withdrawal under current law.',
        'Compare product fees, underlying assets, diversification and access restrictions.',
        'A PEA tax benefit does not remove market risk or make every eligible security suitable.'
      ]),
      S('Assurance-vie', [
        'Assurance-vie combines an insurance contract wrapper, investment options, beneficiary terms, fees and tax rules.',
        'Treatment can depend on contract age, payment dates, premium amounts and withdrawal composition.',
        'Compare entry, management, fund, arbitration and guarantee costs.',
        'Review beneficiary wording and estate consequences with appropriate advice.',
        'Do not confuse the insurer guarantee framework with a guarantee of investment performance.'
      ]),
      S('Investment income and PFU questions', [
        'Investment income and gains may be subject to flat-rate or progressive treatment depending on current rules and elections.',
        'An election may apply broadly rather than to one isolated item; confirm before choosing.',
        'Social-contribution rates and exceptions can change and may differ by product.',
        'Record acquisition cost, fees, distributions, disposals and foreign withholding.'
      ]),
      S('Property, wealth and succession questions', [
        'Property income, capital gains, local taxes, financing and wealth-tax exposure require asset-specific facts.',
        'IFI and exemption questions depend on net taxable real-estate assets, debt and professional-use rules.',
        'Succession and gifts depend on relationship, allowances, ownership rights, prior gifts and timing.',
        'Use a notaire or specialist adviser where property ownership, family transfer or estate planning is material.'
      ]),
      S('France annual file', [
        C('Household and residence facts.'), C('Income by category.'), C('Withholding and prepayments.'), C('Business turnover and activity classification.'),
        C('VAT position.'), C('Investment statements and acquisition costs.'), C('Property income, debt and works.'),
        C('Pension and insurance contributions.'), C('Gifts, succession and beneficiary changes.'), C('Foreign accounts, income or assets.'),
        C('Official sources checked with date.'), C('Professional questions and written answers.')
      ])
    ]
  },
  {
    slug: 'calculators-checklist',
    title: 'Wealth Calculators and Annual Review Checklist',
    subtitle: 'Transparent formulas for compounding, inflation, fees, debt, runway, break-even and concentration.',
    audience: 'A reader who wants repeatable calculations and a disciplined annual financial review.',
    outcome: 'Build a calculation workbook using documented inputs, downside cases and annual review evidence.',
    markers: ['COMPOUNDING', 'FEE DRAG', 'BREAK-EVEN', 'ANNUAL REVIEW'],
    sources: [official.ecb, official.eurostat, official.banqueFrance, official.amfChecks, official.insee],
    sections: [
      S('Calculator rules', [
        'A formula is only as reliable as its inputs and assumptions.', 'Label every input as known, estimated or scenario.',
        'Use nominal and inflation-adjusted results separately.', 'Show fees, tax and timing rather than hiding them in one return assumption.',
        'Use downside, base and upside cases without presenting any as guaranteed.'
      ]),
      S('Net worth', [
        'Net worth = assets at reasonable current value minus liabilities.',
        'Do not count gross business revenue, credit limits or inaccessible expected inheritance as current assets.',
        'Use conservative sale values and include tax or transaction cost where material.',
        'Track liquid net worth separately from total net worth.'
      ]),
      S('Savings rate', [
        'Savings rate = retained after-tax cash divided by after-tax cash inflow.',
        'Define whether debt principal, pension contributions and business reinvestment are included, then use the definition consistently.',
        'Review the rate alongside quality of life and resilience, not as a moral score.',
        'Increase dependable income and remove large leakage before extreme cuts to essentials.'
      ]),
      S('Emergency reserve', [
        'Reserve months = accessible emergency cash divided by essential monthly expenditure.',
        'Adjust target for income stability, dependants, insurance, health, business ownership and access to support.',
        'Do not count volatile investments or unused credit as equivalent cash.',
        'Set replenishment rules after use.'
      ]),
      S('Compounding', [
        'Future value depends on starting amount, contribution timing, return, time and fees.',
        'Constant annual return is an educational simplification; real returns are uneven.',
        'Test lower return, missed contributions and delayed start.',
        'Separate investment growth from contributions to understand the real driver.'
      ]),
      S('Inflation-adjusted value', [
        'Real value approximates nominal value divided by cumulative inflation.',
        'Use a scenario range rather than assuming one permanent inflation rate.',
        'Different household spending patterns can experience different effective inflation.',
        'A higher nominal return does not guarantee a higher risk-adjusted real outcome.'
      ]),
      S('Fee drag', [
        'Total annual cost includes product, platform, advice, trading, spread, FX and performance fees.',
        'Compare portfolios using the same gross-return assumption to isolate cost.',
        'A fee can be justified only by suitable value, service or risk management - not by past marketing claims.',
        'Record costs in currency and percentage terms.'
      ]),
      S('Debt payoff', [
        'Amortisation depends on balance, rate, payment, fees and compounding frequency.',
        'If payment does not exceed interest and charges, the balance may not decline.',
        'Compare avalanche, snowball and refinancing using behaviour and total cost.',
        'Check early-repayment charges and lost protections before changing loans.'
      ]),
      S('Business break-even', [
        'Contribution per unit = selling price minus variable cost.',
        'Break-even units = fixed costs divided by contribution per unit.',
        'Include owner labour, returns, payment fees, defects and tax reserves in decision analysis.',
        'Cash break-even can differ from accounting break-even because of payment timing, inventory and debt.'
      ]),
      S('Cash runway', [
        'Runway months = available operating cash divided by conservative monthly net cash outflow.',
        'Exclude restricted cash, tax money and customer deposits that must fund delivery.',
        'Model slower collection and lower sales.', 'Set action thresholds before runway becomes critical.'
      ]),
      S('Concentration', [
        'Largest exposure percentage should be calculated for employer income, customers, assets, sectors, property, bank and currency.',
        'Look through funds where a small number of holdings dominate.',
        'Include future income and pension exposure in the same economic system.',
        'Set limits based on ruin risk and liquidity, not a generic number.'
      ]),
      S('Annual review checklist', [
        C('Net worth and liquid net worth updated.'), C('Savings rate and emergency reserve calculated.'), C('Debt rates and payoff dates updated.'),
        C('Portfolio allocation, concentration and fees measured.'), C('Investment policy reviewed.'), C('Insurance and beneficiaries reviewed.'),
        C('Business margin, break-even and runway updated.'), C('Tax records and allowances reviewed.'), C('Estate and access records reviewed.'),
        C('One-year goals and automatic contributions set.'), C('Professional advice questions prepared.'), C('Next review scheduled.')
      ])
    ]
  }
];

function addMissingGuides() {
  const existing = new Set(guides.map(guide => guide.slug));
  const required = [
    ['wealth-roadmap', 'The 12-Stage Wealth Creation Roadmap'],
    ['where-money-is-going', 'Where the Money Is Going - Capital Flow Field Guide'],
    ['opportunity-radar', 'Opportunity Radar - Research Before You Invest'],
    ['investing-basics', 'How to Invest - Beginner Evidence Guide'],
    ['copy-the-rich', 'Copy the Rich - Principles You Can Adapt'],
    ['income-creation', 'Income Creation Playbook'],
    ['business-builder', 'Business Creation Engine'],
    ['legal-tax-efficiency', 'Keep More Legally - Tax Efficiency Checklist'],
    ['financial-leakage', 'Money Leakage Audit'],
    ['wealth-structures', 'Companies, Holdings, Trusts and Wealth Structures'],
    ['start-today', 'What To Do Today - Quick Start Guide'],
    ['future-of-money', 'The Future of Making Money - Scenario Map'],
    ['scam-protection', 'Investment Scam Protection Checklist'],
    ['france-wealth-tax', 'France 2026 Wealth and Tax Primer'],
    ['calculators-checklist', 'Wealth Calculators and Annual Review Checklist']
  ];
  for (const [slug, title] of required) if (!existing.has(slug)) throw new Error(`Detailed guide definition missing: ${title}`);
}
addMissingGuides();

function buildPdf(guide, sections) {
  const pages = [];
  const pushPage = items => pages.push(items);
  pushPage([
    { kind: 'cover-title', text: guide.title },
    { kind: 'cover-subtitle', text: guide.subtitle },
    { kind: 'cover-rule', text: '' },
    { kind: 'cover-label', text: 'MATRIX REPROGRAMMED - DETAILED WEALTH GUIDE' },
    { kind: 'cover-body', text: `Reader outcome: ${guide.outcome}` },
    { kind: 'cover-body', text: `Best for: ${guide.audience}` },
    { kind: 'cover-body', text: `Edition checked: ${today}` },
    { kind: 'cover-boundary', text: 'Educational information only. No personalised financial, investment, legal or tax advice. No guaranteed outcomes.' }
  ]);
  const toc = sections.map((section, index) => ({ kind: 'toc', text: `${index + 1}. ${section.title}` }));
  pushPage([{ kind: 'page-title', text: 'CONTENTS' }, ...toc]);

  let current = [];
  let used = 0;
  const capacity = 24;
  const flush = () => { if (current.length) { pushPage(current); current = []; used = 0; } };
  for (const [sectionIndex, section] of sections.entries()) {
    const heading = { kind: 'heading', text: `${sectionIndex + 1}. ${section.title}` };
    const headingCost = 3;
    if (used + headingCost > capacity) flush();
    current.push(heading); used += headingCost;
    for (const original of section.lines || []) {
      const checkbox = /^\[ \]/.test(original);
      const numbered = /^\d+\./.test(original);
      const lines = wrap(original, checkbox ? 80 : 86);
      for (const [lineIndex, line] of lines.entries()) {
        const item = { kind: checkbox ? 'checkbox' : numbered ? 'numbered' : 'body', text: lineIndex ? `  ${line}` : line };
        if (used + 1 > capacity) flush();
        current.push(item); used += 1;
      }
    }
    if (used + 1 > capacity) flush();
    current.push({ kind: 'space', text: '' }); used += 1;
  }
  flush();

  const objects = [];
  const add = value => (objects.push(value), objects.length);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = [];
  const contentIds = [];

  pages.forEach((items, pageIndex) => {
    let stream = 'q\n0.025 0.03 0.04 rg\n0 758 595 84 re f\nQ\n';
    stream += 'q\n0.77 0.58 0.18 rg\n38 750 519 3 re f\nQ\n';
    stream += 'BT\n0.08 0.08 0.08 rg\n/F1 9 Tf\n42 720 Td\n';
    let first = true;
    for (const item of items) {
      const settings = {
        'cover-title': ['/F2 22 Tf\n', 0],
        'cover-subtitle': ['/F1 12 Tf\n', 34],
        'cover-rule': ['/F1 4 Tf\n', 20],
        'cover-label': ['/F2 10 Tf\n', 28],
        'cover-body': ['/F1 10 Tf\n', 28],
        'cover-boundary': ['/F2 9 Tf\n', 42],
        'page-title': ['/F2 18 Tf\n', 0],
        'toc': ['/F1 10 Tf\n', 21],
        'heading': ['/F2 12 Tf\n', 0],
        'checkbox': ['/F1 9 Tf\n', 16],
        'numbered': ['/F1 9 Tf\n', 15],
        'body': ['/F1 9 Tf\n', 14],
        'space': ['/F1 6 Tf\n', 8]
      }[item.kind] || ['/F1 9 Tf\n', 14];
      if (!first) stream += `0 -${settings[1]} Td\n`;
      first = false;
      stream += settings[0];
      if (item.kind !== 'space' && item.kind !== 'cover-rule') stream += `(${pdfEscape(item.text).slice(0, 150)}) Tj\n`;
    }
    stream += 'ET\n';
    stream += 'q\n0.94 0.94 0.94 rg\n0 0 595 34 re f\nQ\n';
    stream += `BT\n0.2 0.2 0.2 rg\n/F1 8 Tf\n42 13 Td\n(Matrix Reprogrammed | ${pdfEscape(guide.slug)} | ${today} | page ${pageIndex + 1} of ${pages.length}) Tj\nET`;
    contentIds.push(add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
    pageIds.push(null);
  });

  const pagesId = add('');
  for (let i = 0; i < pages.length; i++) {
    pageIds[i] = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`);
  }
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  const info = add(`<< /Title (${pdfEscape(guide.title)}) /Author (Matrix Reprogrammed) /Subject (${pdfEscape(guide.subtitle)}) /Keywords (wealth education evidence checklist) /CreationDate (D:${today.replace(/-/g, '')}) >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { bytes: Buffer.from(output, 'binary'), pageCount: pages.length };
}

function patchPublicCards(core) {
  const descriptions = new Map(guides.map(guide => [guide.slug, guide.subtitle]));
  core.downloads = (core.downloads || []).map(item => {
    const guide = guides.find(candidate => candidate.slug === item.slug);
    return guide ? { ...item, title: guide.title, description: guide.subtitle, detailed: true } : item;
  });
  core.updated = today;
  writeJson('data/making-money-core.json', core);

  const jsPath = 'making-money.js';
  let js = read(jsPath);
  const generic = '<p>Branded Matrix Reprogrammed educational guide with checklist, evidence boundary and next actions.</p>';
  const detailed = '<p>${esc(x.description||\'Detailed subject-specific Matrix Reprogrammed guide with evidence checks, worksheets and next actions.\')}</p>';
  if (js && js.includes(generic)) js = js.replace(generic, detailed);
  write(jsPath, js);

  const htmlPath = 'making-money.html';
  let html = read(htmlPath);
  html = html.replace('Every major guide is generated as a free Matrix Reprogrammed PDF during the site build.', 'Sixteen detailed subject-specific guides are rebuilt from their own content plans, with evidence checks, worksheets, official research routes and practical next actions.');
  write(htmlPath, html);

  return descriptions;
}

function protectDetailedGuides() {
  const deepPath = 'scripts/build-deep-pdf-intelligence.mjs';
  let deep = read(deepPath);
  if (deep.includes('wealth=blackOnly?[]:buildWealth()')) deep = deep.replace('wealth=blackOnly?[]:buildWealth()', 'wealth=[]');
  write(deepPath, deep);

  const allPath = 'scripts/build-all-branded-download-pdfs.js';
  let all = read(allPath);
  if (all && !all.includes("run('build-detailed-wealth-guides.js')")) {
    all = all.replace("run('relocate-pdf-report-manifests.js');\nexecFileSync", "run('relocate-pdf-report-manifests.js');\nrun('build-detailed-wealth-guides.js');\nexecFileSync");
  }
  write(allPath, all);
}

function build() {
  const core = readJson('data/making-money-core.json');
  if (!core || !Array.isArray(core.downloads)) throw new Error('data/making-money-core.json is missing its downloads array');
  const expected = new Set(core.downloads.map(item => item.slug));
  for (const guide of guides) if (!expected.has(guide.slug)) throw new Error(`Core download entry missing: ${guide.slug}`);

  ensure('downloads/wealth-guides');
  const index = [];
  for (const guide of guides) {
    const sections = [...guide.sections, ...commonSections(guide)];
    const result = buildPdf(guide, sections);
    const output = `downloads/wealth-guides/${guide.slug}.pdf`;
    fs.writeFileSync(full(output), result.bytes);
    const wordCount = sections.flatMap(section => section.lines || []).join(' ').split(/\s+/).filter(Boolean).length;
    index.push({
      slug: guide.slug,
      title: guide.title,
      description: guide.subtitle,
      url: output,
      pageCount: result.pageCount,
      sectionCount: sections.length,
      wordCount,
      sourceCount: guide.sources.length,
      markers: guide.markers,
      detailed: true,
      generatedAt
    });
  }
  const descriptions = patchPublicCards(core);
  protectDetailedGuides();
  writeJson('downloads/wealth-guides/index.json', { version: 3, updated: generatedAt, count: index.length, purpose: 'Detailed subject-specific financial education guides. Each guide has its own content plan, worksheets, evidence boundaries and official research routes.', guides: index });
  writeJson('data/detailed-wealth-guides.json', { version: 1, updated: generatedAt, count: guides.length, guides: guides.map(guide => ({ slug: guide.slug, title: guide.title, description: descriptions.get(guide.slug), audience: guide.audience, outcome: guide.outcome, markers: guide.markers, sources: guide.sources.map(([name, url]) => ({ name, url })) })) });
  console.log(`Detailed wealth guide library built: ${index.length} guides, ${index.reduce((sum, item) => sum + item.pageCount, 0)} total pages.`);
}

build();
