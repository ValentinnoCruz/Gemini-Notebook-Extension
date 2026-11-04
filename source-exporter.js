(() => {
  "use strict";
  if (window.__geminiNotebookSourceDownloaderLoaded) return;
  window.__geminiNotebookSourceDownloaderLoaded = true;

  const ROOT_ID = "gns-root";
  const SOURCE_SELECTOR = ".single-source-container";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const state = {sources:[], busy:false, stopped:false, selected:new Set(), exportFormat:"md"};
  const safeText = (val) => (val || "").trim();
  const dateStamp = () => new Date().toISOString().slice(0, 10);
  const sanitize = (name) => safeText(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "").slice(0, 110) || "Untitled source";

  function el(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === "className") element.className = value;
      else if (name === "text") element.textContent = value;
      else if (name === "type") element.type = value;
      else if (name === "title") element.title = value;
      else if (name === "checked") element.checked = value;
      else if (name === "hidden") element.hidden = value;
      else if (name === "disabled") element.disabled = value;
      else element.setAttribute(name, value);
    }
    for (const child of children) element.append(child);
    return element;
  }

  function toast(text, kind = "") {
    const box = document.getElementById("gns-progress");
    if (!box) return;
    box.textContent = text;
    box.className = `gns-progress ${kind}`;
  }

  function setBusy(busy) {
    state.busy = busy;
    const panel = document.getElementById("gns-panel");
    panel?.querySelectorAll("button,select,input").forEach((node) => {
      if (node.id === "gns-stop") node.disabled = !busy;
      else if (node.id !== "gns-close") node.disabled = busy;
    });
  }

  async function expandSources() {
    const collapsedPanel = document.querySelector(".source-panel.panel-collapsed");
    if (collapsedPanel) {
      document.querySelector(".toggle-source-panel-button")?.click();
      await sleep(300);
    }
    // Gemini Notebook groups sources under collapsible labels, which can hide their rows.
    const root = document.querySelector("source-picker") || document.querySelector(".source-panel") || document;
    for (let pass = 0; pass < 6; pass++) {
      const closed = [...root.querySelectorAll("mat-expansion-panel-header[aria-expanded='false']")];
      if (!closed.length) break;
      closed.forEach((h) => h.click());
      await sleep(270);
    }
  }

  function sourceTitle(node) {
    const titleNode = node.querySelector(".source-title");
    const candidates = [titleNode?.getAttribute("aria-label"), titleNode?.textContent,
      titleNode?.innerText, node.getAttribute("aria-label"), node.querySelector("button.source-stretched-button")?.getAttribute("aria-label")];
    return candidates.map(safeText).find(Boolean) || "Untitled source";
  }

  function getSourceCards() {
    const rows = [...document.querySelectorAll(SOURCE_SELECTOR)];
    const counts = new Map();
    return rows.map((node, index) => {
      const title = sourceTitle(node);
      const occurrence = counts.get(title) || 0;
      counts.set(title, occurrence + 1);
      const icon = safeText(node.querySelector(".source-item-source-icon")?.textContent).replace(/_/g, " ");
      return {id:`${index}:${title}`,title,occurrence,index,icon,element:node};
    });
  }

  function currentCardFor(source) {
    if (source.element?.isConnected) return source.element;
    const sameTitle = [...document.querySelectorAll(SOURCE_SELECTOR)].filter((n) => sourceTitle(n) === source.title);
    return sameTitle[source.occurrence] || null;
  }

  function renderList() {
    const list = document.getElementById("gns-list");
    const count = document.getElementById("gns-count");
    if (!list) return;
    list.replaceChildren();
    count.textContent = `${state.sources.length} source${state.sources.length === 1 ? "" : "s"} found`;
    if (!state.sources.length) {
      list.append(el("div", {className:"gns-empty",text:"No sources are visible. Open a notebook, expand its source list, and click Rescan."}));
      updateSelected();
      return;
    }
    for (const source of state.sources) {
      const checkbox = el("input", {type:"checkbox",checked:state.selected.has(source.id),"aria-label":`Select ${source.title}`});
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selected.add(source.id); else state.selected.delete(source.id);
        updateSelected();
      });
      const label = el("label", {className:"gns-source"}, [checkbox,
        el("span", {className:"gns-name",title:source.title,text:source.title}),
        el("span", {className:"gns-type",text:source.icon.length < 18 ? source.icon : ""})]);
      const download = el("button", {className:"gns-small-btn",text:"Save",title:`Download text for ${source.title}`});
      download.addEventListener("click", (event) => {event.preventDefault(); exportSources([source], false);});
      label.append(download);
      list.append(label);
    }
    updateSelected();
  }

  function updateSelected() {
    const count = state.sources.filter((s) => state.selected.has(s.id)).length;
    const button = document.getElementById("gns-export");
    if (button) button.textContent = `Download ${count} as ZIP`;
    const all = document.getElementById("gns-all");
    if (all) {all.checked = count > 0 && count === state.sources.length; all.indeterminate = count > 0 && count < state.sources.length;}
  }

  async function scan() {
    if (state.busy) return;
    toast("Looking for sources in this notebook...");
    await expandSources();
    await sleep(220);
    const firstScan = state.sources.length === 0;
    const selectedTitles = new Set(state.sources.filter((s) => state.selected.has(s.id)).map((s) => `${s.title}\0${s.occurrence}`));
    state.sources = getSourceCards();
    state.selected = new Set(state.sources.filter((s) => firstScan || selectedTitles.has(`${s.title}\0${s.occurrence}`)).map((s) => s.id));
    renderList();
    toast(state.sources.length ? `${state.sources.length} visible source(s). Select the ones you want and export.` : "No visible sources detected. Open a notebook, or expand the Sources panel.");
  }

  function isVisible(node) {
    if (!node || !node.isConnected) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (getComputedStyle(node).display === "none" || getComputedStyle(node).visibility === "hidden") return false;
    return Boolean(node.getClientRects().length);
  }

  function activeViewer() {
    return [...document.querySelectorAll("source-viewer")].find(isVisible) || null;
  }

  async function waitForViewer(expectedTitle, previousText) {
    const started = Date.now();
    let latest = null, stable = 0, prior = "";
    while (Date.now() - started < 8500) {
      if (state.stopped) throw Error("Export canceled");
      await sleep(220);
      const viewer = activeViewer();
      if (!viewer) continue;
      const title = safeText(viewer.querySelector("input.title-input")?.value);
      const raw = viewer.textContent || "";
      const readyForSource = (!title || title === expectedTitle) &&
        (raw !== previousText || title === expectedTitle || !previousText);
      if (!readyForSource) continue;
      if (raw === prior && raw.length > 0) stable++; else stable = 0;
      prior = raw;
      if (stable >= 2) {latest = viewer; break;}
    }
    if (!latest) throw Error("The source viewer did not open or load (8.5 s timeout)");
    return latest;
  }

  function getOriginalLink(viewer) {
    // Report only URLs already exposed in the source viewer, never guess original storage endpoints.
    const links = [...viewer.querySelectorAll("a[href]")].map((a) => a.href);
    return links.find((href) => /^https:\/\//i.test(href) &&
      !/^(https:\/\/)?(?:notebook(?:lm)?\.google(?:\.com)?)/i.test(href)) || null;
  }

  function cleanSourceText(node, title) {
    const clone = node.cloneNode(true);
    const noise = ["button", "mat-icon", "svg", "nav", "header", "footer", "input", "textarea",
      "source-guide", ".source-guide", ".source-guide-container", ".source-guide-header",
      ".source-summary", ".source-viewer-header", ".source-viewer-toolbar",
      "[role='toolbar']", "[aria-hidden='true']", "[class*='suggested-question']",
      "[class*='guide-keyword']", "[class*='source-viewer-actions']"];
    try {clone.querySelectorAll(noise.join(",")).forEach((e) => e.remove());} catch (e) { /* ignore unknown selectors */ }
    // Detached clones don't have layout; innerText is unreliable. Walk text nodes and
    // insert breaks for paragraphs, headings, list items and preformatted text.
    const breaks = new Set(["DIV","P","SECTION","ARTICLE","H1","H2","H3","H4","H5","H6","LI","PRE","TR","BLOCKQUOTE","BR"]);
    let output = "";
    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {output += n.nodeValue || "";return;}
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const tag = n.tagName;
      if (tag === "BR") {output += "\n";return;}
      if (tag === "LI") output += "\n- ";
      else if (breaks.has(tag) && output && !output.endsWith("\n")) output += "\n";
      for (const child of n.childNodes) walk(child);
      if (breaks.has(tag) && !output.endsWith("\n")) output += "\n";
    }
    walk(clone);
    let text = safeText(output).replace(/\r\n/g,"\n")
      .replace(/[ \t]+\n/g,"\n").replace(/\n{4,}/g,"\n\n\n");
    if (title && text.startsWith(title)) text = text.slice(title.length).trimStart();
    return text;
  }

  function extractSource(viewer, title) {
    // Prefer the document area, not the Source Guide AI summary.
    const selectors = [
      "[data-testid='source-content']", ".source-text-content", ".source-content-text",
      ".source-viewer-content", ".source-document-content", ".source-content-container",
      "source-text-viewer", "source-document-viewer", ".source-content", ".source-text",
      ".source-body", ".document-content", ".pdf-text-layer", ".source-viewer-body",
      "[class*='source-content']", "[class*='source-text']"
    ];
    const candidates = [];
    for (const selector of selectors) {
      const nodes = [...viewer.querySelectorAll(selector)];
      for (const node of nodes) {
        if (!isVisible(node) || node.closest(".source-guide,source-guide")) continue;
        const content = cleanSourceText(node, title);
        if (content.length > 0) candidates.push({content, selector, node});
      }
    }
    // If the page has no stable document selector, fall back to cleaned viewer text.
    // This is *best effort* and is flagged as an uncertain extraction in the manifest.
    candidates.sort((a,b) => b.content.length - a.content.length);
    const preferred = candidates[0];
    const text = preferred ? preferred.content : cleanSourceText(viewer, title);
    const originalUrl = getOriginalLink(viewer);
    const possiblePartial = !preferred ||
      (preferred.node.scrollHeight > preferred.node.clientHeight * 1.8 &&
        preferred.node.querySelectorAll("[style*='translateY'],[style*='transform']").length > 0);
    if (!text || text.length < 12 || /^(source guide|loading|syncing|no content available)$/i.test(text)) {
      throw Error("Readable source text was not exposed by Gemini Notebook");
    }
    // Refuse if all we found is a source guide (prevent silently exporting a summary as full text).
    if (!preferred && text.length < 220) {
      throw Error("Only brief viewer information was visible, not reliable source text");
    }
    return {text, originalUrl, possiblePartial, strategy:preferred?.selector || "cleaned viewer fallback"};
  }

  async function readSource(source) {
    const card = currentCardFor(source);
    if (!card) throw Error("Source row disappeared from the page. Rescan and retry.");
    const openButton = card.querySelector("button.source-stretched-button") ||
      card.querySelector(".source-stretched-button") ||
      card.querySelector("button[aria-label*='Open source']");
    if (!openButton) throw Error("Gemini Notebook's open-source button was not found");
    const previous = activeViewer()?.textContent || "";
    openButton.click();
    const viewer = await waitForViewer(source.title, previous);
    return extractSource(viewer, source.title);
  }

  function formatContent(source, result, format) {
    if (format === "txt") return `${source.title}\n${"=".repeat(Math.min(60, source.title.length))}\n\n${result.text}\n`;
    return `# ${source.title.replace(/[\r\n#]/g," ")}\n\n` +
      `> Extracted source text from Gemini Notebook on ${new Date().toISOString()}. This is NOT the original uploaded file.` +
      `${result.possiblePartial ? " The source viewer extraction may be incomplete." : ""}\n` +
      (result.originalUrl ? `> Visible original link: ${result.originalUrl}\n` : "") +
      `\n---\n\n${result.text}\n`;
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
    // Browser needs the blob URL alive long enough to begin the download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function exportSources(selected, zipped) {
    if (state.busy || !selected.length) {if (!selected.length) toast("Select at least one source.", "error"); return;}
    state.stopped = false;
    setBusy(true);
    const format = state.exportFormat;
    const entries = [], results = [], filenames = new Map();
    try {
      for (let i = 0; i < selected.length; i++) {
        if (state.stopped) break;
        const source = selected[i];
        toast(`Reading source ${i+1}/${selected.length}: ${source.title}`);
        try {
          const extracted = await readSource(source);
          const base = sanitize(source.title);
          const key = base.toLowerCase();
          const ordinal = (filenames.get(key) || 0) + 1;
          filenames.set(key, ordinal);
          const filename = `${base}${ordinal > 1 ? ` (${ordinal})` : ""}.${format}`;
          const data = formatContent(source, extracted, format);
          const record = {title:source.title,status:"exported",filename,characters:extracted.text.length,
            originalUrl:extracted.originalUrl,extractionMethod:extracted.strategy,possiblyIncomplete:extracted.possiblePartial};
          results.push(record);
          if (zipped) entries.push({name:filename,data});
          else triggerDownload(new Blob([data], {type:"text/plain;charset=utf-8"}), filename);
        } catch (error) {
          results.push({title:source.title,status:"failed",reason:error.message || String(error)});
        }
        await sleep(130);
      }
      const successful = results.filter(r => r.status === "exported").length;
      const failed = results.filter(r => r.status === "failed").length;
      const report = {
        product:"Gemini Notebook Source Downloader", exportedAt:new Date().toISOString(),
        notebookUrl:location.href, format, intendedSources:selected.length, processed:results.length,
        exported:successful, failed, canceled:state.stopped, important:"These are extracted text copies, NOT original PDFs, DOCX, images, audio or other binary files. Content may be incomplete when the website hides or virtualizes document text.",
        sources:results
      };
      if (zipped) {
        entries.push({name:"EXPORT-REPORT.json",data:JSON.stringify(report,null,2)});
        entries.push({name:"README.txt",data:"Gemini Notebook Source Downloader\n\nFiles here contain extracted readable text, NOT original uploaded documents or media.\n\nCheck EXPORT-REPORT.json for failed sources and any possiblyIncomplete flags.\nA source failing extraction is not counted as exported.\n\nNo data is sent to third-party servers by this extension.\n"});
        const zip = GNSZip.makeZip(entries);
        triggerDownload(zip,`Gemini-Notebook-sources-${dateStamp()}.zip`);
      }
      toast(`${successful} exported, ${failed} failed${state.stopped ? ", stopped early" : ""}. ${zipped ? "Check EXPORT-REPORT.json in the ZIP." : ""}`,failed || state.stopped ? "error" : "success");
    } catch (error) {
      toast(`Export interrupted: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    const root = el("div", {id:ROOT_ID});
    const launch = el("button",{id:"gns-launch",text:"↓  Export sources"});
    const panel = el("section",{id:"gns-panel",hidden:true,"aria-label":"Download sources"});
    const close = el("button",{id:"gns-close",className:"gns-iconbtn",text:"×","aria-label":"Close downloader"});
    close.addEventListener("click", () => {panel.hidden = true;launch.hidden = false;});
    const header = el("div",{className:"gns-header"},[
      el("div",{className:"gns-top"},[
        el("div",{},[el("div",{className:"gns-kicker",text:"GEMINI NOTEBOOK"}),el("div",{className:"gns-title",text:"Download sources"})]),close
      ]), el("div",{className:"gns-subtitle",text:"Select sources to export their readable text. Original PDFs, Word documents, images and audio are not recreated."})
    ]);
    const selectAll = el("input",{type:"checkbox",checked:true,id:"gns-all"});
    selectAll.addEventListener("change", () => {
      state.selected = new Set(selectAll.checked ? state.sources.map(s=>s.id) : []);
      renderList();
    });
    const format = el("select",{id:"gns-format","aria-label":"Export format"},[
      el("option",{value:"md",text:"Markdown (.md)"}), el("option",{value:"txt",text:"Text (.txt)"})
    ]);
    format.value = "md";
    format.addEventListener("change",() => {state.exportFormat=format.value;});
    const tools = el("div",{className:"gns-tools"},[
      el("label",{className:"gns-inline"},[selectAll,el("span",{id:"gns-count",text:"0 sources found"})]),format
    ]);
    const list = el("div",{id:"gns-list",className:"gns-list"});
    const rescan = el("button",{className:"gns-secondary",text:"Rescan"});
    rescan.addEventListener("click",() => scan());
    const bulk = el("button",{id:"gns-export",className:"gns-primary",text:"Download 0 as ZIP"});
    bulk.addEventListener("click",() => exportSources(state.sources.filter(s=>state.selected.has(s.id)),true));
    const stop = el("button",{id:"gns-stop",className:"gns-secondary",text:"Stop",disabled:true});
    stop.addEventListener("click",()=>{state.stopped = true;toast("Stopping after the current source...");});
    const actions = el("div",{className:"gns-actions"},[rescan,bulk,stop]);
    panel.append(header,tools,list,actions,
      el("div",{id:"gns-progress",className:"gns-progress",role:"status",text:"Open a notebook, then scan the visible source list."}),
      el("p",{className:"gns-notice",text:"Local-only export • Read-only • ZIP includes success/failure details"}));
    launch.addEventListener("click",() => {panel.hidden=false;launch.hidden=true;scan();});
    root.append(launch,panel);document.body.append(root);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GNS_OPEN") return;
    try {
      mount();
      document.getElementById("gns-panel").hidden = false;
      document.getElementById("gns-launch").hidden = true;
      scan();
      sendResponse({ok:true});
    } catch (error) {sendResponse({ok:false,error:String(error.message || error)});}
  });
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded",mount,{once:true});
})();
