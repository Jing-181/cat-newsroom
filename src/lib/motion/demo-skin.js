// Renderer accepts scene geometry only; replace it without changing contact/trajectory rules.
const NS = 'http://www.w3.org/2000/svg';
export function createDemoSkin(svg) {
  const node = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const root = node('g', { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const fixtures = node('path', { 'stroke-width': 2, opacity: .5 });
  const body = node('path', { 'stroke-width': 4 });
  const head = node('circle', { r: 8, 'stroke-width': 3 });
  const equipment = node('g', { 'stroke-width': 2 });
  equipment.append(node('path', { d: 'M -12 0 H 12 M -8 -8 V 8 M 8 -8 V 8' }));
  root.append(fixtures, body, head, equipment);
  svg.append(root);
  const path = segments => segments.map(points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')).join(' ');
  return {
    resize: box => svg.setAttribute('viewBox', box),
    paint(scene) {
      fixtures.setAttribute('d', path(scene.fixtures));
      body.setAttribute('d', path(scene.body));
      head.setAttribute('cx', scene.head.x); head.setAttribute('cy', scene.head.y);
      const { center, angle, type } = scene.equipment;
      equipment.setAttribute('transform', `translate(${center.x} ${center.y}) rotate(${angle})`);
      equipment.setAttribute('visibility', type === 'fixed-bar' ? 'hidden' : 'visible');
    },
    destroy() { root.remove(); },
  };
}
export function createPlaceholder(svg) {
  const text = document.createElementNS(NS, 'text');
  svg.setAttribute('viewBox', '0 0 180 100');
  text.setAttribute('x', '90'); text.setAttribute('y', '54');
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', 'currentColor');
  text.setAttribute('font-size', '14'); text.textContent = '暂无动作示范';
  svg.append(text);
  let destroyed = false;
  return () => { if (!destroyed) { destroyed = true; text.remove(); } };
}
