// 动作动画的内核：缓动、骨架、剪辑采样。
//
// 这一层不碰 DOM，不认颜色、粗细、class，也不认任何项目。
// 它只回答一个问题：给定时间 t，这副骨架的每个关节点在哪。
// 换项目时原样带走；要改的只有 clips（动作内容）和 skin（怎么画）。

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, t) => from + (to - from) * t;
export const rad = deg => (deg * Math.PI) / 180;

// 缓动只用这四个。多一个名字就多一种没人记得住的节奏。
// inOut 就是原来 squatPhase 里那个 ease()，换掉会让深蹲的手感变掉。
export const EASINGS = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

// 骨架比例：单位是「身体单位」，不是 px。viewBox 决定它最终多大。
// 比例改这里，所有动作一起变；某个动作想改比例，在 solvePose 传自己的 P。
export const PROPORTIONS = Object.freeze({
  thigh: 26,
  shin: 26,
  torso: 32,
  upperArm: 13,
  forearm: 13,
  neck: 9,
  headRadius: 7,
  stand: 50,     // 站直时髋离地的高度
  kneeDir: -1,   // 膝盖弯向：-1 朝 +x（面朝方向）
});

// 姿势参数的默认值。剪辑里只写「这个动作真正在变的那几个量」，
// 没写的落回这里，所以一个关键帧可以只有两三个字段。
export const BASE_POSE = Object.freeze({
  hipHeight: PROPORTIONS.stand,
  hipShift: 0,    // 髋相对踝的前后位移，硬拉往后、弓步往前
  lean: 0,        // 躯干前倾角，度
  armSwing: 0,    // 上臂从「自然下垂」量起的前摆角，度
  elbow: 0,       // 屈肘角，度，0 为直臂
  // 第二条腿。不填就跟近侧腿同角度（只靠皮肤错开几个单位假装前后）；
  // 分腿蹲、弓步、跑步这类要两条腿真做不同的事时，单独给这两个值。
  farThigh: null, // 远侧大腿与竖直的夹角，+ 为向前
  farKnee: null,  // 远侧膝屈角
  rootTilt: 0,    // 整体绕踝旋转，度
  anchorX: 0,     // 整体平移，单位同身体单位
  anchorY: 0,
});

// 缺省值。剪辑里只写「这个动作真正在变的那几个量」，没写的落回这里。
// stand 跟着传入的骨架比例走，换一套比例时髋高不会还锁在 50。
const fillPose = (pose, stand = BASE_POSE.hipHeight) => ({ ...BASE_POSE, hipHeight: stand, ...pose });

// 两骨 IK：已知髋、踝两点与两段骨长，求膝盖。
// 距离超出身高时夹到极限，膝盖落在髋踝连线上，表现为「腿伸直」，不会出 NaN。
export function solveKnee(hip, ankle, thigh, shin, side = -1) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const distance = clamp(Math.hypot(dx, dy), Math.abs(thigh - shin) + 0.01, thigh + shin - 0.01);
  const base = Math.atan2(dy, dx);
  const cos = clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1);
  const angle = Math.acos(cos) * side;
  return {
    x: hip.x + Math.cos(base + angle) * thigh,
    y: hip.y + Math.sin(base + angle) * thigh,
  };
}

// 手臂用正向解算而不是 IK：手不是被钉住的，肘弯多少、手就到哪里，
// 这样推举、划船、弯举这类动作只改两个角度就能演出来。
//
// swing：上臂从「自然下垂」量起的前摆角，0 垂直向下，90 前平举，180 举过头顶（逆时针）。
// elbow：屈肘角。0 为直臂，正值为**向前屈**（肘只能往前弯，这是解剖约束）。
//        符号反了手会折到肩膀后面去，看上去像一把刀插在脖子旁边。
export function solveArm(shoulder, swingDeg, elbowDeg, upper, fore) {
  const a1 = rad(swingDeg);
  const elbow = {
    x: shoulder.x + Math.sin(a1) * upper,
    y: shoulder.y + Math.cos(a1) * upper,
  };
  const a2 = rad(swingDeg + elbowDeg);
  const hand = {
    x: elbow.x + Math.sin(a2) * fore,
    y: elbow.y + Math.cos(a2) * fore,
  };
  return { elbow, hand };
}

function tiltAround(points, origin, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = {};
  for (const [name, p] of Object.entries(points)) {
    if (!p || typeof p.x !== "number") { out[name] = p; continue; }
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    out[name] = { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
  }
  return out;
}

// 角度工具：后面解腿、量关节角都要用，放在最前面避免暂时性死区。
const DEG = 180 / Math.PI;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const angleBetween = (a, b) => {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (!la || !lb) return 0;
  const cos = clamp((a.x * b.x + a.y * b.y) / (la * lb), -1, 1);
  return Math.acos(cos) * DEG;
};

// 从髋出发，用两个角度（大腿与竖直的夹角、膝屈角）正向解出一条腿。
// 这是「第二条腿」用的：它不需要踩在固定点上，只需要摆出一个姿势。
// thighDeg 从「正下方」量起，+ 为向前；kneeFlexDeg 为屈膝角，小腿往后折。
export function solveLeg(hip, thighDeg, kneeFlexDeg, thighLen, shinLen) {
  const a1 = rad(thighDeg);
  const knee = { x: hip.x + Math.sin(a1) * thighLen, y: hip.y + Math.cos(a1) * thighLen };
  const a2 = rad(thighDeg - kneeFlexDeg);
  const ankle = { x: knee.x + Math.sin(a2) * shinLen, y: knee.y + Math.cos(a2) * shinLen };
  return { knee, ankle };
}

// 从已解出的近侧腿反推它的两个角度，好让远侧腿默认跟上。
function legAngles(hip, knee, ankle) {
  const thighDeg = Math.atan2(knee.x - hip.x, knee.y - hip.y) * DEG;
  const kneeFlex = 180 - angleBetween(sub(hip, knee), sub(ankle, knee));
  return { thighDeg, kneeFlex };
}

// 姿势参数 → 关节点。坐标原点在脚踝，y 向下为负（SVG 习惯）。
export function solvePose(params = {}, P = PROPORTIONS) {
  const p = fillPose(params, P.stand);
  const lean = rad(p.lean);
  const hip = { x: p.hipShift, y: -p.hipHeight };
  const ankle = { x: 0, y: 0 };
  const knee = solveKnee(hip, ankle, P.thigh, P.shin, P.kneeDir);
  const shoulder = {
    x: hip.x + Math.sin(lean) * P.torso,
    y: hip.y - Math.cos(lean) * P.torso,
  };
  const { elbow, hand } = solveArm(shoulder, p.armSwing, p.elbow, P.upperArm, P.forearm);
  const head = {
    x: shoulder.x + Math.sin(lean) * P.neck,
    y: shoulder.y - Math.cos(lean) * P.neck,
  };

  // 第二条腿：没给角度就跟近侧腿一模一样（只靠皮肤错位假装前后）
  const near = legAngles(hip, knee, ankle);
  const far = solveLeg(hip, p.farThigh ?? near.thighDeg, p.farKnee ?? near.kneeFlex, P.thigh, P.shin);

  const footHeel = { x: ankle.x - 4, y: ankle.y };
  const footToe = { x: ankle.x + 10, y: ankle.y };
  const footHeelFar = { x: far.ankle.x - 4, y: far.ankle.y };
  const footToeFar = { x: far.ankle.x + 10, y: far.ankle.y };

  const pose = {
    hip, knee, ankle, shoulder, elbow, hand, head,
    kneeFar: far.knee, ankleFar: far.ankle,
    footHeel, footToe, footHeelFar, footToeFar,
    lean,
  };

  const tilted = p.rootTilt ? tiltAround(pose, ankle, rad(p.rootTilt)) : pose;

  // 整体平移最后做：rootTilt 是绕踝旋转的，躺姿转 90° 后身体会被甩到画面外，
  // 得靠 anchor 把它搬回地面。平移比旋转好理解，也不会意外改变姿势本身。
  if (p.anchorX || p.anchorY) {
    const moved = {};
    for (const [name, point] of Object.entries(tilted)) {
      moved[name] = point && typeof point.x === "number"
        ? { x: point.x + p.anchorX, y: point.y + p.anchorY }
        : point;
    }
    return moved;
  }
  return tilted;
}

// 关节角度：从解出来的关节点反算解剖角，用来对着文献核。
//
// 约定（跟 docs/motion-biomechanics.md 一致）：
//   kneeFlex  膝屈角，股骨与胫骨夹角，0 = 站直，数值越大越屈
//   hipFlex   髖屈角，躯干与股骨的夹角，0 = 站直
// 两者都是「偏离伸直状态多少度」，所以站直时都是 0。
export function jointAngles(pose) {
  const shin = sub(pose.knee, pose.ankle);
  return {
    kneeFlex: 180 - angleBetween(sub(pose.hip, pose.knee), sub(pose.ankle, pose.knee)),
    hipFlex: 180 - angleBetween(sub(pose.knee, pose.hip), sub(pose.shoulder, pose.hip)),
    // 胫骨前倾：膝相对踝往前多少度，就是踝背屈的量。站直 0°，深蹲 20–30°。
    shinLean: Math.atan2(shin.x, -shin.y) * DEG,
    trunkLean: (pose.lean || 0) * DEG,
  };
}

// 剪辑：{ duration, loop, tracks: [{ at, pose, ease }] }
// 约定跟 CSS 一样——关键帧上的 ease 管的是「从这一帧到下一帧」那一段。
// 所以「慢慢下去、停一下、慢慢起来、歇一会儿」写出来就是四个时间戳。
export function prepareClip(clip) {
  const tracks = [...(clip.tracks || [])].sort((a, b) => a.at - b.at);
  const loop = clip.loop !== false;
  if (!tracks.length) return { duration: clip.duration || 1, loop, segments: [], stillAt: 0 };

  // 收尾：循环的补一帧回到第一帧，单次的停在最后一帧。
  // 有了这一帧，采样就不需要再处理「最后一段绕回开头」这个特例。
  const last = tracks[tracks.length - 1];
  const duration = clip.duration ?? last.at;
  if (last.at < duration) {
    tracks.push({ at: duration, pose: loop ? tracks[0].pose : last.pose, ease: last.ease });
  }

  const segments = [];
  for (let i = 0; i < tracks.length - 1; i++) {
    const a = tracks[i];
    const b = tracks[i + 1];
    segments.push({
      from: a.at,
      to: b.at,
      a: fillPose(a.pose),
      b: fillPose(b.pose),
      ease: EASINGS[a.ease] || EASINGS.inOut,
    });
  }
  return {
    duration,
    loop,
    segments,
    stillAt: clip.stillAt ?? duration * 0.4,
  };
}

// 采样：时间 → 姿势参数。只在参数上插值，不插值坐标——
// 关节坐标一旦被线性插值，膝盖就会跑到腿外面去。
export function sampleClip(prepared, time) {
  const { duration, loop, segments } = prepared;
  if (!segments.length) return fillPose({});
  let t = loop ? ((time % duration) + duration) % duration : clamp(time, 0, duration);

  let segment = segments[segments.length - 1];
  for (const candidate of segments) {
    if (t >= candidate.from && t < candidate.to) { segment = candidate; break; }
  }

  const span = segment.to - segment.from;
  const local = span > 0 ? clamp((t - segment.from) / span, 0, 1) : 1;
  const eased = segment.ease(local);
  const out = {};
  for (const key of Object.keys(BASE_POSE)) {
    const a = segment.a[key];
    const b = segment.b[key];
    // farThigh / farKnee 默认是 null（意思是「跟近侧腿一样」）。
    // null 不能参与插值——null - null 在 JS 里等于 0，会把「继承」算成 0°，
    // 远侧腿会直接戳到地面以下。两端都不是数时原样传 null，交给 solvePose 回退。
    out[key] = typeof a === "number" && typeof b === "number"
      ? lerp(a, b, eased)
      : (a ?? b ?? null);
  }
  return out;
}
