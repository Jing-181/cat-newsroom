// Pointer Events cover mouse, pen and touch; only the handle reserves touch gestures.
export function createTaskGroupDrag({ host, getTargets, onChange, onDrop }) {
  let active = null;
  function cancel() {
    const previous = active;
    active = null;
    if (previous?.handle.hasPointerCapture?.(previous.id)) previous.handle.releasePointerCapture(previous.id);
    onChange(null);
  }
  function move(event) {
    if (!active || event.pointerId !== active.id) return;
    if (!active.dragging && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
    active.dragging = true;
    const targets = getTargets();
    const hit = targets.find(target => event.clientX >= target.rect.left && event.clientX <= target.rect.right && event.clientY >= target.rect.top && event.clientY <= target.rect.bottom);
    active.target = hit?.name ?? null;
    event.preventDefault();
    onChange({ name: active.name, target: active.target });
  }
  function up(event) {
    if (!active || event.pointerId !== active.id) return;
    const { name, target, dragging } = active;
    cancel();
    if (dragging && target !== null && target !== name) onDrop(name, target);
  }
  function pointerCancel(event) { if (active && event.pointerId === active.id) cancel(); }
  function key(event) { if (active && event.key === 'Escape') { event.preventDefault(); cancel(); } }
  const listeners = [['pointermove', move], ['pointerup', up], ['pointercancel', pointerCancel], ['keydown', key], ['blur', cancel], ['scroll', cancel]];
  listeners.forEach(([type, fn]) => host.addEventListener(type, fn, { capture: true, passive: false }));
  return {
    start(event, name) {
      if (active || event.isPrimary === false || event.button !== 0) return;
      active = { id: event.pointerId, name, target: null, x: event.clientX, y: event.clientY, handle: event.currentTarget, dragging: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    cancel,
    destroy() { cancel(); listeners.forEach(([type, fn]) => host.removeEventListener(type, fn, true)); },
  };
}
