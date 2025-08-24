/* Advanced PDF splitter with enhanced UI and better error handling */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.8.162/pdf.worker.min.js';

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const btnLoad = document.getElementById('btnLoad');
const btnExportAll = document.getElementById('btnExportAll');
const btnExportAllRaster = document.getElementById('btnExportAllRaster');
const btnClear = document.getElementById('btnClear');
const pagesEl = document.getElementById('pages');
const info = document.getElementById('info');
const progressBar = document.getElementById('progressBar');
const statusLine = document.getElementById('statusLine');

let pdfJsDoc = null;
let originalPdfBytes = null;
let pdfLibDoc = null;
let pageState = [];

function setProgress(p) {
  progressBar.style.width = Math.round(p * 100) + '%';
}

function logStatus(s) { 
  statusLine.textContent = s; 
}

function human(n) { 
  return n.toLocaleString(); 
}

// Enhanced drag & drop handlers
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

btnLoad.addEventListener('click', () => fileInput.click());
btnClear.addEventListener('click', clearAll);
btnExportAll.addEventListener('click', () => exportAll({ rasterFallback: false }));
btnExportAllRaster.addEventListener('click', () => exportAll({ rasterFallback: true }));

async function handleFile(file) {
  resetState();
  if (!file.type || !file.type.includes('pdf')) {
    alert('Please upload a PDF file.');
    return;
  }
  
  info.innerHTML = `
    <div class="info">
      <strong>📄 ${file.name}</strong> • ${human(file.size)} bytes
    </div>
  `;
  
  originalPdfBytes = await file.arrayBuffer();
  await loadDocs(originalPdfBytes);
}

async function loadDocs(arrayBuffer) {
  setProgress(0);
  logStatus('Loading PDF and generating thumbnails...');
  
  try {
    const loadingTask = pdfjsLib.getDocument({ arrayBuffer });
    pdfJsDoc = await loadingTask.promise;
    
    info.innerHTML += `
      <div class="info">
        <strong>📑 ${pdfJsDoc.numPages} pages</strong> loaded successfully
      </div>
    `;
    
    logStatus('Preparing PDF for vector export...');
    pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    
    // Initialize page state
    pageState = [];
    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      pageState.push({
        idx: i,
        rotation: 0,
        crop: { mode: 'none', box: null },
        thumbnailUrl: null,
        failed: false
      });
    }
    
    await renderThumbnails();
    setProgress(1);
    logStatus('Ready! Reorder, rotate, or crop pages, then export.');
  } catch (error) {
    console.error('Error loading PDF:', error);
    logStatus('Error loading PDF. Please try a different file.');
  }
}

async function renderThumbnails() {
  pagesEl.innerHTML = '';
  const promises = pageState.map((_, index) => renderThumbnail(index));
  await Promise.all(promises);
}

async function renderThumbnail(stateIndex) {
  const pNum = pageState[stateIndex].idx;
  
  try {
    const page = await pdfJsDoc.getPage(pNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(1.5, 280 / viewport.width);
    const scaledViewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.9));
    const url = URL.createObjectURL(blob);
    pageState[stateIndex].thumbnailUrl = url;
    
    renderPageCard(stateIndex);
    await new Promise(r => setTimeout(r, 50)); // Smooth animation
  } catch (error) {
    console.error(`Error rendering page ${pNum}:`, error);
  }
}

function renderPageCard(stateIndex) {
  const st = pageState[stateIndex];
  const card = document.createElement('div');
  card.className = 'page-card';
  card.dataset.stateIndex = stateIndex;
  card.draggable = true;

  card.innerHTML = `
    <div class="page-header">
      <div class="page-info">
        <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
        <div>
          <div class="page-title">Page ${st.idx}</div>
          <div class="page-subtitle">Position ${stateIndex + 1}</div>
        </div>
      </div>
      <div class="page-actions">
        <button class="icon-btn" title="Rotate 90°" onclick="rotatePage(${stateIndex})">🔄</button>
        <button class="icon-btn" title="Crop page" onclick="openCropModal(${stateIndex})">✂️</button>
        <button class="icon-btn" title="Remove page" onclick="removePage(${stateIndex})" style="color: #ef4444;">🗑️</button>
      </div>
    </div>
    <img class="thumbnail" src="${st.thumbnailUrl}" alt="Page ${st.idx}" style="transform: rotate(${st.rotation}deg);">
    <div class="page-meta">
      <div class="meta-info">
        <div>Original: <strong>${st.idx}</strong></div>
        <div>Rotation: <strong>${st.rotation}°</strong></div>
        <div>Crop: <strong>${st.crop.mode}</strong></div>
      </div>
      <div class="page-controls">
        <button class="btn btn-sm" onclick="exportSingle(${stateIndex}, {rasterFallback: false})">📄 Vector</button>
        <button class="btn btn-sm" onclick="exportSingle(${stateIndex}, {rasterFallback: true})">🖼️ Raster</button>
      </div>
    </div>
  `;

  // Add drag and drop event listeners
  addDragDropListeners(card, stateIndex);
  
  pagesEl.appendChild(card);
}

function addDragDropListeners(card, stateIndex) {
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(stateIndex));
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.style.borderColor = '#38bdf8';
  });

  card.addEventListener('dragleave', () => {
    card.style.borderColor = '';
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.style.borderColor = '';
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    const toIndex = Number(card.dataset.stateIndex);
    
    if (!Number.isFinite(fromIndex) || fromIndex === toIndex) return;
    
    moveState(fromIndex, toIndex);
  });
}

function rotatePage(stateIndex) {
  const st = pageState[stateIndex];
  st.rotation = (st.rotation + 90) % 360;
  refreshAllCards();
}

function removePage(stateIndex) {
  if (confirm('Remove this page from the output?')) {
    pageState.splice(stateIndex, 1);
    refreshAllCards();
  }
}

function moveState(from, to) {
  if (from === to) return;
  const item = pageState.splice(from, 1)[0];
  pageState.splice(to, 0, item);
  refreshAllCards();
}

function refreshAllCards() {
  pagesEl.innerHTML = '';
  for (let i = 0; i < pageState.length; i++) {
    renderPageCard(i);
  }
}

function openCropModal(stateIndex) {
  const st = pageState[stateIndex];
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h3>✂️ Crop Page ${st.idx}</h3>
          <p class="form-label">Choose crop mode and adjust boundaries</p>
        </div>
        <button class="icon-btn" onclick="this.closest('.modal').remove()">✖️</button>
      </div>
      
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <img src="${st.thumbnailUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; background: white;">
      </div>
      
      <div class="crop-controls">
        <div class="form-group">
          <label class="form-label">Crop Mode</label>
          <select class="form-select" id="cropMode">
            <option value="none" ${st.crop.mode === 'none' ? 'selected' : ''}>No Crop</option>
            <option value="vector" ${st.crop.mode === 'vector' ? 'selected' : ''}>Vector (Crop Box)</option>
            <option value="raster" ${st.crop.mode === 'raster' ? 'selected' : ''}>Raster (Pixel Crop)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Left Margin (%)</label>
          <input class="form-input" id="cropL" type="number" min="0" max="100" value="${st.crop.box ? (st.crop.box.l * 100).toFixed(1) : 0}">
        </div>
        
        <div class="form-group">
          <label class="form-label">Top Margin (%)</label>
          <input class="form-input" id="cropT" type="number" min="0" max="100" value="${st.crop.box ? (st.crop.box.t * 100).toFixed(1) : 0}">
        </div>
        
        <div class="form-group">
          <label class="form-label">Width (%)</label>
          <input class="form-input" id="cropW" type="number" min="1" max="100" value="${st.crop.box ? (st.crop.box.w * 100).toFixed(1) : 100}">
        </div>
        
        <div class="form-group">
          <label class="form-label">Height (%)</label>
          <input class="form-input" id="cropH" type="number" min="1" max="100" value="${st.crop.box ? (st.crop.box.h * 100).toFixed(1) : 100}">
        </div>
      </div>
      
      <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
        <button class="btn" onclick="applyCrop(${stateIndex}, this.closest('.modal'))">Apply Crop</button>
        <button class="btn danger" onclick="this.closest('.modal').remove()">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function applyCrop(stateIndex, modal) {
  const st = pageState[stateIndex];
  const mode = modal.querySelector('#cropMode').value;
  const l = Number(modal.querySelector('#cropL').value) / 100 || 0;
  const t = Number(modal.querySelector('#cropT').value) / 100 || 0;
  const w = Number(modal.querySelector('#cropW').value) / 100 || 1;
  const h = Number(modal.querySelector('#cropH').value) / 100 || 1;
  
  if (mode === 'none') {
    st.crop.mode = 'none';
    st.crop.box = null;
  } else {
    st.crop.mode = mode;
    st.crop.box = {
      l: Math.max(0, Math.min(1, l)),
      t: Math.max(0, Math.min(1, t)),
      w: Math.max(0.01, Math.min(1, w)),
      h: Math.max(0.01, Math.min(1, h))
    };
  }
  
  modal.remove();
  refreshAllCards();
}

async function exportSingle(stateIndex, options = { rasterFallback: false }) {
  const st = pageState[stateIndex];
  const name = `page-${st.idx}`;
  
  try {
    logStatus(`Exporting page ${st.idx}...`);
    setProgress(0);
    
    if (st.crop.mode === 'raster' || options.rasterFallback) {
      await exportSingleRaster(st, name);
    } else {
      await exportSingleVector(st, name);
    }
    
    logStatus(`✅ Exported ${name}.pdf successfully`);
    setProgress(1);
  } catch (err) {
    console.error('Export error:', err);
    st.failed = true;
    logStatus(`❌ Export failed for page ${st.idx}: ${err.message || err}`);
    
    if (!options.rasterFallback) {
      const fallback = confirm('Vector export failed. Try raster fallback?');
      if (fallback) {
        await exportSingle(stateIndex, { rasterFallback: true });
      }
    }
  }
}

async function exportSingleVector(st, filePrefix) {
  const original = await PDFLib.PDFDocument.load(originalPdfBytes);
  const newDoc = await PDFLib.PDFDocument.create();
  const copiedPages = await newDoc.copyPages(original, [st.idx - 1]);
  const page = copiedPages[0];
  
  if (st.rotation && st.rotation % 360 !== 0) {
    page.setRotation(PDFLib.degrees(st.rotation));
  }
  
  if (st.crop && st.crop.mode === 'vector' && st.crop.box) {
    try {
      const { width, height } = page.getSize();
      const l = st.crop.box.l * width;
      const t = st.crop.box.t * height;
      const w = st.crop.box.w * width;
      const h = st.crop.box.h * height;
      
      if (typeof page.setCropBox === 'function') {
        page.setCropBox(l, height - (t + h), l + w, height - t);
      } else {
        const cropArray = [
          PDFLib.PDFNumber.of(l),
          PDFLib.PDFNumber.of(height - (t + h)),
          PDFLib.PDFNumber.of(l + w),
          PDFLib.PDFNumber.of(height - t)
        ];
        page.node.set(PDFLib.PDFName.of('CropBox'), PDFLib.PDFArray.fromArray(cropArray, newDoc.context));
      }
    } catch (e) {
      console.warn('Vector crop not supported, continuing without crop:', e);
    }
  }
  
  newDoc.addPage(page);
  const pdfBytes = await newDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  saveAs(blob, `${filePrefix}.pdf`);
}

async function exportSingleRaster(st, filePrefix) {
  const pNum = st.idx;
  const page = await pdfJsDoc.getPage(pNum);
  const scaleFactor = 2.5 * (window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: scaleFactor });
  
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  let cropCanvas = canvas;
  if (st.crop && st.crop.mode !== 'none' && st.crop.box) {
    const c = document.createElement('canvas');
    const sx = Math.round(st.crop.box.l * canvas.width);
    const sy = Math.round(st.crop.box.t * canvas.height);
    const sw = Math.round(st.crop.box.w * canvas.width);
    const sh = Math.round(st.crop.box.h * canvas.height);
    
    c.width = sw;
    c.height = sh;
    const cctx = c.getContext('2d');
    cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    cropCanvas = c;
  }
  
  const blob = await new Promise(res => cropCanvas.toBlob(res, 'image/png', 0.95));
  const arrBuf = await blob.arrayBuffer();
  
  const newDoc = await PDFLib.PDFDocument.create();
  const img = await newDoc.embedPng(arrBuf);
  const { width, height } = img.scale(1);
  const pagePdf = newDoc.addPage([width, height]);
  
  pagePdf.drawImage(img, { x: 0, y: 0, width, height });
  
  if (st.rotation && st.rotation % 360 !== 0) {
    pagePdf.setRotation(PDFLib.degrees(st.rotation));
  }
  
  const pdfBytes = await newDoc.save();
  saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `${filePrefix}-raster.pdf`);
}

async function exportAll({ rasterFallback = false } = {}) {
  if (!pdfLibDoc || pageState.length === 0) {
    alert('No PDF loaded or no pages to export');
    return;
  }
  
  // Disable buttons during export
  btnExportAll.disabled = true;
  btnExportAllRaster.disabled = true;
  btnClear.disabled = true;
  
  setProgress(0);
  logStatus('🚀 Starting batch export...');
  
  const zip = new JSZip();
  const total = pageState.length;
  let completed = 0;
  const failedPages = [];
  
  const exportPromises = pageState.map(async (st, index) => {
    try {
      let pdfBytes;
      
      try {
        pdfBytes = await exportPageToBytesVector(st);
        zip.file(`page-${st.idx}.pdf`, pdfBytes);
      } catch (ve) {
        console.warn('Vector export failed, trying raster:', ve);
        if (rasterFallback) {
          pdfBytes = await exportPageToBytesRaster(st);
          zip.file(`page-${st.idx}-raster.pdf`, pdfBytes);
        } else {
          throw ve;
        }
      }
      
      completed++;
      setProgress(completed / total * 0.8); // Reserve 20% for ZIP generation
      logStatus(`📄 Processed ${completed}/${total} pages...`);
    } catch (err) {
      console.error('Page export failed:', st.idx, err);
      st.failed = true;
      failedPages.push(st.idx);
    }
  });
  
  await Promise.all(exportPromises);
  
  if (failedPages.length > 0) {
    logStatus(`⚠️ ${failedPages.length} pages failed. Continuing with successful pages...`);
  }
  
  if (completed > 0) {
    logStatus('📦 Generating ZIP file...');
    const content = await zip.generateAsync({ type: 'blob' }, (meta) => {
      setProgress(0.8 + (meta.percent / 100) * 0.2);
    });
    
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
    saveAs(content, `pdf-pages_${timestamp}.zip`);
    
    logStatus(`✅ Export complete! ${completed} pages exported successfully.`);
  } else {
    logStatus('❌ All pages failed to export. Please check your PDF file.');
  }
  
  // Re-enable buttons
  btnExportAll.disabled = false;
  btnExportAllRaster.disabled = false;
  btnClear.disabled = false;
  
  setProgress(1);
  refreshAllCards(); // Update UI to show any failures
}

async function exportPageToBytesVector(st) {
  const original = await PDFLib.PDFDocument.load(originalPdfBytes);
  const newDoc = await PDFLib.PDFDocument.create();
  const copiedPages = await newDoc.copyPages(original, [st.idx - 1]);
  const page = copiedPages[0];
  
  if (st.rotation && st.rotation % 360 !== 0) {
    page.setRotation(PDFLib.degrees(st.rotation));
  }
  
  if (st.crop && st.crop.mode === 'vector' && st.crop.box) {
    try {
      const { width, height } = page.getSize();
      const l = st.crop.box.l * width;
      const t = st.crop.box.t * height;
      const w = st.crop.box.w * width;
      const h = st.crop.box.h * height;
      
      if (typeof page.setCropBox === 'function') {
        page.setCropBox(l, height - (t + h), l + w, height - t);
      } else {
        const cropArray = [
          PDFLib.PDFNumber.of(l),
          PDFLib.PDFNumber.of(height - (t + h)),
          PDFLib.PDFNumber.of(l + w),
          PDFLib.PDFNumber.of(height - t)
        ];
        page.node.set(PDFLib.PDFName.of('CropBox'), PDFLib.PDFArray.fromArray(cropArray, newDoc.context));
      }
    } catch (e) {
      console.warn('Vector crop not supported:', e);
    }
  }
  
  newDoc.addPage(page);
  return await newDoc.save();
}

async function exportPageToBytesRaster(st) {
  const pNum = st.idx;
  const page = await pdfJsDoc.getPage(pNum);
  const scaleFactor = 2.5 * (window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: scaleFactor });
  
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  let cropCanvas = canvas;
  if (st.crop && st.crop.mode !== 'none' && st.crop.box) {
    const c = document.createElement('canvas');
    const sx = Math.round(st.crop.box.l * canvas.width);
    const sy = Math.round(st.crop.box.t * canvas.height);
    const sw = Math.round(st.crop.box.w * canvas.width);
    const sh = Math.round(st.crop.box.h * canvas.height);
    
    c.width = sw;
    c.height = sh;
    const cctx = c.getContext('2d');
    cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    cropCanvas = c;
  }
  
  const blob = await new Promise(res => cropCanvas.toBlob(res, 'image/png', 0.95));
  const arrBuf = await blob.arrayBuffer();
  
  const newDoc = await PDFLib.PDFDocument.create();
  const img = await newDoc.embedPng(arrBuf);
  const { width, height } = img.scale(1);
  const pagePdf = newDoc.addPage([width, height]);
  
  pagePdf.drawImage(img, { x: 0, y: 0, width, height });
  
  if (st.rotation && st.rotation % 360 !== 0) {
    pagePdf.setRotation(PDFLib.degrees(st.rotation));
  }
  
  return await newDoc.save();
}

function clearAll() {
  for (const p of pageState) {
    if (p.thumbnailUrl) URL.revokeObjectURL(p.thumbnailUrl);
  }
  pageState = [];
  pagesEl.innerHTML = '';
  info.innerHTML = '';
  setProgress(0);
  logStatus('Ready to process your PDF files');
  pdfJsDoc = null;
  originalPdfBytes = null;
  pdfLibDoc = null;
}

function resetState() {
  clearAll();
  info.innerHTML = '<div class="info">🔄 Loading PDF...</div>';
}

// Load from URL parameter (if provided)
async function loadFromUrlParam() {
  try {
    const params = new URLSearchParams(location.search);
    const url = params.get('url');
    if (!url) return;
    
    info.innerHTML = '<div class="info">🌐 Fetching PDF from URL...</div>';
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    originalPdfBytes = ab;
    await loadDocs(ab);
  } catch (e) {
    console.warn('URL load failed:', e);
    logStatus('Failed to load PDF from URL. Please upload a file manually.');
  }
}

// Initialize
loadFromUrlParam();
