/**
 * PRODUCTION BANK-STATEMENT & APPLICATION SCANNER ENGINE
 * Native label & overlay architecture for 100% reliable cross-device file selection.
 */

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const state = {
  queue: [],               
  currentIndex: 0,
  activeTask: null,
  isScanning: false,
  isPaused: false,
  isStopped: false,
  
  regPages: 3,
  ocrPages: 1,
  minRevenue: 40000,
  
  totalFiles: 0,
  completedFiles: 0,
  regularScanned: 0,
  skippedCompanies: 0,
  ocrNeededCount: 0,
  failedFiles: 0,
  startTime: null,
  timerInterval: null,
  
  companies: new Map(),
  failedList: [],
  ocrNeededQueue: []
};

const MCA_DESCRIPTORS = [
  { match: /(?:DELTA\s+BRIDGE|YELLOWSTONE|YCAPITAL)/i, name: 'Yellowstone Cap', freq: 'Daily' },
  { match: /(?:ONDECK|ON\s+DECK\s+CAP)/i, name: 'OnDeck', freq: 'Daily' },
  { match: /(?:FUNDBOX)/i, name: 'Fundbox', freq: 'Weekly' },
  { match: /(?:ITRIA\s+VENT|BIZ2CREDIT)/i, name: 'Itria Ventures', freq: 'Daily' },
  { match: /(?:FWD\s+FINANCING|FORWARD\s+FIN)/i, name: 'Forward Financing', freq: 'Daily' },
  { match: /(?:EBF\s+HOLDINGS|EVEREST\s+BUS)/i, name: 'Everest Funding', freq: 'Daily' },
  { match: /(?:LIBERTAS\s+FUNDING|LIBERTAS)/i, name: 'Libertas Funding', freq: 'Daily' },
  { match: /(?:CBSG\s+INC|PAR\s+FUNDING)/i, name: 'Par Funding', freq: 'Daily' },
  { match: /(?:KAPITUS|STRATEGIC\s+FUND(?:ING)?)/i, name: 'Kapitus', freq: 'Daily' },
  { match: /(?:CREDIBLY|RETAIL\s+CAP(?:ITAL)?)/i, name: 'Credibly', freq: 'Daily' },
  { match: /(?:RAPID\s+FIN(?:ANCE)?|RAPIDADV(?:ANCE)?)/i, name: 'Rapid Finance', freq: 'Daily' },
  { match: /(?:KALAMATA\s+CAP(?:ITAL)?)/i, name: 'Kalamata Capital', freq: 'Daily' },
  { match: /(?:CFG\s+MERCHANT|CFGMS)/i, name: 'CFGMS', freq: 'Daily' },
  { match: /(?:TVT\s+CAPITAL|ACH\s+CAPITAL)/i, name: 'TVT Capital', freq: 'Daily' },
  { match: /(?:SOS\s+CAPITAL)/i, name: 'SOS Capital', freq: 'Daily' },
  { match: /(?:PEARL\s+CAP(?:ITAL)?)/i, name: 'Pearl Capital', freq: 'Daily' },
  { match: /(?:FOX\s+CAPITAL)/i, name: 'Fox Capital', freq: 'Daily' },
  { match: /(?:KNIGHT\s+CAP(?:ITAL)?)/i, name: 'Knight Capital', freq: 'Daily' },
  { match: /(?:GREENBOX\s+CAP(?:ITAL)?)/i, name: 'Greenbox Capital', freq: 'Daily' },
  { match: /(?:RCG\s+ADV(?:ANCES)?|RAM\s+CAPITAL)/i, name: 'RCG Advances', freq: 'Daily' },
  { match: /(?:CAN\s+CAPITAL|CAPITAL\s+ACCESS)/i, name: 'CAN Capital', freq: 'Daily' },
  { match: /(?:FORA\s+FIN(?:ANCIAL)?)/i, name: 'Fora Financial', freq: 'Daily' },
  { match: /(?:NATL\s+FUNDING|NATIONAL\s+FUNDING)/i, name: 'National Funding', freq: 'Daily' },
  { match: /(?:HEADWAY\s+CAP(?:ITAL)?)/i, name: 'Headway Capital', freq: 'Weekly' },
  { match: /(?:BIZFUND)/i, name: 'Bizfund', freq: 'Daily' },
  { match: /(?:QUIKSTONE)/i, name: 'Quikstone', freq: 'Daily' },
  { match: /(?:QUEEN\s+FUNDING)/i, name: 'Queen Funding', freq: 'Daily' },
  { match: /(?:GOFUND\s+ADV(?:ANCE)?)/i, name: 'GoFund Advance', freq: 'Daily' },
  { match: /(?:LENDIO)/i, name: 'Lendio', freq: 'Daily' }
];

const BANK_SIGNATURES = [
  { match: /JPMORGAN\s+CHASE|CHASE\s+BANK/i, name: 'Chase' },
  { match: /BANK\s+OF\s+AMERICA/i, name: 'Bank of America' },
  { match: /WELLS\s+FARGO/i, name: 'Wells Fargo' },
  { match: /CITIBANK|CITI\s+BUSINESS/i, name: 'Citibank' },
  { match: /U\.?S\.?\s+BANK/i, name: 'U.S. Bank' },
  { match: /PNC\s+BANK/i, name: 'PNC Bank' },
  { match: /TRUIST/i, name: 'Truist' },
  { match: /FIFTH\s+THIRD\s+BANK/i, name: 'Fifth Third' },
  { match: /KEYBANK/i, name: 'KeyBank' },
  { match: /HUNTINGTON\s+NATIONAL\s+BANK|HUNTINGTON\s+BANK/i, name: 'Huntington' },
  { match: /TD\s+BANK/i, name: 'TD Bank' },
  { match: /REGIONS\s+BANK/i, name: 'Regions Bank' },
  { match: /SYNOVUS\s+BANK/i, name: 'Synovus Bank' },
  { match: /WOODFOREST\s+NATIONAL\s+BANK/i, name: 'Woodforest Bank' },
  { match: /SANDY\s+SPRING\s+BANK/i, name: 'Sandy Spring' },
  { match: /SIMMONS\s+BANK/i, name: 'Simmons Bank' },
  { match: /BANK\s+OZK|BANK\s+OF\s+THE\s+OZARKS/i, name: 'Bank OZK' },
  { match: /TOWNEBANK/i, name: 'TowneBank' },
  { match: /FIRST\s+NATIONAL\s+BANK\s+OF\s+OMAHA|FNBO/i, name: 'FNBO' },
  { match: /NAVY\s+FEDERAL\s+CREDIT\s+UNION|NFCU/i, name: 'Navy Federal CU' },
  { match: /STATE\s+EMPLOYEES['\s]+CREDIT\s+UNION|SECU/i, name: 'SECU' },
  { match: /PENTAGON\s+FEDERAL|PENFED/i, name: 'PenFed CU' },
  { match: /BECU|BOEING\s+EMPLOYEES/i, name: 'BECU' },
  { match: /ALLIANT\s+CREDIT\s+UNION/i, name: 'Alliant CU' },
  { match: /LAKE\s+MICHIGAN\s+CREDIT\s+UNION|LMCU/i, name: 'LMCU' },
  { match: /PATELCO\s+CREDIT\s+UNION/i, name: 'Patelco CU' },
  { match: /MERCURY/i, name: 'Mercury' },
  { match: /RELAY/i, name: 'Relay' },
  { match: /NOVO/i, name: 'Novo' },
  { match: /BLUEVINE/i, name: 'Bluevine' },
  { match: /GRASSHOPPER\s+BANK/i, name: 'Grasshopper Bank' },
  { match: /CELTIC\s+BANK/i, name: 'Celtic Bank' },
  { match: /WEBBANK/i, name: 'WebBank' },
  { match: /CROSS\s+RIVER\s+BANK/i, name: 'Cross River Bank' },
  { match: /PATHWARD|METABANK/i, name: 'Pathward' },
  { match: /EVOLVE\s+BANK\s+&\s+TRUST/i, name: 'Evolve Bank & Trust' }
];

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

const resultsTable = document.getElementById('resultsTable');
const tableBody = document.getElementById('tableBody');

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.onclick = function(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.style.display = "none";
  }
}

const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeDisplay = document.getElementById('fontSizeDisplay');
const uiScaleSlider = document.getElementById('uiScaleSlider');
const uiScaleDisplay = document.getElementById('uiScaleDisplay');
const root = document.documentElement;

fontSizeSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  fontSizeDisplay.textContent = val;
  root.style.setProperty('--font-size', `${val}px`);
});

uiScaleSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  uiScaleDisplay.textContent = parseFloat(val).toFixed(1);
  root.style.setProperty('--ui-scale', val);
});

function formatStat(num) {
  return (!num || num === 0) ? '—' : String(num);
}

function updateStatsUI() {
  if (state.totalFiles > 0) {
    const activeCurrent = Math.max(1, state.completedFiles);
    statFiles.textContent = `${activeCurrent} / ${state.totalFiles}`;
  } else {
    statFiles.textContent = '—';
  }

  statScanned.textContent = formatStat(state.regularScanned);
  statSkipped.textContent = formatStat(state.skippedCompanies);
  statOcr.textContent = formatStat(state.ocrNeededCount);
  statFailed.textContent = formatStat(state.failedFiles);

  if (state.ocrNeededCount > 0) {
    statOcrBox.classList.add('highlight-ocr');
  } else {
    statOcrBox.classList.remove('highlight-ocr');
  }

  if (state.failedFiles > 0) {
    statFailedBox.classList.add('highlight-failed');
  } else {
    statFailedBox.classList.remove('highlight-failed');
  }

  progressBar.style.width = state.totalFiles > 0 ? `${(state.completedFiles / state.totalFiles) * 100}%` : '0%';
}

function updateTimerUI() {
  if (!state.startTime || !state.isScanning) return;
  const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
  statElapsed.textContent = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`;
}

function parseMoneyInput(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

function formatCompactMoney(num, roundUp50k = false) {
  if (num === null || num === undefined || isNaN(num)) return '';
  let val = Number(num);
  const isNegative = val < 0;
  val = Math.abs(val);

  if (roundUp50k && val > 0) {
    val = Math.ceil(val / 50000) * 50000;
  }

  if (!roundUp50k && val > 0 && val < 10000) {
     val = Math.round(val / 100) * 100;
  }

  let formatted = '';
  if (val >= 1000000) {
    const m = (val / 1000000).toFixed(1).replace(/\.0$/, '');
    formatted = `$${m}M`;
  } else if (val >= 1000) {
    const k = (val / 1000).toFixed(0);
    formatted = `$${k}K`;
  } else {
    formatted = `$${Math.round(val)}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

function calculateApproval(appRevenue) {
  if (!appRevenue || appRevenue <= 0) return '$200K';
  if (appRevenue < 90000) {
    return '$200K';
  }
  const base = appRevenue + 150000;
  const rounded = Math.ceil(base / 50000) * 50000;
  return formatCompactMoney(rounded, true);
}

function formatPhone(phoneStr) {
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  else if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return phoneStr;
}

const dbName = "ScannerV05DB";
const storeName = "companies";
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

async function loadStateDB() {
  try {
    await initDB();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const records = request.result;
      if (records && records.length > 0) {
        records.forEach(v => {
          v.phone = new Set(v.phone);
          v.email = new Set(v.email);
          v.banks = new Map(v.banks);
          v.mcaMap = new Map(v.mcaMap);
          state.companies.set(v.key, v);
        });
        renderLiveTable();
      }
    };
  } catch(e) { console.warn("Failed to load IndexedDB state", e); }
}

function saveRecordToDB(companyRecord) {
  if (!db) return;
  const recordToSave = {
    ...companyRecord,
    phone: Array.from(companyRecord.phone),
    email: Array.from(companyRecord.email),
    banks: Array.from(companyRecord.banks.entries()),
    mcaMap: Array.from(companyRecord.mcaMap.entries())
  };
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(recordToSave);
}

function clearStateDB() {
  if (!db) return;
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
}

window.addEventListener('DOMContentLoaded', loadStateDB);
