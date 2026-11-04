"use strict";

const launch = document.getElementById("launch");
const status = document.getElementById("status");

launch.addEventListener("click", async () => {
  status.classList.remove("error");
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !/^https:\/\/(?:notebook(?:lm)?\.google(?:\.com)?)(?:\/|$)/.test(tab.url || "")) {
      throw new Error("Open a notebook at notebook.google.com first.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GNS_OPEN" });
    if (!response?.ok) {
      throw new Error(response?.error || "Cannot reach the notebook. Reload the page and retry.");
    }
    window.close();
  } catch (err) {
    status.textContent = err.message || "Please reload Gemini Notebook and retry.";
    status.classList.add("error");
  }
});
