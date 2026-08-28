(() => {
  'use strict';

  const EXT = 'gnb-label-ux';
  const SELECTORS = {
    sourcePicker: 'source-picker',
    sourceCard: '.single-source-container',
    sourceMenu: 'button.source-item-more-button[aria-label="More"], button[aria-label*="More options"]',
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
    menuItem: '[role="menuitem"]',
    moveCheckbox: 'input.mdc-checkbox__native-control'
  };

  const state = {
    lastLabelMenuPoint: null,
    draggedSource: null,
    dragTarget: null,
    injecting: false
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
    return labels.some(t => t === 'rename' || t.includes('rename')) &&
      labels.some(t => t === 'remove' || t.includes('remove')) &&
      labels.some(t => t.includes('emoji'));
  }

  function repositionLabelMenu() {
    const point = state.lastLabelMenuPoint;
    if (!point) return;

    const panes = [...document.querySelectorAll(SELECTORS.overlayPane)].filter(isLabelActionsPane);
    for (const pane of panes) {
      // Angular Material's overlay positioning can occasionally resolve against the
      // wrong origin. Pin this specific label-actions menu to the pointer instead.
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
    return normalize(panel?.querySelector(SELECTORS.labelName)?.textContent);
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

  function decorateSourcesAndLabels() {
    for (const source of document.querySelectorAll(SELECTORS.sourceCard)) {
      if (source.dataset.gnbDraggable === '1') continue;
      source.dataset.gnbDraggable = '1';
      source.draggable = true;
      source.classList.add(`${EXT}-source`);
      source.title = source.title || 'Drag this source onto a label to move it';
    }

    for (const header of document.querySelectorAll(SELECTORS.labelHeader)) {
      if (header.dataset.gnbDroppable === '1') continue;
      header.dataset.gnbDroppable = '1';
      header.classList.add(`${EXT}-label-drop`);
    }
  }

  function clearDragStyles() {
    document.querySelectorAll(`.${EXT}-drag-over`).forEach(el => el.classList.remove(`${EXT}-drag-over`));
    state.dragTarget = null;
  }

  function checkedState(item) {
    const checkbox = item.querySelector(SELECTORS.moveCheckbox);
    return checkbox?.checked === true;
  }

  function currentMoveItems() {
    return menuItems()
      .filter(item => item.querySelector(SELECTORS.moveCheckbox))
      .map(item => ({
        item,
        checkbox: item.querySelector(SELECTORS.moveCheckbox),
        name: normalize(item.textContent)
      }));
  }

  function itemForLabel(items, labelName) {
    const wanted = normalize(labelName).toLowerCase();
    return items.find(entry => entry.name.toLowerCase() === wanted) ||
      items.find(entry => entry.name.toLowerCase().endsWith(wanted)) ||
      items.find(entry => entry.name.toLowerCase().includes(wanted));
  }

  async function toggleMoveItem(entry) {
    if (!entry) return;
    const control = entry.checkbox || entry.item;
    control.click();
    await sleep(140);
  }

  async function moveSourceExclusively(source, targetLabel) {
    const sourceMenu = firstVisible([SELECTORS.sourceMenu], source);
    if (!sourceMenu) {
      toast('Could not find this source’s menu.', 'error');
      return;
    }

    sourceMenu.click();
    const moveTo = await waitFor(() => {
      const direct = [...document.querySelectorAll(SELECTORS.moveTo)].find(visible);
      return direct || menuItemByText('Move to');
    });

    if (!moveTo) {
      toast('Gemini Notebook did not expose “Move to” for this source.', 'error');
      return;
    }

    moveTo.click();
    const ready = await waitFor(() => {
      const items = currentMoveItems();
      return itemForLabel(items, targetLabel) ? items : null;
    }, 5000);

    if (!ready) {
      toast(`Could not find the “${targetLabel}” label in Move to.`, 'error');
      return;
    }

    // 1) Ensure the drop target is selected.
    let items = currentMoveItems();
    let target = itemForLabel(items, targetLabel);
    if (target && !checkedState(target.item)) {
      await toggleMoveItem(target);
    }

    // 2) Drag/drop means MOVE, so remove every other checked label.
    // Re-query after every toggle because Angular may refresh menu nodes.
    for (let guard = 0; guard < 80; guard++) {
      items = currentMoveItems();
      const otherChecked = items.find(entry => {
        const isTarget = entry === itemForLabel(items, targetLabel);
        return !isTarget && checkedState(entry.item);
      });
      if (!otherChecked) break;
      await toggleMoveItem(otherChecked);
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    toast(`Moved source to “${targetLabel}”.`, 'success');
  }

  function installEventHandlers() {
    document.addEventListener('pointerdown', event => {
      const more = event.target.closest?.(SELECTORS.labelMore);
      if (!more) return;
      state.lastLabelMenuPoint = { x: event.clientX, y: event.clientY };
      setTimeout(repositionLabelMenu, 0);
      setTimeout(repositionLabelMenu, 80);
    }, true);

    document.addEventListener('dragstart', event => {
      const interactive = event.target.closest?.('button, input, textarea, a, [role="button"], [role="checkbox"]');
      if (interactive && interactive !== event.target.closest(SELECTORS.sourceCard)) return;

      const source = event.target.closest?.(SELECTORS.sourceCard);
      if (!source) return;

      state.draggedSource = source;
      source.classList.add(`${EXT}-dragging`);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'gemini-notebook-source');
    }, true);

    document.addEventListener('dragover', event => {
      if (!state.draggedSource) return;
      const header = event.target.closest?.(SELECTORS.labelHeader);
      if (!header) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (state.dragTarget !== header) {
        clearDragStyles();
        state.dragTarget = header;
        header.classList.add(`${EXT}-drag-over`);
      }
    }, true);

    document.addEventListener('dragleave', event => {
      const header = event.target.closest?.(SELECTORS.labelHeader);
      if (header && state.dragTarget === header && !header.contains(event.relatedTarget)) {
        clearDragStyles();
      }
    }, true);

    document.addEventListener('drop', event => {
      if (!state.draggedSource) return;
      const header = event.target.closest?.(SELECTORS.labelHeader);
      if (!header) return;

      event.preventDefault();
      event.stopPropagation();

      const source = state.draggedSource;
      const targetLabel = labelNameForHeader(header);
      clearDragStyles();
      source.classList.remove(`${EXT}-dragging`);
      state.draggedSource = null;

      if (!targetLabel) {
        toast('Could not determine the target label name.', 'error');
        return;
      }

      moveSourceExclusively(source, targetLabel).catch(error => {
        console.error('[Gemini Notebook Label UX] drag/drop move failed', error);
        toast('Could not move the source.', 'error');
      });
    }, true);

    document.addEventListener('dragend', () => {
      state.draggedSource?.classList.remove(`${EXT}-dragging`);
      state.draggedSource = null;
      clearDragStyles();
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
  console.info('[Gemini Notebook Label UX] v0.1.0 loaded');
})();
