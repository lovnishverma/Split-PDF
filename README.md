# 📄 PDF Splitter & Export Tool

A modern, browser-based tool to split any PDF into individual pages and export them as a ZIP file.  
Built with **[pdf-lib](https://pdf-lib.js.org/)**, **[JSZip](https://stuk.github.io/jszip/)**, and **[FileSaver.js](https://github.com/eligrey/FileSaver.js/)**.  
No backend required – everything runs locally in the browser! 🚀

---

## ✨ Features
- ✅ Upload any PDF (up to **50 MB**)  
- ✅ Split PDF into **individual page PDFs**  
- ✅ **Rotate pages** (0°, 90°, 180°, 270°) before exporting  
- ✅ **Custom filename patterns** with page placeholders (`##`)  
  - Example: `page_##.pdf` → `page_01.pdf`, `page_02.pdf`  
  - Example: `certificate_##.pdf` → `certificate_01.pdf`, `certificate_02.pdf`  
- ✅ Download all pages together as a **compressed ZIP archive**  
- ✅ **Drag & Drop support**  
- ✅ **Progress bar & status updates** while processing  
- ✅ Beautiful UI with **glassmorphism design**  

---

## 🛠️ Tech Stack
- **Frontend:** HTML5, CSS3 (modern UI with gradients & glassmorphism)  
- **Libraries:**  
  - [`pdf-lib`](https://pdf-lib.js.org/) → extract & manipulate PDF pages  
  - [`jszip`](https://stuk.github.io/jszip/) → bundle all PDFs into a ZIP file  
  - [`FileSaver.js`](https://github.com/eligrey/FileSaver.js/) → save files client-side  

---

## 🚀 Usage
1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/pdf-splitter-tool.git
   cd pdf-splitter-tool
````

2. Open `index.html` in your **browser** (no server required).
3. Upload a PDF file using the **"Choose PDF File"** button (or drag & drop).
4. Configure options:

   * Select **rotation** (if needed).
   * Set a **filename pattern** (e.g., `page_##.pdf`).
5. Click **"Export Pages as ZIP"**.
6. Wait for processing → ZIP file will be downloaded automatically.

---

## 📷 Screenshot

> <img width="943" height="895" alt="image" src="https://github.com/user-attachments/assets/0df8c9fd-f553-4413-8bbc-de0a5ff84f37" />


---

## ⚡ Example

* Input: `document.pdf` with 3 pages
* Pattern: `certificate_##.pdf`
* Output ZIP:

  ```
  certificate_01.pdf
  certificate_02.pdf
  certificate_03.pdf
  ```

---

## 📦 Deployment

Since this is a **static web app**, you can deploy it anywhere:

* GitHub Pages
* Netlify
* Vercel
* Glitch
* Or just open `index.html` in the browser

---

## 📝 License

MIT License © 2025 – Free to use and modify.

---

## 💡 Credits

* [pdf-lib](https://pdf-lib.js.org/) – PDF manipulation
* [JSZip](https://stuk.github.io/jszip/) – ZIP generation
* [FileSaver.js](https://github.com/eligrey/FileSaver.js/) – Client-side file saving


Do you want me to also include a **GitHub Actions workflow** so that every push automatically deploys this tool to **GitHub Pages**?
```
