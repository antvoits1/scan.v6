'use strict';

// UI wiring for repaired Scanner V6.
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const regPagesInput = document.getElementById('regPagesInput');
const ocrPagesInput = document.getElementById('ocrPagesInput');
const minRevenueInput = document.getElementById('minRevenueInput');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnStop = document.getElementById('btnStop');
const btnRestart = document.getElementById('btnRestart');
const btnRetryFailed = document.getElementById('btnRetryFailed');
const btnDownloadXlsx = document.getElementById('btnDownloadXlsx');
const statFiles = document.getElementById('statFiles');
const statScanned = document.getElementById('statScanned');
const statSkipped = document.getElementById('statSkipped');
const statOcr = document.getElementById('statOcr');
const statOcrBox = document.getElementById('statOcrBox');
const statFailed = document.getElementById('statFailed');
const statFailedBox = document.getElementById('statFailedBox');
const statElapsed = document.getElementById('statElapsed');
const progressBar = document.getElementById('progressBar');
const currentFileName = document.getElementById('currentFileName');
const tableBody = document.getElementById('tableBody');

const scanState = {
  queue: [],
  currentIndex: 0,
  allFiles: [],
  failed: [],
  ocrNeededQueue: [],
  scanning: false,
  paused: false,
  stopped: false,
  completed: 0,
  scanned: 0,
  startTime: null,
  timer: null
};

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.addEventListener('click', event => {
  if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none';
});

const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeDisplay = document.getElementById('fontSizeDisplay');
const uiScaleSlider = document.getElementById('uiScaleSlider');
const uiScaleDisplay = document.getElementById('uiScaleDisplay');
const root = document.documentElement;
fontSizeSlider.addEventListener('input', event => {
  fontSizeDisplay.textContent = event.target.value;
  root.style.setProperty('--font-size', `${event.target.value}px`);
});
uiScaleSlider.addEventListener('input', event => {
  uiScaleDisplay.textContent = Number(event.target.value).toFixed(1);
  root.style.setProperty('--ui-scale', event.target.value);
});

function parseMoneyInput(value) {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function formatMoney(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
  const n = Math.round(Number(value));
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
}
function calculateApproval(revenue) {
  const n = Number(revenue) || 0;
  if (n <= 0 || n < 90000) return '$200,000';
  return formatMoney(Math.ceil((n + 150000) / 50000) * 50000);
}
function currentMinRevenue() {
  return Math.max(0, parseMoneyInput(minRevenueInput.value));
}
function keptRows() {
  const minRevenue = currentMinRevenue();
  return STATE.finalRows
    .filter(row => (Number(row._sourceRevenueValue) || 0) >= minRevenue || row._hasEndingBalance)
    .sort((a, b) => (Number(b._sourceRevenueValue) || 0) - (Number(a._sourceRevenueValue) || 0) || String(a.Company || '').localeCompare(String(b.Company || '')));
}
function updateStatsUI() {
  const total = scanState.queue.length;
  statFiles.textContent = total ? `${Math.min(scanState.completed + (scanState.scanning ? 1 : 0), total)} / ${total}` : '—';
  statScanned.textContent = scanState.scanned || '—';
  const rows = STATE.finalRows || [];
  const kept = keptRows();
  statSkipped.textContent = Math.max(0, rows.length - kept.length) || '—';
  statOcr.textContent = scanState.ocrNeededQueue.length || '—';
  statFailed.textContent = scanState.failed.length || '—';
  statOcrBox.classList.toggle('highlight-ocr', scanState.ocrNeededQueue.length > 0);
  statFailedBox.classList.toggle('highlight-failed', scanState.failed.length > 0);
  progressBar.style.width = total ? `${Math.min(100, (scanState.completed / total) * 100)}%` : '0%';
}
function updateTimerUI() {
  if (!scanState.startTime || !scanState.scanning) return;
  const seconds = Math.floor((Date.now() - scanState.startTime) / 1000);
  statElapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function resetEngineAndUI({keepFiles = false} = {}) {
  STATE = { records: [], finalRows: [], auditRows: [], blankFiles: [], sourceFiles: {} };
  if (!keepFiles) {
    scanState.queue = [];
    scanState.allFiles = [];
  }
  scanState.currentIndex = 0;
  scanState.failed = [];
  scanState.ocrNeededQueue = [];
  scanState.completed = 0;
  scanState.scanned = 0;
  scanState.scanning = false;
  scanState.paused = false;
  scanState.stopped = false;
  scanState.startTime = null;
  if (scanState.timer) clearInterval(scanState.timer);
  scanState.timer = null;
  tableBody.innerHTML = '<tr class="placeholder-row">' + '<td>&nbsp;</td>'.repeat(16) + '</tr>';
  statElapsed.textContent = '00:00';
  currentFileName.textContent = 'Ready. Drop documents to auto-start.';
  updateStatsUI();
}

function renderLiveTable() {
  buildFinal();
  const rows = keptRows();
  tableBody.innerHTML = '';
  if (!rows.length) {
    tableBody.innerHTML = '<tr class="placeholder-row">' + '<td>&nbsp;</td>'.repeat(16) + '</tr>';
    updateStatsUI();
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const append = (text, cls = '') => {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = text || '';
      tr.appendChild(td);
    };

    append(index + 1, 'col-num');
    append(row.Company, 'col-bold');
    append(row.Owner);
    append(calculateApproval(row._sourceRevenueValue), 'col-money col-bold');
    append(row._sourceRevenueValue ? formatMoney(row._sourceRevenueValue) : '', 'col-money');

    const statementText = (row._statementDetails || []).map(item => {
      const account = item.account ? `${item.account} ` : '';
      const label = item.isMtd ? 'MTD' : (item.label || 'Statement');
      const deposits = item.deposits != null ? formatMoney(item.deposits) : '—';
      const ending = item.ending != null ? formatMoney(item.ending) : '—';
      return `${account}${label} ${deposits} | ${ending}`;
    }).join(' • ');
    append(statementText);

    append(row.Phones);
    append(row.Emails);
    append(row.DOB);
    append(row.AppDate);
    append(row.BusinessAddress);
    append(row.ApplicationAddress);
    append(row.EIN);

    append((row.BankAccounts || []).map(item => [item.bank, item.account].filter(Boolean).join(' | ')).join(' • '));

    append((row.MCADetails || []).map(item => {
      const parts = [item.name];
      if (item.amount != null) parts.push(formatMoney(item.amount));
      if (item.frequency) parts.push(item.frequency);
      if (item.monthlyTotal) parts.push(`${formatMoney(item.monthlyTotal)} mo`);
      return parts.join(' | ');
    }).join(' • '));

    append(row.DailyCashFlow != null ? formatMoney(row.DailyCashFlow) : '', 'col-money');
    tableBody.appendChild(tr);
  });
  updateStatsUI();
}

async function ingestFiles(files) {
  currentFileName.textContent = 'Reading files...';
  const expanded = await expandFiles(files);
  const pdfs = expanded.filter(file => /\.pdf$/i.test(file.name));
  if (!pdfs.length) {
    currentFileName.textContent = 'No PDF files found.';
    return;
  }

  // A new upload starts a clean batch after the prior batch has finished.
  if (!scanState.scanning && scanState.currentIndex >= scanState.queue.length && scanState.queue.length) resetEngineAndUI();
  scanState.queue.push(...pdfs);
  scanState.allFiles.push(...pdfs);
  updateStatsUI();
  if (!scanState.scanning) startScanning();
}

async function processOneFile(file, index, total) {
  currentFileName.textContent = `Scanning (${index + 1}/${total}): ${shortSourceName(file.name)}`;
  MAX_PAGES = Math.max(1, Math.min(60, Number(regPagesInput.value) || 6));
  OCR_FALLBACK_PAGES = Math.max(1, Math.min(60, Number(ocrPagesInput.value) || 3));

  const meta = await readPdf(file);
  processExtractedFile(file, file.name, meta.text, meta, false);
  if (meta.ocrStatus === 'needs-ocr') {
    if (!scanState.ocrNeededQueue.some(item => item.file.name === file.name)) scanState.ocrNeededQueue.push({ file });
  } else {
    scanState.scanned++;
  }
  renderLiveTable();
}

function startScanning() {
  if (scanState.scanning) return;
  scanState.scanning = true;
  scanState.paused = false;
  scanState.stopped = false;
  if (!scanState.startTime) {
    scanState.startTime = Date.now();
    scanState.timer = setInterval(updateTimerUI, 1000);
  }
  btnPause.style.display = 'inline-flex';
  btnResume.style.display = 'none';
  processNext();
}

async function processNext() {
  if (scanState.paused || scanState.stopped) return;
  if (scanState.currentIndex >= scanState.queue.length) {
    finishBatch();
    return;
  }
  const index = scanState.currentIndex;
  const file = scanState.queue[index];
  try {
    await processOneFile(file, index, scanState.queue.length);
  } catch (error) {
    scanState.failed.push({ file, error: String(error && error.message ? error.message : error) });
  } finally {
    scanState.completed++;
    scanState.currentIndex++;
    updateStatsUI();
    if (!scanState.paused && !scanState.stopped) setTimeout(processNext, 0);
  }
}

function finishBatch() {
  scanState.scanning = false;
  if (scanState.timer) clearInterval(scanState.timer);
  scanState.timer = null;
  renderLiveTable();
  currentFileName.textContent = `Scan complete. ${scanState.completed} files processed. ${keptRows().length} companies shown.`;
  updateStatsUI();
}

dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  if (event.dataTransfer.files?.length) ingestFiles(Array.from(event.dataTransfer.files));
});
fileInput.addEventListener('change', event => {
  if (event.target.files?.length) ingestFiles(Array.from(event.target.files));
  fileInput.value = '';
});

statOcrBox.addEventListener('click', async () => {
  if (!scanState.ocrNeededQueue.length) return alert('No files currently need OCR.');
  const requested = prompt(`OCR needed for ${scanState.ocrNeededQueue.length} files.\nHow many should be processed?`, String(scanState.ocrNeededQueue.length));
  if (requested == null) return;
  const count = Math.min(scanState.ocrNeededQueue.length, Math.max(0, Number(requested) || 0));
  const items = scanState.ocrNeededQueue.splice(0, count);

  for (let index = 0; index < items.length; index++) {
    const file = items[index].file;
    currentFileName.textContent = `OCR (${index + 1}/${items.length}): ${shortSourceName(file.name)}`;
    try {
      OCR_FALLBACK_PAGES = Math.max(1, Math.min(60, Number(ocrPagesInput.value) || 3));
      const meta = await readPdfOcr(file);
      processExtractedFile(file, file.name, meta.text, meta, true);
      STATE.blankFiles = STATE.blankFiles.filter(item => item.src !== file.name);
      if (meta.ocrChars > 0) scanState.scanned++;
      else scanState.failed.push({ file, error: 'OCR returned no readable text' });
    } catch (error) {
      scanState.failed.push({ file, error: String(error && error.message ? error.message : error) });
    }
    renderLiveTable();
  }
  currentFileName.textContent = `OCR complete. ${keptRows().length} companies shown.`;
  updateStatsUI();
});

btnPause.addEventListener('click', () => {
  scanState.paused = true;
  btnPause.style.display = 'none';
  btnResume.style.display = 'inline-flex';
  currentFileName.textContent = 'Scan paused.';
});
btnResume.addEventListener('click', () => {
  scanState.paused = false;
  btnResume.style.display = 'none';
  btnPause.style.display = 'inline-flex';
  processNext();
});
btnStop.addEventListener('click', () => {
  scanState.stopped = true;
  scanState.scanning = false;
  finishBatch();
  closeModal('controlsModal');
});
btnRestart.addEventListener('click', () => {
  const files = [...scanState.allFiles];
  resetEngineAndUI({ keepFiles: true });
  scanState.queue = files;
  scanState.allFiles = files;
  updateStatsUI();
  closeModal('controlsModal');
  if (files.length) startScanning();
});
btnRetryFailed.addEventListener('click', () => {
  if (!scanState.failed.length) return;
  const retryFiles = scanState.failed.map(item => item.file);
  scanState.failed = [];
  scanState.queue.push(...retryFiles);
  updateStatsUI();
  closeModal('controlsModal');
  if (!scanState.scanning) startScanning();
});

minRevenueInput.addEventListener('change', renderLiveTable);

document.querySelectorAll('th .resizer').forEach(handle => handle.addEventListener('mousedown', event => {
  event.preventDefault();
  const th = event.target.parentElement;
  const startX = event.pageX;
  const startWidth = th.offsetWidth;
  event.target.classList.add('resizing');
  const move = e => { th.style.width = `${Math.max(30, startWidth + e.pageX - startX)}px`; };
  const up = () => {
    event.target.classList.remove('resizing');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}));

btnDownloadXlsx.addEventListener('click', () => {
  const rows = keptRows();
  if (!rows.length) return alert('No results to download.');
  const exportRows = rows.map((row, index) => ({
    '#': index + 1,
    'Company': row.Company,
    'Owner / Applicant': row.Owner,
    'Approval': calculateApproval(row._sourceRevenueValue),
    'App Revenue': row._sourceRevenueValue ? formatMoney(row._sourceRevenueValue) : '',
    'Statements': (row._statementDetails || []).map(item => {
      const account = item.account ? `${item.account} ` : '';
      const label = item.isMtd ? 'MTD' : (item.label || 'Statement');
      return `${account}${label} ${item.deposits != null ? formatMoney(item.deposits) : '—'} | ${item.ending != null ? formatMoney(item.ending) : '—'}`;
    }).join(' • '),
    'Phone': row.Phones,
    'Email': row.Emails,
    'DOB': row.DOB,
    'App Date': row.AppDate,
    'Business Address': row.BusinessAddress,
    'Application Address': row.ApplicationAddress,
    'EIN': row.EIN,
    'Bank | Account': (row.BankAccounts || []).map(item => [item.bank, item.account].filter(Boolean).join(' | ')).join(' • '),
    'MCA': (row.MCADetails || []).map(item => [item.name, item.amount != null ? formatMoney(item.amount) : '', item.frequency, item.monthlyTotal ? `${formatMoney(item.monthlyTotal)} mo` : ''].filter(Boolean).join(' | ')).join(' • '),
    'Daily Cash Flow': row.DailyCashFlow != null ? formatMoney(row.DailyCashFlow) : ''
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = [{wch:5},{wch:28},{wch:22},{wch:14},{wch:16},{wch:52},{wch:28},{wch:34},{wch:14},{wch:14},{wch:36},{wch:36},{wch:14},{wch:36},{wch:48},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scanner Results');
  XLSX.writeFile(wb, `Scanner_V6_Results_${new Date().toISOString().slice(0,10)}.xlsx`);
});

resetEngineAndUI();
