statOcrBox.addEventListener('click', async () => {
  if (state.ocrNeededQueue.length === 0) { alert("No files currently flagged as OCR Needed."); return; }
  const promptVal = prompt(`OCR NEEDED: ${state.ocrNeededQueue.length} files.\nHow many files would you like to process through OCR?`, state.ocrNeededQueue.length);
  if (!promptVal) return;
  const count = Math.min(parseInt(promptVal, 10) || 0, state.ocrNeededQueue.length);
  if (count <= 0) return;

  const selectedTasks = state.ocrNeededQueue.splice(0, count);
  state.ocrNeededCount = state.ocrNeededQueue.length;
  updateStatsUI();

  for (let i = 0; i < selectedTasks.length; i++) {
    const task = selectedTasks[i];
    currentFileName.textContent = `Running OCR (${i+1}/${count}): ${task.name}`;
    try {
      const arrayBuffer = await task.fileBlob.arrayBuffer();
      const ocrPages = parseInt(ocrPagesInput.value, 10) || 1;
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let ocrText = '';
      for (let p = 1; p <= Math.min(doc.numPages, ocrPages); p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
        ocrText += text + '\n';
      }
      doc.destroy();
      integrateExtractedResult(parseDocumentText(ocrText, task.name));
      state.regularScanned++;
    } catch (err) { state.failedFiles++; }
    finally { updateStatsUI(); }
  }
  renderLiveTable(true);
  currentFileName.textContent = "OCR processing batch completed.";
});

btnPause.addEventListener('click', () => { state.isPaused = true; btnPause.style.display = 'none'; btnResume.style.display = 'inline-flex'; currentFileName.textContent = "Scan paused."; });
btnResume.addEventListener('click', () => { state.isPaused = false; btnResume.style.display = 'none'; btnPause.style.display = 'inline-flex'; processNextInQueue(); });
btnStop.addEventListener('click', () => { state.isStopped = true; state.isScanning = false; finishBatchScan(); closeModal('controlsModal'); });
btnRestart.addEventListener('click', () => {
  state.currentIndex = 0; state.completedFiles = 0; state.regularScanned = 0; state.skippedCompanies = 0; state.ocrNeededCount = 0; state.failedFiles = 0;
  state.companies.clear(); state.failedList = []; state.ocrNeededQueue = []; state.startTime = Date.now();
  
  tableBody.innerHTML = `
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr class="placeholder-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  `;
  updateStatsUI(); closeModal('controlsModal'); 
  clearStateDB(); 
  startScanningQueue();
});
btnRetryFailed.addEventListener('click', () => {
  if (state.failedList.length === 0) return;
  const retryTasks = [...state.failedList];
  state.failedList = []; state.failedFiles -= retryTasks.length; state.queue.push(...retryTasks);
  state.totalFiles = state.queue.length; updateStatsUI(); closeModal('controlsModal');
  if (!state.isScanning) startScanningQueue();
});

function finishBatchScan() {
  state.isScanning = false;
  if (state.timerInterval) clearInterval(state.timerInterval);
  renderLiveTable(true);
  currentFileName.textContent = `Scan complete. ${state.completedFiles} files processed.`;
  updateStatsUI();
}

document.querySelectorAll('th .resizer').forEach(r => r.addEventListener('mousedown', initResize));
function initResize(e) {
  e.preventDefault();
  const th = e.target.parentElement; const startX = e.pageX; const startWidth = th.offsetWidth;
  e.target.classList.add('resizing');
  function onMouseMove(evt) { th.style.width = `${Math.max(30, startWidth + (evt.pageX - startX))}px`; }
  function onMouseUp() { e.target.classList.remove('resizing'); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); }
  document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
}

btnDownloadXlsx.addEventListener('click', () => {
  const keptList = Array.from(state.companies.values()).filter(c => c.isKept);
  if (keptList.length === 0) return alert("No results to download.");
  keptList.sort((a, b) => b.appRevenue - a.appRevenue);

  const exportRows = keptList.map((comp, idx) => {
    return {
      "#": idx + 1, "Company": comp.company, "Owner / Applicant": comp.owner, "Approval": calculateApproval(comp.appRevenue),
      "App Revenue": comp.appRevenue > 0 ? formatCompactMoney(comp.appRevenue) : '',
      "Statements": comp.statements.map(s => `${s.isMtd ? 'MTD ' : `${s.month} `}${formatCompactMoney(s.deposits)} | ${formatCompactMoney(s.endingBal)}`).join(' • '),
      "Phone": Array.from(comp.phone).join(' • '), "Email": Array.from(comp.email).join(' • '), "DOB": comp.dob, "App Date": comp.appDate,
      "Business Address": comp.businessAddress, "Application Address": comp.appAddress, "EIN": comp.ein,
      "Bank | Account": Array.from(comp.banks.entries()).map(([bank, acct]) => `${bank} | ${acct}`).join(' • '),
      "MCA": Array.from(comp.mcaMap.values()).map(m => `${m.name} | ${formatCompactMoney(m.payment)} | ${m.freq} | ${formatCompactMoney(m.monthly)} mo`).join(' • '),
      "Daily Cash Flow": comp.dailyCashFlow ? formatCompactMoney(comp.dailyCashFlow) : ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scanner Results");
  ws['!cols'] = [{wch:5}, {wch:25}, {wch:18}, {wch:12}, {wch:14}, {wch:35}, {wch:22}, {wch:26}, {wch:12}, {wch:12}, {wch:30}, {wch:30}, {wch:14}, {wch:28}, {wch:30}, {wch:16}];
  XLSX.writeFile(wb, `Scanner_Results_${new Date().toISOString().slice(0,10)}.xlsx`);
});
