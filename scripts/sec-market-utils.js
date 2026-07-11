const crypto = require('crypto');

function clean(value = '', max = 1000) {
  const text = String(value ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function stableId(prefix, ...parts) {
  return `${prefix}-${sha256(parts.join('|')).slice(0, 24)}`;
}

function xmlBlocks(xml, tag) {
  const expression = new RegExp(`<(?:(?:[a-zA-Z0-9_-]+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[a-zA-Z0-9_-]+):)?${tag}>`, 'gi');
  return [...String(xml || '').matchAll(expression)].map(match => match[1]);
}

function xmlValue(xml, tag, fallback = '') {
  const block = xmlBlocks(xml, tag)[0];
  return block == null ? fallback : clean(block, 4000);
}

function nestedValue(xml, parents, tag, fallback = '') {
  let current = String(xml || '');
  for (const parent of parents || []) {
    const block = xmlBlocks(current, parent)[0];
    if (block == null) return fallback;
    current = block;
  }
  return xmlValue(current, tag, fallback);
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

const transactionCodes = {
  P: { category: 'open-market-purchase', label: 'Open-market or private purchase', direction: 'buy', marketTrade: true },
  S: { category: 'open-market-sale', label: 'Open-market or private sale', direction: 'sell', marketTrade: true },
  A: { category: 'award-or-acquisition', label: 'Grant, award or other acquisition', direction: 'acquire', marketTrade: false },
  D: { category: 'disposition-to-issuer', label: 'Disposition back to issuer', direction: 'dispose', marketTrade: false },
  F: { category: 'tax-or-exercise-withholding', label: 'Shares delivered or withheld for exercise price or tax', direction: 'dispose', marketTrade: false },
  M: { category: 'derivative-exercise-or-conversion', label: 'Exercise or conversion of derivative security', direction: 'acquire', marketTrade: false },
  G: { category: 'gift', label: 'Bona fide gift', direction: 'other', marketTrade: false },
  J: { category: 'other-described-transaction', label: 'Other transaction described in filing footnotes', direction: 'other', marketTrade: false },
  C: { category: 'derivative-conversion', label: 'Conversion of derivative security', direction: 'other', marketTrade: false },
  X: { category: 'derivative-exercise', label: 'Exercise of derivative security', direction: 'other', marketTrade: false },
  I: { category: 'discretionary-transaction', label: 'Discretionary transaction', direction: 'other', marketTrade: false },
  K: { category: 'equity-swap', label: 'Equity swap or similar instrument', direction: 'other', marketTrade: false },
  U: { category: 'tender-disposition', label: 'Disposition through tender in change of control', direction: 'dispose', marketTrade: false },
  W: { category: 'will-or-descent', label: 'Acquisition or disposition by will or descent', direction: 'other', marketTrade: false },
  Z: { category: 'voting-trust', label: 'Deposit into or withdrawal from voting trust', direction: 'other', marketTrade: false },
  V: { category: 'voluntary-report', label: 'Voluntarily reported transaction', direction: 'other', marketTrade: false }
};

function classifyTransactionCode(code, acquiredDisposed = '') {
  const normalized = String(code || '').trim().toUpperCase();
  const base = transactionCodes[normalized] || {
    category: 'other-sec-transaction',
    label: normalized ? `SEC transaction code ${normalized}` : 'Transaction code unavailable',
    direction: String(acquiredDisposed || '').toUpperCase() === 'A' ? 'acquire' : String(acquiredDisposed || '').toUpperCase() === 'D' ? 'dispose' : 'other',
    marketTrade: false
  };
  return { code: normalized, ...base };
}

function parseOwners(xml) {
  return xmlBlocks(xml, 'reportingOwner').map((block, index) => {
    const relationship = xmlBlocks(block, 'reportingOwnerRelationship')[0] || '';
    return {
      cik: xmlValue(block, 'rptOwnerCik'),
      name: xmlValue(block, 'rptOwnerName') || `Reporting owner ${index + 1}`,
      isDirector: booleanValue(xmlValue(relationship, 'isDirector')),
      isOfficer: booleanValue(xmlValue(relationship, 'isOfficer')),
      isTenPercentOwner: booleanValue(xmlValue(relationship, 'isTenPercentOwner')),
      isOther: booleanValue(xmlValue(relationship, 'isOther')),
      officerTitle: xmlValue(relationship, 'officerTitle'),
      otherText: xmlValue(relationship, 'otherText')
    };
  });
}

function ownerRoles(owner) {
  const roles = [];
  if (owner.isDirector) roles.push('director');
  if (owner.isOfficer) roles.push(owner.officerTitle ? `officer: ${owner.officerTitle}` : 'officer');
  if (owner.isTenPercentOwner) roles.push('10% owner');
  if (owner.isOther) roles.push(owner.otherText || 'other reporting relationship');
  return roles;
}

function parseTransactionBlock(block, context, derivative = false, index = 0) {
  const acquiredDisposed = nestedValue(block, ['transactionAmounts'], 'transactionAcquiredDisposedCode');
  const code = nestedValue(block, ['transactionCoding'], 'transactionCode');
  const classification = classifyTransactionCode(code, acquiredDisposed);
  const shares = numberValue(nestedValue(block, ['transactionAmounts'], derivative ? 'transactionShares' : 'transactionShares'));
  const price = numberValue(nestedValue(block, ['transactionAmounts'], 'transactionPricePerShare'));
  const postShares = numberValue(nestedValue(block, ['postTransactionAmounts'], derivative ? 'sharesOwnedFollowingTransaction' : 'sharesOwnedFollowingTransaction'));
  const directIndirect = nestedValue(block, ['ownershipNature'], 'directOrIndirectOwnership');
  const nature = nestedValue(block, ['ownershipNature'], 'natureOfOwnership');
  const securityTitle = nestedValue(block, ['securityTitle'], 'value') || xmlValue(block, 'securityTitle');
  const transactionDate = nestedValue(block, ['transactionDate'], 'value') || context.periodOfReport || context.filingDate;
  const transactionValue = shares != null && price != null ? shares * price : null;
  return {
    id: stableId('sec-form4-transaction', context.accessionNumber, derivative ? 'derivative' : 'non-derivative', index, securityTitle, transactionDate, code, shares, price),
    filingType: context.form,
    filingAccession: context.accessionNumber,
    filingDate: context.filingDate,
    periodOfReport: context.periodOfReport,
    sourceUrl: context.sourceUrl,
    issuer: context.issuer,
    reportingOwners: context.reportingOwners,
    reportingOwnerNames: context.reportingOwners.map(owner => owner.name),
    reportingOwnerRoles: context.reportingOwners.flatMap(ownerRoles),
    securityTitle,
    derivative,
    underlyingSecurityTitle: derivative ? nestedValue(block, ['underlyingSecurity'], 'underlyingSecurityTitle') : '',
    underlyingShares: derivative ? numberValue(nestedValue(block, ['underlyingSecurity'], 'underlyingSecurityShares')) : null,
    conversionOrExercisePrice: derivative ? numberValue(nestedValue(block, [], 'conversionOrExercisePrice')) : null,
    transactionDate,
    transactionCode: classification.code,
    transactionCategory: classification.category,
    transactionLabel: classification.label,
    direction: classification.direction,
    marketTrade: classification.marketTrade,
    acquiredDisposed: String(acquiredDisposed || '').toUpperCase(),
    shares,
    pricePerShare: price,
    reportedTransactionValue: transactionValue,
    sharesOwnedFollowing: postShares,
    ownershipForm: String(directIndirect || '').toUpperCase() === 'I' ? 'indirect' : String(directIndirect || '').toUpperCase() === 'D' ? 'direct' : 'not-stated',
    natureOfOwnership: nature,
    tenB5One: booleanValue(xmlValue(block, 'transactionCoding')) && /10b5/i.test(block),
    evidenceGrade: 'A',
    factualStatus: classification.marketTrade ? 'reported-insider-market-transaction' : 'reported-insider-other-transaction',
    establishes: `The SEC Form 4 reports transaction code ${classification.code || 'not stated'} for ${shares == null ? 'an unstated number of' : shares} ${securityTitle || 'securities'} on ${transactionDate || 'the reported date'}.`,
    doesNotEstablish: classification.marketTrade
      ? 'The filing reports a transaction but does not establish motive, investment merit, coordination, continuing ownership today or wrongdoing.'
      : 'This transaction is not classified as an ordinary open-market purchase or sale. It may reflect compensation, exercise, tax withholding, a gift or another filing-defined event and does not establish an investment decision or wrongdoing.',
    reviewStatus: 'official-filing-machine-parsed'
  };
}

function parseForm4(xml, filing = {}) {
  if (!/<(?:(?:[a-zA-Z0-9_-]+):)?ownershipDocument\b/i.test(String(xml || ''))) throw new Error('Not an ownershipDocument XML filing');
  const issuerBlock = xmlBlocks(xml, 'issuer')[0] || '';
  const issuer = {
    cik: xmlValue(issuerBlock, 'issuerCik'),
    name: xmlValue(issuerBlock, 'issuerName'),
    ticker: xmlValue(issuerBlock, 'issuerTradingSymbol')
  };
  const reportingOwners = parseOwners(xml);
  const context = {
    form: filing.form || xmlValue(xml, 'documentType') || '4',
    accessionNumber: filing.accessionNumber || '',
    filingDate: filing.filingDate || '',
    periodOfReport: filing.reportDate || xmlValue(xml, 'periodOfReport') || '',
    sourceUrl: filing.sourceUrl || '',
    issuer,
    reportingOwners
  };
  const transactions = [];
  xmlBlocks(xml, 'nonDerivativeTransaction').forEach((block, index) => transactions.push(parseTransactionBlock(block, context, false, index)));
  xmlBlocks(xml, 'derivativeTransaction').forEach((block, index) => transactions.push(parseTransactionBlock(block, context, true, index)));
  return {
    filing: {
      id: stableId('sec-form4-filing', context.accessionNumber || context.sourceUrl),
      form: context.form,
      accessionNumber: context.accessionNumber,
      filingDate: context.filingDate,
      periodOfReport: context.periodOfReport,
      sourceUrl: context.sourceUrl,
      issuer,
      reportingOwners,
      evidenceGrade: 'A',
      factualStatus: 'official-sec-form4'
    },
    transactions
  };
}

function holdingKey(holding) {
  return [holding.cusip, holding.titleOfClass, holding.putCall || '', holding.sharesOrPrincipalType || ''].map(value => clean(value, 200).toUpperCase()).join('|');
}

function parse13F(xml, filing = {}) {
  if (!/<(?:(?:[a-zA-Z0-9_-]+):)?informationTable\b/i.test(String(xml || ''))) throw new Error('Not an informationTable XML filing');
  const holdings = xmlBlocks(xml, 'infoTable').map((block, index) => {
    const valueThousands = numberValue(xmlValue(block, 'value'));
    const shares = numberValue(nestedValue(block, ['shrsOrPrnAmt'], 'sshPrnamt'));
    const holding = {
      id: stableId('sec-13f-holding', filing.accessionNumber, index, xmlValue(block, 'cusip'), xmlValue(block, 'nameOfIssuer'), xmlValue(block, 'titleOfClass'), xmlValue(block, 'putCall')),
      managerId: filing.subjectId || '',
      managerName: filing.subjectName || '',
      managerCik: filing.cik || '',
      form: filing.form || '13F-HR',
      accessionNumber: filing.accessionNumber || '',
      filingDate: filing.filingDate || '',
      reportDate: filing.reportDate || '',
      sourceUrl: filing.sourceUrl || '',
      issuerName: xmlValue(block, 'nameOfIssuer'),
      titleOfClass: xmlValue(block, 'titleOfClass'),
      cusip: xmlValue(block, 'cusip'),
      figi: xmlValue(block, 'figi'),
      valueUsdThousands: valueThousands,
      valueUsd: valueThousands == null ? null : valueThousands * 1000,
      sharesOrPrincipalAmount: shares,
      sharesOrPrincipalType: nestedValue(block, ['shrsOrPrnAmt'], 'sshPrnamtType'),
      putCall: xmlValue(block, 'putCall'),
      investmentDiscretion: xmlValue(block, 'investmentDiscretion'),
      otherManager: xmlValue(block, 'otherManager'),
      votingAuthority: {
        sole: numberValue(nestedValue(block, ['votingAuthority'], 'Sole')),
        shared: numberValue(nestedValue(block, ['votingAuthority'], 'Shared')),
        none: numberValue(nestedValue(block, ['votingAuthority'], 'None'))
      },
      evidenceGrade: 'A',
      factualStatus: 'reported-quarter-end-institutional-holding',
      establishes: `The manager reported ${shares == null ? 'an unstated quantity of' : shares} ${xmlValue(block, 'titleOfClass') || 'securities'} of ${xmlValue(block, 'nameOfIssuer') || 'the named issuer'} as of ${filing.reportDate || 'the filing report date'}.`,
      doesNotEstablish: 'Form 13F does not reveal the exact purchase or sale date, execution price, short positions, complete portfolio exposure, present ownership today or investment motive.',
      reviewStatus: 'official-filing-machine-parsed'
    };
    holding.key = holdingKey(holding);
    return holding;
  });
  return {
    filing: {
      id: stableId('sec-13f-filing', filing.accessionNumber || filing.sourceUrl),
      subjectId: filing.subjectId || '',
      managerName: filing.subjectName || '',
      managerCik: filing.cik || '',
      form: filing.form || '13F-HR',
      accessionNumber: filing.accessionNumber || '',
      filingDate: filing.filingDate || '',
      reportDate: filing.reportDate || '',
      sourceUrl: filing.sourceUrl || '',
      holdingCount: holdings.length,
      totalReportedValueUsd: holdings.reduce((sum, holding) => sum + Number(holding.valueUsd || 0), 0),
      evidenceGrade: 'A',
      factualStatus: 'official-sec-form13f'
    },
    holdings
  };
}

function compare13F(currentFiling, currentHoldings, previousFiling, previousHoldings) {
  const current = new Map((currentHoldings || []).map(holding => [holding.key || holdingKey(holding), holding]));
  const previous = new Map((previousHoldings || []).map(holding => [holding.key || holdingKey(holding), holding]));
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const changes = [];
  for (const key of keys) {
    const now = current.get(key) || null;
    const before = previous.get(key) || null;
    const currentShares = Number(now?.sharesOrPrincipalAmount || 0);
    const previousShares = Number(before?.sharesOrPrincipalAmount || 0);
    const shareChange = currentShares - previousShares;
    let changeType = 'unchanged';
    if (!before && now) changeType = 'new-position';
    else if (before && !now) changeType = 'exited-position';
    else if (shareChange > 0) changeType = 'increased-position';
    else if (shareChange < 0) changeType = 'reduced-position';
    if (changeType === 'unchanged') continue;
    const record = now || before;
    const percentChange = previousShares > 0 ? (shareChange / previousShares) * 100 : null;
    changes.push({
      id: stableId('sec-13f-change', currentFiling?.accessionNumber, previousFiling?.accessionNumber, key, changeType),
      managerId: currentFiling?.subjectId || previousFiling?.subjectId || record?.managerId || '',
      managerName: currentFiling?.managerName || previousFiling?.managerName || record?.managerName || '',
      managerCik: currentFiling?.managerCik || previousFiling?.managerCik || record?.managerCik || '',
      issuerName: record?.issuerName || '',
      titleOfClass: record?.titleOfClass || '',
      cusip: record?.cusip || '',
      putCall: record?.putCall || '',
      changeType,
      previousReportDate: previousFiling?.reportDate || '',
      currentReportDate: currentFiling?.reportDate || '',
      previousFilingDate: previousFiling?.filingDate || '',
      currentFilingDate: currentFiling?.filingDate || '',
      previousShares,
      currentShares,
      shareChange,
      percentChange,
      previousValueUsd: before?.valueUsd ?? null,
      currentValueUsd: now?.valueUsd ?? null,
      currentSourceUrl: currentFiling?.sourceUrl || '',
      previousSourceUrl: previousFiling?.sourceUrl || '',
      evidenceGrade: 'A',
      factualStatus: 'inferred-from-consecutive-official-13f-filings',
      establishes: `The manager's reported quarter-end position ${changeType.replace(/-/g, ' ')} between ${previousFiling?.reportDate || 'the previous report'} and ${currentFiling?.reportDate || 'the current report'}.`,
      doesNotEstablish: 'The comparison does not reveal the exact trade date, execution price, whether offsetting derivatives or short positions existed, whether the position remains held today, who made the decision or why it changed.',
      reviewStatus: 'official-filings-machine-compared'
    });
  }
  return changes.sort((a, b) => Math.abs(Number(b.currentValueUsd || b.previousValueUsd || 0)) - Math.abs(Number(a.currentValueUsd || a.previousValueUsd || 0)));
}

module.exports = {
  clean,
  sha256,
  stableId,
  xmlBlocks,
  xmlValue,
  nestedValue,
  numberValue,
  classifyTransactionCode,
  parseForm4,
  parse13F,
  compare13F,
  holdingKey
};
