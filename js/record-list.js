(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RecordList = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const timestamp = record => {
    const value = Date.parse(record.updated_at || record.created_at || "");
    return Number.isFinite(value) ? value : Number(record.id) || 0;
  };

  function sortNewest(records) {
    return [...(records || [])].sort((left, right) => {
      const leftOrder = Number(left.sort_order);
      const rightOrder = Number(right.sort_order);
      const leftManual = Number.isFinite(leftOrder);
      const rightManual = Number.isFinite(rightOrder);
      if (leftManual && rightManual && leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftManual !== rightManual) return leftManual ? -1 : 1;
      const newestFirst = timestamp(right) - timestamp(left);
      return newestFirst || String(right.id).localeCompare(String(left.id), undefined, { numeric: true });
    });
  }

  function placeNewAtTop(records, record) {
    const orders = (records || []).map(item => Number(item.sort_order)).filter(Number.isFinite);
    record.sort_order = orders.length ? Math.min(...orders) - 1 : 0;
    return record;
  }

  function reorder(records, movingId, targetId, after = false) {
    const items = sortNewest(records);
    const from = items.findIndex(item => String(item.id) === String(movingId));
    const target = items.findIndex(item => String(item.id) === String(targetId));
    if (from < 0 || target < 0 || from === target) return items;
    const [moving] = items.splice(from, 1);
    let index = items.findIndex(item => String(item.id) === String(targetId));
    items.splice(index + (after ? 1 : 0), 0, moving);
    items.forEach((item, position) => { item.sort_order = position; });
    return items;
  }

  function wireDrag(container, onReorder) {
    if (!container) return;
    container.__recordListAbort?.abort();
    const controller = new AbortController();
    container.__recordListAbort = controller;
    const listenerOptions = { signal: controller.signal };
    let movingId = null;
    let dropTarget = null;
    const clear = () => container.querySelectorAll(".rec.is-dragging, .rec.is-drop-target").forEach(item => item.classList.remove("is-dragging", "is-drop-target"));
    const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest(".rec[data-record-id]");
    const move = (target, y) => {
      if (!target || String(target.dataset.recordId) === String(movingId)) return;
      const rect = target.getBoundingClientRect();
      dropTarget = { id: target.dataset.recordId, after: y > rect.top + rect.height / 2 };
      container.querySelectorAll(".rec.is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
      target.classList.add("is-drop-target");
    };
    const finish = () => {
      if (movingId && dropTarget) onReorder(movingId, dropTarget.id, dropTarget.after);
      movingId = null; dropTarget = null; clear();
    };
    container.querySelectorAll(".drag-handle").forEach(handle => {
      const record = handle.closest(".rec[data-record-id]");
      handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        movingId = record.dataset.recordId;
        record.classList.add("is-dragging");
        handle.setPointerCapture?.(event.pointerId);
      }, listenerOptions);
      handle.addEventListener("pointermove", event => { if (movingId) move(targetAt(event.clientX, event.clientY), event.clientY); }, listenerOptions);
      handle.addEventListener("pointerup", finish, listenerOptions);
      handle.addEventListener("pointercancel", () => { movingId = null; dropTarget = null; clear(); }, listenerOptions);
      handle.addEventListener("dragstart", event => { movingId = record.dataset.recordId; event.dataTransfer.effectAllowed = "move"; record.classList.add("is-dragging"); }, listenerOptions);
    });
    container.addEventListener("dragover", event => { if (!movingId) return; event.preventDefault(); move(targetAt(event.clientX, event.clientY), event.clientY); }, listenerOptions);
    container.addEventListener("drop", event => { event.preventDefault(); finish(); }, listenerOptions);
    container.addEventListener("dragend", finish, listenerOptions);
  }

  return { sortNewest, placeNewAtTop, reorder, wireDrag };
});
