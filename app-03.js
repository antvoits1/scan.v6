function parseDocumentText(text, fileName) {
  const result = { skipped: false, company: null, owner: null, appRevenue: 0, phone: new Set(), email: new Set(), dob: null, appDate: null, businessAddress: null, appAddress: null, ein: null, bank: null, accountNumber: null, statementMonth: null, deposits: 0, endingBalance: 0, isMtd: false, mcaList: [], dailyCashFlow: null };

  const compMatch = text.match(/(?:Legal\s+Name|Business\s+Name|Company\s+Name|DBA|Legal\s+Business\s+Name)[:\s]+([A-Za-z0-9&,.'\-\s]{3,40})/i);
  if (compMatch && compMatch[1] && !/address|phone|tax|ein/i.test(compMatch[1])) {
    result.company = cleanName(compMatch[1].split('\n')[0]);
  }
  const einMatch = text.match(/(?:EIN|Tax\s+ID|FEIN)[:\s]*(\d{2}-\d{7})\b/i);
  if (einMatch) result.ein = einMatch[1];
  const acctMatch = text.match(/(?:Account\s+Number|Account\s+#|Account)[:\s]*([X*•\d-]{4,18})/i);
  if (acctMatch) result.accountNumber = acctMatch[1].trim();

  const compKey = result.company || (result.ein ? `EIN_${result.ein}` : (result.accountNumber ? `ACCT_${result.accountNumber}` : null));
  const normalizedKey = compKey ? compKey.toLowerCase().replace(/[^a-z0-9]/g, '') : 'unknown';

  const revMatch = text.match(/(?:Annual\s+Gross\s+Sales|Gross\s+Annual\s+Revenue|Annual\s+Revenue|Monthly\s+Gross\s+Sales|Average\s+Monthly\s+Revenue|Monthly\s+Revenue)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (revMatch) {
    let val = parseFloat(revMatch[1].replace(/,/g, ''));
    result.appRevenue = /annual/i.test(revMatch[0]) ? val / 12 : val;
  }
  const endBalMatch = text.match(/(?:Ending\s+Balance|Ending\s+Ledger\s+Balance|New\s+Balance|Closing\s+Balance)[:\s]*\$?(-?[0-9,]+\.[0-9]{2})/i);
  if (endBalMatch) result.endingBalance = parseFloat(endBalMatch[1].replace(/,/g, ''));

  const existing = state.companies.get(normalizedKey);
  const alreadyKept = existing ? existing.isKept : false;
  const passesNow = (result.appRevenue >= state.minRevenue) || (result.endingBalance >= 20000);

  if (!alreadyKept && !passesNow) {
    result.skipped = true;
    return result;
  }

  const ownerMatch = text.match(/(?:Owner|Applicant|Principal|Partner|Guarantor)(?:\s+Name)?[:\s]+([A-Za-z.'\-\s]{3,30})/i);
  if (ownerMatch) result.owner = ownerMatch[1].split('\n')[0].trim();

  const phoneMatches = text.matchAll(/(?:Phone|Cell|Mobile|Tel)?[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/gi);
  for (const m of phoneMatches) { const cleanP = formatPhone(m[1]); if (cleanP) result.phone.add(cleanP); }

  const emailMatches = text.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
  for (const m of emailMatches) result.email.add(m[1].toLowerCase());

  const dobMatch = text.match(/(?:DOB|Date\s+of\s+Birth|Birth\s+Date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (dobMatch) result.dob = dobMatch[1];
  const appDateMatch = text.match(/(?:Date|Signed|Signature\s+Date|Application\s+Date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (appDateMatch && appDateMatch[1] !== result.dob) result.appDate = appDateMatch[1];

  const bAddrMatch = text.match(/(?:Business\s+Address|Physical\s+Address|Address)[:\s]*([0-9A-Za-z\s,.'#-]{8,50}\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+\d{5})/i);
  if (bAddrMatch) result.businessAddress = bAddrMatch[1].replace(/\s+/g, ' ').trim();

  for (const b of BANK_SIGNATURES) { if (b.match.test(text)) { result.bank = b.name; break; } }
  
  const monthMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:\d{1,2},?\s+)?(202[0-9])/i);
  if (monthMatch) result.statementMonth = monthMatch[0].slice(0, 3).toUpperCase();
  if (/MTD|Month\s+to\s+Date/i.test(text)) result.isMtd = true;

  const depMatch = text.match(/(?:Total\s+Deposits|Deposits\s+and\s+other\s+credits|Deposits\s+and\s+Additions|Total\s+Credits)[:\s]*\$?([0-9,]+\.[0-9]{2})/i);
  if (depMatch) result.deposits = parseFloat(depMatch[1].replace(/,/g, ''));

  const textLines = text.split('\n');
  for (const line of textLines) {
    for (const mca of MCA_DESCRIPTORS) {
      if (mca.match.test(line)) {
        const moneyInLine = line.match(/\$?([0-9,]+\.[0-9]{2})/);
        if (moneyInLine) {
          const pmt = parseFloat(moneyInLine[1].replace(/,/g, ''));
          result.mcaList.push({ name: mca.name, payment: pmt, freq: mca.freq, monthly: mca.freq === 'Daily' ? pmt * 21 : pmt * 4.33 });
        }
      }
    }
  }

  const dcfMatch = text.match(/(?:Average\s+Daily\s+Balance|Average\s+Balance|Daily\s+Cash\s+Flow)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (dcfMatch) result.dailyCashFlow = parseFloat(dcfMatch[1].replace(/,/g, ''));

  return result;
}
function cleanName(str) { return str.replace(/[^A-Za-z0-9&,.'\-\s]/g, '').replace(/\s+/g, ' ').trim(); }

function integrateExtractedResult(data) {
  const compKey = data.company || (data.ein ? `EIN_${data.ein}` : (data.accountNumber ? `ACCT_${data.accountNumber}` : 'Unknown Entity'));
  const normalizedKey = compKey.toLowerCase().replace(/[^a-z0-9]/g, '');

  let existing = state.companies.get(normalizedKey);
  if (!existing) {
    existing = { key: normalizedKey, company: data.company || 'Unknown Entity', owner: data.owner || '', approval: '', appRevenue: data.appRevenue || 0, statements: [], phone: new Set(data.phone), email: new Set(data.email), dob: data.dob || '', appDate: data.appDate || '', businessAddress: data.businessAddress || '', appAddress: data.appAddress || '', ein: data.ein || '', banks: new Map(), mcaMap: new Map(), dailyCashFlow: data.dailyCashFlow || null, maxEndingBal: data.endingBalance || 0 };
    state.companies.set(normalizedKey, existing);
  } else {
    if (!existing.owner && data.owner) existing.owner = data.owner;
    if (!existing.dob && data.dob) existing.dob = data.dob;
    if (!existing.appDate && data.appDate) existing.appDate = data.appDate;
    if (!existing.ein && data.ein) existing.ein = data.ein;
    if (data.appRevenue > existing.appRevenue) existing.appRevenue = data.appRevenue;
    data.phone.forEach(p => existing.phone.add(p));
    data.email.forEach(e => existing.email.add(e));
    if (data.dailyCashFlow) existing.dailyCashFlow = data.dailyCashFlow;
  }

  if (data.deposits > 0 || data.endingBalance !== 0 || data.statementMonth) {
    const mon = data.statementMonth || 'MTD';
    const exists = existing.statements.some(s => s.month === mon && s.deposits === data.deposits);
    if (!exists) {
      existing.statements.push({ month: mon, deposits: data.deposits, endingBal: data.endingBalance, isMtd: data.isMtd });
      if (data.endingBalance > existing.maxEndingBal) existing.maxEndingBal = data.endingBalance;
    }
  }

  if (data.bank || data.accountNumber) existing.banks.set(data.bank || 'Bank', data.accountNumber || 'Unknown');
  for (const m of data.mcaList) if (!existing.mcaMap.has(m.name)) existing.mcaMap.set(m.name, m);

  existing.isKept = (existing.appRevenue >= state.minRevenue) || (existing.maxEndingBal >= 20000);
  
  saveRecordToDB(existing);
  renderLiveTable();
}

function renderLiveTable(isFinalSort = false) {
  let keptList = Array.from(state.companies.values()).filter(c => c.isKept);
  state.skippedCompanies = state.companies.size - keptList.length;

  if (isFinalSort) keptList.sort((a, b) => b.appRevenue - a.appRevenue);

  if (keptList.length === 0) {
    return;
  }

  tableBody.innerHTML = '';

  keptList.forEach((comp, idx) => {
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td'); tdNum.className = 'col-num'; tdNum.textContent = idx + 1; tr.appendChild(tdNum);
    const tdComp = document.createElement('td'); tdComp.className = 'col-bold'; tdComp.textContent = comp.company; tr.appendChild(tdComp);
    const tdOwner = document.createElement('td'); tdOwner.textContent = comp.owner; tr.appendChild(tdOwner);
    const tdAppr = document.createElement('td'); tdAppr.className = 'col-money col-bold'; tdAppr.textContent = calculateApproval(comp.appRevenue); tr.appendChild(tdAppr);
    const tdRev = document.createElement('td'); tdRev.className = 'col-money'; tdRev.textContent = comp.appRevenue > 0 ? formatCompactMoney(comp.appRevenue) : ''; tr.appendChild(tdRev);
    
    const tdStmt = document.createElement('td');
    tdStmt.textContent = comp.statements.map(s => `${s.isMtd ? 'MTD ' : `${s.month} `}${formatCompactMoney(s.deposits)} | ${formatCompactMoney(s.endingBal)}`).join(' • ');
    tr.appendChild(tdStmt);

    const tdPhone = document.createElement('td'); tdPhone.textContent = Array.from(comp.phone).join(' • '); tr.appendChild(tdPhone);
    const tdEmail = document.createElement('td'); tdEmail.textContent = Array.from(comp.email).join(' • '); tr.appendChild(tdEmail);
    const tdDob = document.createElement('td'); tdDob.textContent = comp.dob; tr.appendChild(tdDob);
    const tdDate = document.createElement('td'); tdDate.textContent = comp.appDate; tr.appendChild(tdDate);
    const tdBAddr = document.createElement('td'); tdBAddr.textContent = comp.businessAddress; tr.appendChild(tdBAddr);
    const tdAAddr = document.createElement('td'); tdAAddr.textContent = comp.appAddress; tr.appendChild(tdAAddr);
    const tdEin = document.createElement('td'); tdEin.textContent = comp.ein; tr.appendChild(tdEin);
    
    const tdBank = document.createElement('td');
    const bankStrs = []; comp.banks.forEach((acct, bank) => bankStrs.push(`${bank} | ${acct}`));
    tdBank.textContent = bankStrs.join(' • '); tr.appendChild(tdBank);

    const tdMca = document.createElement('td');
    const mcaStrs = []; comp.mcaMap.forEach(m => mcaStrs.push(`${m.name} | ${formatCompactMoney(m.payment)} | ${m.freq} | ${formatCompactMoney(m.monthly)} mo`));
    tdMca.textContent = mcaStrs.join(' • '); tr.appendChild(tdMca);

    const tdDcf = document.createElement('td'); tdDcf.className = 'col-money'; tdDcf.textContent = comp.dailyCashFlow ? formatCompactMoney(comp.dailyCashFlow) : ''; tr.appendChild(tdDcf);

    tableBody.appendChild(tr);
  });
}
