(() => {
  'use strict';

  const EXT = 'gnb-label-ux';
  const VERSION = '0.1.2';
  const SELECTORS = {
    sourcePicker: 'source-picker',
    sourceCard: '.single-source-container, .source-item-container',
    sourceMenu: 'button.source-item-more-button[aria-label="More"], button.source-item-more-button, button[aria-label*="More options"]',
    autoLabelButtons: [
      'button[aria-label="Auto-label your sources by topic"]',
      'button[aria-label="Undo or re-label sources"]'
    ],
    labelPanel: 'source-picker mat-expansion-panel',
    labelHeader: 'source-picker mat-expansion-panel-header',
    labelName: '.label-name',
    labelMore: 'button.label-more-button',
    renameInput: 'input.label-rename-input',
    moveTo: 'button.more-menu-move-to-labels-button',
    overlayPane: '.cdk-overlay-container .cdk-overlay-pane',
    menuItem: '[role="menuitem"], [role="menuitemcheckbox"]',
    moveCheckbox: 'input.mdc-checkbox__native-control, input[type="checkbox"]'
  };

  const state = {
    lastLabelMenuPoint: null,
    injecting: false,
    pointerId: null,
    pointerSource: null,
    pointerOrigin: null,
    pointerDragging: false,
    dragTarget: null,
    dragGhost: null,
    suppressClicksUntil: 0
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function firstVisible(selectors, root = document) {
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  }

  function menuItems() {
    return [...document.querySelectorAll(`${SELECTORS.overlayPane} ${SELECTORS.menuItem}`)].filter(visible);
  }

  function menuItemByText(text, exact = false) {
    const wanted = normalize(text).toLowerCase();
    return menuItems().find(el => {
      const current = normalize(el.textContent).toLowerCase();
      return exact ? current === wanted : current.includes(wanted);
    }) || null;
  }

  async function waitFor(getter, timeout = 4500, interval = 50) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const result = getter();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  function toast(message, type = 'info') {
    document.getElementById(`${EXT}-toast`)?.remove();
    const el = document.createElement('div');
    el.id = `${EXT}-toast`;
    el.className = `${EXT}-toast ${EXT}-toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 180);
    }, 2600);
  }

  function setMenuPointFromElement(el) {
    const rect = el.getBoundingClientRect();
    state.lastLabelMenuPoint = {
      x: Math.round(rect.right + 4),
      y: Math.round(rect.top + Math.min(rect.height, 20))
    };
  }

  function isLabelActionsPane(pane) {
    if (!visible(pane)) return false;
    const labels = [...pane.querySelectorAll(SELECTORS.menuItem)]
      .map(el => normalize(el.textContent).toLowerCase());
    return labels.some(t => t.includes('rename')) &&
      labels.some(t => t.includes('remove')) &&
      labels.some(t => t.includes('emoji'));
  }

  function repositionLabelMenu() {
    const point = state.lastLabelMenuPoint;
    if (!point) return;

    const panes = [...document.querySelectorAll(SELECTORS.overlayPane)].filter(isLabelActionsPane);
    for (const pane of panes) {
      pane.style.setProperty('position', 'fixed', 'important');
      pane.style.setProperty('right', 'auto', 'important');
      pane.style.setProperty('bottom', 'auto', 'important');
      pane.style.setProperty('transform', 'none', 'important');

      requestAnimationFrame(() => {
        const rect = pane.getBoundingClientRect();
        const gap = 8;
        const maxX = Math.max(gap, window.innerWidth - rect.width - gap);
        const maxY = Math.max(gap, window.innerHeight - rect.height - gap);
        const left = Math.min(Math.max(gap, point.x + gap), maxX);
        const top = Math.min(Math.max(gap, point.y + gap), maxY);
        pane.style.setProperty('left', `${left}px`, 'important');
        pane.style.setProperty('top', `${top}px`, 'important');
      });
    }
  }

  function labelNameForHeader(header) {
    const panel = header?.closest('mat-expansion-panel');
    const named = normalize(panel?.querySelector(SELECTORS.labelName)?.textContent);
    if (named) return named;

    // Fallback for small DOM changes where .label-name is renamed.
    const clone = header?.cloneNode(true);
    clone?.querySelectorAll('button, mat-icon, [aria-hidden="true"]').forEach(el => el.remove());
    return normalize(clone?.textContent);
  }

  function sourceDisplayName(source) {
    const candidates = [
      '.source-title',
      '.source-item-title',
      '[class*="source-title"]',
      '[class*="source-name"]'
    ];
    for (const selector of candidates) {
      const text = normalize(source.querySelector(selector)?.textContent);
      if (text) return text;
    }
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button, input, mat-icon, .gnb-label-ux-drag-handle').forEach(el => el.remove());
    return normalize(clone.textContent).slice(0, 120) || 'Source';
  }

  function existingLabelPanels() {
    return new Set(document.querySelectorAll(SELECTORS.labelPanel));
  }

  async function enterRenameMode(panel) {
    if (!panel) return false;
    const more = panel.querySelector(SELECTORS.labelMore);
    if (!more) return false;

    setMenuPointFromElement(more);
    more.click();
    const rename = await waitFor(() => menuItemByText('Rename', true) || menuItemByText('Rename'));
    if (!rename) return false;

    rename.click();
    const input = await waitFor(() => panel.querySelector(SELECTORS.renameInput));
    if (!input) return false;

    input.focus();
    input.select?.();
    return true;
  }

  async function createLabelAndRename(button) {
    if (button.disabled) return;
    button.disabled = true;

    try {
      const before = existingLabelPanels();
      const nativeButton = firstVisible(SELECTORS.autoLabelButtons);
      if (!nativeButton) {
        toast('Could not find Gemini Notebook’s label menu.', 'error');
        return;
      }

      nativeButton.click();
      const add = await waitFor(() => menuItemByText('Add new label', true) || menuItemByText('Add new label'));
      if (!add) {
        toast('Gemini Notebook did not expose “Add new label”.', 'error');
        return;
      }

      add.click();

      const panel = await waitFor(() => {
        const panels = [...document.querySelectorAll(SELECTORS.labelPanel)];
        return panels.find(p => !before.has(p)) ||
          [...panels].reverse().find(p => normalize(p.querySelector(SELECTORS.labelName)?.textContent) === 'New Label');
      }, 5500);

      if (!panel) {
        toast('Label created. I could not automatically open rename mode.', 'info');
        return;
      }

      const renamed = await enterRenameMode(panel);
      toast(renamed ? 'New label created — type its name and press Enter.' : 'New label created.', 'success');
    } catch (error) {
      console.error('[Gemini Notebook Label UX] create label failed', error);
      toast('Could not create the label.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function makeAddLabelButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${EXT}-add-label`;
    button.className = `${EXT}-add-label`;
    button.innerHTML = '<span aria-hidden="true">＋</span><span>Add new label</span>';
    button.title = 'Create a new source label';
    button.addEventListener('click', () => createLabelAndRename(button));
    return button;
  }

  function injectAddLabelButton() {
    if (document.getElementById(`${EXT}-add-label`)) return;
    const nativeButton = firstVisible(SELECTORS.autoLabelButtons);
    if (!nativeButton?.parentElement) return;

    const button = makeAddLabelButton();
    nativeButton.parentElement.insertBefore(button, nativeButton);
  }

  function makeDragHandle() {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `${EXT}-drag-handle`;
    handle.setAttribute('aria-label', 'Drag source to a label');
    handle.title = 'Drag source to a label';
    handle.innerHTML = '<span aria-hidden="true">⠿</span>';
    return handle;
  }

  function decorateSourcesAndLabels() {
    for (const source of document.querySelectorAll(SELECTORS.sourceCard)) {
      source.classList.add(`${EXT}-source`);
      source.draggable = false;
      source.removeAttribute('draggable');
      if (!source.querySelector(`.${EXT}-drag-handle`)) {
        source.appendChild(makeDragHandle());
      }
    }

    for (const header of document.querySelectorAll(SELECTORS.labelHeader)) {
      header.classList.add(`${EXT}-label-drop`);
    }
  }

  function clearDragStyles() {
    document.querySelectorAll(`.${EXT}-drag-over`).forEach(el => el.classList.remove(`${EXT}-drag-over`));
    state.dragTarget = null;
  }

  function checkboxState(checkbox) {
    if (!checkbox) return null;
    if (typeof checkbox.checked === 'boolean') return checkbox.checked;
    const aria = checkbox.getAttribute?.('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    return null;
  }

  function checkedState(entry) {
    if (!entry) return false;

    const direct = checkboxState(entry.checkbox);
    if (direct !== null) return direct;

    const hosts = [
      entry.checkbox?.closest?.('mat-checkbox'),
      entry.item?.closest?.('[aria-checked]'),
      entry.item?.querySelector?.('[aria-checked]'),
      entry.item
    ].filter(Boolean);

    for (const host of hosts) {
      const aria = host.getAttribute?.('aria-checked');
      if (aria === 'true') return true;
      if (aria === 'false') return false;
      if (host.classList?.contains('mdc-checkbox--selected') || host.querySelector?.('.mdc-checkbox--selected')) return true;
    }

    return false;
  }

  function labelTextFromCheckbox(checkbox) {
    if (!checkbox) return '';
    const aria = normalize(checkbox.getAttribute('aria-label'));
    if (aria) return aria;

    const labelledBy = checkbox.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/)
        .map(id => normalize(document.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(' ');
      if (text) return text;
    }

    const menuItem = checkbox.closest('[role="menuitem"], [role="menuitemcheckbox"]');
    const menuText = normalize(menuItem?.textContent);
    if (menuText) return menuText;

    const matCheckbox = checkbox.closest('mat-checkbox');
    const matText = normalize(matCheckbox?.textContent);
    if (matText) return matText;

    const label = checkbox.closest('label') || checkbox.parentElement?.querySelector?.('label');
    return normalize(label?.textContent);
  }

  function currentMoveItems() {
    const overlays = [...document.querySelectorAll('.cdk-overlay-container, .cdk-overlay-pane')];
    const roots = overlays.length ? overlays : [document];
    const entries = [];
    const seen = new Set();

    // The current Gemini Notebook implementation renders a native Material
    // checkbox for every label.  Start from those checkboxes because their
    // surrounding element structure has changed more often than the checkbox.
    for (const root of roots) {
      for (const checkbox of root.querySelectorAll(SELECTORS.moveCheckbox)) {
        const item = checkbox.closest('[role="menuitem"], [role="menuitemcheckbox"]') ||
          checkbox.closest('button, mat-checkbox, label') || checkbox.parentElement;
        if (!item) continue;

        const name = labelTextFromCheckbox(checkbox) || normalize(item.textContent);
        if (!name) continue;

        const key = `${name.toLowerCase()}::${entries.length}`;
        if (seen.has(checkbox)) continue;
        seen.add(checkbox);
        entries.push({ item, checkbox, name, key });
      }
    }

    // Fallback for variants where the checkbox is represented by aria-checked
    // but no native input is exposed to the content script.
    for (const item of document.querySelectorAll('.cdk-overlay-container [role="menuitemcheckbox"], .cdk-overlay-container [role="menuitem"][aria-checked]')) {
      if (!visible(item)) continue;
      const name = normalize(item.getAttribute('aria-label')) || normalize(item.textContent);
      if (!name) continue;
      if (entries.some(entry => entry.item === item || entry.name.toLowerCase() === name.toLowerCase())) continue;
      entries.push({ item, checkbox: null, name, key: name.toLowerCase() });
    }

    return entries;
  }

  function comparableLabel(value) {
    return normalize(value)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim()
      .toLowerCase();
  }

  function itemForLabel(items, labelName) {
    const wanted = comparableLabel(labelName);
    if (!wanted) return null;

    return items.find(entry => comparableLabel(entry.name) === wanted) ||
      items.find(entry => comparableLabel(entry.checkbox?.getAttribute?.('aria-label')) === wanted) ||
      items.find(entry => comparableLabel(entry.name).endsWith(wanted)) ||
      items.find(entry => comparableLabel(entry.name).includes(wanted));
  }

  function entryStillExists(labelName) {
    return itemForLabel(currentMoveItems(), labelName);
  }

  async function clickMoveEntry(entry, desiredState) {
    if (!entry) return false;
    const labelName = entry.name;

    const isDesired = () => {
      const refreshed = entryStillExists(labelName);
      return refreshed && checkedState(refreshed) === desiredState ? refreshed : null;
    };

    if (isDesired()) return true;

    const attempts = [];
    if (entry.checkbox) attempts.push(entry.checkbox);
    const matCheckbox = entry.checkbox?.closest?.('mat-checkbox');
    if (matCheckbox && !attempts.includes(matCheckbox)) attempts.push(matCheckbox);
    if (entry.item && !attempts.includes(entry.item)) attempts.push(entry.item);

    for (const target of attempts) {
      try {
        target.click();
      } catch (_) {
        try {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (_) {}
      }

      const changed = await waitFor(isDesired, 1400, 40);
      if (changed) {
        await sleep(90);
        return true;
      }
    }

    return false;
  }

  function closeOpenMenu() {
    const sourcePicker = document.querySelector(SELECTORS.sourcePicker);
    const safeTarget = sourcePicker || document.body;
    try {
      safeTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      safeTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      safeTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }

  async function moveSourceExclusively(source, targetLabel) {
    const sourceMenu = firstVisible([SELECTORS.sourceMenu], source);
    if (!sourceMenu) {
      toast('Could not find this source’s menu.', 'error');
      return false;
    }

    sourceMenu.click();
    const moveTo = await waitFor(() => {
      const direct = [...document.querySelectorAll(SELECTORS.moveTo)].find(visible);
      return direct || menuItemByText('Move to');
    });

    if (!moveTo) {
      closeOpenMenu();
      toast('Gemini Notebook did not expose “Move to” for this source.', 'error');
      return false;
    }

    // Some Material menu versions open a submenu on hover while others open on
    // click. Fire both paths; the second event is harmless when already open.
    try {
      moveTo.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }));
      moveTo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window }));
    } catch (_) {}
    moveTo.click();

    const ready = await waitFor(() => {
      const items = currentMoveItems();
      return itemForLabel(items, targetLabel) ? items : null;
    }, 6000, 60);

    if (!ready) {
      const found = currentMoveItems().map(entry => entry.name).filter(Boolean).slice(0, 5);
      console.warn('[Gemini Notebook Label UX] Move-to label match failed', { targetLabel, found });
      toast(found.length
        ? `Move to opened, but “${targetLabel}” was not matched. Found: ${found.join(', ')}`
        : `Move to opened, but no label checkboxes were detected.`, 'error');
      // Leave the native Move to menu open so the user can still finish the
      // action manually and so a screenshot clearly shows the DOM variant.
      return false;
    }

    // Dropping means MOVE. Check the destination FIRST. If the source row is
    // currently rendered inside a label panel, unchecking that original label
    // can remove the row and destroy its anchored Material menu. Keeping the
    // destination membership established first prevents a transient unlabeled
    // state, and clearing the original label last gives Angular the best chance
    // to keep the submenu alive until the operation is complete.
    let target = itemForLabel(currentMoveItems(), targetLabel);
    if (!target) {
      toast(`Destination label “${targetLabel}” disappeared from Move to.`, 'error');
      return false;
    }

    if (!checkedState(target)) {
      const changed = await clickMoveEntry(target, true);
      if (!changed) {
        console.warn('[Gemini Notebook Label UX] Could not check destination label', targetLabel);
        toast(`Move to opened, but Gemini Notebook would not select “${targetLabel}”.`, 'error');
        return false;
      }
    }

    const originPanel = source.closest('mat-expansion-panel');
    const originLabel = originPanel ? labelNameForHeader(originPanel.querySelector(SELECTORS.labelHeader)) : '';

    // Remove extra memberships other than the panel the dragged row currently
    // lives in. Removing the origin is deliberately deferred until last.
    for (let guard = 0; guard < 50; guard++) {
      const items = currentMoveItems();
      const refreshedTarget = itemForLabel(items, targetLabel);
      if (!refreshedTarget) break;

      const extra = items.find(entry =>
        entry !== refreshedTarget &&
        checkedState(entry) &&
        (!originLabel || comparableLabel(entry.name) !== comparableLabel(originLabel))
      );
      if (!extra) break;

      const changed = await clickMoveEntry(extra, false);
      if (!changed) {
        console.warn('[Gemini Notebook Label UX] Could not uncheck extra source label', extra.name);
        toast(`Could not remove the old label “${extra.name}”.`, 'error');
        return false;
      }
    }

    // Finally remove the origin label, but only when it differs from the drop
    // target. This click may cause Notebook to rerender/close the menu, which
    // is fine because all required membership changes have already happened.
    if (originLabel && comparableLabel(originLabel) !== comparableLabel(targetLabel)) {
      const originEntry = itemForLabel(currentMoveItems(), originLabel);
      if (originEntry && checkedState(originEntry)) {
        const changed = await clickMoveEntry(originEntry, false);
        if (!changed) {
          // The row can disappear immediately after Angular accepts the click,
          // taking the overlay with it. Treat a vanished menu as success here.
          const overlayGone = currentMoveItems().length === 0;
          if (!overlayGone) {
            console.warn('[Gemini Notebook Label UX] Could not uncheck origin source label', originLabel);
            toast(`Could not remove the original label “${originLabel}”.`, 'error');
            return false;
          }
        }
      }
    }

    // Final verification when the menu remains open. If Angular closed the
    // overlay after removing the origin row, the accepted state changes above
    // are the authoritative signal and we can finish successfully.
    const finalItems = currentMoveItems();
    if (finalItems.length) {
      const finalTarget = itemForLabel(finalItems, targetLabel);
      const stray = finalItems.find(entry => entry !== finalTarget && checkedState(entry));
      if (!finalTarget || !checkedState(finalTarget) || stray) {
        console.warn('[Gemini Notebook Label UX] Move verification failed', {
          targetLabel,
          labels: finalItems.map(entry => ({ name: entry.name, checked: checkedState(entry) }))
        });
        toast('The Move to menu changed, so I did not close it. Please finish this move manually.', 'error');
        return false;
      }
    }

    closeOpenMenu();
    await sleep(180);
    toast(`Moved source to “${targetLabel}”.`, 'success');
    return true;
  }

  function createDragGhost(source) {
    const ghost = document.createElement('div');
    ghost.className = `${EXT}-drag-ghost`;
    ghost.innerHTML = `<span aria-hidden="true">📄</span><span>${escapeHtml(sourceDisplayName(source))}</span>`;
    document.body.appendChild(ghost);
    return ghost;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function positionDragGhost(x, y) {
    if (!state.dragGhost) return;
    state.dragGhost.style.left = `${x + 14}px`;
    state.dragGhost.style.top = `${y + 14}px`;
  }

  function labelHeaderAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest?.(SELECTORS.labelHeader) || null;
  }

  function updateDragTarget(x, y) {
    const header = labelHeaderAtPoint(x, y);
    if (header === state.dragTarget) return header;
    clearDragStyles();
    if (header) {
      state.dragTarget = header;
      header.classList.add(`${EXT}-drag-over`);
    }
    return header;
  }

  function beginPointerDrag(source, event) {
    state.pointerDragging = true;
    state.pointerSource = source;
    source.classList.add(`${EXT}-dragging`);
    document.documentElement.classList.add(`${EXT}-drag-active`);
    state.dragGhost = createDragGhost(source);
    positionDragGhost(event.clientX, event.clientY);
    updateDragTarget(event.clientX, event.clientY);
  }

  function resetPointerDrag() {
    state.pointerSource?.classList.remove(`${EXT}-dragging`);
    state.dragGhost?.remove();
    document.documentElement.classList.remove(`${EXT}-drag-active`);
    clearDragStyles();
    state.pointerId = null;
    state.pointerSource = null;
    state.pointerOrigin = null;
    state.pointerDragging = false;
    state.dragGhost = null;
  }

  function startPointerCandidate(source, event) {
    if (event.button !== 0 || state.pointerId !== null) return;
    state.pointerId = event.pointerId;
    state.pointerSource = source;
    state.pointerOrigin = { x: event.clientX, y: event.clientY };
    state.pointerDragging = false;

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Pointer capture is optional; document listeners still handle the drag.
    }
  }

  function installEventHandlers() {
    document.addEventListener('pointerdown', event => {
      const more = event.target.closest?.(SELECTORS.labelMore);
      if (more) {
        state.lastLabelMenuPoint = { x: event.clientX, y: event.clientY };
        setTimeout(repositionLabelMenu, 0);
        setTimeout(repositionLabelMenu, 80);
        return;
      }

      const handle = event.target.closest?.(`.${EXT}-drag-handle`);
      if (handle) {
        const source = handle.closest(SELECTORS.sourceCard);
        if (source) {
          event.preventDefault();
          event.stopPropagation();
          startPointerCandidate(source, event);
        }
        return;
      }

      // Also allow dragging from blank/non-interactive parts of the source row.
      const source = event.target.closest?.(SELECTORS.sourceCard);
      if (!source) return;
      const interactive = event.target.closest?.('button, input, textarea, a, [role="button"], [role="checkbox"], mat-checkbox');
      if (interactive) return;
      startPointerCandidate(source, event);
    }, true);

    document.addEventListener('pointermove', event => {
      if (state.pointerId === null || event.pointerId !== state.pointerId || !state.pointerSource) return;

      if (!state.pointerDragging) {
        const dx = event.clientX - state.pointerOrigin.x;
        const dy = event.clientY - state.pointerOrigin.y;
        if (Math.hypot(dx, dy) < 6) return;
        beginPointerDrag(state.pointerSource, event);
      }

      event.preventDefault();
      positionDragGhost(event.clientX, event.clientY);
      updateDragTarget(event.clientX, event.clientY);
    }, true);

    document.addEventListener('pointerup', event => {
      if (state.pointerId === null || event.pointerId !== state.pointerId) return;

      const source = state.pointerSource;
      const wasDragging = state.pointerDragging;
      const header = wasDragging ? labelHeaderAtPoint(event.clientX, event.clientY) || state.dragTarget : null;
      const targetLabel = header ? labelNameForHeader(header) : '';

      if (wasDragging) {
        event.preventDefault();
        event.stopPropagation();
        state.suppressClicksUntil = performance.now() + 400;
      }

      resetPointerDrag();

      if (!wasDragging) return;
      if (!header || !targetLabel) {
        toast('Drop the source directly on a label name/header.', 'info');
        return;
      }

      moveSourceExclusively(source, targetLabel).catch(error => {
        console.error('[Gemini Notebook Label UX] pointer drag/drop move failed', error);
        toast('Could not move the source.', 'error');
      });
    }, true);

    document.addEventListener('pointercancel', event => {
      if (state.pointerId !== null && event.pointerId === state.pointerId) resetPointerDrag();
    }, true);

    // Suppress the click generated after a completed drag so Notebook does not
    // open the source or toggle a label after we drop it.
    document.addEventListener('click', event => {
      if (event.isTrusted && performance.now() < state.suppressClicksUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    // Prevent native browser dragging from competing with the pointer drag.
    document.addEventListener('dragstart', event => {
      if (event.target.closest?.(SELECTORS.sourceCard)) event.preventDefault();
    }, true);
  }

  function refresh() {
    injectAddLabelButton();
    decorateSourcesAndLabels();
    repositionLabelMenu();
  }

  installEventHandlers();
  refresh();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  console.info(`[Gemini Notebook Label UX] v${VERSION} loaded`);
})();
