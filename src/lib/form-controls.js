// Shared option surface for Vue and string templates; native elements keep values/events.
export function matchingOptions(options, query = '') {
  const text = query.trim().toLocaleLowerCase();
  return options.filter(option => !option.disabled && (!text || option.label.toLocaleLowerCase().includes(text)));
}
let installed = false;
export function ensureFormControls() {
  if (!installed) { installFormControls(); installed = true; }
}
export function installFormControls(root = document) {
  let active = null, popup = null, items = [], index = -1, serial = 0;
  const removalObserver = new MutationObserver(() => { if (active && !active.isConnected) close(); });
  const controller = new AbortController();
  const on = (target, type, fn, capture = false) => target.addEventListener(type, fn, { signal: controller.signal, capture });
  const eligible = node => node?.matches?.('select:not([multiple]):not([size]), input[list], input[data-options-list]') && !node.disabled && !node.readOnly;
  function close() {
    if (active) { active.setAttribute('aria-expanded', 'false'); active.removeAttribute('aria-activedescendant'); active.removeAttribute('aria-controls'); }
    removalObserver.disconnect();
    popup?.remove(); popup = null; active = null; items = []; index = -1;
  }
  function position() {
    if (!popup || !active?.isConnected || !active.getClientRects().length) { close(); return; }
    const rect = active.getBoundingClientRect(), viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const below = top + height - rect.bottom - 8, above = rect.top - top - 8;
    const up = below < 160 && above > below;
    const available = Math.max(44, Math.min(240, up ? above : below));
    Object.assign(popup.style, { width: `${Math.min(rect.width, width - 16)}px`, maxHeight: `${available}px`, left: `${Math.max(left + 8, Math.min(rect.left, left + width - rect.width - 8))}px`, top: `${up ? Math.max(top + 8, rect.top - Math.min(popup.scrollHeight, available) - 4) : rect.bottom + 4}px` });
  }
  function highlight(next) {
    index = items.length && next !== -1 ? (next + items.length) % items.length : -1;
    popup?.querySelectorAll('[role=option]').forEach((node, i) => { node.setAttribute('aria-selected', String(i === index)); if (i === index) { active.setAttribute('aria-activedescendant', node.id); node.scrollIntoView({ block: 'nearest' }); } });
  }
  function choose(i) {
    const source = active, item = items[i];
    if (!source || !item) return;
    source.value = item.value;
    close();
    source.dispatchEvent(new Event('input', { bubbles: true }));
    source.dispatchEvent(new Event('change', { bubbles: true }));
    if (source.isConnected) source.focus({ preventScroll: true });
  }
  function open(source, filter = false) {
    close(); active = source;
    if (source.hasAttribute('list')) { source.dataset.optionsList = source.getAttribute('list'); source.removeAttribute('list'); }
    const select = source.tagName === 'SELECT';
    const options = select ? source.options : document.getElementById(source.dataset.optionsList)?.options || [];
    items = matchingOptions(Array.from(options, option => ({ value: option.value, label: option.label || option.textContent || option.value, disabled: option.disabled || option.parentElement?.disabled })), filter ? source.value : '');
    source.setAttribute('role', 'combobox'); source.setAttribute('aria-haspopup', 'listbox'); source.setAttribute('aria-expanded', 'true');
    if (!select) source.setAttribute('aria-autocomplete', 'list');
    popup = document.createElement('div'); popup.className = 'shared-options'; popup.id = `shared-options-${++serial}`; popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', source.labels?.[0]?.textContent || source.getAttribute('aria-label') || '选项');
    popup.setAttribute('popover', 'manual');
    source.setAttribute('aria-controls', popup.id);
    items.forEach((item, i) => { const option = document.createElement('div'); option.id = `${popup.id}-${i}`; option.setAttribute('role', 'option'); option.textContent = item.label; option.addEventListener('pointerdown', event => event.preventDefault()); option.addEventListener('click', () => choose(i)); popup.append(option); });
    if (!items.length) { const empty = document.createElement('p'); empty.textContent = '没有匹配项，可继续输入'; popup.append(empty); }
    (source.closest('dialog, .overlay') || document.body).append(popup);
    popup.showPopover?.(); position();
    removalObserver.observe(document.body, { childList: true, subtree: true });
    highlight(select ? Math.max(0, items.findIndex(item => item.value === source.value)) : -1);
  }
  on(root, 'pointerdown', event => {
    if (popup?.contains(event.target)) return;
    if (!eligible(event.target)) { close(); return; }
    if (event.target.tagName === 'SELECT') { event.preventDefault(); event.target.focus(); if (active === event.target) close(); else open(event.target); }
    else open(event.target);
  }, true);
  on(root, 'focusin', event => {
    if (active && event.target !== active && !popup?.contains(event.target)) close();
    if (eligible(event.target) && event.target.hasAttribute('list')) { event.target.dataset.optionsList = event.target.getAttribute('list'); event.target.removeAttribute('list'); }
  }, true);
  on(root, 'input', event => { if (eligible(event.target) && event.target.tagName === 'INPUT' && !event.isComposing) open(event.target, true); });
  on(root, 'keydown', event => {
    const source = event.target;
    if (!eligible(source) || event.isComposing) return;
    if (event.key === 'Escape' && active === source) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); const existing = active === source;
      if (!existing) open(source);
      highlight(existing ? (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : event.key === 'ArrowDown' ? 0 : items.length - 1);
    } else if (event.key === 'Enter' || (source.tagName === 'SELECT' && event.key === ' ')) {
      event.preventDefault(); if (active === source && index >= 0) choose(index); else open(source);
    } else if (source.tagName === 'SELECT' && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); if (active !== source) open(source);
      const found = items.findIndex(item => item.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())); if (found >= 0) highlight(found);
    }
  }, true);
  on(document, 'scroll', event => { if (!popup?.contains(event.target)) position(); }, true);
  on(window, 'resize', position);
  if (window.visualViewport) { on(window.visualViewport, 'resize', position); on(window.visualViewport, 'scroll', position); }
  on(document, 'toggle', event => { if (active && event.target.matches('details, dialog') && event.target.contains(active) && !event.target.open) close(); }, true);
  return () => { close(); controller.abort(); };
}
