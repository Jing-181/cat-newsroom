// 线条稿皮肤：一副骨架画成一支笔的线条。
//
// 这一层只认「怎么画」——粗细层级、远侧的纵深、关节的转折、器械的形状。
// 它不认时间、不认动作，也不 import core / clips：拿到的永远只是一组关节点。
//
// 五条规矩，改之前先读：
// 1. 粗细是唯一的层级信号。深墨底上只剩一种米色，颜色帮不上忙，只有粗细分得开。
// 2. 纵深靠「细 + 淡 + 被挡住」，不靠平移。挪得多了是重影，挪得少了看不见；
//    真正表达「在后面」的是躯干把头、腿挡掉的那一截。
// 3. 头是空心的，所以「在头后面」的东西（颈、远侧肢、背上的杆）要用遮罩在脸前挖掉；
//    「在头前面」的东西（近侧手臂、手里的杆）画在头之后，靠不透明的笔画自己盖住头的轮廓。
//    上一版把手臂也塞进头的遮罩里，引体向上到顶点时整条手臂被脸吃光。
// 4. 同一副骨架在不同出场尺寸下不是同一张图。compact 只有两档线宽、没有关节圆点、
//    远侧肢默认不画；regular / full 才有三档和圆点。见 CONTRACT.md「尺寸档」。
// 5. paint 每帧调一次，里面不建 DOM、不量尺寸（尺寸只在 resize 和 ResizeObserver 里量）；
//    所有元素在 createSvgSkin 里就建好。

import { sizeTier, strokeUnits, measureHeight, TIERS } from "../optical.js";

const NS = "http://www.w3.org/2000/svg";

// 基础线宽，单位是身体单位，按 96px 出场尺寸调过：viewBox 106×122 缩到 96px 高时
// 1 单位 ≈ 0.79px。
//   contour 3.3 ≈ 2.6px  外轮廓：躯干、大腿
//   head    2.8 ≈ 2.2px  头（比四肢重、比躯干轻）
//   limb    2.15≈ 1.7px  四肢：小腿、上臂、前臂
//   foot    2.2 ≈ 1.7px  脚掌
//   neck    1.7 ≈ 1.3px  颈
//   bar     1.4 ≈ 1.1px  器械的杆
// 造型重定（2026-11-07）：头放大之后，原来的细胳膊细腿就变成了棒棒糖。
// 可爱不是「头大」，是「头大 + 身子也有点肉」，两条要一起给。
// 外轮廓从 3.3 提到 4.0、四肢从 2.15 提到 2.8，颈也跟着粗一档。
// 按参考图重定：细胳膊细腿 + 大脑袋。上一轮我把四肢加粗是加反了，
// 参考图里四肢占身高不到 3%，可爱全在头身比上，不在肉量上。
const WEIGHT = {
  contour: 3.4,
  head: 3.2,
  limb: 2.3,
  foot: 2.6,
  neck: 1.8,
  bar: 1.4,
};

// 每一档怎么改基础线宽。倍数只是微调，真正的差别是「画几档」和「画不画远侧肢」。
//
// compact（≤128px，就是教练小人真正出场的尺寸）：
//   只剩两档 —— 外轮廓 3.5 和其余 2.35。颈和杆并进第二档：1.7 和 1.4 在 96px 下
//   只剩 1.3px / 1.1px，夹在别的一堆线里读不出层级，只会变成一层灰。
//   关节圆点半径归零：2.1 单位在 96px 下约 1px，看不见，还占着关节缝。
//   远侧肢 "auto"：跟近侧腿没分开就不画（分腿蹲那种真两条腿才留一条淡的）。
const TIER_WIDTHS = {
  [TIERS.compact]: { contour: 1.06, head: 1.25, limb: 1.09, foot: 1.06, neck: 1.38, bar: 1.68, joint: 0, far: "auto" },
  [TIERS.regular]: { contour: 1, head: 1, limb: 1, foot: 1, neck: 1, bar: 1, joint: 0.95, far: "on" },
  [TIERS.full]: { contour: 1, head: 1, limb: 1, foot: 1, neck: 1, bar: 1, joint: 1.05, far: "on" },
};

// 远侧肢体 = 近侧 × 0.7。只细不淡读成第二条近腿，只淡不细读成脏。
const FAR_SCALE = 0.7;
const FAR_OPACITY = "0.45";
// 远侧错开一点点。重点不在这个数，在于远侧永远比近侧细这么一档：
// 两条腿重合时读出一条带虚边的腿，分开时（分腿蹲）才是一条独立的腿。
const FAR_OFFSET = 1.2;
// compact 下远侧腿要「真分开」才画。低于这个距离的两个关节画出来只是重叠的影子。
const FAR_MIN_SPREAD = 4.5;

// 关节点。收一点骨头的端头，用一个圆点把缝填上：
// 硬角是工程图，圆角才是关节。
const JOINT_GAP = 0.4;
const JOINT_R = 0;   // 参考图没有关节圆点，一个都没有

// 躯干微弧的鼓度。直躯干读起来是尺子，弧一点点才读成背和胸。
const SPINE_BULGE = 1.3;

// 四肢的弓度。大腿往前鼓、小腿往后鼓，一前一后才读成一条腿而不是两根棍。
// 手臂同理：上臂向外、前臂向内回，弯举那个动作才看得出是在弯。
const BOW_THIGH = 1.5;
const BOW_SHIN = -1.0;
const BOW_UPPER = 0.9;
const BOW_FORE = -0.6;
// 脚掌魅起一点。一条水平线读成尺子，魅起来的才是脚。
const TOE_LIFT = 1.2;
// 躺姿的鼓度要大得多：躯干、大腿在躺姿里是共线的一条横线，
// 弧起来之后背和腿才分得开。
const SPINE_BULGE_FLAT = 2.8;
// 躺姿的躯干不是一条中轴线，而是「中轴 + 胸面」两条弧：
// 一根横线永远读成横杆，多一道胸面的边它才是「躺着的人」。
// 不做成上下对称的带：大腿在躺姿里就压在中轴上，再画下半条就会把腿包进去。
const CHEST_DEPTH = 3.9;
// 躺姿下大腿的弧度。不弯一下，大腿和躯干就是同一条横线，腿和膝都读不出来。
const THIGH_BOW = 3.0;
// 躯干接近水平就算「躺着」：|cos lean| 小于这个值约等于倾角超过 65°。
// 卧推是 90°、平板支撑是 86°，别的动作都在这条线以下。
const FLAT_TUNK_COS = 0.42;

// 头按骨架给的头半径再收一点，并沿脊柱方向抬一点：
// 骨架里颈长 9、头半径 7，头底离肩只剩 2 个单位，颈线根本露不出来。收小 + 上抬，
// 颈才有长度可画 —— 头和身体就是这么接上的，不是靠画得更大。
//
// 2026-11-07 重新定造型：「不够可爱」的根源就是头太小。
// 现在放到 1.16 倍（头直径约 16 单位，全身 97.5，约 1/6），并且画得比髂微宽——
// 正圆读成球，微宽才读成脸。这是**风格选择，不是解剖**，比例数字没变。
const HEAD_SCALE = 1.45;
const HEAD_LIFT = 1.5;
// 躺姿再多抬一点：侧视里头和肩是并排的，不拉开一点，手臂看上去就像从脑袋上长出来的。
const HEAD_LIFT_FLAT = 2.2;

const num = v => v.toFixed(1);
const pt = p => `${num(p.x)} ${num(p.y)}`;

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// 从 a 朝 b 走 k 个单位。k 夹在骨长的 45% 以内，短骨上不至于收到翻过去。
const along = (a, b, k) => {
  const d = dist(a, b) || 1;
  const t = Math.min(k / d, 0.45);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

// 一段骨：两端各收 gap，关节处留缝给圆点。
const bone = (a, b, gap = 0) => (gap
  ? `M${pt(along(a, b, gap))}L${pt(along(b, a, gap))}`
  : `M${pt(a)}L${pt(b)}`);

// 躯干：一条二次弧，鼓向面朝方向（+x）。髋到肩之间只有一个控制点。
const trunkNormal = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx < 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
};

const spine = (a, b, bulge) => {
  const n = trunkNormal(a, b);
  return `M${pt(a)}Q${num((a.x + b.x) / 2 + n.x * bulge)} ${num((a.y + b.y) / 2 + n.y * bulge)} ${pt(b)}`;
};

// 一段带弧的肢：两端各收 gap 留关节缝，中间沿朝前方向鼓 bow 个单位。
// 直段 + 圆头读起来是机械臂；弧一点点，大腿才有腹、小腿才有腓肠肌。
// bow 可以为负（小腿往身后鼓）。
const bent = (a, b, bow, gap = 0) => {
  const A = gap ? along(a, b, gap) : a;
  const B = gap ? along(b, a, gap) : b;
  const n = trunkNormal(A, B);
  const mx = (A.x + B.x) / 2 + n.x * bow;
  const my = (A.y + B.y) / 2 + n.y * bow;
  return `M${pt(A)}Q${num(mx)} ${num(my)} ${pt(B)}`;
};

// 一段带锥度的肢：宽端在身侧、窄端在末端，两头用半圆封口。
// 等粗的圆头线不管多粗都读成管子；人腿是上粗下细的，那点锥度才是「肉」。
const limbNormal = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: -dy / L, y: dx / L };
};
// wa 在 a 端，wb 在 b 端。bow 让中段外弓，锥度才不变成一根直梯。
const limbShape = (a, b, wa, wb, bow = 0) => {
  const n = limbNormal(a, b);
  const wm = (wa + wb) / 2;
  const at = (p, w, sign) => `${num(p.x + n.x * w * sign)} ${num(p.y + n.y * w * sign)}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const c1 = `${num(mx + n.x * (wm + bow))} ${num(my + n.y * (wm + bow))}`;
  const c2 = `${num(mx - n.x * (wm + bow))} ${num(my - n.y * (wm + bow))}`;
  return [
    `M${at(a, wa, 1)}`,
    `Q${c1} ${at(b, wb, 1)}`,
    `A${num(wb)} ${num(wb)} 0 0 0 ${at(b, wb, -1)}`,
    `Q${c2} ${at(a, wa, -1)}`,
    `A${num(wa)} ${num(wa)} 0 0 0 ${at(a, wa, 1)}`,
    "Z",
  ].join("");
};

function stroke(parent, className, attrs = {}) {
  const node = document.createElementNS(NS, "path");
  node.setAttribute("class", className);
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "0");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function disc(parent, className, radius, { filled = false, width = 0 } = {}) {
  const node = document.createElementNS(NS, "circle");
  node.setAttribute("class", className);
  node.setAttribute("r", String(radius));
  node.setAttribute("fill", filled ? "currentColor" : "none");
  if (!filled) {
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", String(width));
  }
  parent.append(node);
  return node;
}

// 器械参数。三种杆的差别不只是长度：杠铃两头有杠片，引体杆没有，哑铃是两头实心小片。
// 认不出是哪个，器械就白画了。
const PROPS = {
  barbell: { half: 18, plate: 2.9 },
  bar: { half: 26, plate: 0 },
  dumbbell: { half: 7, plate: 2.6 },
};

// 同一页可能有十几个人偶，mask id 必须各自唯一，否则后面的图会被前面的遮罩吃掉。
let instances = 0;

export function createSvgSkin(svg, {
  proportions = {},
  farOffset = FAR_OFFSET,
  strokeWidth = {},
  headScale = HEAD_SCALE,
  headLift = HEAD_LIFT,
  jointRadius = JOINT_R,
  body = "stick",   // "stick" 骨架线 | "shape" 带锥度的实心剪影
  jointGap = JOINT_GAP,
} = {}) {
  const P = { headRadius: 7, ...proportions };
  const BASE = { ...WEIGHT, ...strokeWidth };

  const headRx = P.headRadius * headScale * 1.0;
  const headRy = P.headRadius * headScale * 0.96;
  // 遮罩往外扩的量：被挡住的东西要留一道缝，贴着描边太紧会像没画完。
  // 头的扩边要更小：头靠近肩，扩多了会把整条手臂和颈一起吃掉（引体向上到顶点时最明显）。
  const CUT_PAD = 1.6;
  const HEAD_CUT_PAD = 0.6;

  svg.innerHTML = "";

  // ── 两套遮罩 ──
  // body：躯干。远侧腿经过躯干时被切断，这才叫「在后面」。
  // head：头。头是空心的（fill: none），所以画在它后面的东西会从脸里穿出来 ——
  //   颈、远侧肢、背上的杆全都要在脸前断开。头自己不在遮罩里，它就是那把刀。
  // 用 mask 而不是把背景色画上去：底色是暖棕渐变，涂不出「无」。
  //
  // 手臂和手里那根杆故意不挂 head 遮罩：它们本来就在头前面。
  // 同色、不透明的笔画画在头之后，自然盖住头轮廓的那一小段 —— 遮挡关系自己就成立了。
  const maskId = `line-body-${++instances}`;
  const headMaskId = `line-head-${++instances}`;
  const defs = document.createElementNS(NS, "defs");
  svg.append(defs);

  const makeMask = id => {
    const mask = document.createElementNS(NS, "mask");
    mask.setAttribute("id", id);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    // 创建时就给一个足够大的默认范围：mask 不铺满画面时，挂在它下面的东西会整个消失。
    // 不能指望宿主一定调 resize —— 对照页就是自己设 viewBox、不调 resize 的。
    mask.setAttribute("x", "-300");
    mask.setAttribute("y", "-400");
    mask.setAttribute("width", "600");
    mask.setAttribute("height", "600");
    const base = document.createElementNS(NS, "rect");
    base.setAttribute("x", "-300");
    base.setAttribute("y", "-400");
    base.setAttribute("width", "600");
    base.setAttribute("height", "600");
    base.setAttribute("fill", "#fff");
    mask.append(base);
    defs.append(mask);
    return { mask, base };
  };
  const bodyMask = makeMask(maskId);
  const headMask = makeMask(headMaskId);

  const headCut = document.createElementNS(NS, "ellipse");
  headCut.setAttribute("fill", "#000");
  headMask.mask.append(headCut);

  // ── 层序就是 z 序，从后往前 ──
  // 背上的杆 → 远侧腿（被躯干切断）→ 躯干 → 近侧腿 → 颈 → 头 → 近侧手臂 → 关节 → 手里的杆。
  // 头之前的一切都被头的遮罩在脸前挖掉；头之后的（手臂、正面器械）画在头上面。
  const figure = document.createElementNS(NS, "g");
  figure.setAttribute("class", "fig-body");
  figure.setAttribute("mask", `url(#${headMaskId})`);
  svg.append(figure);

  const propBack = document.createElementNS(NS, "g");
  propBack.setAttribute("class", "fig-prop");
  figure.append(propBack);

  const farGroup = document.createElementNS(NS, "g");
  farGroup.setAttribute("class", "fig-far-group");
  farGroup.setAttribute("mask", `url(#${maskId})`);
  figure.append(farGroup);
  const farFoot = stroke(farGroup, "fig-far", { opacity: FAR_OPACITY });
  const farThigh = stroke(farGroup, "fig-far", { opacity: FAR_OPACITY });
  const farShin = stroke(farGroup, "fig-far", { opacity: FAR_OPACITY });

  const torso = stroke(figure, "fig-torso");
  const torsoBack = stroke(figure, "fig-torso");
  const torsoCut = stroke(bodyMask.mask, "fig-cut", { stroke: "#000" });

  const thigh = stroke(figure, "fig-limb");
  const shin = stroke(figure, "fig-limb");
  const foot = stroke(figure, "fig-foot");
  const pelvis = stroke(figure, "fig-pelvis");
  const neck = stroke(figure, "fig-neck");

  // 头是 <ellipse> 而不是 <circle>：竖着略长一点才像头，正圆永远读成「球」。
  const head = document.createElementNS(NS, "ellipse");
  head.setAttribute("class", "fig-head");
  head.setAttribute("fill", "none");
  head.setAttribute("stroke", "currentColor");
  head.setAttribute("stroke-width", "0");
  head.setAttribute("rx", String(headRx));
  head.setAttribute("ry", String(headRy));
  svg.append(head);

  // 手臂在头之后：引体、推举时手臂就是从头前面过去的，
  // 挂在头遮罩里会被脸整段切掉，顶点看上去像没胳膊。
  const armGroup = document.createElementNS(NS, "g");
  armGroup.setAttribute("class", "fig-arm-group");
  svg.append(armGroup);
  const upperArm = stroke(armGroup, "fig-arm");
  const forearm = stroke(armGroup, "fig-arm");

  const jointGroup = document.createElementNS(NS, "g");
  jointGroup.setAttribute("class", "fig-joint-group");
  svg.append(jointGroup);
  const joints = [0, 1, 2].map(() => disc(jointGroup, "fig-joint", 0, { filled: true }));
  // 手：一个小的实心圆当作拳。手臂直接断在腕上，读起来像被截了。
  const mitts = [0, 1].map(() => disc(jointGroup, "fig-joint", 0, { filled: true }));

  // ── 正面骨架的节点 ──
  // 单独一套，不跟侧面共用：侧面那套里「远侧腿错开 1.2 单位假装前后」的技巧
  // 到了正面全部站不住（正面两侧是等距的）。两套各自管自己。
  // 躯干画成梯形而不是一根线：正面只剩四条胶体加一根中轴，不画外形就是一团线。
  const frontGroup = document.createElementNS(NS, "g");
  frontGroup.setAttribute("class", "fig-front");
  svg.append(frontGroup);
  const F = {
    torso: stroke(frontGroup, "fig-torso"),
    // 肩线和髖线：四肢接在 ±10 两侧，脊柱在中轴 0，不加这两条线身体就是断的。
    // 只是一条线，不是一块面——风格不变。
    girdle: stroke(frontGroup, "fig-limb"),
    neck: stroke(frontGroup, "fig-neck"),
    thighN: stroke(frontGroup, "fig-limb"),
    shinN: stroke(frontGroup, "fig-limb"),
    footN: stroke(frontGroup, "fig-foot"),
    thighF: stroke(frontGroup, "fig-limb"),
    shinF: stroke(frontGroup, "fig-limb"),
    footF: stroke(frontGroup, "fig-foot"),
    armN: stroke(frontGroup, "fig-arm"),
    foreN: stroke(frontGroup, "fig-arm"),
    armF: stroke(frontGroup, "fig-arm"),
    foreF: stroke(frontGroup, "fig-arm"),
    dots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => disc(frontGroup, "fig-joint", 0, { filled: true })),
  };
  const frontHead = document.createElementNS(NS, "ellipse");
  frontHead.setAttribute("class", "fig-head");
  frontHead.setAttribute("fill", "none");
  frontHead.setAttribute("stroke", "currentColor");
  frontHead.setAttribute("stroke-width", "0");
  frontHead.setAttribute("rx", String(headRx));
  frontHead.setAttribute("ry", String(headRy));
  svg.append(frontHead);

  const propFront = document.createElementNS(NS, "g");
  propFront.setAttribute("class", "fig-prop");
  svg.append(propFront);

  // 器械：一根有粗细的杆 + 两头的杠片。杆用一条圆头线画，本身就是有宽度的杆；
  // 两条平行的细线拼出来的杆，在 96px 下会糊成一团。
  const makeProp = group => {
    const bar = stroke(group, "fig-prop");
    const plateA = disc(group, "fig-prop-plate", 0, { filled: true });
    const plateB = disc(group, "fig-prop-plate", 0, { filled: true });
    // 正面视角两只手各有一件器械（哑铃一对），所以杆和杠片各多一套。
    const bar2 = stroke(group, "fig-prop");
    const plate2A = disc(group, "fig-prop-plate", 0, { filled: true });
    const plate2B = disc(group, "fig-prop-plate", 0, { filled: true });
    // 绳索、凳子、训练椅不是杆，单给两条路径：它们的位置由身体推出来，
    // 不是「手里一根东西」。挂在同一组里是为了叠层顺序一致（凳在身后、绳在身前）。
    const rope = stroke(group, "fig-prop");
    const frame = stroke(group, "fig-prop");
    return { bar, plateA, plateB, bar2, plate2A, plate2B, rope, frame };
  };
  const propBackParts = makeProp(propBack);
  const propFrontParts = makeProp(propFront);

  const hideProp = parts => {
    for (const node of [parts.bar, parts.bar2, parts.rope, parts.frame]) node.setAttribute("d", "");
    for (const node of [parts.plateA, parts.plateB, parts.plate2A, parts.plate2B]) node.setAttribute("r", "0");
  };

  // ── 尺寸档 ──
  // 尺寸只在这里量，paint 里不读布局。
  // 量不到（还没挂进文档、或者 display:none）时返回 false，由 ResizeObserver
  // 或 paint 的前几次探针补上。
  let pxHeight = 0;
  let tier = TIERS.full;
  let styled = false;
  let probes = 0;
  let cutNormal = 5;
  let cutFlat = 12;

  const applyStyle = () => {
    const tuning = TIER_WIDTHS[tier] || TIER_WIDTHS[TIERS.full];
    // 参考尺寸（96px）→ 当前尺寸的光学缩放。线宽以 px 为准，不跟着 viewBox 等比缩放。
    const f = strokeUnits(pxHeight || 96, 1);
    const w = key => BASE[key] * (tuning[key] ?? 1) * f;

    const contour = w("contour");
    const limb = w("limb");

    torso.setAttribute("stroke-width", num(contour));
    torsoBack.setAttribute("stroke-width", num(contour * 0.9));
    torsoCut.setAttribute("stroke-width", num(contour + CUT_PAD));
    cutNormal = contour + CUT_PAD;
    cutFlat = contour + 7;    // 躺姿要遮住整条身子，不然远侧腿会从躯干里面露出来
    thigh.setAttribute("stroke-width", num(contour));
    pelvis.setAttribute("stroke-width", num(contour * 0.78));
    shin.setAttribute("stroke-width", num(limb));
    foot.setAttribute("stroke-width", num(w("foot")));
    neck.setAttribute("stroke-width", num(w("neck")));
    head.setAttribute("stroke-width", num(w("head")));
    upperArm.setAttribute("stroke-width", num(limb));
    forearm.setAttribute("stroke-width", num(limb));

    farThigh.setAttribute("stroke-width", num(contour * FAR_SCALE));
    farShin.setAttribute("stroke-width", num(limb * FAR_SCALE));
    farFoot.setAttribute("stroke-width", num(w("foot") * FAR_SCALE));

    // 正面骨架：躯干给外轮廓宽度，四肢跟侧面同一档，头同头。
    F.torso.setAttribute("stroke-width", num(contour));
    F.girdle.setAttribute("stroke-width", num(limb));
    F.neck.setAttribute("stroke-width", num(w("neck")));
    for (const node of [F.thighN, F.thighF]) node.setAttribute("stroke-width", num(contour));
    for (const node of [F.shinN, F.shinF]) node.setAttribute("stroke-width", num(limb));
    for (const node of [F.footN, F.footF]) node.setAttribute("stroke-width", num(w("foot")));
    for (const node of [F.armN, F.foreN, F.armF, F.foreF]) node.setAttribute("stroke-width", num(limb));
    frontHead.setAttribute("stroke-width", num(w("head")));

    // 关节圆点的半径也走光学缩放：它和线一样，跟着 viewBox 等比就会在小图上消失。
    const joint = jointRadius * tuning.joint * f;
    for (const dot of joints) dot.setAttribute("r", joint > 0.05 ? String(joint) : "0");
    for (const dot of F.dots) dot.setAttribute("r", joint > 0.05 ? String(joint) : "0");
    // 手是一个小实心圆。它不跟着关节半径走——参考图里没有关节点，但有手。
    const mittR = 1.7 * f;
    for (const mitt of mitts) mitt.setAttribute("r", mittR > 0.05 ? String(mittR) : "0");

    // 器械的杆比四肢细一档，但 compact 下跟第二档同粗（见 TIER_WIDTHS 的注释）。
    // 绳索和凳子/训练椅也必须在这里设宽度：它们是后加的节点，漏了就会 stroke-width 0，
    // 路径数据都在，但屏幕上什么都不出。
    for (const parts of [propBackParts, propFrontParts]) {
      parts.bar.setAttribute("stroke-width", num(w("bar")));
      parts.bar2.setAttribute("stroke-width", num(w("bar")));
      parts.rope.setAttribute("stroke-width", num(w("bar") * 0.6));
      parts.frame.setAttribute("stroke-width", num(w("bar") * 0.92));
    }

    styled = true;
  };

  const measure = () => {
    const h = measureHeight(svg);
    if (!(h > 0)) return false;
    const changed = Math.abs(h - pxHeight) > 0.5;
    pxHeight = h;
    const next = sizeTier(pxHeight);
    if (next !== tier || changed || !styled) {
      tier = next;
      applyStyle();
    }
    return true;
  };

  // 宿主改尺寸（旋转、窗口缩放、对照页切尺寸按钮）只有这里知道，不是每帧去量。
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure()) : null;
  if (observer) observer.observe(svg);
  measure();
  // 量不到尺寸（元素还没挂进文档）也先给一套线宽：
  // stroke-width 初始是 0，万一后面没人再调，整个小人会变成透明的。
  if (!styled) applyStyle();

  // 支撑物：练凳、椅子。它们承托身体，所以永远画在身后一层，不能压在人身上。
  const drawFrame = (parts, kind, pose) => {
    const top = pose.hip.y + 3;              // 垫面比髖线低一点，人是压在它上面的
    // 身子朝 +x，所以「身后」是 -x。卧推的垫面往头那侧铺到肩外；坐姿的椅面往身后铺出靠背。
    const front = kind === "bench" ? pose.shoulder.x + 8 : pose.hip.x + 8;
    const back = pose.hip.x - 9;
    const d = [
      // 垫面画两条平行线：一条线读成一根棍，两条才读成有厚度的垫子。
      `M${pt({ x: back, y: top - 1.4 })}L${pt({ x: front, y: top - 1.4 })}`,
      `M${pt({ x: back, y: top + 1.4 })}L${pt({ x: front, y: top + 1.4 })}`,
    ];
    if (kind === "bench") {
      // 训练椅的腿是外撇的 A 形。两根竖直棍子画出来是张桌子，不是器械。
      d.push(`M${pt({ x: back + 4, y: top + 1.4 })}L${pt({ x: back - 1, y: 0 })}`);
    } else {
      d.push(`M${pt({ x: back + 4, y: top + 1.4 })}L${pt({ x: back + 1, y: 0 })}`);
      d.push(`M${pt({ x: front - 4, y: top + 1.4 })}L${pt({ x: front - 1, y: 0 })}`);
      // 靠背：坐姿必须有，否则人悬空坐着跟骑马步没区别
      d.push(`M${pt({ x: back, y: top - 1.4 })}L${pt({ x: back, y: pose.shoulder.y + 2 })}`);
    }
    parts.frame.setAttribute("d", d.join(""));
  };

  const drawProp = (parts, prop, pose) => {
    // 绳索：从上方滑轮垂到手上。下压、下拉的器械是「手被绳子牵着走」，
    // 不画绳的话人只是在空握着手上下摆。
    if (prop.kind === "cable") {
      // 滑轮要真在头顶之上、往前一点点。贴着脑袋挂会被读成「头上粘了个球」，
      // 而且绳子太短的时候看不出「手被绳子牵着走」这件事。
      const pulley = { x: pose.shoulder.x + 13, y: -108 };
      parts.rope.setAttribute("d", `M${pt(pulley)}L${pt(pose.hand)}`);
      parts.plateA.setAttribute("cx", num(pulley.x));
      parts.plateA.setAttribute("cy", num(pulley.y));
      parts.plateA.setAttribute("r", "2.2");
      return;
    }

    // 凳子 / 训练椅：躺着、坐着这两种体位必须有支撑物。
    // 没有它，卧推就是一条水平的身子浮在空中，大腿和躯干又是同一高度的两条横线，
    // 叠成一条之后只剩一根竖着的小腿，读起来像「身上戳了一根棍」。
    if (prop.kind === "bench" || prop.kind === "seat") {
      drawFrame(parts, prop.kind, pose);
      return;
    }

    const spec = PROPS[prop.kind] || PROPS.barbell;
    // 正面视角的哑铃：轴指向镜头，投影本来就是一个点。
    // 画成一根横杆会被读成杠铃的端面，而且是左右各一根，看着像两根杠。
    if (pose.handNear && prop.kind === "dumbbell") {
      for (const [hand, plate] of [[pose.handNear, parts.plateA], [pose.handFar, parts.plateB]]) {
        plate.setAttribute("cx", num(hand.x));
        plate.setAttribute("cy", num(hand.y));
        plate.setAttribute("r", String(spec.plate * 0.95));
      }
      return;
    }

    // 正面视角的杠铃跨在两只手之间，不是挂在单只手上。
    // 半长也取两手间距的一半再加出头，否则杆会比肩窄，读成一根短棍。
    const gripHalf = pose.handNear && prop.kind === "barbell"
      ? Math.abs(pose.handNear.x - pose.handFar.x) / 2 + 8
      : spec.half;
    let center;
    let angle;

    if (prop.at === "back") {
      // 背蹲：杆压在上背，杆与脊柱垂直。脊柱方向是 (sin L, -cos L)，
      // 屏幕上的垂线是 (cos L, sin L)，所以角度就是 lean —— 加了 90° 会把杆画成竖的。
      center = {
        x: pose.shoulder.x - Math.sin(pose.lean) * 4,
        y: pose.shoulder.y + Math.cos(pose.lean) * 4,
      };
      angle = pose.lean;
    } else {
      // 手里：引体、卧推、硬拉。杆跟着拳走，但保持水平（杠铃受重力，不会斜着挂）。
      center = pose.handNear
        ? { x: (pose.handNear.x + pose.handFar.x) / 2, y: (pose.handNear.y + pose.handFar.y) / 2 }
        : pose.hand;
      angle = 0;
    }

    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const a = { x: center.x - ux * gripHalf, y: center.y - uy * gripHalf };
    const b = { x: center.x + ux * gripHalf, y: center.y + uy * gripHalf };
    parts.bar.setAttribute("d", `M${pt(a)}L${pt(b)}`);

    // 杠片是实心小圆盘。空心环跟脑袋是同一个形状语言，三个圈并排就读成三个球了。
    for (const [plate, point] of [[parts.plateA, a], [parts.plateB, b]]) {
      plate.setAttribute("cx", num(point.x));
      plate.setAttribute("cy", num(point.y));
      plate.setAttribute("r", String(spec.plate));
    }

    // 正面视角：两只手各一件。杠铃本来就是一根杆两端，不是两件东西，
    // 所以这里只给哑铃（和任何「单件在手」的器械）补另一只手。
    if (pose.handFar && prop.kind !== "barbell" && prop.kind !== "bar") {
      const c2 = pose.handFar;
      const a2 = { x: c2.x - spec.half, y: c2.y };
      const b2 = { x: c2.x + spec.half, y: c2.y };
      parts.bar2.setAttribute("d", `M${pt(a2)}L${pt(b2)}`);
      for (const [plate, point] of [[parts.plate2A, a2], [parts.plate2B, b2]]) {
        plate.setAttribute("cx", num(point.x));
        plate.setAttribute("cy", num(point.y));
        plate.setAttribute("r", String(spec.plate));
      }
    }
  };

  // 远侧腿错开一点点：整体往身后挪一个单位多。
  const back = p => ({ x: p.x - farOffset, y: p.y });

  const setHeadCut = (node, x, y) => {
    node.setAttribute("cx", num(x));
    node.setAttribute("cy", num(y));
    node.setAttribute("rx", String(headRx + HEAD_CUT_PAD));
    node.setAttribute("ry", String(headRy + HEAD_CUT_PAD));
  };

  // 正面渲染。两侧等距，所以没有「远近肢」，也没有遮挡要处理。
  const paintFront = pose => {
    const seg = (a, b) => `M${pt(a)}L${pt(b)}`;

    // 躯干就是一条线。不做梯形、不加厚度：这套系统的形语言是单线，
    // 一旦给躯干加外形，四肢和头也得跟着加，整套就变成另一个风格了。
    // 正面的身份靠「两侧对称」，不靠身体形状。
    F.torso.setAttribute("d", seg(pose.hip, pose.shoulder));
    F.girdle.setAttribute("d", `${seg(pose.hipFar, pose.hipNear)}${seg(pose.shoulderFar, pose.shoulderNear)}`);

    F.neck.setAttribute("d", seg(pose.shoulder, along(pose.head, pose.shoulder, headRy)));
    frontHead.setAttribute("cx", num(pose.head.x));
    frontHead.setAttribute("cy", num(pose.head.y));
    // 躺姿时头在最远端，半径要跟着投影缩（core 已经把值算好放在 pose.headR）
    const hr = pose.headR ?? headRx;
    frontHead.setAttribute("rx", String(hr));
    frontHead.setAttribute("ry", String(hr));

    // 侧面那套的弓度直接搬过来用，近侧向外、远侧向外（trunkNormal 永远指向 +x，所以符号相反）
    F.thighN.setAttribute("d", bent(pose.hipNear, pose.kneeNear, 0.9, jointGap));
    F.shinN.setAttribute("d", bent(pose.kneeNear, pose.ankleNear, -0.6, jointGap));
    F.footN.setAttribute("d", bent(pose.footHeel, { x: pose.footToe.x, y: pose.footToe.y - TOE_LIFT }, 0));
    F.thighF.setAttribute("d", bent(pose.hipFar, pose.kneeFar, -0.9, jointGap));
    F.shinF.setAttribute("d", bent(pose.kneeFar, pose.ankleFar, 0.6, jointGap));
    F.footF.setAttribute("d", bent(pose.footHeelFar, { x: pose.footToeFar.x, y: pose.footToeFar.y - TOE_LIFT }, 0));

    F.armN.setAttribute("d", bent(pose.shoulderNear, pose.elbowNear, 0.6, jointGap));
    F.foreN.setAttribute("d", bent(pose.elbowNear, pose.handNear, -0.4, jointGap));
    F.armF.setAttribute("d", bent(pose.shoulderFar, pose.elbowFar, -0.6, jointGap));
    F.foreF.setAttribute("d", bent(pose.elbowFar, pose.handFar, 0.4, jointGap));

    const dots = [
      pose.hipNear, pose.hipFar, pose.kneeNear, pose.kneeFar,
      pose.shoulderNear, pose.shoulderFar, pose.elbowNear, pose.elbowFar,
      pose.handNear, pose.handFar,
    ];
    F.dots.forEach((dot, i) => {
      dot.setAttribute("cx", num(dots[i].x));
      dot.setAttribute("cy", num(dots[i].y));
    });
  };

  // ── 轮廓造型（body: "shape"）──
  // 火柴人没有身体宽度，所以不管线多粗都读成骨架。这个造型给每段肢体一个锥度，
  // 用闭合路径填成实心剪影——这是唯一能让 96px 下读成「人」而不是「符号」的做法。
  // 关节的位置一点没动，变的只是怎么画。
  const paintShape = pose => {
    const toe = { x: pose.footToe.x, y: pose.footToe.y - TOE_LIFT };
    const skull = { x: pose.head.x, y: pose.head.y - 0.5 };

    torso.setAttribute("d", limbShape(pose.hip, pose.shoulder, 5.0, 5.6, 0.8));
    torsoBack.setAttribute("d", "");
    torsoCut.setAttribute("d", "");
    pelvis.setAttribute("d", "");
    neck.setAttribute("d", limbShape(pose.shoulder, skull, 2.2, 1.6));

    head.setAttribute("cx", num(skull.x));
    head.setAttribute("cy", num(skull.y));
    head.setAttribute("rx", String(headRx * 1.08));
    head.setAttribute("ry", String(headRy * 1.12));

    thigh.setAttribute("d", limbShape(pose.hip, pose.knee, 4.4, 2.9, 0.4));
    shin.setAttribute("d", limbShape(pose.knee, pose.ankle, 2.7, 1.5, -0.25));
    foot.setAttribute("d", limbShape(pose.footHeel, toe, 1.5, 1.3, 0));
    upperArm.setAttribute("d", limbShape(pose.shoulder, pose.elbow, 2.5, 1.9, 0.2));
    forearm.setAttribute("d", limbShape(pose.elbow, pose.hand, 1.8, 1.0, -0.15));

    // 远侧：同样的形，细一档。侧视里它就是第二层。
    farThigh.setAttribute("d", limbShape(back(pose.hip), back(pose.kneeFar), 4.0, 2.6, 0.4));
    farShin.setAttribute("d", limbShape(back(pose.kneeFar), back(pose.ankleFar), 2.4, 1.3, -0.25));
    farFoot.setAttribute("d", limbShape(back(pose.footHeelFar), back({ x: pose.footToeFar.x, y: pose.footToeFar.y - TOE_LIFT }), 1.3, 1.1, 0));

    for (const dot of joints) dot.setAttribute("r", "0");
  };

  return {
    resize(viewBox) {
      if (viewBox) svg.setAttribute("viewBox", viewBox);
      // mask 的默认范围故意给得很大，这里只是把它收到视图附近：
      // 范围太小时远侧腿会在画面边缘被切一刀，而且没人会注意到是 mask 干的。
      const [x, y, w, h] = String(viewBox || "").split(/[\s,]+/).map(Number);
      if ([x, y, w, h].every(Number.isFinite)) {
        for (const { mask, base } of [bodyMask, headMask]) {
          for (const node of [mask, base]) {
            node.setAttribute("x", String(x - 24));
            node.setAttribute("y", String(y - 24));
            node.setAttribute("width", String(w + 48));
            node.setAttribute("height", String(h + 48));
          }
        }
      }
      // 尺寸在设完 viewBox 之后量：viewBox 决定宽高比，宽高比决定渲染高度。
      measure();
    },

    paint(pose) {
      if (body === "shape") { paintShape(pose); return; }
      // 量不到尺寸时（宿主还没挂进文档）再补量几次，之后就再也不读了。
      if (!(pxHeight > 0) && probes < 8) { probes++; measure(); }

      // 正面视角走另一条渲染路径。两套图形互斥显示，不是叠加：
      // 侧面那套里很多技巧（远侧错位、头遮罩切臂、躺姿胸面）在正面都是错的。
      if (pose.shoulderNear) {
        if (figure.style.display !== "none") {
          figure.style.display = "none";
          armGroup.style.display = "none";
          head.style.display = "none";
          jointGroup.style.display = "none";
          frontGroup.style.display = "";
          frontHead.style.display = "";
        }
        paintFront(pose);
        return;
      }
      if (frontGroup.style.display !== "none") {
        figure.style.display = "";
        armGroup.style.display = "";
        head.style.display = "";
        jointGroup.style.display = "";
        frontGroup.style.display = "none";
        frontHead.style.display = "none";
      }

      // 远侧腿：细、淡、错开。被躯干和头挡住的一段由 mask 切掉。
      // compact 下只有在「真分开了」的时候才画：96px 下两条重合的腿只会糊成一条脏边。
      const farAuto = TIER_WIDTHS[tier]?.far === "auto";
      const spread = Math.max(dist(pose.kneeFar, pose.knee), dist(pose.ankleFar, pose.ankle));
      const showFar = !farAuto || spread > FAR_MIN_SPREAD;
      farGroup.style.display = showFar ? "" : "none";
      if (showFar) {
        farThigh.setAttribute("d", bone(back(pose.hip), back(pose.kneeFar)));
        farShin.setAttribute("d", bone(back(pose.kneeFar), back(pose.ankleFar)));
        farFoot.setAttribute("d", bone(back(pose.footHeelFar), back(pose.footToeFar)));
      }

      // 头沿脊柱方向抬一点，颈才有长度。躺姿多抬一点：头和肩在侧视里是并排的，
      // 不拉开一点，手臂看上去就像从脑袋上长出来的。
      const flatTrunk = Math.abs(Math.cos(pose.lean)) < FLAT_TUNK_COS;
      const lift = flatTrunk ? headLift + HEAD_LIFT_FLAT : headLift;

      // 躺姿下先定「胸在哪一侧」：骨架没规定，由手臂倒推 —— 胳膊往哪边抬，哪边就是胸。
      // 躯干的厚度、大腿往哪边弧、头坐在哪条线上都看它。
      let chest = null;
      if (flatTrunk) {
        const n = trunkNormal(pose.hip, pose.shoulder);
        const towardArm = n.x * (pose.elbow.x - pose.shoulder.x) + n.y * (pose.elbow.y - pose.shoulder.y);
        chest = towardArm >= 0 ? n : { x: -n.x, y: -n.y };
      }

      // 躺下时头坐在躯干的中间层，不是坐在躯干下沿：
      // 不抬这一下，头看上去是挂在胸下面的一只轮子。
      const skull = {
        x: pose.head.x + Math.sin(pose.lean) * lift + (chest ? chest.x * CHEST_DEPTH * 0.5 : 0),
        y: pose.head.y - Math.cos(pose.lean) * lift + (chest ? chest.y * CHEST_DEPTH * 0.5 : 0),
      };

      if (flatTrunk) {
        // 躺姿：中轴 + 一道胸面的边，躯干才有厚度；髋上一道竖线收口，顺便标出骨盆。
        // 两头不用封口：肩那一头钻进头里（被头的遮罩切掉），髋那一头靠这道收口。
        const at = (p, k) => ({ x: p.x + chest.x * k, y: p.y + chest.y * k });

        torso.setAttribute("d", spine(at(pose.hip, CHEST_DEPTH), at(skull, CHEST_DEPTH), SPINE_BULGE_FLAT));
        torsoBack.setAttribute("d", spine(pose.hip, skull, SPINE_BULGE_FLAT));
        pelvis.setAttribute("d", bone(pose.hip, at(pose.hip, CHEST_DEPTH)));
        torsoCut.setAttribute("d", spine(pose.hip, skull, SPINE_BULGE_FLAT));
        torsoCut.setAttribute("stroke-width", num(cutFlat));
      } else {
        const trunk = spine(pose.hip, pose.shoulder, SPINE_BULGE);
        torso.setAttribute("d", trunk);
        torsoBack.setAttribute("d", "");
        pelvis.setAttribute("d", "");
        torsoCut.setAttribute("d", trunk);
        torsoCut.setAttribute("stroke-width", num(cutNormal));
      }

      // 近侧腿：大腿是外轮廓，最粗；小腿降一档。
      // 躺姿下大腿和躯干共线，不弯一下就会被躯干吃掉，膝弯也跟着消失。
      // 背向胸的一侧弧下去，腿就从身子底下显出来了。
      if (flatTrunk) {
        // 躺姿下大腿和躯干共线，不弯一下就会被躯干吃掉，膝弯也跟着消失。
        // 往背向胸的一侧弧下去，腿就从身子底下显出来了。
        const mid = { x: (pose.hip.x + pose.knee.x) / 2, y: (pose.hip.y + pose.knee.y) / 2 };
        const bow = { x: mid.x - chest.x * THIGH_BOW, y: mid.y - chest.y * THIGH_BOW };
        thigh.setAttribute("d", `M${pt(pose.hip)}Q${num(bow.x)} ${num(bow.y)} ${pt(pose.knee)}`);
      } else {
        thigh.setAttribute("d", bent(pose.hip, pose.knee, BOW_THIGH, jointGap));
      }
      shin.setAttribute("d", bent(pose.knee, pose.ankle, BOW_SHIN, jointGap));
      // 脚掌：躺姿下把脚往远离头的一侧转。骨架里的脚永远朝 +x（人面向的方向），
      // 躺着时那个方向正好指着脑袋，小脚看上去就像一根支架。
      if (flatTrunk) {
        const mirror = p => ({ x: 2 * pose.ankle.x - p.x, y: p.y });
        foot.setAttribute("d", bone(mirror(pose.footToe), mirror(pose.footHeel)));
      } else {
        foot.setAttribute("d", bone(pose.footHeel, { x: pose.footToe.x, y: pose.footToe.y - TOE_LIFT }));
      }
      upperArm.setAttribute("d", bent(pose.shoulder, pose.elbow, BOW_UPPER, jointGap));
      forearm.setAttribute("d", bent(pose.elbow, pose.hand, BOW_FORE, jointGap));

      // 颈：从肩上一点出发，插进椭圆里收住。头单独一个椭圆时，
      // 头和身体之间会有一道缝，那道缝就是「脱节」的来源。
      neck.setAttribute("d", bone(
        along(pose.shoulder, skull, 0.9),
        along(skull, pose.shoulder, headRy),
      ));

      head.setAttribute("cx", num(skull.x));
      head.setAttribute("cy", num(skull.y));
      setHeadCut(headCut, skull.x, skull.y);

      // 关节只点膝、肘、肩。髋不点：躯干弧线本来就压在髋上，再点一个圆点反而像颗钉子。
      for (const [dot, point] of [
        [joints[0], pose.knee],
        [joints[1], pose.elbow],
        [joints[2], pose.shoulder],
        [mitts[0], pose.hand],
        ...(pose.handFar ? [[mitts[1], pose.handFar]] : []),
      ]) {
        dot.setAttribute("cx", num(point.x));
        dot.setAttribute("cy", num(point.y));
      }
    },

    // 器械单独一个方法：姿势变了器械也要跟着变，但它不属于「人」。
    paintProp(prop, pose) {
      hideProp(propBackParts);
      hideProp(propFrontParts);
      if (!prop) return;
      // 一件器械不够的时候（卧推 = 练凳 + 杠铃），支撑物走 setup 字段画在身后，
      // 手里的东西照旧按 at 分层。只有一件时（坐姿腿屈伸的椅子）直接当 kind 用。
      const setup = prop.setup || (prop.kind === "bench" || prop.kind === "seat" ? prop.kind : null);
      if (setup) drawFrame(propBackParts, setup, pose);
      if (setup === prop.kind) return;
      drawProp(prop.at === "back" ? propBackParts : propFrontParts, prop, pose);
    },

    destroy() {
      observer?.disconnect();
    },
  };
}

export default { createSvgSkin };

// 契约入口：聚合页按 createSkin 这个名字找。
export const createSkin = createSvgSkin;
