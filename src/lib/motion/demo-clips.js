// World-space contacts, body joints and equipment are separate. Units are drawing units,
// not anatomical measurements. Side views project the two hands onto one grip.
const p = (x, y) => ({ x, y });
const shift = (a, x, y = 0) => p(a.x + x, a.y + y);
export function jointBetween(a, b, length, side = 1) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const height = Math.sqrt(Math.max(0, length * length - distance * distance / 4));
  return p((a.x + b.x) / 2 - side * dy / distance * height,
    (a.y + b.y) / 2 + side * dx / distance * height);
}
const cycle = (time, duration) => (1 - Math.cos(2 * Math.PI * time / duration)) / 2;
const segment = (...points) => points;
function squat(q) {
  const ankle = p(85, 150), farAnkle = p(93, 150);
  const hip = p(85 - 18 * q, 92 + 29 * q);
  const shoulder = p(85, hip.y - Math.sqrt(40 ** 2 - (hip.x - 85) ** 2));
  const grip = shift(shoulder, -5, -2), elbow = jointBetween(shoulder, grip, 17, -1);
  const farHip = shift(hip, 8);
  return {
    joints: { ankle, farAnkle, hip, shoulder, grip, elbow,
      knee: jointBetween(hip, ankle, 30, -1), farKnee: jointBetween(farHip, farAnkle, 30, -1) },
    head: shift(shoulder, 1, -16),
    body: [segment(hip, shoulder, shift(shoulder, 0, -8)), segment(shoulder, elbow, grip),
      segment(hip, jointBetween(hip, ankle, 30, -1), ankle, shift(ankle, 10)),
      segment(farHip, jointBetween(farHip, farAnkle, 30, -1), farAnkle, shift(farAnkle, 10))],
    supports: { ankle, farAnkle },
    fixtures: [segment(p(55, 153), p(120, 153))],
    equipment: { center: grip, angle: 0, grips: [grip], type: 'barbell' },
  };
}
function pullUp(q) {
  const leftGrip = p(48, 25), rightGrip = p(112, 25);
  const leftShoulder = p(68, 61 - 29 * q), rightShoulder = p(92, 61 - 29 * q);
  const hip = p(80, 100 - 29 * q), neck = p(80, leftShoulder.y - 2);
  const leftElbow = jointBetween(leftShoulder, leftGrip, 22, -1);
  const rightElbow = jointBetween(rightShoulder, rightGrip, 22, 1);
  return {
    joints: { leftGrip, rightGrip, leftShoulder, rightShoulder, leftElbow, rightElbow, hip },
    head: shift(neck, 0, -13),
    body: [segment(leftGrip, leftElbow, leftShoulder, rightShoulder, rightElbow, rightGrip),
      segment(neck, hip), segment(hip, p(71, hip.y + 25), p(73, hip.y + 47)),
      segment(hip, p(89, hip.y + 25), p(87, hip.y + 47))],
    supports: { leftGrip, rightGrip }, fixtures: [segment(p(30, 25), p(130, 25))],
    equipment: { center: p(80, 25), angle: 0, grips: [leftGrip, rightGrip], type: 'fixed-bar' },
  };
}
function benchPress(q) {
  const shoulder = p(53, 100), hip = p(98, 100), ankle = p(137, 150), farAnkle = p(147, 150);
  const grip = p(65, 57 + 34 * q);
  const elbow = jointBetween(shoulder, grip, 23, -1);
  return {
    joints: { shoulder, hip, ankle, farAnkle, grip, elbow }, head: p(36, 98),
    body: [segment(p(44, 100), shoulder, p(75, 96), hip), segment(shoulder, elbow, grip),
      segment(hip, jointBetween(hip, ankle, 33, -1), ankle, shift(ankle, 10)),
      segment(hip, jointBetween(hip, farAnkle, 36, -1), farAnkle, shift(farAnkle, 8))],
    supports: { shoulder, hip, ankle, farAnkle, head: p(36, 98) },
    fixtures: [segment(p(25, 104), p(106, 104)), segment(p(33, 104), p(33, 150)),
      segment(p(99, 104), p(99, 150)), segment(p(20, 153), p(160, 153))],
    equipment: { center: grip, angle: 0, grips: [grip], type: 'barbell' },
  };
}
const make = (id, label, viewBox, solve, view, support, movement, source) => Object.freeze({
  id, label, viewBox, duration: 4, stillAt: 2, loop: true, view, support, movement, source,
  sample: time => solve(cycle(time, 4)),
});
export const DEMO_CLIPS = Object.freeze({
  squat: make('squat', '杠铃深蹲', '30 15 110 150', squat, '侧面 · 足底与杠铃轨迹',
    '双脚固定于地面；双手与杠铃同动，杠铃贴近上背。', '髋膝同步屈伸；杠铃保持水平，沿足中上方升降。深度仅作样片展示。',
    'https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/'),
  pullUp: make('pullUp', '引体向上', '20 0 120 165', pullUp, '正面 · 双臂与固定握杠',
    '横杠与双手握点固定于世界坐标；身体上移，双脚悬空。', '屈肘拉起身体，再缓慢回落；横杠不随身体移动。',
    'https://www.acefitness.org/resources/everyone/exercise-library/191/pull-ups/'),
  benchPress: make('benchPress', '杠铃卧推', '15 40 150 125', benchPress, '侧面 · 仰卧接触与脚支撑',
    '头、肩背与髋保持凳面接触；双脚固定于地面。', '手与杠铃同步下放至胸附近再推起；水平杠杆在侧视中简化为端部投影。',
    'https://www.acefitness.org/resources/everyone/exercise-library/5/chest-press/'),
});
