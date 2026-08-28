(() => {
  'use strict';

  const EXT = 'gnb-label-ux';
  const VERSION = '0.1.1';
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

  function checkedState(entry) {
    if (!entry) return false;
    if (entry.checkbox && typeof entry.checkbox.checked === 'boolean') return entry.checkbox.checked;
    const ariaHost = entry.item.closest('[aria-checked]') || entry.item.querySelector('[aria-checked]') || entry.item;
    return ariaHost.getAttribute?.('aria-checked') === 'true';
  }

  function currentMoveItems() {
    return menuItems()
      .map(item => ({
        item,
        checkbox: item.querySelector(SELECTORS.moveCheckbox),
        name: normalize(item.textContent)
      }))
      .filter(entry => entry.checkbox || entry.item.getAttribute('role') === 'menuitemcheckbox');
  }

  function itemForLabel(items, labelName) {
    const wanted = normalize(labelName).toLowerCase();
    return items.find(entry => entry.name.toLowerCase() === wanted) ||
      items.find(entry => entry.name.toLowerCase().endsWith(wanted)) ||
      items.find(entry => entry.name.toLowerCase().includes(wanted));
  }

  async function toggleMoveItem(entry) {
    if (!entry) return;
    const before = checkedState(entry);
    entry.item.click();
    await waitFor(() => {
      const items = currentMoveItems();
      const refreshed = items.find(x => normalize(x.name).toLowerCase() === normalize(entry.name).toLowerCase());
      return refreshed && checkedState(refreshed) !== before ? true : null;
    }, 1200, 40);
    await sleep(80);
  }

  function closeOpenMenu() {
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

    moveTo.click();
    const ready = await waitFor(() => {
      const items = currentMoveItems();
      return itemForLabel(items, targetLabel) ? items : null;
    }, 5000);

    if (!ready) {
      closeOpenMenu();
      toast(`Could not find the “${targetLabel}” label in Move to.`, 'error');
      return false;
    }

    // Dropping means MOVE: target checked, all other labels unchecked.
    let items = currentMoveItems();
    let target = itemForLabel(items, targetLabel);
    if (target && !checkedState(target)) {
      await toggleMoveItem(target);
    }

    for (let guard = 0; guard < 80; guard++) {
      items = currentMoveItems();
      const refreshedTarget = itemForLabel(items, targetLabel);
      const otherChecked = items.find(entry => entry !== refreshedTarget && checkedState(entry));
      if (!otherChecked) break;
      await toggleMoveItem(otherChecked);
    }

    closeOpenMenu();
    await sleep(120);
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
