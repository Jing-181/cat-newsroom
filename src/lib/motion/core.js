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
// 骨骼分段长度。单位不是像素：
// ankle 固定在原点 y=0，所以 stand 是「髖关节到踝关节」的距离，不含足高。
// 踝到头顶 = stand + torso + neck + headRadius = 97.5 单位。
// 换算：1 单位 = 0.961 / 97.5 = 0.99% 身高，即整个人 ≈ 101 单位高。
//
// 各段取值依据（以 Drillis & Contini 1966 的闭合链为准，单位=身高百分比）：
//   肩峰 0.818 / 肘 0.630 / 腕 0.485 / 指尖 0.377 / 髖 0.530 / 膝 0.285 / 踝 0.039
//   → 大腿 0.245、小腿 0.246、躯干(髖→肩峰) 0.288、上臂 0.188、前臂 0.145
// 肩/肘/腕/指尖这四点在 ANSUR II 实测里与 D&C 吻合到 0.5% 以内（0.820/0.629/0.483/0.373），
// 唯一真分歧在髖高（D&C 0.530 vs ANSUR 实测大转子 0.512）。这里取 D&C，
// 理由是它能保住 stand 50 和总高不变，且与 Dempster 的分段长自洽。
//
// 上一版 thigh26/shin26/upperArm13/forearm13/torso32 的后果是可算的：
//   ・thigh+shin = 52 > stand 50 → IK 被限到 50，站直时膝屈 31.9°、膝盖前移 7.1 单位，
//     所有「站直」的帧都在微蹲；
//   ・臂 26 单位，而真实应 34 → 腕落在髖上方 6 单位（真实应在髖下 4.5），
//     于是硬拉杠停在髖上、卧推行程少 23%、划船的杠根本够不到肚子。
// 现在这条链每一环都对得上：髖 50 → 肩 79.5 → 腕 45.5 → 头心 90.5 → 头顶 97.5。
export const PROPORTIONS = Object.freeze({
  thigh: 25,
  shin: 25,
  torso: 29.5,
  upperArm: 19,
  forearm: 15,
  neck: 11,
  headRadius: 7,
  stand: 50,     // 站直时髋离地的高度
  kneeDir: -1,   // 膝盖弯向：-1 朝 +x（面朝方向）
  // 横向宽度：只在正面视角用得上。矢状面投影里它们看不见，所以之前没有。
  // 取值依据：ANSUR II 肩峰间宽 0.234H、大转子间宽 0.191H，换到本骨架 1 单位≈0.99%H。
  // 这两项是**估算**，不是精确的关节中心距离：真实肩关节中心比肩峰骨突窄 2–3 单位，
  // 窄一点反而更像人（肩峰是骨头最外端，胳膊是从它内侧转的）。
  shoulderWidth: 19.5,  // 肩关节中心间距
  hipWidth: 18,       // 髖关节中心间距
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
  // 握点锚定：给了 gripY，就把整个身体平移，让手正好落在 (gripX, -gripY) 上。
  // 这不是一个方便字段，是一个物理约束：杠是钉死的，不是跟着手跑的。
  // 有了它，「身体上移多少」不再需要人拍脑袋一帧帧调，而是由屈肘角度推出来的。
  gripX: null,
  gripY: null,
  // 杠轨迹锚定：给了 barHeight，手臂就改成反解——目标点先定，角度回推。
  // 为什么必须这样：硬拉、卧推这类动作里，「杠走哪条线」是教练第一句话，
  // 它不是手臂角度的副产品。只给角度的正解永远保证不了杠不漂。
  // 与 gripY 的区别：gripY 是「手被钉住、整个人挂上去」；bar 是「手在一条指定路径上滑」。
  barX: null,       // 杠的水平位置（骸中心为 0）
  barHeight: null,  // 杠离地高度
  armFold: -1,      // 肘往哪边折：-1 往身前（推类），+1 往身后（拉类、过顶）
  // 悬垂时脚不踩地，腿就不能用「踝在地面」这个 IK 解，只能跟手臂一样用角度正解。
  freeLegs: false,
  freeThigh: 6,   // 悬垂时大腿与竖直的夹角
  freeKnee: 14,   // 悬垂时膝屈角
  // 悬垂时脚尖顺着小腿往下（自然下坠）；跑步这种“脚即将落地”的姿态要的是程度，
  // 因为实际是脚跟先着地、脚尖背屈朝上。两者不能用同一种脚。
  footFlat: false,
  // ── 正面视角专用 ──
  // 这些字段只在该条剪辑声明 view: "front" 时才参与解算。
  // 侧面那套（armSwing/lean）在正面里不要用：正面看不到前摆，看得到外展。
  stance: 7,      // 踩点相对中心的半间距
  armAbduct: 0,   // 外展角，0 为自然下垂，90 为与肩同高向两侧
  // 躯干沿视线方向的压缩系数。仰卧时身体的长轴指向镜头，
  // 正面投影里躯干只能占很小一段——不压扁就会画成一个「站着的矮人」。
  foreshorten: 1,
});

// 缺省值。剪辑里只写「这个动作真正在变的那几个量」，没写的落回这里。
// stand 跟着传入的骨架比例走，换一套比例时髋高不会还锁在 50。
const fillPose = (pose, stand = BASE_POSE.hipHeight) => ({ ...BASE_POSE, hipHeight: stand, ...pose });

// 两骨 IK：已知髋、踝两点与两段骨长，求膝盖。
// 距离超出身高时靠 clamp(cos) 夹住，膝盖落在髋踝连线上，表现为「腿伸直」，不会出 NaN。
// 别在距离上预先减 0.01：thigh+shin 恰好等于腿长（站直）时，那一减会把膝盖
// 推离髋踝连线，小腿量出来比骨长多 0.01。真正会超界的是 cos，夹 cos 就够了。
export function solveKnee(hip, ankle, thigh, shin, side = -1) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const distance = clamp(Math.hypot(dx, dy), 1e-6, thigh + shin);
  const base = Math.atan2(dy, dx);
  const cos = clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1);
  const angle = Math.acos(cos) * side;
  return {
    x: hip.x + Math.cos(base + angle) * thigh,
    y: hip.y + Math.sin(base + angle) * thigh,
  };
}

// 手臂反解：已知肩与想要的掌位，回推上臂角与屈肘角。
// 为什么需要它：硬拉、卧推这类动作里，「杠走哪条线」是教练先讲的东西，
// 不是手臂角度的副产品。只给角度的正解解不出「杠始终在小腿正上方」这种约束，
// 实测就会飘（旧版卧推的手水平漂了 12.8 个单位）。
//
// fold 是折叠方向：-1 时肘往「身前」折（推类），+1 往身后折（拉类、过顶）。同一目标点两解。
export function solveArmToTarget(shoulder, target, upper, fore, fold = -1) {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(upper - fore) + 0.01, upper + fore - 0.01);
  const theta = Math.atan2(dx, dy);
  const cosA = clamp((upper * upper + d * d - fore * fore) / (2 * upper * d), -1, 1);
  const a1 = theta + fold * Math.acos(cosA);
  const elbow = { x: shoulder.x + Math.sin(a1) * upper, y: shoulder.y + Math.cos(a1) * upper };
  const a2 = Math.atan2(target.x - elbow.x, target.y - elbow.y);
  let flex = (a2 - a1) * DEG;
  while (flex > 180) flex -= 360;
  while (flex < -180) flex += 360;
  return { swingDeg: a1 * DEG, elbowDeg: flex };
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

// 手臂到底用角度还是用反解，取决于这一帧有没有声明「杠在哪」。
// 写了 barHeight 就以路径为准（反解），没写就按角度正解。两种写法可以在同一库里共存。
function armAngles(p, shoulder, P) {
  if (Number.isFinite(p.barHeight)) {
    const target = { x: Number.isFinite(p.barX) ? p.barX : 0, y: -p.barHeight };
    return solveArmToTarget(shoulder, target, P.upperArm, P.forearm, p.armFold ?? -1);
  }
  return { swingDeg: p.armSwing, elbowDeg: p.elbow };
}

// 身体几何：给定髋高度，解出全身关节点。
// 抽成函数是因为握点锚定要迭代：髋高度是未知量，手的位置才是已知量。
function buildPose(p, P, hipHeight) {
  const lean = rad(p.lean);
  const hip = { x: p.hipShift, y: -hipHeight };
  let knee;
  let ankle;
  if (p.freeLegs) {
    // 悬垂：脚没有地面可踩，腿就不能用「踝在地面」这个 IK，只能跟手臂一样用角度正解。
    ({ knee, ankle } = solveLeg(hip, p.freeThigh, p.freeKnee, P.thigh, P.shin));
  } else {
    ankle = { x: 0, y: 0 };
    knee = solveKnee(hip, ankle, P.thigh, P.shin, P.kneeDir);
  }
  const shoulder = {
    x: hip.x + Math.sin(lean) * P.torso,
    y: hip.y - Math.cos(lean) * P.torso,
  };
  const arm = armAngles(p, shoulder, P);
  const { elbow, hand } = solveArm(shoulder, arm.swingDeg, arm.elbowDeg, P.upperArm, P.forearm);
  const head = {
    x: shoulder.x + Math.sin(lean) * P.neck,
    y: shoulder.y - Math.cos(lean) * P.neck,
  };

  // 第二条腿：没给角度就跟近侧腿一模一样（只靠皮肤错位假装前后）
  const near = legAngles(hip, knee, ankle);
  const far = solveLeg(
    hip,
    p.farThigh ?? (p.freeLegs ? p.freeThigh : near.thighDeg),
    p.farKnee ?? (p.freeLegs ? p.freeKnee : near.kneeFlex),
    P.thigh, P.shin,
  );

  // 脚。踩地时脚掌平放；悬垂时脚尖顺着小腿方向下伸，不然会变成一双平举在空中的脚。
  const makeFoot = (k, a) => {
    if (!p.freeLegs || p.footFlat) return { heel: { x: a.x - 4, y: a.y }, toe: { x: a.x + 10, y: a.y } };
    const len = Math.hypot(a.x - k.x, a.y - k.y) || 1;
    const dx = (a.x - k.x) / len;
    const dy = (a.y - k.y) / len;
    return {
      heel: { x: a.x - dx * 3, y: a.y - dy * 3 },
      toe: { x: a.x + dx * 9, y: a.y + dy * 9 },
    };
  };
  const nearFoot = makeFoot(knee, ankle);
  const farFoot = makeFoot(far.knee, far.ankle);

  return {
    hip, knee, ankle, shoulder, elbow, hand, head,
    kneeFar: far.knee, ankleFar: far.ankle,
    footHeel: nearFoot.heel, footToe: nearFoot.toe,
    footHeelFar: farFoot.heel, footToeFar: farFoot.toe,
    lean,
  };
}

function shiftPose(pose, dx, dy) {
  const moved = {};
  for (const [name, point] of Object.entries(pose)) {
    moved[name] = point && typeof point.x === "number"
      ? { x: point.x + dx, y: point.y + dy }
      : point;
  }
  return moved;
}

// 姿势参数 → 关节点。坐标原点在脚踝（踩地动作）或握点下方（悬垂动作），y 向下为负。
// ── 正面视角 ──
// 这不是把侧面骨架转 90°。正面看不到前摆和躯干前倾，看得到的是外展、横向开度、左右对称。
// 所以它是一套独立的解算，但输出同一套字段名，皮肤不需要知道自己是哪种视角。
//
// 唯一的投影近似：肘屈在正面几乎看不见（前臂往前折向镜头），
// 所以按 cos 缩短前臂的投影长度。臂伸直时投影最长，折到 90° 时前臂贡献归零。
function buildFrontPose(p, P, hipHeight) {
  const lift = rad(p.lean);   // 正面里 lean 是左右倾，不是前倾
  const cx = p.hipShift ?? 0;
  const rot = (dx, dy) => ({
    x: cx + dx * Math.cos(lift) - dy * Math.sin(lift),
    y: -hipHeight + dx * Math.sin(lift) + dy * Math.cos(lift),
  });

  const hipHalf = P.hipWidth / 2;
  const shHalf = P.shoulderWidth / 2 * Math.sqrt(p.foreshorten);  // 压扁时肩宽也跟着收
  const torsoUp = P.torso * p.foreshorten;
  const hipNear = rot(hipHalf, 0);
  const hipFar = rot(-hipHalf, 0);
  const shoulderNear = rot(shHalf, -torsoUp);
  const shoulderFar = rot(-shHalf, -torsoUp);
  const head = rot(0, -(torsoUp + P.neck * Math.sqrt(p.foreshorten)));

  // 踩点不跟着 hipShift 走：脚是钉在地上的，髋横移就是横移。
  const stance = p.stance ?? hipHalf;
  const ankleNear = { x: stance, y: 0 };
  const ankleFar = { x: -stance, y: 0 };

  // 膝盖往外鼓一点。正面视角里膝屈被投影掉了，膝盖就落在髖踝连线上，
  // 不鼓一下会变成两条笔直的棍子。缺省 5% 腿长，不参与角度计算。
  const kneeOf = (h, a) => {
    const side = Math.sign(h.x - cx) || 1;
    const len = Math.hypot(a.x - h.x, a.y - h.y);
    return { x: (h.x + a.x) / 2 + side * len * 0.03, y: (h.y + a.y) / 2 };
  };
  const kneeNear = kneeOf(hipNear, ankleNear);
  const kneeFar = kneeOf(hipFar, ankleFar);

  const ab = rad(p.armAbduct);
  const foreshorten = Math.cos(rad(p.elbow));   // 前臂投影系数
  const arm = (shoulder, outward) => {
    const dir = { x: outward * Math.sin(ab), y: Math.cos(ab) };
    const elbow = { x: shoulder.x + dir.x * P.upperArm, y: shoulder.y + dir.y * P.upperArm };
    const hand = {
      x: elbow.x + dir.x * P.forearm * foreshorten,
      y: elbow.y + dir.y * P.forearm * foreshorten,
    };
    return { elbow, hand };
  };
  const nearArm = arm(shoulderNear, 1);
  const farArm = arm(shoulderFar, -1);

  // 正面看脚是朝向镜头的，投影下来就是一个短横。六单位已经比真实投影宽，
  // 但再短就看不出脚在那儿。
  const foot = (a, outward) => ({
    heel: { x: a.x - outward * 2, y: a.y },
    toe: { x: a.x + outward * 4, y: a.y },
  });
  const footNear = foot(ankleNear, 1);
  const footFar = foot(ankleFar, -1);

  return {
    // 中轴两点：躯干从髖中心到肩中心
    hip: rot(0, 0),
    shoulder: rot(0, -torsoUp),
    head,
    // 兼容原有字段：取近侧，跟侧面视角的含义对齐
    knee: kneeNear, ankle: ankleNear, elbow: nearArm.elbow, hand: nearArm.hand,
    kneeFar, ankleFar,
    footHeel: footNear.heel, footToe: footNear.toe,
    footHeelFar: footFar.heel, footToeFar: footFar.toe,
    // 正面专用的对称点
    hipNear, hipFar, shoulderNear, shoulderFar,
    kneeNear, ankleNear,
    elbowNear: nearArm.elbow, handNear: nearArm.hand,
    elbowFar: farArm.elbow, handFar: farArm.hand,
    // 头的投影半径。仰卧时头在最远端，不缩就会变成一个跟身体等大的圈，
    // 看上去就像肚子。 按 sqrt(foreshorten) 缩，跟肩宽同一量级。
    headR: P.headRadius * Math.sqrt(p.foreshorten),
    lean: p.lean,
  };
}

export function solvePose(params = {}, P = PROPORTIONS) {
  const p = fillPose(params, P.stand);
  if (p.view === "front") return buildFrontPose(p, P, p.hipHeight);
  let hp = p.hipHeight;
  let pose = buildPose(p, P, hp);

  // 握点锚定：手必须钉在杠上，而不是身体不动、把杠往下拉。
  // 手臂角度不变时手与髋高度是线性关系，所以几次迭代就收敛。
  // 意义在于：「身体上移多少」不再靠人拍脑袋逐帧调，而是由屈肘角推出来的。
  if (Number.isFinite(p.gripY)) {
    for (let i = 0; i < 4; i += 1) {
      const err = pose.hand.y + p.gripY;   // 期望 hand.y === -gripY
      if (Math.abs(err) < 0.01) break;
      hp += err;
      pose = buildPose(p, P, hp);
    }
  }
  if (Number.isFinite(p.gripX)) pose = shiftPose(pose, p.gripX - pose.hand.x, 0);

  const tilted = p.rootTilt ? tiltAround(pose, pose.ankle, rad(p.rootTilt)) : pose;

  // 整体平移最后做：rootTilt 是绕踝旋转的，躺姿转 90° 后身体会被甩到画面外，
  // 得靠 anchor 把它搬回地面。平移比旋转好理解，也不会意外改变姿势本身。
  if (p.anchorX || p.anchorY) return shiftPose(tilted, p.anchorX, p.anchorY);
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
  const view = clip.view || "side";
  const tracks = [...(clip.tracks || [])].sort((a, b) => a.at - b.at);
  const loop = clip.loop !== false;
  if (!tracks.length) return { duration: clip.duration || 1, loop, view, segments: [], stillAt: 0 };

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
    view,
    segments,
    stillAt: clip.stillAt ?? duration * 0.4,
  };
}

// 采样：时间 → 姿势参数。只在参数上插值，不插值坐标——
// 关节坐标一旦被线性插值，膝盖就会跑到腿外面去。
export function sampleClip(prepared, time) {
  const { duration, loop, segments } = prepared;
  // view 不是数值，不参与插值，直接挂在采样结果上：解算器读 pose.view 决定用哪套骨架。
  if (!segments.length) return { ...fillPose({}), view: prepared.view };
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
  out.view = prepared.view;
  return out;
}
