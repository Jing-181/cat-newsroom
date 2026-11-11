// Q-proportion demonstrations, integrated with visual review pending. X = head-to-foot (bench) / forward (squat), Y = left/right, Z = up.
// Proportions are chosen BEFORE IK and remain constant throughout a cycle.
export const v = (x, y, z) => ({ x, y, z });
export const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => v(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => mul(a, 1 / length(a));
export function bendJoint(a, b, upper, lower, hint) {
  const delta = sub(b, a), d = length(delta);
  if (d < 1e-6 || d >= upper + lower || d <= Math.abs(upper - lower)) throw new RangeError('Unreachable candidate limb');
  const axis = unit(delta);
  const direction = sub(hint, mul(axis, dot(hint, axis)));
  if (length(direction) < 1e-6) throw new RangeError('Degenerate bend hint');
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const radius = Math.sqrt(upper * upper - along * along);
  return add(add(a, mul(axis, along)), mul(unit(direction), radius));
}
// Orthonormal camera basis: fixed orthographic 3/4 view, no post-projection body scaling.
export function project(p, { yaw = .64, elevation = .25, offsetY = 150, offsetX = 100 } = {}) {
  const depth = p.x * Math.sin(yaw) + p.y * Math.cos(yaw);
  return { x: offsetX + p.x * Math.cos(yaw) - p.y * Math.sin(yaw),
    y: offsetY + depth * Math.sin(elevation) - p.z * Math.cos(elevation),
    depth: depth * Math.cos(elevation) + p.z * Math.sin(elevation) };
}
export const CANDIDATE_PROPORTIONS = Object.freeze({
  squat: Object.freeze({ thigh: 31, shin: 29, upperArm: 15, forearm: 15, torso: 26, headRadius: 10, footLength: 17, footWidth: 9 }),
  benchPress: Object.freeze({ thigh: 20, shin: 20, upperArm: 25, forearm: 23, torso: 32, headRadius: 10, footLength: 11, footWidth: 7 }),
});
const phase = time => (1 - Math.cos(2 * Math.PI * time / 4)) / 2;
function bar(center, halfGrip = 24) {
  return { center, axis: v(0, 1, 0), ends: [-42, 42].map(y => add(center, v(0, y, 0))),
    grips: [-halfGrip, halfGrip].map(y => add(center, v(0, y, 0))),
    plates: [-36, 36].map(y => add(center, v(0, y, 0))) };
}
function leg(hip, ankle, proportions, side) {
  return { hip, knee: bendJoint(hip, ankle, proportions.thigh, proportions.shin, v(1, side * .12, .1)), ankle };
}
function foot(ankle, size, side) {
  // Sole is an explicit ground polygon; ankle sits above it, not on a floating stroke.
  return [0, 1].flatMap(index => {
    const x = index ? size.footLength * .75 : -size.footLength * .25;
    const ys = index ? [1, -1] : [-1, 1];
    return ys.map(y => v(ankle.x + x, ankle.y + y * size.footWidth / 2 + x * side * .12, 0));
  });
}
function squat(q) {
  const size = CANDIDATE_PROPORTIONS.squat;
  const hip = v(-15 * q, 0, 60 - 25 * q);
  const shoulderCenter = v(5, 0, hip.z + Math.sqrt(size.torso ** 2 - (5 - hip.x) ** 2));
  const torsoUp = unit(sub(shoulderCenter, hip));
  // Upper-back surface offset is defined in body coordinates, not glued to the wrist.
  const back = v(-torsoUp.z, 0, torsoUp.x);
  const backAnchor = add(shoulderCenter, mul(back, 8.5));
  const equipment = bar(backAnchor, 23);
  const arms = [-1, 1].map((side, i) => {
    const shoulder = add(shoulderCenter, v(0, side * 9, 0)), hand = equipment.grips[i];
    return { shoulder, elbow: bendJoint(shoulder, hand, size.upperArm, size.forearm, add(mul(back, 1), v(0, side * .25, -1))), hand };
  });
  const legs = [-1, 1].map(side => leg(add(hip, v(0, side * 8, 0)), v(0, side * 15, 5), size, side));
  const soles = legs.map((l, i) => foot(l.ankle, size, i ? 1 : -1));
  const head = add(shoulderCenter, mul(torsoUp, 15));
  return { id: 'squat', size, hip, shoulderCenter, head, arms, legs, soles, equipment, backAnchor,
    supports: { ankles: legs.map(l => l.ankle), soles }, bench: null };
}
function benchPress(q) {
  const size = CANDIDATE_PROPORTIONS.benchPress;
  const shoulderCenter = v(-24, 0, 34), hip = v(8, 0, 34);
  const equipment = bar(v(-19 + 8 * q, 0, 77 - 33 * q));
  const arms = [-1, 1].map((side, i) => {
    const shoulder = add(shoulderCenter, v(0, side * 12, 0)), hand = equipment.grips[i];
    // Body-relative outward + footward hints; lowering also directs the elbow below the wrist.
    const hint = v(.75, side, -.9 * q);
    return { shoulder, elbow: bendJoint(shoulder, hand, size.upperArm, size.forearm, hint), hand, hint };
  });
  const legs = [-1, 1].map(side => leg(add(hip, v(0, side * 7, 0)), v(30, side * 16, 4), size, side));
  const soles = legs.map((l, i) => foot(l.ankle, size, i ? 1 : -1));
  const head = v(-42, 0, 36);
  const bench = { top: [v(-53, -11, 26), v(14, -11, 26), v(14, 11, 26), v(-53, 11, 26)],
    legs: [-44, 8].flatMap(x => [-8, 8].map(y => [v(x, y, 26), v(x, y, 0)])) };
  return { id: 'benchPress', camera: { yaw: .48, elevation: .62, offsetY: 136 }, size, hip, shoulderCenter, head, arms, legs, soles, equipment, bench,
    supports: { ankles: legs.map(l => l.ankle), soles, head: v(-42, 0, 26), back: v(-24, 0, 26), pelvis: v(8, 0, 26) } };
}
const make = (id, label, solve) => Object.freeze({ id, label, duration: 4, stillAt: 2, loop: true,
  viewBox: '20 20 160 155', sample: time => solve(phase(time)) });
export const CANDIDATE_CLIPS = Object.freeze({
  squat: make('squat', '深蹲 · 下肢强调候选', squat),
  benchPress: make('benchPress', '卧推 · 上肢强调候选', benchPress),
});
