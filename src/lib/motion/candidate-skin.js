import { clipPolylineBehindHead } from './projected-lines.js';
import { project, add, v } from './candidate-clips.js';
const NS = 'http://www.w3.org/2000/svg';
const path = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ');
// Flat stick figure: one open stroke per limb, no outlined volumes, fills or shoe polygons.
export function createCandidateSkin(svg) {
  const make = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, value]) => el.setAttribute(k, value));
    return el;
  };
  const root = make('g', { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const strokes = {};
  for (const name of ['bench', 'farLeg', 'farArm', 'torso', 'shoulders', 'nearLeg', 'nearArm', 'neck', 'leftFoot', 'rightFoot', 'bar', 'plates']) {
    const el = make('path', { 'data-part': name, 'stroke-width': ['bar', 'plates', 'bench'].includes(name) ? 1.9 : 3.8 });
    if (name === 'bench') el.setAttribute('opacity', '.45');
    if (name.startsWith('far')) el.setAttribute('opacity', '.55');
    strokes[name] = el; root.append(el);
  }
  const head = make('circle', { 'data-part': 'head', 'stroke-width': 3.2 });
  root.append(head); svg.append(root);
  return {
    resize: box => svg.setAttribute('viewBox', box),
    paint(scene) {
      // Opposite three-quarter view puts the overlapping press arm behind the head;
      // preserve world joints/grips and clip only genuinely rear projected spans.
      const camera = scene.id === 'strictPress' ? { ...scene.camera, yaw: -.6 } : scene.id === 'birdDog' ? { ...scene.camera, yaw: -.45, elevation: .6 } : ['pulldownSingle','arnold'].includes(scene.id) ? { ...scene.camera, yaw: -.8, elevation: .2 } : scene.id === 'invertedRow' ? { ...scene.camera, yaw: -.45 } : ['inclineFly','smithBench','singleDumbbellBench','closeBench'].includes(scene.id) ? { ...scene.camera, yaw: -.35, elevation: .4 } : ['singleRdl','thrust'].includes(scene.id) ? {...scene.camera,yaw:-.3,elevation:.3} : scene.id === 'overhead' ? {...scene.camera,yaw:1.2,elevation:.3} : scene.id === 'badminton' ? {...scene.camera,yaw:-.8,elevation:-.2} : scene.id === 'cableCrunch' ? {...scene.camera,yaw:-.5,elevation:.65} : scene.id === 'twist' ? {...scene.camera,yaw:.8,elevation:.45} : scene.id === 'hangingRaise' ? {...scene.camera,yaw:-.8,elevation:.2} : ['treadmill','inclineWalk'].includes(scene.id) ? {...scene.camera,yaw:-.85,elevation:.35} : scene.id === 'run' ? {...scene.camera,yaw:-.65,elevation:.35,offsetX:100-scene.mechanism.travel*Math.cos(-.65),offsetY:146-scene.mechanism.travel*Math.sin(-.65)*Math.sin(.35)} : scene.id === 'trail' ? {...scene.camera,yaw:-.75,elevation:.35,offsetX:100-scene.mechanism.travel*Math.cos(-.75),offsetY:146-scene.mechanism.travel*Math.sin(-.75)*Math.sin(.35)+scene.mechanism.slope*scene.mechanism.travel*Math.cos(.35)} : scene.camera;
      const p = point => project(point, camera);
      strokes.plates.setAttribute('opacity',scene.id==='bike'?.65:1);
      const projectedPath = points => ['strictPress','birdDog','pulldownSingle','arnold','invertedRow','inclineFly','smithBench','singleDumbbellBench','badminton','cableCrunch','twist','hangingRaise','treadmill','inclineWalk','closeBench','overhead'].includes(scene.id)
        ? clipPolylineBehindHead(points.map(p), p(scene.head), scene.size.headRadius + 2).map(path).join(' ')
        : path(points.map(p));
      const draw = (name, points) => strokes[name].setAttribute('d', projectedPath(points));
      const mean = (a, b) => v((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      // Explicit per-scene emphasis, rather than hidden ID-specific fixture restyling.
      strokes.bench.setAttribute('stroke-width', scene.fixtureStyle?.width ?? 1.9);
      strokes.bench.setAttribute('opacity', scene.fixtureStyle?.opacity ?? .45);
      if (scene.bench) {
        const t = scene.bench.top;
        // A single bench surface and two legs, not a wireframe cuboid.
        strokes.bench.setAttribute('d', [projectedPath([mean(t[0], t[3]), mean(t[1], t[2])]),
          ...[-44, 8].map(x => projectedPath([v(x, 0, 26), v(x, 0, 0)]))].join(' '));
      } else {
        const fixtures = scene.id === 'birdDog'
          ? [...(scene.fixtures || []), [v(-55,-16,0),v(85,-16,0)], [v(-55,16,0),v(85,16,0)]]
          : scene.fixtures || [];
        strokes.bench.setAttribute('d', fixtures.map(projectedPath).join(' '));
      }
      scene.legs.forEach((leg, i) => {
        draw(i ? 'nearLeg' : 'farLeg', [leg.hip, leg.knee, leg.ankle]);
        const sole = scene.soles[i], foot = scene.feet?.[i];
        const heel = foot?.heel || mean(sole[0], sole[1]), toe = foot?.toe || mean(sole[2], sole[3]);
        const contact = foot ? mean(heel,toe) : v(leg.ankle.x,leg.ankle.y,0);
        strokes[i ? 'rightFoot' : 'leftFoot'].setAttribute('d', `${path([p(leg.ankle), p(contact)])} ${path([p(heel), p(toe)])}`);
      });
      draw('torso', scene.torsoChain || [scene.hip, scene.shoulderCenter]);
      draw('shoulders', scene.arms.map(arm => arm.shoulder));
      scene.arms.forEach((arm, i) => draw(i ? 'nearArm' : 'farArm', arm.wrist ? [arm.shoulder, arm.elbow, arm.wrist, arm.hand] : [arm.shoulder, arm.elbow, arm.hand]));
      if (scene.equipment.type === 'dualCable') {
        const e=scene.equipment;
        strokes.bar.setAttribute('d',e.cables.map(points=>path(points.map(p))).join(' '));
        strokes.plates.setAttribute('d',e.anchors.map(anchor=>{const c=p(anchor);return `M ${c.x-3} ${c.y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`;}).join(' '));
      } else if (scene.equipment.type === 'cableHandle') {
        const e=scene.equipment,c=p(e.pulley);
        strokes.bar.setAttribute('d',[e.cable,...e.handleLines].map(projectedPath).join(' '));
        strokes.plates.setAttribute('d',`M ${c.x-3} ${c.y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`);
      } else if (scene.equipment.type === 'machine') {
        strokes.bar.setAttribute('d', scene.equipment.lines.map(projectedPath).join(' '));
        strokes.plates.setAttribute('d', scene.equipment.rollers.map(roller=>{
          const c=p(roller.center),r=roller.radius;
          return `M ${c.x-r} ${c.y} a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 ${-r*2} 0`;
        }).join(' '));
      } else if (scene.equipment.type === 'rope') {
        const e = scene.equipment;
        strokes.bar.setAttribute('d', [e.cable, ...e.branches].map(projectedPath).join(' '));
        const c = p(e.pulley);
        strokes.plates.setAttribute('d', `M ${c.x - 3} ${c.y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`);
      } else {
        const weights = scene.equipment.weights || [scene.equipment];
        strokes.bar.setAttribute('d', weights.map(w => projectedPath(w.ends)).join(' '));
        strokes.plates.setAttribute('d', weights.flatMap(w => {
          const a = p(w.ends[0]), b = p(w.ends[1]);
          const d = Math.hypot(b.x - a.x, b.y - a.y), normal = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
          return w.plates.map(center => {
            const c = p(center), radius = scene.equipment.weights ? 3.5 : 6;
            return path([-radius, radius].map(r => ({ x: c.x + normal.x * r, y: c.y + normal.y * r })));
          });
        }).join(' '));
      }
      const h = p(scene.head), shoulder = p(scene.shoulderCenter);
      const neckDistance = Math.hypot(shoulder.x-h.x, shoulder.y-h.y);
      // Round cap meets the head outline, while the entire neck stroke stays out of its interior.
      const neckRadius = scene.size.headRadius + 3.8/2;
      const neckEnd = { x:h.x+(shoulder.x-h.x)*neckRadius/neckDistance, y:h.y+(shoulder.y-h.y)*neckRadius/neckDistance };
      strokes.neck.setAttribute('d', neckDistance > neckRadius ? path([shoulder,neckEnd]) : '');
      head.setAttribute('cx', h.x); head.setAttribute('cy', h.y); head.setAttribute('r', scene.size.headRadius);
    },
    destroy() { root.remove(); },
  };
}
