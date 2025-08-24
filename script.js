/* script.js - corrected, integrated and debug-friendly */

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
let pageState = []; // { pageNum, fullCanvas, rotation, crop:{x,y,w,h}, thumbUrl }

function setStatus(text){ statusEl.textContent = text; console.log('[status]', text); }
function setProgress(p){ progressBar.style.width = `${Math.round(p*100)}%`; }

dropzone.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e)=>{ e.preventDefault(); dropzone.classList.remove('dragover'); const f = e.dataTransfer.files?.[0]; if(f) fileInput.files = e.dataTransfer.files; if(f) handleFile(f); });

fileInput.addEventListener('change', (e)=>{ const f = e.target.files?.[0]; if(f) handleFile(f); });
btnClear.addEventListener('click', clearAll);
btnExportAllPng.addEventListener('click', ()=> exportAllImages('png'));
btnExportAllJpg.addEventListener('click', ()=> exportAllImages('jpeg'));
btnExportPdf.addEventListener('click', exportEditedPdf);

// Main entry: process uploaded file
async function handleFile(file){
  try {
    if (!file || !file.type || !file.type.includes('pdf')) {
      alert('Please upload a PDF file.');
      return;
    }
    clearAll();
    setStatus(`Loading ${file.name}...`);
    setProgress(0.02);
    originalPdfBytes = await file.arrayBuffer();
    pdfJsDoc = await pdfjsLib.getDocument({ data: originalPdfBytes }).promise;
    setStatus(`PDF loaded — ${pdfJsDoc.numPages} pages`);
    // sequential render to control memory
    for (let i=1;i<=pdfJsDoc.numPages;i++){
      setProgress((i-1)/pdfJsDoc.numPages);
      await renderAndStorePage(i);
      // refresh UI progressively
      refreshCards();
      await new Promise(r=>setTimeout(r,20));
    }
    setProgress(1);
    setStatus('Ready — reorder, rotate, crop, then export.');
    // enable reordering
    Sortable.create(pagesEl, {
      animation: 150,
      onEnd: (evt) => {
        // rebuild pageState according to DOM order
        const newOrder = [];
        pagesEl.querySelectorAll('.page-card').forEach(card => {
          const pnum = Number(card.dataset.pagenum);
          const st = pageState.find(s => s.pageNum === pnum);
          if (st) newOrder.push(st);
        });
        pageState = newOrder;
        refreshCards();
      }
    });
  } catch (err) {
    console.error('handleFile error', err);
    setStatus('Failed to load PDF. See console.');
    alert('Failed to load PDF: ' + (err.message || err));
  }
}

// Render a page (high-quality canvas), store in pageState
async function renderAndStorePage(pageNum){
  const page = await pdfJsDoc.getPage(pageNum);
  // EXPORT_SCALE controls internal canvas resolution (higher → larger memory)
  const EXPORT_SCALE = 2.0;
  const viewport = page.getViewport({ scale: EXPORT_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  // create a thumbnail data URL now
  const thumbUrl = createThumbDataUrl(canvas);

  pageState.push({
    pageNum,
    fullCanvas: canvas,
    rotation: 0,
    crop: null,
    thumbUrl
  });
}

// create thumbnail dataURL from a full canvas (no crop/rotation here)
function createThumbDataUrl(fullCanvas){
  const THUMB_W = 600;
  const scale = Math.min(1, THUMB_W / fullCanvas.width);
  const tcan = document.createElement('canvas');
  tcan.width = Math.max(1, Math.floor(fullCanvas.width * scale));
  tcan.height = Math.max(1, Math.floor(fullCanvas.height * scale));
  const tctx = tcan.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0,0,tcan.width,tcan.height);
  tctx.drawImage(fullCanvas, 0, 0, fullCanvas.width, fullCanvas.height, 0, 0, tcan.width, tcan.height);
  return tcan.toDataURL('image/png');
}

// rebuild page cards UI
function refreshCards(){
  pagesEl.innerHTML = '';
  for (let st of pageState){
    const card = document.createElement('div');
    card.className = 'page-card';
    card.dataset.pagenum = st.pageNum;

    // ensure thumb reflects crop/rotation if set
    const thumb = document.createElement('img');
    thumb.className = 'page-thumb';
    thumb.alt = `Page ${st.pageNum}`;
    thumb.src = st.thumbUrl;

    const meta = document.createElement('div');
    meta.className = 'page-meta';
    meta.innerHTML = `
      <div class="page-info">
        <div>Page <strong>${st.pageNum}</strong></div>
        <div class="small">Rot: <span class="rot">${st.rotation}°</span></div>
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.innerHTML = `
      <button class="icon-btn rotate" title="Rotate 90°">🔄</button>
      <button class="icon-btn crop" title="Crop">✂️</button>
      <button class="icon-btn download-img" title="Download image">💾</button>
    `;
    meta.appendChild(actions);

    card.appendChild(thumb);
    card.appendChild(meta);
    pagesEl.appendChild(card);

    // wire events
    card.querySelector('.rotate').addEventListener('click', async ()=>{
      st.rotation = (st.rotation + 90) % 360;
      // regenerate thumbnail to reflect rotation + crop
      await regenerateThumbFromState(st);
      refreshCards();
    });

    card.querySelector('.crop').addEventListener('click', ()=> openCropModal(st));

    card.querySelector('.download-img').addEventListener('click', async ()=>{
      try {
        const blob = await exportCanvasImage(st, 'png');
        saveAs(blob, `page-${st.pageNum}.png`);
      } catch (e){
        console.error('download image failed', e);
        alert('Download failed. See console.');
      }
    });
  }
}

// Open crop modal — interactive with Fabric.js
function openCropModal(st){
  // build modal
  const modal = document.createElement('div'); modal.className = 'modal';
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>Crop — Page ${st.pageNum}</strong>
      <div><button id="closeModal" class="btn muted">Close</button></div>
    </div>
    <div style="margin-top:10px">
      <canvas id="fabricCanvas" class="crop-canvas"></canvas>
    </div>
    <div class="controls-row">
      <label class="small" style="color:var(--muted);margin-right:auto">Draw a rectangle then click Apply.</label>
      <button id="applyCrop" class="btn">Apply Crop</button>
      <button id="clearCrop" class="btn muted">Clear Crop</button>
    </div>
    <div class="footer-note">Tip: After selecting crop, click <strong>Apply Crop</strong> to save.</div>
  `;
  modal.appendChild(card);
  document.body.appendChild(modal);

  const canvasEl = card.querySelector('#fabricCanvas');
  const full = st.fullCanvas;
  const maxW = Math.min(window.innerWidth * 0.85, 900);
  const scale = Math.min(1, maxW / full.width);
  canvasEl.width = Math.floor(full.width * scale);
  canvasEl.height = Math.floor(full.height * scale);

  const fabricCanvas = new fabric.Canvas(canvasEl, { selection: true });
  const dataUrl = full.toDataURL('image/png');
  fabric.Image.fromURL(dataUrl, img => {
    img.set({ left: 0, top: 0, selectable: false, evented: false, scaleX: scale, scaleY: scale });
    fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas));
  });

  // restore previous crop if present
  if (st.crop) {
    const r = new fabric.Rect({
      left: st.crop.x * scale,
      top: st.crop.y * scale,
      width: st.crop.w * scale,
      height: st.crop.h * scale,
      fill: 'rgba(56,189,248,0.12)',
      stroke: 'rgba(56,189,248,0.9)',
      strokeWidth: 2,
      selectable: true
    });
    fabricCanvas.add(r);
    fabricCanvas.setActiveObject(r);
  }

  let drawing = false, rect, startX, startY;
  fabricCanvas.on('mouse:down', function(opt){
    if (opt.target) return; // editing existing
    drawing = true;
    const p = fabricCanvas.getPointer(opt.e);
    startX = p.x; startY = p.y;
    rect = new fabric.Rect({
      left: startX, top: startY, width: 1, height: 1,
      fill: 'rgba(56,189,248,0.12)', stroke: 'rgba(56,189,248,0.9)', strokeWidth: 2, selectable: true
    });
    fabricCanvas.add(rect);
  });
  fabricCanvas.on('mouse:move', function(opt){
    if (!drawing || !rect) return;
    const p = fabricCanvas.getPointer(opt.e);
    rect.set({ width: Math.abs(p.x - startX), height: Math.abs(p.y - startY), left: Math.min(p.x, startX), top: Math.min(p.y, startY) });
    fabricCanvas.requestRenderAll();
  });
  fabricCanvas.on('mouse:up', function(){ drawing = false; rect = rect; });

  card.querySelector('#closeModal').addEventListener('click', ()=> { fabricCanvas.dispose(); modal.remove(); });
  card.querySelector('#clearCrop').addEventListener('click', ()=> {
    st.crop = null;
    fabricCanvas.getObjects().forEach(o => { if (o !== fabricCanvas.backgroundImage) fabricCanvas.remove(o); });
  });

  card.querySelector('#applyCrop').addEventListener('click', async ()=>{
    const active = fabricCanvas.getActiveObject() || fabricCanvas.getObjects().find(o => o.type === 'rect');
    if (!active) {
      // clear crop
      st.crop = null;
      await regenerateThumbFromState(st);
      refreshCards();
      fabricCanvas.dispose(); modal.remove();
      return;
    }
    const x = Math.round(active.left / scale);
    const y = Math.round(active.top / scale);
    const w = Math.round(active.width * active.scaleX / scale);
    const h = Math.round(active.height * active.scaleY / scale);
    // clamp
    st.crop = {
      x: Math.max(0, Math.min(st.fullCanvas.width - 1, x)),
      y: Math.max(0, Math.min(st.fullCanvas.height - 1, y)),
      w: Math.max(1, Math.min(st.fullCanvas.width - x, w)),
      h: Math.max(1, Math.min(st.fullCanvas.height - y, h))
    };
    await regenerateThumbFromState(st);
    refreshCards();
    fabricCanvas.dispose(); modal.remove();
  });
}

// regenerate thumbnail from state (apply crop + rotation)
async function regenerateThumbFromState(st){
  const full = st.fullCanvas;
  // compute crop box
  let sx = 0, sy = 0, sw = full.width, sh = full.height;
  if (st.crop) { sx = st.crop.x; sy = st.crop.y; sw = st.crop.w; sh = st.crop.h; }
  const rot = st.rotation % 360;
  const off = document.createElement('canvas');
  // rotated dims
  if (rot === 90 || rot === 270) { off.width = sh; off.height = sw; }
  else { off.width = sw; off.height = sh; }
  const octx = off.getContext('2d');
  octx.fillStyle = '#ffffff'; octx.fillRect(0,0,off.width, off.height);
  octx.save();
  if (rot === 90) {
    octx.translate(off.width, 0); octx.rotate(Math.PI/2); octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot === 180) {
    octx.translate(off.width, off.height); octx.rotate(Math.PI); octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot === 270) {
    octx.translate(0, off.height); octx.rotate(-Math.PI/2); octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  octx.restore();
  // make thumb
  const THUMB_W = 600;
  const scale = Math.min(1, THUMB_W / off.width);
  const tcan = document.createElement('canvas');
  tcan.width = Math.max(1, Math.floor(off.width * scale));
  tcan.height = Math.max(1, Math.floor(off.height * scale));
  tcan.getContext('2d').drawImage(off, 0, 0, off.width, off.height, 0, 0, tcan.width, tcan.height);
  st.thumbUrl = tcan.toDataURL('image/png');
}

// export the image for a state (respecting crop+rotation)
async function exportCanvasImage(st, mime='png'){
  const full = st.fullCanvas;
  let sx = 0, sy = 0, sw = full.width, sh = full.height;
  if (st.crop) { sx = st.crop.x; sy = st.crop.y; sw = st.crop.w; sh = st.crop.h; }
  const rot = st.rotation % 360;
  let outW = sw, outH = sh;
  if (rot === 90 || rot === 270) { outW = sh; outH = sw; }
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,outW,outH);
  ctx.save();
  if (rot === 90) {
    ctx.translate(outW, 0); ctx.rotate(Math.PI/2); ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot === 180) {
    ctx.translate(outW, outH); ctx.rotate(Math.PI); ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else if (rot === 270) {
    ctx.translate(0, outH); ctx.rotate(-Math.PI/2); ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  ctx.restore();
  return new Promise(resolve => out.toBlob(b => resolve(b), `image/${mime}`, mime === 'jpeg' ? 0.92 : 0.95));
}

// export all images (current order)
async function exportAllImages(format='png'){
  if (!pageState.length) { alert('No pages to export'); return; }
  setStatus('Exporting images...');
  setProgress(0);
  for (let i=0;i<pageState.length;i++){
    const st = pageState[i];
    const blob = await exportCanvasImage(st, format === 'jpg' ? 'jpeg' : format);
    const ext = format === 'jpg' ? 'jpg' : format;
    saveAs(blob, `page-${i+1}.${ext}`);
    setProgress((i+1)/pageState.length);
    await new Promise(r=>setTimeout(r,20));
  }
  setStatus('Images exported.');
  setProgress(1);
}

// export edited PDF (embed each edited page as an image)
async function exportEditedPdf(){
  if (!pageState.length) { alert('No pages'); return; }
  setStatus('Preparing edited PDF...');
  setProgress(0);
  const outPdf = await PDFLib.PDFDocument.create();
  for (let i=0;i<pageState.length;i++){
    const st = pageState[i];
    const blob = await exportCanvasImage(st, 'png');
    const arr = await blob.arrayBuffer();
    const img = await outPdf.embedPng(arr);
    const { width, height } = img.scale(1);
    const page = outPdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    setProgress((i+1)/pageState.length * 0.9);
    await new Promise(r=>setTimeout(r,15));
  }
  const pdfBytes = await outPdf.save();
  saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `edited-${Date.now()}.pdf`);
  setStatus('Edited PDF ready.');
  setProgress(1);
}

// clear everything
function clearAll(){
  pageState.forEach(st => { if (st.thumbUrl && st.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(st.thumbUrl); });
  pageState = [];
  pagesEl.innerHTML = '';
  pdfJsDoc = null;
  originalPdfBytes = null;
  setStatus('Cleared.');
  setProgress(0);
}
