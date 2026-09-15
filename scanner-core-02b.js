function valueAfter(text, labels, maxLen = 140) {
  const lines = cleanLines(text);
  for (const line of lines) {
    const low = line.toLowerCase();
    for (const label of labels) {
      const idx = low.indexOf(label);
      if (idx >= 0) {
        const val = line.slice(idx + label.length).replace(/^[\s:#\-|]+/, '').trim();
        if (val.length > 1) return val.slice(0, maxLen);
      }
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const low = lines[i].toLowerCase();
    if (labels.some(label => low.includes(label))) return lines[i + 1].slice(0, maxLen);
  }
  return '';
}
function cleanCompany(value) {
  let v = cleanSpace(value).replace(/^(legal company name|legal business name|business name|company name|dba)\s*:?\s*/i, '');
  v = v.replace(/[^A-Za-z0-9&.,'\- /]/g, '').trim();
  return /[A-Za-z]{3}/.test(v) ? v.slice(0, 90) : '';
}
function companyFromFilename(filename) {
  const base = String(filename || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/use_this_app|application|statement|bank|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d+/gi, ' ').replace(/[_\-]+/g, ' ');
  return cleanCompany(base);
}

function valueAfterFrom(lines, label, startIdx, endIdx) {
  const lab = String(label || '').toLowerCase();
  startIdx = Math.max(0, startIdx || 0);
  endIdx = Math.min(lines.length, endIdx == null ? lines.length : endIdx);
  for (let i = startIdx; i < endIdx; i++) {
    const line = String(lines[i] || '');
    const low = line.toLowerCase();
    if (low.startsWith(lab)) return { value: line.slice(label.length).replace(/^[\s:#\-|]+/, '').trim(), index: i };
    const idx = low.indexOf(lab);
    if (idx >= 0) return { value: line.slice(idx + label.length).replace(/^[\s:#\-|]+/, '').trim(), index: i };
  }
  return { value: '', index: -1 };
}
const FIELD_BOUNDARY = /\s+(?=(?:City|State|Zip|Full Name|First Name|Last Name|Date of Birth|DOB|Monthly Credit Card Processing|Home Address|Business Telephone|Mobile|Email|Signature|Title)\s*:)/i;
function boundedField(value) {
  return cleanSpace(String(value || '').split(FIELD_BOUNDARY)[0]).replace(/\s*:\s*$/, '').trim();
}
function normalizeDOB(v) {
  v = boundedField(String(v || '').replace(/\s+0:00:00\b/i, ''));
  if (!v) return '';
  if (/\b[A-Za-z]{3,9},?\s+\d{1,2},?\s+\d{2}\b/.test(v) && !/\b(?:19|20)\d{2}\b/.test(v)) return '';
  let m = v.match(/\b((?:19|20)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (m) return String(m[2]).padStart(2, '0') + '/' + String(m[3]).padStart(2, '0') + '/' + m[1].slice(-2);
  m = v.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y >= 30 ? 1900 : 2000;
    return String(m[1]).padStart(2, '0') + '/' + String(m[2]).padStart(2, '0') + '/' + String(y).slice(-2);
  }
  const d = parseDate(v);
  if (d && d.getFullYear() >= 1900 && d.getFullYear() <= new Date().getFullYear()) return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getFullYear()).slice(-2);
  return '';
}
function extractApplicationRevenue(lines) {
  const monthlyLabels = /^(?:average\s+)?(?:gross\s+)?monthly\s+(?:business\s+)?(?:revenue|sales)(?:\s*[:#-])?/i;
  const annualLabels = /^(?:average\s+)?(?:gross\s+)?(?:annual|yearly)\s+(?:business\s+)?revenue(?:\s*[:#-])?/i;
  const moneyOnly = /^\s*\(?\$?\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?\)?\s*$/;
  const readValue = (index, labelPattern) => {
    const line = cleanSpace(lines[index]);
    const remainder = cleanSpace(line.replace(labelPattern, ''));
    const sameLine = moneyVals(remainder).filter(v => v > 0);
    if (sameLine.length) return sameLine[0];
    const next = cleanSpace(lines[index + 1] || '');
    if (moneyOnly.test(next)) {
      const values = moneyVals(next).filter(v => v > 0);
      if (values.length) return values[0];
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (monthlyLabels.test(cleanSpace(lines[i]))) {
      const value = readValue(i, monthlyLabels);
      if (value != null) return { value: Math.round(value), source: 'application monthly revenue' };
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (annualLabels.test(cleanSpace(lines[i]))) {
      const value = readValue(i, annualLabels);
      if (value != null) return { value: Math.round(value / 12), source: 'application annual revenue divided by 12' };
    }
  }
  return { value: null, source: 'application revenue not found' };
}
function cleanAddressPart(value) {
  return cleanSpace(value)
    .replace(/\b(?:Business Address|Address|City|State|Zip(?: Code)?)\s*:\s*/gi, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^,|,$/g, '')
    .trim();
}
function normalizeDateField(value) {
  const raw = boundedField(String(value || '').replace(/\s+0:00:00\b/i, ''));
  if (!raw) return '';
  let m = raw.match(/\b((?:19|20)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (m) return String(m[2]).padStart(2,'0') + '/' + String(m[3]).padStart(2,'0') + '/' + m[1];
  const cleaned = raw.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, '');
  const d = parseDate(cleaned);
  if (!d || Number.isNaN(d.getTime())) return '';
  return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' + d.getFullYear();
}
function labeledDateValue(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    for (const label of labels) {
      const idx = low.indexOf(label.toLowerCase());
      if (idx < 0) continue;
      let same = boundedField(lines[i].slice(idx + label.length).replace(/^[\s:#\-|]+/, ''));
      if (same) {
        const hasMonthDay = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(same);
        const hasYear = /\b(?:19|20)\d{2}\b/.test(same);
        if (hasMonthDay && !hasYear) {
          for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const year = lines[j].match(/\b(?:19|20)\d{2}\b/);
            if (year) { same += ' ' + year[0]; break; }
          }
        }
        return same;
      }
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const candidate = boundedField(lines[j]);
        if (/^(city|state|zip|phone|email|address|ssn|ein|tax id)\b/i.test(candidate)) break;
        if (candidate) return candidate;
      }
    }
  }
  return '';
}
function extractApplicationEmails(text) {
  const raw = String(text || '').replace(/\u00a0/g, ' ');
  const candidates = [
    raw,
    raw.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*(?=[A-Za-z]{2,}(?:\s|$))/g, '.'),
    raw.replace(/[\r\n]+/g, ' ').replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.')
  ];
  const found = [];
  for (const source of candidates) {
    const matches = source.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi) || [];
    for (const email of matches) {
      const cleaned = email.toLowerCase().replace(/^\.+|\.+$/g, '');
      if (cleaned.length <= 254 && !found.includes(cleaned)) found.push(cleaned);
    }
  }
  return found.slice(0, 8);
}

function sourceGroupKey(src) {
  const parts = String(src || '').split('/').filter(Boolean);
  const generic = /^(?:bank|banks|statement|statements|bank statements?|application|applications|app|apps|docs?|documents?|uploads?|scanner|scan|files?)$/i;
  for (let i = parts.length - 2; i >= 0; i--) {
    const folder = cleanSpace(parts[i].replace(/[_-]+/g, ' '));
    if (folder && !generic.test(folder)) return folder;
  }
  const fromFile = cleanCompany(companyFromFilename(src));
  if (fromFile && !generic.test(fromFile)) return fromFile;
  return String(src || 'document').split('/').pop().replace(/\.[a-z0-9]+$/i, '') || 'document';
}

