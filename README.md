# Gemini Notebook PowerTools

An all-in-one Chrome extension that supercharges **Gemini Notebook / NotebookLM** with intuitive source-organization tools, label drag-and-drop, and one-click source exporting.

---

## Features

### 1. 🏷️ Label UX & Source Organization
* **Dedicated "Add new label" button:** Quickly create new source labels right in the sidebar without opening submenus.
* **Smart auto-focus:** Immediately opens newly created labels in rename mode.
* **Repositioned 3-dot menus:** Keeps the label options menu right beside your mouse cursor rather than stuck at the top corner of the screen.
* **Reliable Drag-and-Drop:** Adds a dedicated `⠿` handle beside each source item to drag and drop sources directly into labels using pointer events (bypassing Angular UI event drops).
* **Exclusive Move:** Dropping a source onto a label moves it cleanly.

### 2. 📦 Source Downloader & Exporter
* **One-Click Export UI:** Floating `Export sources` action button and popup launcher to open the export tray.
* **Batch or Single Downloads:** Save sources individually as Markdown (`.md`) or Plain Text (`.txt`), or bundle selected sources into an in-memory `.zip` archive.
* **Zero Dependencies:** Pure in-memory ZIP writer (`zip.js`) without external libraries or tracking.
* **Audit Report:** Generates an `EXPORT-REPORT.json` inside exports with processing status, timestamps, and warnings.

---

## Installation (Unpacked)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select this directory.
5. Open [NotebookLM / Gemini Notebook](https://notebooklm.google.com/) and reload the page.

---

## Extension Structure

```
├── manifest.json         # Manifest V3 extension configuration
├── popup.html/js/css     # Toolbar action launcher and status UI
├── label-ux.js           # Label management & drag-and-drop interactions
├── label-ux.css          # Drag handle and label button styles
├── source-exporter.js    # Source viewer text extraction and export modal
├── source-exporter.css   # Exporter panel and overlay styles
├── zip.js                # Lightweight zero-dependency in-browser ZIP writer
├── icons/                # Extension icons (16px, 48px, 128px)
└── tests/
    └── zip.test.cjs      # Unit test suite for the ZIP packager
```

---

## Privacy & Security

* **100% Client-side:** All extraction, labeling, and compression happens entirely inside your local browser.
* **No external servers:** No data, source text, or user credentials ever leave your browser.
* **No login or API keys required:** Operates directly on the rendered document views.
