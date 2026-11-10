// Shared modal ownership: only the last release restores the page.
const locks = new Set();
let restorePage;

function preserve(style, names) {
  const saved = names.map(name => [name, style.getPropertyValue(name), style.getPropertyPriority(name)]);
  return () => saved.forEach(([name, value, priority]) => {
    if (value) style.setProperty(name, value, priority);
    else style.removeProperty(name);
  });
}

export function focusWithoutScroll(element) {
  if (element?.isConnected) element.focus?.({ preventScroll: true });
}

export function lockPageScroll() {
  const token = {};
  if (!locks.size) {
    const root = document.documentElement;
    const body = document.body;
    const x = window.scrollX, y = window.scrollY;
    const restoreBody = preserve(body.style, ['position', 'top', 'left', 'width', 'overflow']);
    const restoreRoot = preserve(root.style, ['overflow', 'scroll-behavior']);
    body.style.setProperty('position', 'fixed');
    body.style.setProperty('top', `${-y}px`);
    body.style.setProperty('left', `${-x}px`);
    body.style.setProperty('width', '100%');
    body.style.setProperty('overflow', 'hidden');
    root.style.setProperty('overflow', 'hidden');
    restorePage = () => {
      restoreBody();
      root.style.setProperty('scroll-behavior', 'auto', 'important');
      window.scrollTo(x, y);
      restoreRoot();
    };
  }
  locks.add(token);
  return () => {
    if (!locks.delete(token)) return;
    if (!locks.size) { restorePage?.(); restorePage = null; }
  };
}

// Runtime geometry only; no zoom restrictions and no blur/scroll-to-top handlers.
export function initMobileViewport() {
  const root = document.documentElement;
  const touch = window.matchMedia('(any-pointer: coarse)');
  const viewport = window.visualViewport;
  const names = ['--mobile-viewport-height', '--mobile-viewport-top'];
  const restore = preserve(root.style, names);
  let frame = 0;
  function update() {
    frame = 0;
    if (!touch.matches) { restore(); return; }
    // Pinch zoom keeps the last layout geometry; don't fight the user's zoom.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    root.style.setProperty(names[0], `${viewport?.height ?? window.innerHeight}px`);
    root.style.setProperty(names[1], `${viewport?.offsetTop ?? 0}px`);
  }
  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  touch.addEventListener('change', schedule);
  update();
  return () => {
    window.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    touch.removeEventListener('change', schedule);
    restore();
  };
}
