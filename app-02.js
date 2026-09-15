/* =========================================================================
   RELIABLE NATIVE FILE INGESTION (DRAG & DROP + NATIVE OVERLAY SELECTION)
   ========================================================================= */

dropZone.addEventListener('dragover', (e) => { 
  e.preventDefault(); 
  dropZone.classList.add('dragover'); 
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); 
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFilesSelected(Array.from(e.dataTransfer.files));
  }
});

// Direct native file input change event
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFilesSelected(Array.from(e.target.files));
  }
});

async function handleFilesSelected(files) {
  const newTasks = [];
  currentFileName.textContent = "Unpacking files and reading directory tree...";

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        for (const relativePath of Object.keys(zipContent.files)) {
          const zipEntry = zipContent.files[relativePath];
          if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.pdf')) {
            const blob = await zipEntry.async('blob');
            newTasks.push({ id: 'task_' + Math.random().toString(36).substring(2, 9), name: zipEntry.name.split('/').pop(), fileBlob: blob, status: 'pending' });
          }
        }
      } catch (err) { state.failedFiles++; }
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      newTasks.push({ id: 'task_' + Math.random().toString(36).substring(2, 9), name: file.name, fileBlob: file, status: 'pending' });
    }
  }

  if (newTasks.length === 0) return;
  state.queue.push(...newTasks);
  state.totalFiles = state.queue.length;
  updateStatsUI();

  if (!state.isScanning) startScanningQueue();
}

function startScanningQueue() {
  state.isScanning = true;
  state.isPaused = false;
  state.isStopped = false;
  if (!state.startTime) {
    state.startTime = Date.now();
    state.timerInterval = setInterval(updateTimerUI, 1000);
  }
  btnPause.style.display = 'inline-flex';
  btnResume.style.display = 'none';
  processNextInQueue();
}

async function processNextInQueue() {
  if (state.isPaused || state.isStopped) return;
  if (state.currentIndex >= state.queue.length) { finishBatchScan(); return; }

  const task = state.queue[state.currentIndex];
  state.activeTask = task;
  currentFileName.textContent = `Scanning (${state.currentIndex + 1}/${state.totalFiles}): ${task.name}`;
  task.status = 'scanning';

  try {
    const arrayBuffer = await task.fileBlob.arrayBuffer();
    state.regPages = parseInt(regPagesInput.value, 10) || 3;
    state.ocrPages = parseInt(ocrPagesInput.value, 10) || 1;
    state.minRevenue = parseMoneyInput(minRevenueInput.value) || 40000;

    const result = await scanPdfDocument(arrayBuffer, task.name, state.regPages, false);

    if (result.ocrNeeded) {
      task.status = 'ocr_needed';
      state.ocrNeededCount++;
      state.ocrNeededQueue.push(task);
    } else if (!result.skipped) {
      task.status = 'done';
      state.regularScanned++;
      integrateExtractedResult(result);
    } else {
      task.status = 'done';
    }
  } catch (err) {
    task.status = 'failed';
    state.failedFiles++;
    state.failedList.push(task);
  } finally {
    state.completedFiles++;
    state.currentIndex++;
    updateStatsUI();
    setTimeout(processNextInQueue, 10);
  }
}

async function scanPdfDocument(arrayBuffer, fileName, maxPages, isOcrRun = false) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(doc.numPages, maxPages);
  let aggregatedText = '';

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    const items = textContent.items;
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    let lastY = null;
    let pageStr = '';
    for (const item of items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 3) pageStr += '\n';
      else if (pageStr.length > 0 && !pageStr.endsWith(' ')) pageStr += ' ';
      pageStr += item.str;
      lastY = item.transform[5];
    }
    aggregatedText += pageStr + '\n';
  }

  const cleanCharCount = aggregatedText.replace(/\s/g, '').length;
  if (!isOcrRun && cleanCharCount < 100) {
    doc.destroy();
    return { ocrNeeded: true, rawText: aggregatedText };
  }

  const parsedData = parseDocumentText(aggregatedText, fileName);
  doc.destroy();
  return parsedData;
}
