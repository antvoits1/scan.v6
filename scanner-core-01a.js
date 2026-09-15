'use strict';

let MAX_PAGES = 6;
const EMBEDDED_TEXT_MIN_CHARS = 80;
let OCR_FALLBACK_PAGES = 3;
const OCR_SCALE = 1.15;
const OCR_TIMEOUT_MS = 25000;
const MONTH_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let STATE = { records: [], finalRows: [], auditRows: [], blankFiles: [], sourceFiles: {} };
let SCAN_BATCH_COUNT = 0;

/* BEGIN PRODUCTION V10 CORE */
function cleanSpace(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function shortSourceName(src, kind = '', statementEndValue = '', isMtd = false) {
  if (kind === 'application' || /(?:^|[\s_\-])(app|application|use_this_app)(?:[\s_\-]|$)/i.test(String(src || ''))) return 'App';
  if (isMtd || kind === 'mtd' || /(?:^|[\s_\-])mtd(?:[\s_\-]|$)|month[\s_\-]*to[\s_\-]*date/i.test(String(src || ''))) return 'MTD';
  const dateText = String(statementEndValue || '');
  const monthNumber = /^\d{4}-(\d{2})/.test(dateText) ? Number(dateText.slice(5, 7)) : 0;
  if (monthNumber >= 1 && monthNumber <= 12) return MONTH_LABEL[monthNumber];
  const sourceText = String(src || '');
  const monthMatch = sourceText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i);
  if (monthMatch) {
    const key = monthMatch[1].slice(0, 3).toLowerCase();
    const index = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(key);
    if (index >= 0) return MONTH_LABEL[index + 1];
  }
  return kind === 'bank' ? 'Statement' : 'Document';
}
function safeScannerQueueLabel(name,index=0){const raw=String(name||'').toLowerCase();if(/application|app(?:lication)?[_. -]/.test(raw))return'App';if(/(?:^|[^a-z0-9])mtd(?:[^a-z0-9]|$)|month[ _-]?to[ _-]?date/.test(raw))return'MTD';const months=[['jan','Jan'],['feb','Feb'],['mar','Mar'],['apr','Apr'],['may','May'],['jun','Jun'],['jul','Jul'],['aug','Aug'],['sep','Sep'],['oct','Oct'],['nov','Nov'],['dec','Dec']];for(const [token,label] of months)if(raw.includes(token))return label;return`Document ${index+1}`}
function cleanLines(text) { return String(text || '').split(/\r?\n/).map(cleanSpace).filter(Boolean); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function fmtRound(value) { if (value == null || value === '') return ''; return '$' + Math.round(Number(value)).toLocaleString(); }
function fmtNearestThousand(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? '$' + (Math.round(n / 1000) * 1000).toLocaleString() : ''; }
function displayAccount(value) { const raw = String(value || '').trim(); if (!raw) return ''; if (/[Xx*]/.test(raw)) return 'XXXX' + digits(raw).slice(-4); const d = digits(raw); return d.length > 4 ? d : (d ? 'XXXX' + d.slice(-4) : ''); }
function fmtK(value) { if (value == null || value === '') return ''; const n = Number(value); return Math.abs(n) >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n); }
function roundTo50K(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.ceil(n / 50000) * 50000 : null; }
function maskAccount(value) { const d = digits(value); if (!d) return ''; return 'XXXXX' + d.slice(-4); }
function moneyVals(text) {
  const out = [];
  const re = /\(?\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{2})?|[0-9]{4,}(?:\.\d{2})?|[0-9]{1,3}\.\d{2})\)?/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[0]; const bareDigits = raw.replace(/\D/g, '');
    if (bareDigits.length >= 7 && !/[,$.]/.test(raw)) continue;
    let v = parseFloat(m[1].replace(/,/g, ''));
    const chunk = String(text || '').slice(Math.max(0, m.index - 3), Math.min(String(text || '').length, re.lastIndex + 3));
    if (chunk.includes('-') || (chunk.includes('(') && chunk.includes(')'))) v = -v;
    if (Math.abs(v) <= 50000000) out.push(v);
  }
  return out;
}
function moneyAbs(text) { const vals = moneyVals(text).filter(v => !(Math.abs(v) >= 2020 && Math.abs(v) <= 2030)); return vals.length ? Math.abs(vals[0]) : null; }
function normAcct(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/[^0-9Xx*\- ]/g, '').trim().replace(/\s+/g, '').replace(/[x*]/g, 'X').replace(/-/g, ''); }
function parseDate(value) {
  const s = cleanSpace(value).replace(/,/g, ''); let m = s.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (m) { let y = Number(m[3]); if (y < 100) y += 2000; return new Date(y, Number(m[1]) - 1, Number(m[2])); }
  m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})\b/i);
  if (m) { const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[1].toLowerCase()); return new Date(Number(m[3]), month, Number(m[2])); }
  m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s\/-]+(\d{1,2})[\s\/-]+(\d{2,4})\b/i);
  if (m) { const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase()); let year = Number(m[3]); if (year < 100) year += year >= 30 ? 1900 : 2000; return new Date(year, month, Number(m[2])); }
  return null;
}
function isoDate(date) { if (!date) return ''; return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
