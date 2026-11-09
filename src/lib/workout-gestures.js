// A gesture commits to one axis; long press only opens the same explicit group menu.
export function bindFocusGestures(root, { step, openGroup }) {
  let gesture = null;
  let timer = null;
  let suppressClick = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  const cancel = () => { clear(); gesture = null; };
  const start = event => {
    cancel();
    suppressClick = false;
    if (event.touches.length !== 1 || event.target.closest('dialog')) return;
    const group = event.target.closest('[data-focus-group-menu]');
    if (!group && event.target.closest('input, textarea, select, button, a')) return;
    const { clientX: x, clientY: y } = event.touches[0];
    gesture = { x, y, dx: 0, axis: null, held: false };
    if (group) timer = setTimeout(() => {
      if (!gesture) return;
      gesture.held = true;
      suppressClick = true;
      openGroup();
    }, 550);
  };
  const move = event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { cancel(); return; }
    const dx = event.touches[0].clientX - gesture.x;
    const dy = event.touches[0].clientY - gesture.y;
    gesture.dx = dx;
    if (Math.hypot(dx, dy) > 8) {
      clear();
      suppressClick = true;
      if (!gesture.axis) gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    }
    if ((gesture.axis === 'x' || gesture.held) && event.cancelable) event.preventDefault();
  };
  const end = () => {
    const last = gesture;
    cancel();
    if (last && !last.held && last.axis === 'x' && Math.abs(last.dx) >= 56) step(last.dx < 0 ? 1 : -1);
  };
  const click = event => {
    if (!suppressClick || !event.isTrusted || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const context = event => {
    if (event.target.closest('[data-focus-group-menu]')) event.preventDefault();
  };
  root.addEventListener('touchstart', start, { passive: true });
  root.addEventListener('touchmove', move, { passive: false });
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', cancel);
  root.addEventListener('click', click, true);
  root.addEventListener('contextmenu', context);
  window.addEventListener('scroll', cancel, true);
  return () => {
    cancel();
    root.removeEventListener('touchstart', start);
    root.removeEventListener('touchmove', move);
    root.removeEventListener('touchend', end);
    root.removeEventListener('touchcancel', cancel);
    root.removeEventListener('click', click, true);
    root.removeEventListener('contextmenu', context);
    window.removeEventListener('scroll', cancel, true);
  };
}
