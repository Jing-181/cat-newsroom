// 画法层（体积线）：暖黄实心身体 + 粗外轮廓 + 细肌肉分块线。
//
// 这一套只有三个可变量：身体的实心块、外轮廓、内部短线。
// 没有渐变、没有投影、没有环境光，体积感全靠「粗外轮廓 / 细内线」的层级差。
//
// 实现上只有一个技巧值得说：
//   每一层先把所有形状用 ink 描边画一遍（线宽 2×ow，等于沿边界向外扩 ow），
//   再把所有填充盖上去。露在外面的 ink 就只剩并集的边界，
//   于是相邻的两条腿、躯干和头之间没有接缝，只有一条外轮廓。
//   同一层里「描边全部在前、填充全部在后」这条顺序不能破，破了就会画出关节内的暗线。
//
// 肢体是有宽度的形状，不是线：关节点之间用「两端半径不同的胶囊」拼出来。
// 粗细比例全在这里，骨架（core.js）一个字不动。

import { sizeTier, strokeUnits, measureHeight } from "../optical.js";

const NS = "http://www.w3.org/2000/svg";

// 单位是「身体单位」，跟骨架同一套。整体按 P.thigh / 26 缩放，换骨架比例时不会走形。
const RADII = {
  torsoHip: 9.0,    // 骨盆端
  torsoChest: 8.6,  // 胸口
  torsoTop: 5.5,    // 肩／颈根。收窄是必要的：头半径 7、脖子只有 9 长，
                    // 肩端不收窄的话头会被埋进躯干里，只剩半个圆。
  thigh: 6.6,
  knee: 5.0,
  ankle: 3.2,
  upperArm: 5.0,    // 肩端比躯干上端粗一点，肩头才有个鼓包
  elbow: 3.5,
  wrist: 2.5,
  foot: 3.0,
  toe: 2.2,
  outline: 1.45,    // 外轮廓半径。描边实际线宽是它的两倍，可见带宽正好等于它。
  mark: 0.85,       // 内部肌肉线，细且淡，比外轮廓低一个量级
};

const COLORS = {
  ink: "#221a12",       // 近黑偏褐，描边
  body: "#EFCF5A",      // 暖黄
  bodyFar: "#B0913A",   // 远侧肢体压暗，制造前后
  mark: "#9A7724",      // 肌肉线：比身体暗一档，不抢轮廓
  markStrong: "#6E5216", // 小尺寸用：压更深，不然抗锯齿一抹就成灰雾
  shorts: "#3B3630",    // 深灰短裤，把身体分成上中下三段
  prop: "#6E5F49",      // 器械杆
  propPlate: "#4A3C2C", // 杠片，比杆暗，两块配重才读得出来
};

// 躯干上「最宽处」的位置。胸在 0.62 处，往上是收窄的肩颈。
const CHEST_T = 0.62;

// 内部肌肉线。骨骼局部坐标：t 沿骨长 0→1，o 是相对该处半径的垂直偏移（+ 为身前）。
// 只画概括的块面分割，不画解剖学的肌肉群：一眼读出「有肌肉」，仅此而已。
// layer 决定它画在哪一层：画早了被后面的肢体盖住，画晚了会浮在别的肢体上。
const MARKS = [
  // 胸肌下缘：从身前收到体侧
  { layer: "torso", bone: "torso", t0: 0.60, o0: 0.55, t1: 0.80, o1: 0.10, bend: 0.10 },
  // 腹：一道短斜线，把胸和腹分开
  { layer: "torso", bone: "torso", t0: 0.32, o0: 0.30, t1: 0.43, o1: 0.70, bend: 0.03 },
  // 背：肩胛／背阔的边
  { layer: "torso", bone: "torso", t0: 0.62, o0: -0.40, t1: 0.48, o1: -0.26 },
  // 股四头：大腿前侧一道长线
  { layer: "leg", bone: "thigh", t0: 0.42, o0: 0.44, t1: 0.80, o1: 0.10, bend: 0.06 },
  // 腓肠肌后缘
  { layer: "leg", bone: "shin", t0: 0.14, o0: -0.42, t1: 0.40, o1: -0.10, bend: -0.05 },
  // 三角肌：肩头一小段
  { layer: "arm", bone: "upperArm", t0: 0.08, o0: -0.30, t1: 0.26, o1: 0.18, bend: 0.06 },
  // 二头
  { layer: "arm", bone: "upperArm", t0: 0.46, o0: 0.45, t1: 0.72, o1: 0.26 },
  // 前臂
  { layer: "arm", bone: "forearm", t0: 0.34, o0: 0.42, t1: 0.58, o1: 0.16 },
];

// 小尺寸只留三笔：胸下缘、股四头、二头。
// 三个身体区域各一处——读成「有胸、有腿、有胳膊」，而不是均匀铺开的一层灰。
// 选这三笔的依据：靠身体中轴或外缘，不会被手臂或短裤盖住。
const COMPACT_MARKS = new Set([MARKS[0], MARKS[3], MARKS[6]]);

const n1 = v => v.toFixed(1);
const lerp = (a, b, t) => a + (b - a) * t;

// 身前法线：+o 一律指「身体正面」。
// 竖着的骨头取 +x 那一侧；横着的骨头（躺姿的躯干）取朝上那一侧。
function frontNormal(ux, uy) {
  let nx = -uy;
  let ny = ux;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

// 两端半径不同的胶囊：两条外公切线 + 两个端部圆弧。
// ra === rb 时退化成一个普通胶囊，半径差大时自然收成锥形，
// 所以大腿粗小腿细不需要额外画法。
function taper(a, b, ra, rb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);

  if (d < 1e-4) {
    const r = Math.max(ra, rb, 0.1);
    return `M${n1(a.x - r)} ${n1(a.y)}A${n1(r)} ${n1(r)} 0 1 1 ${n1(a.x + r)} ${n1(a.y)}` +
      `A${n1(r)} ${n1(r)} 0 1 1 ${n1(a.x - r)} ${n1(a.y)}Z`;
  }

  const ux = dx / d;
  const uy = dy / d;
  const nx = -uy;
  const ny = ux;

  // 公切线的法线与骨轴夹 ψ，sinψ = (ra-rb)/d
  const sin = Math.max(-1, Math.min(1, (ra - rb) / d));
  const cos = Math.sqrt(1 - sin * sin);
  const m1x = nx * cos + ux * sin;
  const m1y = ny * cos + uy * sin;
  const m2x = -nx * cos + ux * sin;
  const m2y = -ny * cos + uy * sin;

  // 端部圆弧绕远端的那个方向：m1→m2 的叉积符号就是 sweep
  const sweep = m1x * m2y - m1y * m2x > 0 ? 1 : 0;

  const ax = a.x + ra * m1x;
  const ay = a.y + ra * m1y;
  const bx = b.x + rb * m1x;
  const by = b.y + rb * m1y;
  const cx = b.x + rb * m2x;
  const cy = b.y + rb * m2y;
  const ex = a.x + ra * m2x;
  const ey = a.y + ra * m2y;

  return `M${n1(ax)} ${n1(ay)}L${n1(bx)} ${n1(by)}` +
    `A${n1(rb)} ${n1(rb)} 0 0 ${sweep} ${n1(cx)} ${n1(cy)}` +
    `L${n1(ex)} ${n1(ey)}` +
    `A${n1(ra)} ${n1(ra)} 0 0 ${sweep} ${n1(ax)} ${n1(ay)}Z`;
}

export function createSkin(target, {
  proportions = {},
  palette = {},
  widths = {},
  farOffset = 6.5,   // 远侧肢体整体往后错开这么多，才看得出是前后两条
} = {}) {
  const P = { thigh: 26, shin: 26, torso: 32, upperArm: 13, forearm: 13, headRadius: 7, ...proportions };
  const scale = P.thigh / 26 || 1;
  const W = {};
  for (const [key, value] of Object.entries({ ...RADII, ...widths })) W[key] = value * scale;
  const C = { ...COLORS, ...palette };

  target.innerHTML = "";

  // 尺寸档：线宽与肌肉线条数都跟它走。初始 full，量到真实尺寸后重算。
  let px = 0;
  let tier = "full";
  let probes = 0;
  const inkNodes = [];
  const markNodes = [];

  // 只造不挂：元素的插入顺序就是图层顺序，最后统一按 order 数组挂上去。
  const make = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const inkAttrs = {
    fill: "none",
    stroke: C.ink,
    "stroke-width": String(2 * W.outline),
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  };
  // 一对路径共用同一份 d：描边在前、填充在后，所以 paint 里只算一次几何。
  const pair = color => {
    const ink = make("path", { ...inkAttrs, d: "" });
    inkNodes.push(ink);
    return [ink, make("path", { fill: color, d: "" })];
  };
  const draw = (p, d) => {
    p[0].setAttribute("d", d);
    p[1].setAttribute("d", d);
  };
  const markPath = (bone, m) => {
    const node = make("path", {
      fill: "none",
      stroke: C.mark,
      "stroke-width": String(W.mark),
      "stroke-linecap": "round",
      d: "",
    });
    node._bone = bone;
    node._mark = m;
    markNodes.push(node);
    return node;
  };

  // ── 元素顺序＝绘制顺序 ───────────────────────────────────────
  // 器械分两层：背上的杠要压在身体后面，手里的杠要盖在身体前面。
  // paintProp 在 paint 之后调用，所以靠固定好的 DOM 顺序决定前后，而不是靠调用顺序。
  const propBack = [
    make("path", { ...inkAttrs, d: "" }), make("path", { ...inkAttrs, d: "" }), make("path", { ...inkAttrs, d: "" }),
    make("path", { fill: C.prop, d: "" }), make("path", { fill: C.propPlate, d: "" }), make("path", { fill: C.propPlate, d: "" }),
  ];

  // 远侧：腿 + 臂，都在身体后面
  const farThigh = pair(C.bodyFar);
  const farShin = pair(C.bodyFar);
  const farFoot = pair(C.bodyFar);
  const farUpperArm = pair(C.bodyFar);
  const farForearm = pair(C.bodyFar);

  // 躯干：两段（骨盆→胸、胸→肩颈）。头单独是圆，但描边必须排在躯干填充之前。
  const torsoLow = pair(C.body);
  const torsoHigh = pair(C.body);
  const headInk = make("circle", { ...inkAttrs, cx: "0", cy: "0", r: String(P.headRadius) });
  const headFill = make("circle", { cx: "0", cy: "0", r: String(P.headRadius), fill: C.body });
  // 眼睛：头内的一个小弧。没有脸，只有「这边是正面」的暗示。
  const eye = make("path", {
    fill: "none",
    stroke: C.ink,
    "stroke-width": String(W.mark * 1.2),
    "stroke-linecap": "round",
    d: "",
  });

  // 近侧腿 → 短裤 → 近侧臂
  const nearThigh = pair(C.body);
  const nearShin = pair(C.body);
  const nearFoot = pair(C.body);
  const shorts = pair(C.shorts);

  // 近侧臂有两套槽位：举过头顶时手臂要画在头的后面，
  // 否则头会被整条手臂盖住，整个人变成一个没有头的兜帽。
  // 每帧只往其中一套写几何，另一套清空。
  const armLayer = () => ({
    upper: pair(C.body),
    fore: pair(C.body),
    marks: MARKS.filter(m => m.layer === "arm").map(m => markPath(m.bone, m)),
  });
  const armBack = armLayer();
  const armFront = armLayer();
  const armNodes = layer => [
    ...layer.upper, ...layer.fore, ...layer.marks,
  ];

  // 肌肉线按层插在上面几层里，顺序不能挪
  const torsoMarks = MARKS.filter(m => m.layer === "torso").map(m => markPath(m.bone, m));
  const legMarks = MARKS.filter(m => m.layer === "leg").map(m => markPath(m.bone, m));

  const propFront = [
    make("path", { ...inkAttrs, d: "" }), make("path", { ...inkAttrs, d: "" }), make("path", { ...inkAttrs, d: "" }),
    make("path", { fill: C.prop, d: "" }), make("path", { fill: C.propPlate, d: "" }), make("path", { fill: C.propPlate, d: "" }),
  ];

  // 图层顺序。肌肉线和眼睛夹在层与层之间：画早了会被后面的肢体盖住，
  // 画晚了会浮在别的肢体上（胸线压到手臂上就是这么来的）。
  const order = [
    ...propBack,
    ...farThigh, ...farShin, ...farFoot, ...farUpperArm, ...farForearm,
    ...armNodes(armBack),
    ...torsoLow, ...torsoHigh, headInk, headFill, ...torsoMarks, eye,
    ...nearThigh, ...nearShin, ...nearFoot, ...legMarks,
    ...shorts,
    ...armNodes(armFront),
    ...propFront,
  ];
  target.innerHTML = "";
  for (const node of order) target.append(node);

  const torsoR = t => (t < CHEST_T
    ? lerp(W.torsoHip, W.torsoChest, t / CHEST_T)
    : lerp(W.torsoChest, W.torsoTop, (t - CHEST_T) / (1 - CHEST_T)));

  const footPath = (heel, toe) => {
    // 脚掌是贴地的一块，把胶囊抬起来让鞋底落在 y≈0
    const lift = W.foot * 0.62;
    return taper(
      { x: heel.x, y: heel.y - lift },
      { x: toe.x, y: toe.y - lift * 0.75 },
      W.foot,
      W.toe,
    );
  };

  const drawMark = (node, bone) => {
    const m = node._mark;
    const { a, b, rAt } = bone;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const { nx, ny } = frontNormal(dx / d, dy / d);
    const at = (t, o) => {
      const r = rAt(t);
      return { x: a.x + dx * t + nx * o * r, y: a.y + dy * t + ny * o * r };
    };
    const p0 = at(m.t0, m.o0);
    const p1 = at(m.t1, m.o1);
    if (!m.bend) {
      node.setAttribute("d", `M${n1(p0.x)} ${n1(p0.y)}L${n1(p1.x)} ${n1(p1.y)}`);
      return;
    }
    const c = at((m.t0 + m.t1) / 2, (m.o0 + m.o1) / 2 + m.bend);
    node.setAttribute("d", `M${n1(p0.x)} ${n1(p0.y)}Q${n1(c.x)} ${n1(c.y)} ${n1(p1.x)} ${n1(p1.y)}`);
  };

  const clearProp = layer => {
    for (const node of layer) node.setAttribute("d", "");
  };

  const headRadius = P.headRadius * 1.06;

  // 按尺寸档重算线宽与细节。全部是属性赋值，不在 paint 里做。
  const applyTier = () => {
    tier = sizeTier(px);
    const compact = tier === "compact";
    // 只对描边和肌肉线做光学缩放；身体填充半径不动——
    // 身体的胖瘦是画风的一部分，不能因为图小了就变瘦。
    const opt = strokeUnits(px, 1);
    const outline = W.outline * opt * (compact ? 1.18 : 1);
    const mark = W.mark * opt * (compact ? 1.6 : 1);
    const markColor = compact ? C.markStrong : C.mark;

    for (const node of inkNodes) node.setAttribute("stroke-width", String(2 * outline));
    for (const node of markNodes) {
      node.setAttribute("stroke-width", String(mark));
      node.setAttribute("stroke", markColor);
      // 小尺寸留三笔，其余直接不画。留着但缩细 = 一层灰雾，比不画更差。
      const keep = !compact || COMPACT_MARKS.has(node._mark);
      node.style.display = keep ? "" : "none";
    }
  };

  return {
    resize(viewBox) {
      if (viewBox) target.setAttribute("viewBox", viewBox);
      px = measureHeight(target);
      applyTier();
    },

    paint(pose) {
      // 首次挂载时元素可能还没进文档，gBCR 是 0。前几帧探一下，量到就定死。
      if (px <= 0 && probes < 8) {
        probes += 1;
        const h = measureHeight(target);
        if (h > 0) { px = h; applyTier(); }
      }

      const { hip, knee, ankle, shoulder, elbow, hand, head } = pose;

      // 远侧肢体：压暗 + 略细 + 整体后错，三件事一起做才读得出前后。
      const far = 0.92;
      const off = p => ({ x: p.x - farOffset, y: p.y });
      const farHip = off(hip);
      const farKnee = off(pose.kneeFar);
      const farAnkle = off(pose.ankleFar);
      draw(farThigh, taper(farHip, farKnee, W.thigh * far, W.knee * far));
      draw(farShin, taper(farKnee, farAnkle, W.knee * far, W.ankle * far));
      draw(farFoot, footPath(off(pose.footHeelFar), off(pose.footToeFar)));
      const farShoulder = off(shoulder);
      const farElbow = off(elbow);
      const farHand = off(hand);
      draw(farUpperArm, taper(farShoulder, farElbow, W.upperArm * far, W.elbow * far));
      draw(farForearm, taper(farElbow, farHand, W.elbow * far, W.wrist * far));

      // 躯干拆两段：骨盆到胸（几乎不收）＋ 胸到肩颈（明显收窄）。
      const chest = {
        x: lerp(hip.x, shoulder.x, CHEST_T),
        y: lerp(hip.y, shoulder.y, CHEST_T),
      };
      draw(torsoLow, taper(hip, chest, W.torsoHip, W.torsoChest));
      draw(torsoHigh, taper(chest, shoulder, W.torsoChest, W.torsoTop));

      const hr = headRadius;
      for (const node of [headInk, headFill]) {
        node.setAttribute("cx", n1(head.x));
        node.setAttribute("cy", n1(head.y));
        node.setAttribute("r", n1(hr));
      }

      const torsoUx = shoulder.x - hip.x;
      const torsoUy = shoulder.y - hip.y;
      const torsoLen = Math.hypot(torsoUx, torsoUy) || 1;
      const tn = frontNormal(torsoUx / torsoLen, torsoUy / torsoLen);
      const bones = {
        torso: { a: hip, b: shoulder, rAt: torsoR },
        thigh: { a: hip, b: knee, rAt: t => lerp(W.thigh, W.knee, t) },
        shin: { a: knee, b: ankle, rAt: t => lerp(W.knee, W.ankle, t) },
        upperArm: { a: shoulder, b: elbow, rAt: t => lerp(W.upperArm, W.elbow, t) },
        forearm: { a: elbow, b: hand, rAt: t => lerp(W.elbow, W.wrist, t) },
      };
      for (const node of torsoMarks) drawMark(node, bones.torso);

      // 眼窝：头内坐标里的一小道弧，方向跟着躯干走
      const upx = tn.ny;
      const upy = -tn.nx;
      const ex = head.x + tn.nx * hr * 0.40;
      const ey = head.y + tn.ny * hr * 0.40;
      const e0 = { x: ex + upx * hr * 0.20, y: ey + upy * hr * 0.20 };
      const e1 = { x: ex - upx * hr * 0.15 + tn.nx * hr * 0.10, y: ey - upy * hr * 0.15 + tn.ny * hr * 0.10 };
      const ec = { x: ex + tn.nx * hr * 0.24, y: ey + tn.ny * hr * 0.24 };
      eye.setAttribute("d", `M${n1(e0.x)} ${n1(e0.y)}Q${n1(ec.x)} ${n1(ec.y)} ${n1(e1.x)} ${n1(e1.y)}`);

      // 近侧腿
      draw(nearThigh, taper(hip, knee, W.thigh, W.knee));
      draw(nearShin, taper(knee, ankle, W.knee, W.ankle));
      draw(nearFoot, footPath(pose.footHeel, pose.footToe));
      for (const node of legMarks) drawMark(node, bones[node._bone]);

      // 短裤：沿「腰口 → 髋 → 裤腿」三个横截面折过去的一条带。
      // 只用腰口和裤腿两个截面，在深蹲里会挤成一个三角楔，因为髋本身是个折角；
      // 中间补上髋这一层（取躯干和大腿两条前法线的角平分方向），折角才有地方落。
      // 腰口必须高于大腿在髋处的圆头（半径 W.thigh），否则大腿会从腰口上面鼓出来。
      // 它顺带盖住髋关节那条接缝，这是短裤在这套画法里必须存在的第二个理由。
      const waistT = 0.20;
      const waist = { x: hip.x + torsoUx * waistT, y: hip.y + torsoUy * waistT };
      const waistR = torsoR(waistT) * 1.06;
      const legUx = knee.x - hip.x;
      const legUy = knee.y - hip.y;
      const legLen = Math.hypot(legUx, legUy) || 1;
      const ln = frontNormal(legUx / legLen, legUy / legLen);
      // 角平分方向：两条前法线直接相加再归一化，不能喂给 frontNormal
      // （那个函数要的是骨轴方向，会对结果再转一次 90°，画出来是个自交的蝴蝶结）。
      let bx = tn.nx + ln.nx;
      let by = tn.ny + ln.ny;
      const blen = Math.hypot(bx, by);
      if (blen < 1e-3) { bx = tn.nx; by = tn.ny; } else { bx /= blen; by /= blen; }
      const bisec = bx < -1e-9 || (Math.abs(bx) <= 1e-9 && by > 0) ? { nx: -bx, ny: -by } : { nx: bx, ny: by };
      const hipR = W.torsoHip * 1.04;
      const hemT = 0.40;
      const hem = { x: hip.x + legUx * hemT, y: hip.y + legUy * hemT };
      const hemR = W.thigh * 1.18;
      const at3 = (p, n, r, side) => `${n1(p.x + n.nx * r * side)} ${n1(p.y + n.ny * r * side)}`;
      draw(shorts, `M${at3(waist, tn, waistR, 1)}` +
        `L${at3(hip, bisec, hipR, 1)}` +
        `L${at3(hem, ln, hemR, 1)}` +
        `L${at3(hem, ln, hemR, -1)}` +
        `L${at3(hip, bisec, hipR, -1)}` +
        `L${at3(waist, tn, waistR, -1)}Z`);

      // 近侧臂：举过头顶时画在头的后面（否则整个人变成一个没有头的兜帽），
      // 其余时候画在最前面。两套槽位每帧只填一套，另一套清空。
      const overhead = hand.y < head.y;
      const arm = overhead ? armBack : armFront;
      for (const node of armNodes(overhead ? armFront : armBack)) node.setAttribute("d", "");
      draw(arm.upper, taper(shoulder, elbow, W.upperArm, W.elbow));
      draw(arm.fore, taper(elbow, hand, W.elbow, W.wrist));
      for (const node of arm.marks) drawMark(node, bones[node._bone]);
    },

    paintProp(prop, pose) {
      if (!prop) {
        clearProp(propBack);
        clearProp(propFront);
        return;
      }
      const layer = prop.at === "back" ? propBack : propFront;
      clearProp(layer === propBack ? propFront : propBack);

      // 背上的杠跟躯干垂直（角度直接取 lean，不是 lean + π/2——
      // 后者会算出一根豎着的杆，这是契约里标过的坑）。
      // 不锁世界水平：人往前仆时杠会跟着背一起斜，锁死反而看着像秤杆。
      const half = (prop.kind === "dumbbell" ? 7 : prop.kind === "bar" ? 26 : 19) * scale;
      let center;
      let angle;
      if (prop.at === "back") {
        center = {
          x: pose.shoulder.x - Math.sin(pose.lean) * 4 * scale,
          y: pose.shoulder.y + Math.cos(pose.lean) * 4 * scale,
        };
        angle = pose.lean;
      } else {
        // 手里：杆跟着拳走，但保持水平（杠铃受重力，不会斜着挂）
        center = pose.hand;
        angle = 0;
      }

      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const a = { x: center.x - ux * half, y: center.y - uy * half };
      const b = { x: center.x + ux * half, y: center.y + uy * half };
      const rodR = (prop.kind === "bar" ? 1.2 : prop.kind === "dumbbell" ? 1.4 : 1.7) * scale;

      layer[0].setAttribute("d", taper(a, b, rodR, rodR));
      layer[3].setAttribute("d", taper(a, b, rodR, rodR));

      // 杠片：杆两端各一块厚圆片。引体那根是固定杆，没有片。
      if (prop.kind === "bar") {
        for (const i of [1, 2, 4, 5]) layer[i].setAttribute("d", "");
        return;
      }
      const plateR = (prop.kind === "dumbbell" ? 2.9 : 2.8) * scale;
      const plateH = (prop.kind === "dumbbell" ? 3.4 : 5.2) * scale;
      const px = -uy;
      const py = ux;
      const plate = p => taper(
        { x: p.x - px * plateH, y: p.y - py * plateH },
        { x: p.x + px * plateH, y: p.y + py * plateH },
        plateR,
        plateR,
      );
      layer[1].setAttribute("d", plate(a));
      layer[2].setAttribute("d", plate(b));
      layer[4].setAttribute("d", plate(a));
      layer[5].setAttribute("d", plate(b));
    },

    destroy() {
      target.innerHTML = "";
    },
  };
}

export default { createSkin };
