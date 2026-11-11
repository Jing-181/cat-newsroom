import { v, add, mul, sub, length, bendJoint } from './candidate-clips.js';
const size = Object.freeze({ upperArm: 25, forearm: 24, thigh: 22, shin: 22, headRadius: 9 });
const smooth = t => t * t * (3 - 2 * t);
// Controlled lift, short hold, slower return; zero velocity at phase joins.
function phase(t) { t = ((t % 5) + 5) % 5; return t < 1.6 ? smooth(t / 1.6) : t < 2 ? 1 : t < 4.7 ? 1 - smooth((t - 2) / 2.7) : 0; }
function weight(center, axis, half = 7) {
  return { center, axis, ends: [-half, half].map(n => add(center, mul(axis, n))), plates: [-half + 1, half - 1].map(n => add(center, mul(axis, n))) };
}
function sample(kind, q) {
  const hip = v(0, 0, 44), shoulderCenter = v(0, 0, 76), head = v(0, 0, 91);
  const down = kind === 'ropePushdown';
  const angle = (down ? 100 - 85 * q : 12 + 113 * q) * Math.PI / 180;
  const spread = down ? q * .2 : 0;
  const arms = [-1, 1].map(side => {
    const shoulder = v(0, side * 15, 76), elbow = v(0, side * 15, 51);
    const direction = v(Math.sin(angle) * Math.sqrt(1 - spread * spread), side * spread, -Math.cos(angle) * Math.sqrt(1 - spread * spread));
    const hand = add(elbow, mul(direction, size.forearm));
    return { shoulder, elbow, hand };
  });
  const legs = [-1, 1].map(side => {
    const root = v(0, side * 7, 44), ankle = v(0, side * 12, 2);
    return { hip: root, knee: bendJoint(root, ankle, 22, 22, v(1, 0, 0)), ankle };
  });
  const soles = legs.map(l => [v(-3,l.ankle.y-2,0),v(-3,l.ankle.y+2,0),v(8,l.ankle.y+2,0),v(8,l.ankle.y-2,0)]);
  let equipment;
  if (kind === 'barbellCurl') {
    const center = v(arms[0].hand.x, 0, arms[0].hand.z);
    equipment = { ...weight(center, v(0,1,0), 34), grips: arms.map(a => a.hand), type: 'barbell' };
  } else if (down) {
    const pulley = v(36, 0, 112), center = v(arms[0].hand.x, 0, arms[0].hand.z);
    // Both rope branches have fixed length; junction follows the two moving handles.
    const branchLength = 30, halfSpan = Math.abs(arms[0].hand.y);
    const junction = add(center, v(0, 0, Math.sqrt(branchLength ** 2 - halfSpan ** 2)));
    equipment = { type: 'rope', pulley, junction, grips: arms.map(a => a.hand), branchLength,
      cable: [pulley, junction], branches: arms.map(a => [junction, a.hand]) };
  } else {
    equipment = { type: 'dumbbells', grips: arms.map(a => a.hand), weights: arms.map(a => {
      // Neutral-grip handle follows thumb direction perpendicular to the forearm in its bend plane.
      const axis = kind === 'hammerCurl' ? v(Math.cos(angle), 0, Math.sin(angle)) : v(0,1,0);
      return weight(a.hand, axis);
    }) };
  }
  return { id: kind, size, hip, shoulderCenter, head, arms, legs, soles, equipment, bench: null,
    camera: { yaw: .85, elevation: .22, offsetY: 148 }, supports: { ankles: legs.map(l=>l.ankle), soles } };
}
const curlSource = 'https://www.acefitness.org/resources/everyone/exercise-library/70/bicep-curl/';
const make = (id, label, movement, source) => Object.freeze({ id, label, duration: 5, stillAt: 1.8, loop: true,
  viewBox: '20 20 160 155', sample: time => sample(id, phase(time)), view: '正交三分之四 · 上肢比例强调',
  support: '双脚固定，躯干与上臂保持稳定；以肘为轴运动。', movement, source });
export const ARM_CLIPS = Object.freeze({
  dumbbellCurl: make('dumbbellCurl', '哑铃弯举', '双手各持独立哑铃，掌心朝前的握姿保持；双侧前臂同步屈伸，器械随手绕肘走弧线。', curlSource),
  barbellCurl: make('barbellCurl', '杠铃弯举', '反手握单根长杠，双握点保持固定间距；肘固定于体侧，长杠随双手上举再控制回落。', curlSource),
  hammerCurl: make('hammerCurl', '锤式弯举', '掌心相对的中立握，两件哑铃独立；器械轴随前臂转动但不发生旋前旋后，区别于普通弯举。', 'https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/'),
  ropePushdown: make('ropePushdown', '绳索下压', '上方滑轮固定，拉索连接分叉绳和双手；上臂不摆动，以伸肘下压并轻分绳端，再缓慢回放。', 'https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/'),
});
