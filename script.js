// === Global Variables ===
let pdfDoc = null;
let file = null;

// === File Upload Handling ===
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  file = e.dataTransfer.files[0];
  loadPDF(file);
});

fileInput.addEventListener("change", (e) => {
  file = e.target.files[0];
  loadPDF(file);
});

// === PDF Loading ===
async function loadPDF(file) {
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();

  pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  document.getElementById("info").innerText = `Loaded: ${file.name} (${pdfDoc.numPages} pages)`;

  renderPages();
}

// === Render Thumbnails ===
async function renderPages() {
  const container = document.getElementById("pages");
  container.innerHTML = "";

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);

    const viewport = page.getViewport({ scale: 0.3 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    const card = document.createElement("div");
    card.className = "page-card";
    card.innerHTML = `<h4>Page ${i}</h4>`;
    card.appendChild(canvas);

    container.appendChild(card);
  }
}

// === Export All Pages (Vector) ===
document.getElementById("btnExportAll").addEventListener("click", async () => {
  if (!file) return alert("No PDF loaded!");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
  const zip = new JSZip();

  for (let i = 0; i < pdf.getPageCount(); i++) {
    const newPdf = await PDFLib.PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdf, [i]);
    newPdf.addPage(copiedPage);

    const pdfBytes = await newPdf.save();
    zip.file(`page-${i + 1}.pdf`, pdfBytes);
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "split-pages.zip");
});

// === Clear ===
document.getElementById("btnClear").addEventListener("click", () => {
  document.getElementById("pages").innerHTML = "";
  document.getElementById("info").innerText = "";
  file = null;
  pdfDoc = null;
});
