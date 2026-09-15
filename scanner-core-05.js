async function readPdf(file) {
  await waitForLibrary('pdfjsLib', 'PDF reader');
  configurePdfWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf, verbosity: 0 }).promise;
  const cap = Math.min(pdf.numPages, MAX_PAGES);
  let text = '';
  let firstPageText = '';
  for (let pg = 1; pg <= cap; pg++) {
    const page = await pdf.getPage(pg);
    const tc = await page.getTextContent();
    const rows = {};
    for (const it of tc.items) {
      const y = Math.round(it.transform[5] / 2) * 2;
      (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
    }
    const pageText = Object.keys(rows).sort((a, b) => b - a).map(y => rows[y].sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    if (pg === 1) firstPageText = pageText;
    text += pageText + '\n';
    { const statusNode=document.querySelector('#queueProgress')||document.querySelector('#status'); if(statusNode) statusNode.textContent='Fast text scan: ' + shortSourceName(file.name) + ' page ' + pg + '/' + cap; }
  }
  const embeddedChars = cleanSpace(text).replace(/[^A-Za-z0-9]/g, '').length;
  return { text, firstPageText, pages: pdf.numPages, embeddedChars, ocrChars: 0, usedOcr: false, ocrPages: 0, ocrStatus: enoughEmbeddedText(text) ? 'not-needed' : 'needs-ocr' };
}
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'OCR timeout')), ms))
  ]);
}
const scannerLibrarySources={
  pdfjsLib:[
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js'
  ],
  OCRAD:[
    'https://cdn.jsdelivr.net/npm/ocrad.js@0.0.1/ocrad.js',
    'https://unpkg.com/ocrad.js@0.0.1/ocrad.js'
  ],
  Tesseract:[
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5.0.4/dist/tesseract.min.js'
  ]
};
const scannerLibraryLoads=new Map();
function loadScannerLibraryScript(url){
  if(scannerLibraryLoads.has(url))return scannerLibraryLoads.get(url);
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=url;
    script.async=true;
    script.crossOrigin='anonymous';
    script.onload=()=>resolve(true);
    script.onerror=()=>reject(new Error('Could not load scanner library'));
    document.head.appendChild(script);
  });
  scannerLibraryLoads.set(url,promise);
  return promise;
}
async function ensureScannerLibrary(name,label){
  if(globalThis[name])return globalThis[name];
  const urls=scannerLibrarySources[name]||[];
  for(const url of urls){
    try{
      await loadScannerLibraryScript(url);
      if(globalThis[name])return globalThis[name];
    }catch{}
  }
  throw new Error(label+' could not load. Connect to the internet and try again.');
}
async function waitForLibrary(name,label,timeoutMs=15000){
  if(globalThis[name])return globalThis[name];
  if(typeof $==='function'){const status=$('status');if(status)status.textContent='Loading '+label+'…';}
  return Promise.race([
    ensureScannerLibrary(name,label),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out while loading.')),timeoutMs))
  ]);
}
async function readPdfOcr(file) {
  await waitForLibrary('pdfjsLib', 'PDF reader');
  configurePdfWorker();
  try { await waitForLibrary('Tesseract', 'OCR engine'); }
  catch (e) { return { text: '', pages: 0, embeddedChars: 0, ocrChars: 0, usedOcr: false, ocrPages: 0, ocrStatus: 'tesseract-not-loaded' }; }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf, verbosity: 0 }).promise;
  const ocrCap = Math.min(pdf.numPages, OCR_FALLBACK_PAGES);
  let ocrText = '';
  let firstPageText = '';
  let ocrPages = 0;
  let ocrStatus = 'used';
  for (let pg = 1; pg <= ocrCap; pg++) {
    { const statusNode=document.querySelector('#queueProgress')||document.querySelector('#status'); if(statusNode) statusNode.textContent='OCR blank file: ' + shortSourceName(file.name) + ' page ' + pg + '/' + ocrCap; }
    try {
      const page = await pdf.getPage(pg);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const result = await withTimeout(Tesseract.recognize(canvas, 'eng'), OCR_TIMEOUT_MS, 'OCR timeout on ' + file.name);
      const pageText = result && result.data && result.data.text ? result.data.text : '';
      if (pg === 1) firstPageText = pageText;
      ocrText += pageText + '\n';
      ocrPages++;
      canvas.width = 1;
      canvas.height = 1;
    } catch (e) {
      ocrStatus = String(e && e.message ? e.message : e).slice(0, 160);
      break;
    }
  }
  const ocrChars = cleanSpace(ocrText).replace(/[^A-Za-z0-9]/g, '').length;
  return { text: ocrText, firstPageText, pages: pdf.numPages, embeddedChars: 0, ocrChars, usedOcr: true, ocrPages, ocrStatus: ocrChars ? ocrStatus : 'tried-no-text' };
}
async function expandFiles(fileList) {
  const expanded = [];
  for (const f of Array.from(fileList)) {
    const name = f.webkitRelativePath || f.name;
    if (/\.zip$/i.test(f.name)) {
      await waitForLibrary('JSZip', 'ZIP reader');
      const zip = await JSZip.loadAsync(f);
      for (const n of Object.keys(zip.files)) {
        const z = zip.files[n];
        if (z.dir) continue;
        if (/\.(pdf|txt|csv)$/i.test(n)) {
          const blob = await z.async('blob');
          expanded.push(new File([blob], n, { type: blob.type }));
        }
      }
    } else {
      expanded.push(new File([f], name, { type: f.type }));
    }
  }
  return expanded;
}
function extractBankBase(text, src) {
  const [date, dateSource] = statementEnd(text, src);
  const summary = parseSummary(text);
  return {
    kind: 'bank', folder: sourceGroupKey(src), src,
    statement_end: isoDate(date), month_label: date ? MONTH_LABEL[date.getMonth() + 1] : '', date_source: dateSource,
    bank: detectBank(text, src), account: extractAccount(text, src),
    deposits: summary.deposits, ending: summary.ending, beginning: summary.beginning, withdrawals: summary.withdrawals,
    mca_hits: extractMCA(text), confidence: summary.confidence || 0, evidence: summary.evidence || '', math_diff: summary.math_diff
  };
}
function processExtractedFile(f, src, text, readMeta, replaceBlank) {
  const folder = sourceGroupKey(src);
  if (replaceBlank) {
    STATE.auditRows = STATE.auditRows.filter(a => !(a.source_id === src && (a.kind === 'blank/no-text' || a.kind === 'weak-text/needs-ocr')));
  }
  const imageOnlyEnvelope = /Docusign Envelope ID/i.test(text) && !/(account statement|beginning balance|ending balance|transaction description)/i.test(text);
  const weakEmbedded = !readMeta.usedOcr && (readMeta.ocrStatus === 'needs-ocr' || imageOnlyEnvelope);
  if (!cleanLines(text).length || weakEmbedded) {
    STATE.auditRows.push({ source_id: src, file: shortSourceName(src), folder, company: cleanSpace(folder.replace(/[_-]+/g, ' ')), kind: weakEmbedded ? 'weak-text/needs-ocr' : 'blank/no-text', ocr_used: readMeta.usedOcr ? 'yes' : 'no', embedded_chars: readMeta.embeddedChars || 0, ocr_chars: readMeta.ocrChars || 0, ocr_pages: readMeta.ocrPages || 0, issues: readMeta.usedOcr ? 'OCR tried; still no readable text' : (weakEmbedded ? 'Embedded text is too weak to trust; OCR recommended' : 'No embedded text; OCR recommended') });
    if (!readMeta.usedOcr) STATE.blankFiles.push({ file: f, src, folder, embeddedChars: readMeta.embeddedChars || 0 });
    return;
  }
  const kind = classify(text, src);
  if (kind === 'application') {
    const r = extractApp(text, src);
    r.folder = folder;
    STATE.records.push(r);
    STATE.auditRows.push({ source_id: src, file: shortSourceName(src, 'application'), folder, kind: 'application', ocr_used: readMeta.usedOcr ? 'yes' : 'no', embedded_chars: readMeta.embeddedChars || 0, ocr_chars: readMeta.ocrChars || 0, ocr_pages: readMeta.ocrPages || 0, company: r.company, revenue: r.revenue, revenue_source: r.revenue_source, owner: r.owner, address: r.address, start_date: r.start_date, issues: r.revenue == null ? 'Application revenue not found' : '' });
  } else if (kind === 'bank') {
    const summaryText = readMeta.summaryText || readMeta.firstPageText || text;
    const r = extractBank(summaryText, src);
    r.folder = folder;
    r.mca_hits = extractMCA(text);
    r.is_mtd = isMtdDocument(readMeta.firstPageText || text, src);
    STATE.records.push(r);
    const issues = [];
    if (!r.statement_end) issues.push('No date');
    if (r.deposits == null) issues.push('No deposits');
    if (r.ending == null) issues.push('No ending');
    if (!r.bank) issues.push('No bank');
    if (!r.account) issues.push('No account');
    STATE.auditRows.push({ source_id: src, file: shortSourceName(src, r.is_mtd ? 'mtd' : 'bank', r.statement_end, r.is_mtd), folder, company: cleanSpace(folder.replace(/[_-]+/g, ' ')), kind: r.is_mtd ? 'mtd' : 'bank', ocr_used: readMeta.usedOcr ? 'yes' : 'no', embedded_chars: readMeta.embeddedChars || 0, ocr_chars: readMeta.ocrChars || 0, ocr_pages: readMeta.ocrPages || 0, bank: r.bank, account: displayAccount(r.account), statement_end: r.statement_end, deposits: r.deposits != null ? fmtRound(r.deposits) : '', ending: r.ending != null ? fmtRound(r.ending) : '', mca_count: r.mca_hits.length, confidence: r.confidence, evidence: r.evidence, issues: issues.join(' · ') });
  } else {
    STATE.auditRows.push({ source_id: src, file: shortSourceName(src, 'other'), folder, company: cleanSpace(folder.replace(/[_-]+/g, ' ')), kind: 'other', ocr_used: readMeta.usedOcr ? 'yes' : 'no', embedded_chars: readMeta.embeddedChars || 0, ocr_chars: readMeta.ocrChars || 0, ocr_pages: readMeta.ocrPages || 0, mca_count: extractMCA(text).length, issues: 'Unrecognized' });
  }
}
/* END PRODUCTION V10 CORE */
