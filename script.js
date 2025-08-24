/* script.js
   - Uses PDF.js to render pages (thumbnails + full canvases)
   - Fabric.js for crop selection UI (modal)
   - SortableJS for reordering
   - pdf-lib to assemble edited PDF (image-embedded pages)
   - FileSaver / JSZip available (we use FileSaver for single PDF and per-image downloads)
*/

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.8.162/pdf.worker.min.js';

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const btnExportAllPng = document.getElementById('btnExportAllPng');
const btnExportAllJpg = document.getElementById('btnExportAllJpg');
const btnExportPdf = document.getElementById('btnExportPdf');
const btnClear = document.getElementById('btnClear');

let originalPdfBytes = null;
let pdfJsDoc = null;
// pageState: array of { pageNum, thumbUrl, fullCanvas, rotation (deg), crop {x,y,w,h} in pixels relative to fullCanvas }
let pageState = [];

function setStatus(text){ statusEl.textContent = text; }
function setProgress(p){ progressBar.style.width = `${Math.round(p*100)}%`; }

// drag & drop
dropzone.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e)=>{ e.preventDefault(); dropzone.classList.remove('dragover'); const f = e.dataTransfer.files?.[0]; if (f) fileInput.files = e.dataTransfer.files; handleFileInput(f); });

fileInput.addEventListener('change', (e)=>{ const f = e.target.files?.[0]; if (f) handleFileInput(f); });
btnClear.addEventListener('click', clearAll);

// Export buttons
btnExportAllPng.addEventListener('click', ()=> exportAllImages('png'));
btnExportAllJpg.addEventListener('click', ()=> exportAllImages('jpeg'));
btnExportPdf.addEventListener('click', exportEditedPdf);

// Handle file input
async function handleFileInput(file){
  if (!file) return;
  if (!file.type || !file.type.includes('pdf')) { alert('Please provide a PDF file'); return; }
  clearAll();
  setStatus(`Loading ${file.name}...`);
  setProgress(0.02);
  originalPdfBytes = await file.arrayBuffer();
  try {
    pdfJsDoc = await pdfjsLib.getDocument({data: originalPdfBytes}).promise;
  } catch (e) {
    alert('Failed to parse PDF: ' + e.message);
    setStatus('Failed to load PDF.');
    return;
  }
  setStatus(`PDF loaded — ${pdfJsDoc.numPages} pages`);
  // render pages sequentially
  for (let i=1;i<=pdfJsDoc.numPages;i++){
    setProgress((i-1)/pdfJsDoc.numPages);
    await renderPage(i);
    await new Promise(r=>setTimeout(r,40));
  }
  setProgress(1);
  setStatus('Ready — reorder, rotate, crop, then export.');
  // enable reordering
  Sortable.create(pagesEl, {
    animation: 150,
    onEnd: (ev)=> {
      // update pageState order to match DOM
      const newOrder = [];
      const cards = pagesEl.querySelectorAll('.page-card');
      cards.forEach(card => {
        const idx = Number(card.dataset.index);
        const found = pageState.find(p => p.pageNum === idx);
        if (found) newOrder.push(found);
      });
      pageState = newOrder;
      refreshCards();
    }
  });
}

// Render single page: full high-res canvas + thumbnail
async function renderPage(pageNum){
  const page = await pdfJsDoc.getPage(pageNum);
  // choose scale for full canvas (export quality). Adjust if very large.
  const EXPORT_SCALE = 2.0; // tweak for quality/performance
  const viewport = page.getViewport({ scale: EXPORT_SCALE });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  // white background
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  // create thumbnail (smaller canvas -> dataURL)
  const thumbCanvas = document.createElement('canvas');
  const THUMB_W = 600; // px width of thumb canvas (scaled)
  const scaleThumb = Math.min(1, THUMB_W / canvas.width);
  thumbCanvas.width = Math.floor(canvas.width * scaleThumb);
  thumbCanvas.height = Math.floor(canvas.height * scaleThumb);
  const tctx = thumbCanvas.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0,0,thumbCanvas.width, thumbCanvas.height);
  tctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumbUrl = thumbCanvas.toDataURL('image/png');

  // store state
  pageState.push({
    pageNum,
    thumbUrl,
    fullCanvas: canvas,
    rotation: 0,
    crop: null // {x,y,w,h} in pixels on fullCanvas
  });

  // append card UI
  appendPageCard(pageNum, thumbUrl);
}

// Append UI card for page
function appendPageCard(pageNum, thumbUrl){
  const idx = pageNum;
  const card = document.createElement('div');
  card.className = 'page-card';
  card.dataset.index = idx;

  card.innerHTML = `
    <img class="page-thumb" src="${thumbUrl}" alt="Page ${idx}">
    <div class="page-meta">
      <div class="page-info">
        <div>Page <strong>${idx}</strong></div>
        <div class="small">Rot: <span class="rot">0°</span></div>
      </div>
      <div class="page-actions">
        <button class="icon-btn rotate" title="Rotate 90°">🔄</button>
        <button class="icon-btn crop" title="Crop">✂️</button>
        <button class="icon-btn download-img" title="Download image">💾</button>
      </div>
    </div>
  `;
  pagesEl.appendChild(card);

  // wire events
  const rotateBtn = card.querySelector('.rotate');
  const cropBtn = card.querySelector('.crop');
  const downloadBtn = card.querySelector('.download-img');

  rotateBtn.addEventListener('click', ()=> {
    const st = pageState.find(p => p.pageNum === pageNum);
    st.rotation = (st.rotation + 90) % 360;
    updateCardRotation(card, st);
  });

  cropBtn.addEventListener('click', ()=> openCropModal(pageNum, card));

  downloadBtn.addEventListener('click', async ()=> {
    const st = pageState.find(p => p.pageNum === pageNum);
    const blob = await exportCanvasImage(st, 'png');
    saveAs(blob, `page-${st.pageNum}.png`);
  });
}

// Update rotation display and thumbnail, and re-render thumbnail from fullCanvas
function updateCardRotation(card, st){
  // apply visual rotation to thumbnail display
  const img = card.querySelector('.page-thumb');
  img.style.transform = `rotate(${st.rotation}deg)`;
  const rotSpan = card.querySelector('.rot');
  rotSpan.textContent = `${st.rotation}°`;
}

// Refresh all cards to reflect current pageState order and thumbs
function refreshCards(){
  pagesEl.innerHTML = '';
  for (const st of pageState){
    appendPageCard(st.pageNum, st.thumbUrl);
    // update rotation display if not zero
    const newCard = pagesEl.lastElementChild;
    updateCardRotation(newCard, st);
  }
}

// Open crop modal using Fabric.js to let user draw a rectangle on a preview of fullCanvas
function openCropModal(pageNum, cardEl){
  const st = pageState.find(p=>p.pageNum===pageNum);
  if (!st) return;
  // create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  const modalCard = document.createElement('div');
  modalCard.className = 'card';
  modalCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <strong>Crop — Page ${pageNum}</strong>
      <div><button id="closeModal" class="btn muted">Close</button></div>
    </div>
    <div style="margin-top:10px">
      <canvas id="fabricCanvas" class="crop-canvas"></canvas>
    </div>
    <div class="controls-row">
      <label class="small" style="color:var(--muted);margin-right:auto">Drag to create selection. Double-click rectangle to edit.</label>
      <button id="applyCrop" class="btn">Apply Crop</button>
      <button id="clearCrop" class="btn muted">Clear Crop</button>
    </div>
    <div class="footer-note">Tip: After selecting crop, click <strong>Apply Crop</strong> to save. Rotation is independent.</div>
  `;
  modal.appendChild(modalCard);
  document.body.appendChild(modal);

  // fabric init
  const canvasEl = modal.querySelector('#fabricCanvas');
  // set canvas size proportional to fullCanvas but limited to modal width
  const full = st.fullCanvas;
  const maxW = Math.min(window.innerWidth * 0.85, 900);
  const scale = Math.min(1, maxW / full.width);
  canvasEl.width = Math.floor(full.width * scale);
  canvasEl.height = Math.floor(full.height * scale);

  const fab = new fabric.Canvas(canvasEl, { selection: true, preserveObjectStacking: true });
  // set white background image
  const dataUrl = full.toDataURL('image/png');
  fabric.Image.fromURL(dataUrl, function(img) {
    img.set({ left: 0, top: 0, selectable: false, evented: false, scaleX: scale, scaleY: scale });
    fab.setBackgroundImage(img, fab.renderAll.bind(fab));
  });

  // load existing crop rect
  if (st.crop) {
    const { x,y,w,h } = st.crop;
    const rect = new fabric.Rect({
      left: x * scale,
      top: y * scale,
      width: w * scale,
      height: h * scale,
      fill: 'rgba(34,211,238,0.12)',
      stroke: 'rgba(34,211,238,0.9)',
      strokeWidth: 2,
      selectable: true
    });
    fab.add(rect);
    fab.setActiveObject(rect);
  }

  // let user draw rectangle with mouse
  let drawingRect, startX, startY;
  fab.on('mouse:down', function(opt){
    if (opt.target) return; // editing existing
    const pointer = fab.getPointer(opt.e);
    startX = pointer.x; startY = pointer.y;
    drawingRect = new fabric.Rect({
      left: startX, top: startY, width: 1, height: 1,
      fill: 'rgba(34,211,238,0.12)', stroke: 'rgba(34,211,238,0.9)', strokeWidth: 2, selectable: true
    });
    fab.add(drawingRect);
  });
  fab.on('mouse:move', function(opt){
    if (!drawingRect) return;
    const pointer = fab.getPointer(opt.e);
    drawingRect.set({ width: Math.abs(pointer.x - startX), height: Math.abs(pointer.y - startY) });
    drawingRect.set({ left: Math.min(pointer.x, startX), top: Math.min(pointer.y, startY) });
    fab.requestRenderAll();
  });
  fab.on('mouse:up', function(){ drawingRect = null; });

  // handlers
  modal.querySelector('#closeModal').addEventListener('click', ()=>{ fab.dispose(); modal.remove(); });
  modal.querySelector('#clearCrop').addEventListener('click', ()=>{
    st.crop = null;
    fab.getObjects().forEach(o => fab.remove(o));
  });

  modal.querySelector('#applyCrop').addEventListener('click', ()=>{
    // take the active object or first rect
    const obj = fab.getActiveObject() || fab.getObjects()[0];
    if (!obj) {
      st.crop = null;
      fab.dispose(); modal.remove(); refreshCards();
      return;
    }
    // convert back to fullCanvas pixel coords
    const s = scale;
    const x = Math.round(obj.left / s);
    const y = Math.round(obj.top / s);
    const w = Math.round(obj.width * obj.scaleX / s);
    const h = Math.round(obj.height * obj.scaleY / s);
    // clamp
    st.crop = {
      x: Math.max(0, Math.min(st.fullCanvas.width-1, x)),
      y: Math.max(0, Math.min(st.fullCanvas.height-1, y)),
      w: Math.max(1, Math.min(st.fullCanvas.width - x, w)),
      h: Math.max(1, Math.min(st.fullCanvas.height - y, h))
    };
    fab.dispose(); modal.remove();
    // update thumbnail to show crop visually (we'll regenerate thumb)
    regenerateThumbnail(st).then(()=> refreshCards());
  });
}

// regenerate thumbnail from fullCanvas taking into account crop and rotation
async function regenerateThumbnail(st){
  const full = st.fullCanvas;
  // create an offscreen canvas to apply crop + rotation
  const off = document.createElement('canvas');
  let sx=0, sy=0, sw=full.width, sh=full.height;
  if (st.crop) { sx = st.crop.x; sy = st.crop.y; sw = st.crop.w; sh = st.crop.h; }
  // if rotated 90 or 270, swap dims
  const rot = st.rotation % 360;
  if (rot===90 || rot===270){
    off.width = sh; off.height = sw;
  } else {
    off.width = sw; off.height = sh;
  }
  const octx = off.getContext('2d');
  // white background
  octx.fillStyle = '#ffffff'; octx.fillRect(0,0,off.width, off.height);
  // draw with rotation
  octx.save();
  if (rot===90){
    octx.translate(off.width, 0); octx.rotate(Math.PI/2);
    octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot===180){
    octx.translate(off.width, off.height); octx.rotate(Math.PI);
    octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot===270){
    octx.translate(0, off.height); octx.rotate(-Math.PI/2);
    octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  octx.restore();
  // create thumb sized to 600px width
  const THUMB_W = 600;
  const scale = Math.min(1, THUMB_W / off.width);
  const tcan = document.createElement('canvas');
  tcan.width = Math.max(1, Math.floor(off.width * scale));
  tcan.height = Math.max(1, Math.floor(off.height * scale));
  tcan.getContext('2d').drawImage(off, 0, 0, off.width, off.height, 0, 0, tcan.width, tcan.height);
  st.thumbUrl = tcan.toDataURL('image/png');
}

// Export canvas/image for one page as Blob (png/jpeg)
async function exportCanvasImage(st, mime='png'){
  // prepare an offscreen canvas applying crop & rotation; use fullCanvas as source
  const full = st.fullCanvas;
  let sx=0, sy=0, sw=full.width, sh=full.height;
  if (st.crop) { sx=st.crop.x; sy=st.crop.y; sw=st.crop.w; sh=st.crop.h; }
  const rot = st.rotation % 360;
  let outW = sw, outH = sh;
  if (rot===90 || rot===270){ outW = sh; outH = sw; }
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,out.width,out.height);
  ctx.save();
  if (rot===90){
    ctx.translate(out.width, 0); ctx.rotate(Math.PI/2);
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot===180){
    ctx.translate(out.width, out.height); ctx.rotate(Math.PI);
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot===270){
    ctx.translate(0, out.height); ctx.rotate(-Math.PI/2);
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  ctx.restore();
  return new Promise(res => out.toBlob(b => res(b), `image/${mime}`, mime==='jpeg'?0.92:0.95));
}

// Export all pages as individual images (PNG/JPG)
async function exportAllImages(format='png'){
  if (!pageState.length) return alert('No pages loaded');
  setStatus('Exporting images...');
  setProgress(0);
  for (let i=0;i<pageState.length;i++){
    const st = pageState[i];
    try {
      const blob = await exportCanvasImage(st, format==='jpg'?'jpeg':format);
      const ext = (format==='jpg'?'jpg':format);
      saveAs(blob, `page-${i+1}.${ext}`);
    } catch(e){
      console.error('Export image failed', e);
      alert('Failed to export image for page ' + st.pageNum);
    }
    setProgress((i+1)/pageState.length);
    await new Promise(r=>setTimeout(r,30));
  }
  setStatus('Export complete.');
  setProgress(1);
}

// Export edited PDF (each page embedded as image preserving current crop+rotation)
async function exportEditedPdf(){
  if (!pageState.length) return alert('No pages loaded');
  setStatus('Preparing edited PDF...');
  setProgress(0);
  const outPdf = await PDFLib.PDFDocument.create();
  for (let i=0;i<pageState.length;i++){
    const st = pageState[i];
    const blob = await exportCanvasImage(st,'png');
    const arr = await blob.arrayBuffer();
    const img = await outPdf.embedPng(arr);
    const { width, height } = img.scale(1);
    const page = outPdf.addPage([width, height]);
    page.drawImage(img, { x:0, y:0, width, height });
    setProgress((i+1)/pageState.length * 0.9);
    await new Promise(r=>setTimeout(r,20));
  }
  const pdfBytes = await outPdf.save();
  saveAs(new Blob([pdfBytes], {type:'application/pdf'}), `edited-${Date.now()}.pdf`);
  setStatus('Edited PDF ready.');
  setProgress(1);
}

// Clear everything
function clearAll(){
  for (const st of pageState) {
    if (st.thumbUrl) URL.revokeObjectURL(st.thumbUrl);
  }
  pageState = [];
  pagesEl.innerHTML = '';
  pdfJsDoc = null;
  originalPdfBytes = null;
  setStatus('Cleared.');
  setProgress(0);
}

// refresh cards to show updated thumbs / rotation info
function refreshCards(){
  pagesEl.innerHTML = '';
  for (const st of pageState){
    appendPageCardFromState(st);
  }
}

function appendPageCardFromState(st){
  const idx = st.pageNum;
  const card = document.createElement('div');
  card.className = 'page-card';
  card.dataset.index = idx;
  card.innerHTML = `
    <img class="page-thumb" src="${st.thumbUrl}" alt="Page ${idx}">
    <div class="page-meta">
      <div class="page-info">
        <div>Page <strong>${idx}</strong></div>
        <div class="small">Rot: <span class="rot">${st.rotation}°</span></div>
      </div>
      <div class="page-actions">
        <button class="icon-btn rotate">🔄</button>
        <button class="icon-btn crop">✂️</button>
        <button class="icon-btn download-img">💾</button>
      </div>
    </div>
  `;
  pagesEl.appendChild(card);

  card.querySelector('.rotate').addEventListener('click', ()=> { st.rotation = (st.rotation + 90) % 360; regenerateThumbnail(st).then(()=> refreshCards()); });
  card.querySelector('.crop').addEventListener('click', ()=> openCropModal(st.pageNum, card));
  card.querySelector('.download-img').addEventListener('click', async ()=> { const blob = await exportCanvasImage(st,'png'); saveAs(blob, `page-${st.pageNum}.png`); });
}

// initial append uses pageState filled in renderPage
function appendPageCard(pageNum, thumbUrl){
  const st = pageState.find(p=>p.pageNum===pageNum);
  if (!st) {
    console.warn('State missing for', pageNum);
    return;
  }
  appendPageCardFromState(st);
}

// When a pageState crop is changed we want the UI thumbnail to change: regenerate all cards
// We used regenerateThumbnail earlier inside applyCrop -> refreshCards

// Expose saveAs (FileSaver) - available globally via included FileSaver script
// No extra export needed.

