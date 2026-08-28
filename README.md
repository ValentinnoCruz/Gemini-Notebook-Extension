# Gemini Notebook Label UX

A small Chrome Manifest V3 extension that improves source-label management in Gemini Notebook (formerly NotebookLM).

## What it changes

1. **Direct “Add new label” button**
   - Adds a dedicated button beside Gemini Notebook's label controls.
   - Uses Gemini Notebook's own native `Add new label` command.
   - Automatically opens the newly created label in rename mode so you can type the name immediately and press **Enter**.

2. **Label action menu appears where you clicked**
   - Clicking a label's three-dot menu keeps **Rename**, **Remove**, and **Add emoji** next to your pointer instead of allowing the Angular overlay to appear at the upper-left of the window.

3. **Drag a source onto a label to move it**
   - Source rows become draggable.
   - Drop a source on a label header to move it to that label.
   - Drag/drop is intentionally an exclusive **move**: other checked label memberships are removed.
   - To keep a source in multiple labels, use Gemini Notebook's native **Move to** menu and its checkboxes.

## Install in Chrome

1. Extract this folder somewhere permanent.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** in the upper-right.
4. Click **Load unpacked**.
5. Select the `gemini-notebook-label-ux` folder.
6. Open or refresh Gemini Notebook.

## Supported sites

- `https://notebooklm.google.com/*`
- `https://notebook.google.com/*`

## Privacy

This extension has no background service worker, no analytics, no network code, and no external server. It only runs as a content script on Gemini Notebook pages and drives the existing UI.

## Current version

`0.1.0`

## If Gemini changes its UI

Gemini Notebook is actively evolving. This version uses currently observed semantic selectors such as `source-picker`, `.single-source-container`, `.label-more-button`, and the native `Move to` label menu. If Google renames those elements, the affected behavior may need a selector update.
