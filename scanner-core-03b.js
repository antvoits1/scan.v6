function extractMCA(text) {
  const hits = {};
  const lines = cleanLines(String(text || '')).map(x => x.replace(/\u00a0/g, ' '));
  let section='';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    section=mcaSectionKind(line,section);
    const name = canonicalMCA(line);
    if (!name || !mcaLineIsDebit(line,section,lines[i-1]||'',lines[i+1]||'')) continue;
    if (!hits[name]) hits[name] = { name, count: 0, amount: null, amounts: [], total_amount: 0, evidence: '', debit_evidence: false };
    const scrubbed = line.replace(/\b(?:DES|ID|TRACE|REF|Transaction)\s*[:#]?\s*[A-Z0-9-]+/gi, ' ').replace(/(?:\*{2,}|X{2,})\d+/gi, ' ').replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, ' ');
    const signed=[...scrubbed.matchAll(/(?:-\s*\$?\s*|\(\s*\$?\s*)([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/g)].map(match=>Number(match[1].replace(/,/g,''))).filter(v=>v>=25&&v<=250000&&!(v>=2020&&v<=2030));
    const sameLine = moneyVals(scrubbed).map(Math.abs).filter(v => v >= 25 && v <= 250000 && !(v >= 2020 && v <= 2030));
    const previous = moneyVals(lines[i-1] || '').map(Math.abs).filter(v => v >= 25 && v <= 250000 && !(v >= 2020 && v <= 2030));
    const nearby = moneyVals(lines[i+1] || '').map(Math.abs).filter(v => v >= 25 && v <= 250000 && !(v >= 2020 && v <= 2030));
    const vals = signed.length ? signed : (sameLine.length ? sameLine : (previous.length ? previous : nearby));
    const selected = vals.length ? (signed.length ? vals[vals.length-1] : (vals.length >= 2 ? vals[vals.length - 2] : vals[0])) : null;
    hits[name].count += 1;
    hits[name].debit_evidence = true;
    if (selected != null) { hits[name].amounts.push(selected); hits[name].total_amount += selected; }
    if (!hits[name].evidence) hits[name].evidence = line.slice(0, 160);
  }
  return Object.values(hits).map(h => {
    const freq = {};
    for (const v of h.amounts) { const k = Number(v).toFixed(2); freq[k] = (freq[k] || 0) + 1; }
    const ranked = Object.entries(freq).sort((a,b)=>b[1]-a[1] || Number(a[0])-Number(b[0]));
    const sorted = h.amounts.slice().sort((a,b)=>a-b);
    const amount = ranked.length && ranked[0][1] >= 2 ? Number(ranked[0][0]) : (sorted.length ? sorted[Math.floor(sorted.length/2)] : null);
    return {...h, amount, amounts: undefined, total_amount: Math.round((Number(h.total_amount)||0)*100)/100, verified: h.name === 'Generic MCA' ? h.count >= 2 : Boolean(h.debit_evidence), freq: mcaFreq(h.count)};
  }).sort((a, b) => (Number(b.verified) - Number(a.verified)) || (b.count - a.count) || ((b.total_amount || 0) - (a.total_amount || 0)));
}
function classify(text, filename) {
  const low = (String(text || '') + ' ' + String(filename || '')).toLowerCase();
  if (String(filename || '').toLowerCase().includes('use_this_app') || ((/legal (?:company|business) name|business name/.test(low)) && /(monthly revenue|monthly sales|date of birth|social security|owner name|first name)/.test(low))) return 'application';
  if (/statement|beginning balance|ending balance|account summary|statement summary|account no|account #|business checking|deposits & credits|deposits and other credits|deposits\/other credits|account detail - wells fargo|printed from chase for business/.test(low)) return 'bank';
  return 'other';
}
function isMtdDocument(firstPageText, filename) {
  return /(?:^|[^a-z0-9])mtd(?:[^a-z0-9]|$)|month\s*to\s*date|month-to-date|current\s+month\s+activity|period\s+to\s+date/i.test(String(filename || '') + ' ' + String(firstPageText || ''));
}
function folderOf(name) { const parts = String(name || '').split('/').filter(Boolean); return parts.length > 1 ? parts[parts.length - 2] : ''; }
function enoughEmbeddedText(text) {
  const s=String(text||'');
  if (/Docusign Envelope ID/i.test(s) && !/(account statement|beginning balance|ending balance|transaction description)/i.test(s)) return false;
  return cleanSpace(s).replace(/[^A-Za-z0-9]/g, '').length >= EMBEDDED_TEXT_MIN_CHARS;
}
function ocrMoneyNums(s){ return moneyVals(String(s||'')).map(Math.abs).filter(v => v > 0 && !(v>=2020&&v<=2030)); }
function ocrStatementEnd(text, src){
  const t=String(text||'').replace(/\u00a0/g,' ');
  let m = t.match(/(?:Statement|Stavernent)\s+For\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if(m){ const d=parseDate(m[2]); if(d) return [d,'ocr-range-end']; }
  m = t.match(/THIS\s+STATEMENT\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})/i);
  if(m){ const d=parseDate(m[1]); if(d) return [d,'ocr-this-statement']; }
  return statementEnd(text, src);
}
function ocrDetectBank(text, src){
  const low=(String(text||'')+' '+String(src||'')).toLowerCase();
  if(low.includes('indiana') && (low.includes('members credit union') || low.includes('imcu.com'))) return 'Indiana Members Credit Union';
  if(low.includes('farmers') && (low.includes('thefarmersbank') || low.includes('-the-') || String(src||'').toLowerCase().includes('farmers'))) return 'Farmers Bank';
  return detectBank(text, src);
}
function ocrExtractAccount(text, src){ const acc=extractAccount(text, src); if(/^800586/.test(acc)) return ''; return acc; }
function parseOcrSummary(text, src){
  const raw=String(text||''); const low=raw.toLowerCase(); const r={};
  if(low.includes('farmers') || String(src||'').toLowerCase().includes('farmers')){
    let m=raw.match(/\b\d+\s+CREDITS\s+([0-9]{1,3}(?:,\s*[0-9]{3})*\.\d{2})/i);
    if(m) r.deposits=parseFloat(m[1].replace(/[,\s]/g,''));
    m=raw.match(/THIS\s+STATEMENT\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+([0-9]{1,3}(?:,\s*[0-9]{3})*\.\d{2}|[0-9]{4,}\.\d{2})/i);
    if(m) r.ending=parseFloat(m[1].replace(/[,\s]/g,''));
    if(r.deposits!=null || r.ending!=null) return {...r, confidence:95, evidence:'Farmers OCR summary'};
  }
  if(low.includes('imcu.com') || low.includes('members credit union') || low.includes('indiana')){
    const compact=cleanSpace(raw.replace(/\n/g,' '));
    const depMatches=[...compact.matchAll(/(?:total|tot\w*|tata|aera|7stoal|106\s*tata)?\s*(?:d\w+\s*)?(?:depo\w*|doposts\w*|deposts\w*)\s*(?:for|or|tor|stor)?\s*["'$ ]*([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})/ig)].map(x=>parseFloat(x[1].replace(/,/g,''))).filter(v=>v>=1000 && v<10000000);
    if(depMatches.length) r.deposits=Math.max(...depMatches);
    const lines=cleanLines(raw);
    for(const line of lines){
      if(/prefer.*b.*(check|checs|bins|busnes)|preferred business checking|preferred busnes/i.test(line)){
        const vals=ocrMoneyNums(line).filter(v=>v>=100 && v<1000000);
        if(vals.length){ r.ending=vals[vals.length-1]; break; }
      }
    }
    if(r.ending==null){ let m=compact.match(/Account\s+Balance\s+Total\s+\$?\s*([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})/i); if(m) r.ending=parseFloat(m[1].replace(/[,\s]/g,'')); }
    if(r.deposits!=null || r.ending!=null) return {...r, confidence:95, evidence:'IMCU OCR summary'};
  }
  return null;
}
