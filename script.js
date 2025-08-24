let pdfDoc = null;
const container = document.getElementById("pages-container");
const zip = new JSZip();

document.getElementById("pdf-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function () {
    const typedarray = new Uint8Array(this.result);
    pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
    renderAllPages();
  };
  reader.readAsArrayBuffer(file);
});

async function renderAllPages() {
  container.innerHTML = "";
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    await page.render({ canvasContext: context, viewport }).promise;

    const wrapper = document.createElement("div");
    wrapper.classList.add("page-wrapper");
    wrapper.appendChild(canvas);
    canvas.classList.add("page-canvas");

    // crop overlay
    let cropOverlay = document.createElement("div");
    cropOverlay.classList.add("crop-area");
    wrapper.appendChild(cropOverlay);

    let startX, startY, isCropping = false;
    canvas.addEventListener("mousedown", (e) => {
      startX = e.offsetX;
      startY = e.offsetY;
      isCropping = true;
      cropOverlay.style.left = startX + "px";
      cropOverlay.style.top = startY + "px";
      cropOverlay.style.width = 0;
      cropOverlay.style.height = 0;
    });
    canvas.addEventListener("mousemove", (e) => {
      if (isCropping) {
        cropOverlay.style.display = "block";
        cropOverlay.style.width = e.offsetX - startX + "px";
        cropOverlay.style.height = e.offsetY - startY + "px";
      }
    });
    canvas.addEventListener("mouseup", () => {
      isCropping = false;
    });

    const actions = document.createElement("div");
    actions.classList.add("page-actions");

    const rotateBtn = document.createElement("button");
    rotateBtn.textContent = "Rotate";
    let rotation = 0;
    rotateBtn.onclick = () => {
      rotation = (rotation + 90) % 360;
      canvas.style.transform = `rotate(${rotation}deg)`;
    };

    const cropBtn = document.createElement("button");
    cropBtn.textContent = "Crop";
    cropBtn.onclick = () => {
      const rect = cropOverlay.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();

      const scaleX = canvas.width / cRect.width;
      const scaleY = canvas.height / cRect.height;

      const x = (rect.left - cRect.left) * scaleX;
      const y = (rect.top - cRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      tempCanvas.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(tempCanvas, 0, 0);
      cropOverlay.style.display = "none";
    };

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download";
    downloadBtn.onclick = async () => {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `page-${i}.png`;
      link.click();
    };

    actions.appendChild(rotateBtn);
    actions.appendChild(cropBtn);
    actions.appendChild(downloadBtn);
    wrapper.appendChild(actions);
    container.appendChild(wrapper);
  }
}

document.getElementById("download-zip").addEventListener("click", async () => {
  const wrappers = document.querySelectorAll(".page-wrapper canvas");
  let count = 1;

  for (let canvas of wrappers) {
    const dataUrl = canvas.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    zip.file(`page-${count}.png`, blob);
    count++;
  }

  const content = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(content);
  link.download = "pages.zip";
  link.click();
});
