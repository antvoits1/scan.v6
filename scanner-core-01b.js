function statementEnd(text, filename) {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  let m;
  const patterns = [
    [/End\s+Date\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i, 1, 'text-end-date'],
    [/Statement\s+Date\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i, 1, 'text-statement-date'],
    [/Statement\s+Ending\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i, 1, 'text-statement-ending']
  ];
  for (const [re, group, source] of patterns) {
    m = t.match(re);
    if (m) {
      const d = parseDate(m[group]);
      if (d) return [d, source];
    }
  }
  const rangePatterns = [
    /From\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(?:Thru|Through|To)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /For\s+the\s+Period\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(?:to|through|thru|[-–])\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\b(?:from\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*(?:through|thru|to|[-–])\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/i
  ];
  for (const re of rangePatterns) {
    m = t.match(re);
    if (m) {
      const d = parseDate(m[2]);
      if (d) return [d, 'text-range-end'];
    }
  }
  m = t.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*(?:through|thru|to|[-–])\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i);
  if (m) {
    const d = parseDate(m[1]);
    if (d) return [d, 'text-range-end'];
  }
  m = t.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s]+\d{1,2},?\s+\d{4}\s*(?:through|thru|to|[-–])\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s]+\d{1,2},?\s+\d{4})\b/i);
  if (m) { const d = parseDate(m[1]); if (d) return [d, 'text-range-end']; }
  m = t.match(/\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*(?:through|thru|to|[-–])\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/i);
  if (m) { const d = parseDate(m[2].replace(/\./g,'')); if (d) return [d, 'text-range-end']; }
  m = t.match(/Statement\s+Date\s*:?\s*[\s\S]{0,50}?(?:through|thru|to)\s+([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})/i);
  if (m) { const d = parseDate(m[1]+' '+m[2]+' '+m[3]); if (d) return [d, 'text-statement-range-end']; }
  m = t.match(/Statement\s+Date[\s\S]{0,140}?(?:through|thru|to)\s+([A-Za-z]{3,9})\s+(\d{1,2}),?[\s\S]{0,120}?\b(20\d{2})\b/i);
  if (m) { const d = parseDate(m[1]+' '+m[2]+' '+m[3]); if (d) return [d, 'text-statement-range-end']; }
  m = t.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}),\s*\d{1,2}:\d{2}\s*(?:AM|PM)?/i);
  if (m) { const d = parseDate(m[1]); if (d) return [d, 'text-snapshot-date']; }
  m = t.match(/\b(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(?:오전|오후|\d{1,2}:)/);
  if (m) { const y=2000+Number(m[1]); return [new Date(y,Number(m[2])-1,Number(m[3])),'text-snapshot-date']; }
  const base = String(filename || '').replace(/_/g, ' ');
  const dates = [...base.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g)].map(x => x[0]);
  if (dates.length >= 2) {
    const parts = dates[dates.length - 1].split('-').map(Number);
    return [new Date(parts[0], parts[1] - 1, parts[2]), 'filename-range-end'];
  }
  if (dates.length === 1) {
    const parts = dates[0].split('-').map(Number);
    return [new Date(parts[0], parts[1] - 1, parts[2]), 'filename-single-end-date'];
  }
  const compact = [...base.matchAll(/\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/g)];
  if (compact.length) {
    const d = compact[compact.length - 1];
    return [new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])), 'filename-compact-date'];
  }
  m = base.match(/\b(20\d{2})[_-](0?[1-9]|1[0-2])\b/);
  if (m) return [new Date(Number(m[1]), Number(m[2]), 0), 'filename-year-month'];
  const low = base.toLowerCase();
  const year = (low.match(/20\d{2}/) || ['2026'])[0];
  const mons = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  for (let i = 0; i < 12; i++) {
    if (new RegExp('\\b' + mons[i] + '[a-z]*\\b').test(low)) {
      return [new Date(Number(year), i, new Date(Number(year), i + 1, 0).getDate()), 'filename-month'];
    }
  }
  return [null, 'none'];
}
function nextMoney(lines, index, count = 4) {
  for (let j = index + 1; j < Math.min(lines.length, index + 1 + count); j++) {
    const v = moneyAbs(lines[j]);
    if (v != null) return [v, j, lines[j]];
  }
  return [null, null, ''];
}
function prevMoney(lines, index, count = 7) {
  for (let j = index - 1; j > Math.max(-1, index - 1 - count); j--) {
    const v = moneyAbs(lines[j]);
    if (v != null) return [v, j, lines[j]];
  }
  return [null, null, ''];
}
function labeledMoney(lines, index, nextCount = 4) {
  const same = moneyAbs(lines[index]);
  return same != null ? same : nextMoney(lines, index, nextCount)[0];
}
function detectBank(text, filename) {
  const lines = cleanLines(text);
  const header = lines.slice(0, 120).join('\n').toLowerCase();
  const all = String(text || '').toLowerCase();
  const f = String(filename || '').toLowerCase();
  if (header.includes('truist')) return 'Truist';
  if (header.includes('jpmorgan chase bank') || header.includes('chase business') || header.includes('printed from chase for business')) return 'Chase';
  if (header.includes('regions bank') || all.includes('1-800-regions')) return 'Regions Bank';
  if (header.includes('pnc bank')) return 'PNC Bank';
  if (header.includes('bank of america')) return 'Bank of America';
  if (header.includes('wells fargo') || all.includes('wellsfargo.com')) return 'Wells Fargo';
  if (header.includes('td bank') || all.includes('tdbank.com')) return 'TD Bank';
  if (header.includes('u.s. bank') || header.includes('us bank') || all.includes('usbank.com')) return 'U.S. Bank';
  if (header.includes('citizens bank') || all.includes('citizensbank.com')) return 'Citizens Bank';
  if (header.includes('first citizens bank') || all.includes('firstcitizens.com')) return 'First Citizens Bank';
  if (header.includes('city national bank') || all.includes('cnb.com')) return 'City National Bank';
  if (header.includes('m&t bank') || header.includes('m and t bank') || all.includes('mtb.com')) return 'M&T Bank';
  if (header.includes('keybank') || all.includes('key.com')) return 'KeyBank';
  if (header.includes('california coast credit union') || all.includes('calcoastcu.org')) return 'California Coast Credit Union';
  if (header.includes('bluevine') || all.includes('bluevine.com')) return 'BlueVine';
  if (header.includes('navy federal credit union') || all.includes('navyfederal.org')) return 'Navy Federal Credit Union';
  if (header.includes('huntington national bank') || all.includes('huntington.com')) return 'Huntington Bank';
  if (header.includes('fifth third bank') || all.includes('53.com')) return 'Fifth Third Bank';
  if (header.includes('middlesex federal') || all.includes('middlesexfederal.com')) return 'Middlesex Federal Savings';
  if (all.includes('thomastonsb.com')) return 'Thomaston Savings Bank';
  if (all.includes('htb.com')) return 'HomeTrust Bank';
  if (all.includes('vbank.com')) return 'Valliance Bank';
  if (all.includes('vystarcu.org')) return 'VyStar Credit Union';
  if (header.includes('visions federal credit union') || all.includes('visionsfcu.org')) return 'Visions Federal Credit Union';
  if (header.includes('nano') && header.includes('ban')) return 'Nano Banc';
  if (all.includes('carterbank.com')) return 'Carter Bank';
  if (all.includes('bankwithsouthern.com')) return 'Southern Bank';
  if (all.includes('bank name: cal coast')) return 'California Coast Credit Union';
  if (all.includes('1-866-322-4249')) return 'First Citizens Bank';
  if (/\bcnb\b/i.test(f)) return 'CNB';
  if (header.includes('old national') || f.includes('old national')) return 'Old National Bank';
  if (header.includes('keypoint') || all.includes('kpcu.com')) return 'KeyPoint Credit Union';
  if (all.includes('bluestonefcu') || header.includes('bluestone federal')) return 'Bluestone Federal Credit Union';
  if (all.includes('dfcu') || header.includes('the cash back')) return 'DFCU Financial Credit Union';
  if (all.includes('800-453-bank') || all.includes('mybusiness checking')) return 'Commerce Bank';
  if (all.includes('nyse symbol "pb"')) return 'Prosperity Bank';
  return '';
}
function extractAccount(text) {
  const lines = cleanLines(text);
  let endingAcct = String(text || '').match(/(?:checking\s+(?:account\s+)?(?:for|ending)|account\s+ending)\s+([Xx*\d-]{5,})/i);
  if (endingAcct) return normAcct(endingAcct[1]);
  if (lines.some(l => l.toUpperCase().includes('MICRO BUSINESS DRAFT'))) {
    let m = cleanSpace(text).match(/MEMBER\s*#\s*:?\s*(\d{4,})/i);
    if (m) return m[1] + '-050';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase() === 'member #:') {
        for (let j = i + 1; j < i + 4 && j < lines.length; j++) {
          m = lines[j].match(/\b(\d{4,})\b/);
          if (m) return m[1] + '-050';
        }
      }
    }
  }
  const accountPatterns = [
    /Primary Account Number\s*[:#]?\s*([Xx*\- ]*\d[\d Xx*\-]{3,})/i,
    /Account number\s*[:#]?\s*([Xx*\- ]*\d[\d Xx*\-]{3,})/i,
    /Account No\.?\s*[:#]?\s*([Xx*\- ]*\d[\d Xx*\-]{3,})/i,
    /Account #\s*([Xx*\- ]*\d[\d Xx*\-]{3,})/i,
    /myBusiness Checking Account #\s*([Xx*\- ]*\d[\d Xx*\-]{3,})/i,
    /TX Small Business(?: Checking)? Account No\s*([Xx*]+\d{4})/i
  ];
  for (const line of lines.slice(0, 180)) {
    for (const pat of accountPatterns) {
      const m = line.match(pat);
      if (m) {
        let token = normAcct(m[1]);
        if (/^X+\d{4,}$/.test(token)) return token;
        if (token.length > 14 && /^\d+$/.test(token)) {
          if (token.length === 24) token = token.slice(0, 12);
          else if (token.length === 18 && token.slice(0, 9) === token.slice(9)) token = token.slice(0, 9);
        }
        if (token && !/^(1800|1888|1877|1866|1855|1844|1833|844|888|877|866|855|833)/.test(token)) return token;
      }
    }
  }
  let m = String(text || '').match(/([Xx*]{2,}[\- Xx*]*\d{4,})/);
  if (m) return normAcct(m[1]);
  for (let i = 0; i < lines.length && i < 180; i++) {
    const low = lines[i].toLowerCase();
    if (/^(account number|account #|account no\.?|primary account number)$/.test(low)) {
      for (let j = i + 1; j < i + 8 && j < lines.length; j++) {
        const raw = lines[j];
        if (/page|cycle|enclosures|customer service|chase\.com|800-|1-800|service center|date/i.test(raw)) continue;
        const token = normAcct(raw);
        if (token && /\d{4,}/.test(token) && !/^(001|092|0000|0|26)$/.test(token) && !/^(1800|1888|1877|1866|1855|1844|1833|844|888|877|866|855|833)/.test(token)) return token;
      }
    }
  }
  if (lines.slice(0, 60).some(l => l.toUpperCase() === 'ACCOUNTS SUMMARY') && lines.slice(0, 70).some(l => l.toUpperCase().includes('ACCOUNT NUMBER'))) {
    for (let i = 0; i < lines.length && i < 120; i++) {
      if (/Business Checking|Business Draft/i.test(lines[i])) {
        for (let j = i + 1; j < i + 6 && j < lines.length; j++) {
          const token = normAcct(lines[j]);
          if (/^\d{5,12}$/.test(token) && !/^(2026|2025)/.test(token)) return token;
        }
      }
    }
  }
  for (let i = 0; i < lines.length && i < 90; i++) {
    if (lines[i].startsWith('Account Summary Account #')) {
      for (let j = i - 1; j > Math.max(-1, i - 10); j--) {
        const token = normAcct(lines[j]);
        if (/^\d{8,12}$/.test(token) && !/^(800|888|877|866|855|844|833)/.test(token)) return token;
      }
    }
  }
  for (const line of lines.slice(0, 35)) {
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\(|\)/.test(line)) continue;
    const token = normAcct(line);
    if (/^\d{10,17}$/.test(token) && !/^(1800|1888|1877|1866|1855|1844|1833|844|888|877|866|855|833)/.test(token)) return token;
  }
  m = String(text || '').match(/\*{2,}\s*(\d{4})/);
  if (m) return 'XXXX' + m[1];
  return '';
}
