function extractApp(text, src) {
  const r = { kind: 'application', src, folder: sourceGroupKey(src), phones: [], emails: [] };
  const lines = String(text || '').split(/\n+/).map(x => String(x || '').trim()).filter(Boolean);
  const joined = lines.join('\n');

  r.company =
    cleanCompany(boundedField(valueAfterFrom(lines, 'Legal Company Name', 0).value)) ||
    cleanCompany(boundedField(valueAfterFrom(lines, 'Legal Business Name', 0).value)) ||
    cleanCompany(boundedField(valueAfterFrom(lines, 'Business Name', 0).value)) ||
    cleanCompany(boundedField(valueAfterFrom(lines, 'Company Name', 0).value)) ||
    companyFromFilename(src) ||
    sourceGroupKey(src);

  const first = boundedField(valueAfterFrom(lines, 'First Name', 0).value).replace(/[^A-Za-z\- ']/g, '').trim();
  const last = boundedField(valueAfterFrom(lines, 'Last Name', 0).value).replace(/[^A-Za-z\- ']/g, '').trim();
  const ownerVal =
    valueAfterFrom(lines, 'Full Name', 0).value ||
    valueAfterFrom(lines, 'Owner Name', 0).value ||
    valueAfterFrom(lines, 'Applicant Name', 0).value ||
    valueAfterFrom(lines, 'Name Printed', 0).value;
  r.owner = boundedField(ownerVal).replace(/\s*:\s*$/, '') || cleanSpace(first + ' ' + last);

  function addressFromLabel(labels) {
    for (const label of labels) {
      const hit = valueAfterFrom(lines, label, 0);
      if (hit.index < 0) continue;
      const line = lines[hit.index] || '';
      const labelEsc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const structured = line.match(new RegExp(labelEsc + '\\s*:\\s*(.*?)\\s+City\\s*:\\s*(.*?)\\s+State\\s*:\\s*([A-Za-z]{2})\\s+Zip(?: Code)?\\s*:\\s*([0-9-]+)', 'i'));
      let street = structured ? structured[1] : boundedField(hit.value);
      const blockStart = hit.index;
      let city = structured ? structured[2] : boundedField(valueAfterFrom(lines, 'City', blockStart, blockStart + 18).value);
      let st = structured ? structured[3] : boundedField(valueAfterFrom(lines, 'State', blockStart, blockStart + 18).value);
      let zip = structured ? structured[4] : boundedField(valueAfterFrom(lines, 'Zip', blockStart, blockStart + 18).value);
      street = cleanAddressPart(street);
      city = cleanAddressPart(city);
      st = cleanAddressPart(st).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
      zip = cleanAddressPart(zip).match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '';
      const locality = [city, st].filter(Boolean).join(', ') + (zip ? ' ' + zip : '');
      const value = [street, locality].filter(Boolean).join(', ').replace(/\s+,/g, ',').replace(/(?:,\s*){2,}/g, ', ').trim();
      if (value) return value;
    }
    return '';
  }

  r.business_address = addressFromLabel(['Business Address', 'Physical Address', 'Business Street Address']);
  r.application_address = addressFromLabel(['Applicant Address', 'Home Address', 'Residential Address', 'Mailing Address']);
  r.address = r.business_address || r.application_address;

  r.dob = normalizeDOB(labeledDateValue(lines, ['Date of Birth', 'DOB', 'Birth Date']));
  r.app_date = normalizeDateField(labeledDateValue(lines, ['Application Date', 'Date Signed', 'Signature Date', 'Signed Date']));
  r.start_date = normalizeDateField(labeledDateValue(lines, ['Business Start Date', 'Start Date', 'Date Business Started', 'Business Established', 'Date Established']));

  const ssn = joined.match(/(?:Social Security NO|Social Security|SSN)[^\d]{0,20}(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})/i);
  r.ssn = ssn ? ssn[1] + '-' + ssn[2] + '-' + ssn[3] : '';
  const ein = joined.match(/(?:Tax ID|EIN|Federal Tax ID|FEIN)[^\d]{0,20}(\d{2})[-\s]?(\d{7})/i) || joined.match(/\b(\d{2})[-\s](\d{7})\b/);
  r.ein = ein ? ein[1] + '-' + ein[2] : '';

  const rawPhones = joined.match(/(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/g) || [];
  r.phones = [...new Set(rawPhones.map(p => digits(p).slice(-10)).filter(d => d.length === 10).map(d => '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)))].slice(0, 8);
  r.emails = extractApplicationEmails(joined);

  const revenueResult = extractApplicationRevenue(lines);
  r.revenue = revenueResult.value;
  r.revenue_source = revenueResult.source;
  return r;
}
function prettyFunder(name) {
  return cleanSpace(name).replace(/\b\w/g, c => c.toUpperCase());
}

const MCA_ALIASES = {
  'FundX': ['fundx','fund x'],
  'Forward Financing': ['forward financing','forward financin','forwardfinance'],
  'Shopify Capital': ['shopify capital','shopify repay','shopify repayments'],
  'Expansion Capital': ['expansioncap','expansion capital','expansion cap'],
  'Fintech Capital': ['fintech capital','fintechcapital'],
  'Forest Capital': ['forest capital'],
  'Millstone Funding': ['millstone fundin','millstone funding','millstone fund'],
  'Flow Capital': ['flow capital'],
  '26 Capital': ['26 capital'],
  'Barclays Advance': ['barclays advance'],
  'Viking Funding': ['viking funding','viking funding ii','viking funding i i'],
  'Giggle Finance': ['giggle finance'],
  'DoorDash Capital': ['doordash capital','door dash capital'],
  'OnDeck': ['ondeck','on deck'],
  'Rapid Finance': ['rapid finance'],
  'Kapitus': ['kapitus'],
  'Fora Financial': ['fora financial'],
  'Credibly': ['credibly'],
  'National Funding': ['national funding'],
  'Everest Business Funding': ['everest business funding','everest funding'],
  'QuickBridge': ['quickbridge','quick bridge'],
  'Square Capital': ['square capital'],
  'PayPal Working Capital': ['paypal working capital','paypal wc'],
  'Stripe Capital': ['stripe capital'],
  'Toast Capital': ['toast capital'],
  'BlueVine': ['bluevine'],
  'Fundbox': ['fundbox']
};
const MCA_LINE_EXCLUDES = [
  'capital one      mobile pmt','capital one      online pmt','capital one      crcardpmt',
  'capital one mobile pmt','capital one online pmt','crcardpmt  capital one',
  'mobile pmt capital one','online pmt capital one','ach web mobile pmt capital one','ach web online pmt capital one',
  'credit card','crcardpmt','card pmt','cc pmt','crc ardpmt',
  'payroll','adp tax','adp 401k','insurance','utility','rent','lease','service charge','monthly service fee',
  'square inc','toast dep','grubhub','uber','doordash, inc.','dd *doordash','doordash*','shopify payout','stripe payout','paypal transfer',
  'merchant service merch dep','advance auto','cont finance','sig properties'
];
function canonLine(s) { return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').toLowerCase(); }
function canonicalMCA(line) {
  const low = canonLine(line);
  for (const bad of MCA_LINE_EXCLUDES) if (low.includes(bad)) return null;
  if (low.includes('capital one') && !/capital one\s+(business\s+)?(loan|funding|capital)/i.test(low)) return null;
  for (const [canon, aliases] of Object.entries(MCA_ALIASES)) {
    if (aliases.some(a => low.includes(a))) return canon;
  }
  if (/\b(merchant cash advance|cash advance|future receivables|receivables purchase|mca debit|mca payment)\b/i.test(low)) return 'Generic MCA';
  return null;
}
function mcaFreq(count) {
  const n = Number(count) || 0;
  if (n >= 12) return 'daily';
  if (n >= 2) return 'weekly';
  return 'monthly';
}
function mcaSectionKind(line,current='') {
  const low=canonLine(line);
  if (/(deposits?\s*(?:&|and)?\s*credits?|credits?\s*(?:&|and)?\s*deposits?|deposits\/other credits|deposits and other credits)/i.test(low)) return 'credit';
  if (/(withdrawals?|debits?|checks paid|electronic withdrawals?|other withdrawals?|payments and other debits|withdrawals and other debits|debits and withdrawals)/i.test(low)) return 'debit';
  return current;
}
function mcaLineIsDebit(line,section,previousLine='',nextLine='') {
  const raw=String(line||''),context=[previousLine,raw,nextLine].join(' ');
  if (/(?:^|\s)-\s*\$?\s*\d[\d,]*\.\d{2}\b|\(\s*\$?\s*\d[\d,]*\.\d{2}\s*\)|\$?\s*[0-9][0-9,]*\.\d{2}­/.test(raw)) return true;
  if (/\b(?:ach\s+debit|debit|withdrawal|external\s+withdrawal|e\s+withdrawal|payment|pmt)\b/i.test(raw)) return true;
  if (/\b(?:deposit|credit|external\s+deposit|e\s+deposit)\b/i.test(raw)) return false;
  if (/\b(?:wire\s+type\s*:\s*wire\s+in|loan\s+proceeds|funding)\b/i.test(context)) return false;
  if (section==='credit') return false;
  return true;
}
