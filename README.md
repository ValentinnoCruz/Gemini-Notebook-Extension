# Gemini Notebook Label UX v0.1.1

A small Manifest V3 Chrome extension that improves source-label management in Gemini Notebook / NotebookLM.

## Features

- Adds a dedicated **Add new label** button.
- Automatically opens a newly created `New Label` in rename mode.
- Repositions the label `...` menu beside the pointer instead of the upper-left corner.
- Adds a small **⠿ drag handle** to every source.
- Uses extension-controlled pointer dragging instead of native browser HTML5 drag/drop, which is more reliable inside Gemini Notebook's Angular UI.
- Dropping a source on a label performs an exclusive move to that label.
- Gemini Notebook's native **Move to** menu remains available when you want a source assigned to multiple labels.

## Install / update

1. Extract the ZIP.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. If v0.1.0 is already loaded, click **Remove** on it (or point its existing unpacked extension to this new folder).
5. Click **Load unpacked** and select the `gemini-notebook-label-ux` folder.
6. Refresh any open Gemini Notebook tabs.

## Dragging

Grab the **⠿** handle beside a source, drag it over a label header/name, and release when the label highlights.

You can also begin dragging from a blank, non-interactive part of a source row. The handle is the most reliable method.
