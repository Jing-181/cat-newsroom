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
const WEIGHT = {
  contour: 3.3,
  head: 2.8,
  limb: 2.15,
  foot: 2.2,
  neck: 1.7,
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
const JOINT_R = 2.1;

// 躯干微弧的鼓度。直躯干读起来是尺子，弧一点点才读成背和胸。
const SPINE_BULGE = 1.3;
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
const HEAD_SCALE = 0.86;
const HEAD_LIFT = 1.1;
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
  jointGap = JOINT_GAP,
} = {}) {
  const P = { headRadius: 7, ...proportions };
  const BASE = { ...WEIGHT, ...strokeWidth };

  const headRx = P.headRadius * headScale * 0.94;
  const headRy = P.headRadius * headScale * 1.04;
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

  const propFront = document.createElementNS(NS, "g");
  propFront.setAttribute("class", "fig-prop");
  svg.append(propFront);

  // 器械：一根有粗细的杆 + 两头的杠片。杆用一条圆头线画，本身就是有宽度的杆；
  // 两条平行的细线拼出来的杆，在 96px 下会糊成一团。
  const makeProp = group => {
    const bar = stroke(group, "fig-prop");
    const plateA = disc(group, "fig-prop-plate", 0, { filled: true });
    const plateB = disc(group, "fig-prop-plate", 0, { filled: true });
    return { bar, plateA, plateB };
  };
  const propBackParts = makeProp(propBack);
  const propFrontParts = makeProp(propFront);

  const hideProp = parts => {
    parts.bar.setAttribute("d", "");
    [parts.plateA, parts.plateB].forEach(p => p.setAttribute("r", "0"));
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

    // 关节圆点的半径也走光学缩放：它和线一样，跟着 viewBox 等比就会在小图上消失。
    const joint = jointRadius * tuning.joint * f;
    for (const dot of joints) dot.setAttribute("r", joint > 0.05 ? String(joint) : "0");

    // 器械的杆比四肢细一档，但 compact 下跟第二档同粗（见 TIER_WIDTHS 的注释）。
    for (const parts of [propBackParts, propFrontParts]) {
      parts.bar.setAttribute("stroke-width", num(w("bar")));
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

  const drawProp = (parts, prop, pose) => {
    const spec = PROPS[prop.kind] || PROPS.barbell;
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
      center = pose.hand;
      angle = 0;
    }

    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const a = { x: center.x - ux * spec.half, y: center.y - uy * spec.half };
    const b = { x: center.x + ux * spec.half, y: center.y + uy * spec.half };
    parts.bar.setAttribute("d", `M${pt(a)}L${pt(b)}`);

    // 杠片是实心小圆盘。空心环跟脑袋是同一个形状语言，三个圈并排就读成三个球了。
    for (const [plate, point] of [[parts.plateA, a], [parts.plateB, b]]) {
      plate.setAttribute("cx", num(point.x));
      plate.setAttribute("cy", num(point.y));
      plate.setAttribute("r", String(spec.plate));
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
      // 量不到尺寸时（宿主还没挂进文档）再补量几次，之后就再也不读了。
      if (!(pxHeight > 0) && probes < 8) { probes++; measure(); }

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
        thigh.setAttribute("d", bone(pose.hip, pose.knee, jointGap));
      }
      shin.setAttribute("d", bone(pose.knee, pose.ankle, jointGap));
      // 脚掌：躺姿下把脚往远离头的一侧转。骨架里的脚永远朝 +x（人面向的方向），
      // 躺着时那个方向正好指着脑袋，小脚看上去就像一根支架。
      if (flatTrunk) {
        const mirror = p => ({ x: 2 * pose.ankle.x - p.x, y: p.y });
        foot.setAttribute("d", bone(mirror(pose.footToe), mirror(pose.footHeel)));
      } else {
        foot.setAttribute("d", bone(pose.footHeel, pose.footToe));
      }
      upperArm.setAttribute("d", bone(pose.shoulder, pose.elbow, jointGap));
      forearm.setAttribute("d", bone(pose.elbow, pose.hand, jointGap));

      // 颈：从肩上一点出发，插进椭圆里收住。头单独一个椭圆时，
      // 头和身体之间会有一道缝，那道缝就是「脱节」的来源。
      neck.setAttribute("d", bone(
        along(pose.shoulder, skull, 0.9),
        along(skull, pose.shoulder, headRy * 0.7),
      ));

      head.setAttribute("cx", num(skull.x));
      head.setAttribute("cy", num(skull.y));
      setHeadCut(headCut, skull.x, skull.y);

      // 关节只点膝、肘、肩。髋不点：躯干弧线本来就压在髋上，再点一个圆点反而像颗钉子。
      for (const [dot, point] of [
        [joints[0], pose.knee],
        [joints[1], pose.elbow],
        [joints[2], pose.shoulder],
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
