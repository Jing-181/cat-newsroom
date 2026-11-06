// 线条稿皮肤：一副骨架画成一支笔的线条。
//
// 这一层只认「怎么画」——粗细层级、远侧的纵深、关节的转折、器械的形状。
// 它不认时间、不认动作，也不 import core / clips：拿到的永远只是一组关节点。
//
// 四条规矩，改之前先读：
// 1. 粗细是唯一的层级信号。深墨底上只剩一种米色，颜色帮不上忙，只有粗细分得开。
// 2. 纵深靠「细 + 淡 + 被挡住」，不靠平移。挪得多了是重影，挪得少了看不见；
//    真正表达「在后面」的是躯干把头、腿挡掉的那一截。
// 3. 器械不能穿过脑袋。杆画在最前面，靠一个只含头的遮罩把它在脸前断开。
// 4. paint 每帧调一次，里面不建 DOM、不读布局；所有元素在 createSvgSkin 里就建好。

const NS = "http://www.w3.org/2000/svg";

// 三级线宽，单位是身体单位。viewBox 106×122 缩到 96px 高时 1 单位 ≈ 0.79px：
//   contour 3.3 ≈ 2.6px  外轮廓：躯干、大腿
//   limb    2.15 ≈ 1.7px 四肢：小腿、上臂、前臂
//   neck    1.7 ≈ 1.3px  颈（介于四肢和细节之间，太细就白画了）
//   detail  1.4 ≈ 1.1px  内部：杆的粗细
const WEIGHT = {
  contour: 3.3,
  head: 2.8,
  limb: 2.15,
  foot: 2.2,
  neck: 1.7,
  detail: 1.4,
};

// 远侧肢体 = 近侧 × 0.7。只细不淡读成第二条近腿，只淡不细读成脏。
const FAR_SCALE = 0.7;
const FAR_OPACITY = "0.45";
// 远侧错开一点点。重点不在这个数，在于远侧永远比近侧细这么一档：
// 两条腿重合时读出一条带虚边的腿，分开时（分腿蹲）才是一条独立的腿。
const FAR_OFFSET = 1.2;

// 关节点。收一点骨头的端头，用一个圆点把缝填上：
// 硬角是工程图，圆角才是关节。
const JOINT_GAP = 0.4;
const JOINT_R = 2.1;

// 躯干微弧的鼓度。直躯干读起来是尺子，弧一点点才读成背和胸。
const SPINE_BULGE = 1.3;

// 头按骨架给的头半径再收一点，并沿脊柱方向抬一点：
// 骨架里颈长 9、头半径 7，头底离肩只剩 2 个单位，颈线根本露不出来。收小 + 上抬，
// 颈才有长度可画 —— 头和身体就是这么接上的，不是靠画得更大。
const HEAD_SCALE = 0.86;
const HEAD_LIFT = 1.1;

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
const spine = (a, b, bulge) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx < 0) { nx = -nx; ny = -ny; }
  return `M${pt(a)}Q${num((a.x + b.x) / 2 + nx * bulge)} ${num((a.y + b.y) / 2 + ny * bulge)} ${pt(b)}`;
};

function stroke(parent, className, width, attrs = {}) {
  const node = document.createElementNS(NS, "path");
  node.setAttribute("class", className);
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", String(width));
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
  barbell: { half: 18, plate: 2.9, bar: 1.8, solid: true },
  bar: { half: 26, plate: 0, bar: 1.8, solid: true },
  dumbbell: { half: 7, plate: 2.6, bar: 1.8, solid: true },
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
  const W = { ...WEIGHT, ...strokeWidth };

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
  //   躯干、四肢、器械全都要在脸前断开。头自己不在遮罩里，它就是那把刀。
  // 用 mask 而不是把背景色画上去：底色是暖棕渐变，涂不出「无」。
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
  // 背上的杆 → 远侧腿（被躯干切断）→ 躯干 → 近侧腿 → 臂 → 颈 → 关节 → 头 → 手里的杆。
  // 除了头和手里的杆，其余全在 figure 组里，一起被头的遮罩在脸前挖掉。
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
  const farFoot = stroke(farGroup, "fig-far", W.foot * FAR_SCALE, { opacity: FAR_OPACITY });
  const farThigh = stroke(farGroup, "fig-far", W.contour * FAR_SCALE, { opacity: FAR_OPACITY });
  const farShin = stroke(farGroup, "fig-far", W.limb * FAR_SCALE, { opacity: FAR_OPACITY });

  const torso = stroke(figure, "fig-torso", W.contour);
  const torsoCut = stroke(bodyMask.mask, "fig-cut", W.contour + CUT_PAD, { stroke: "#000" });

  const thigh = stroke(figure, "fig-limb", W.contour);
  const shin = stroke(figure, "fig-limb", W.limb);
  const foot = stroke(figure, "fig-foot", W.foot);
  const upperArm = stroke(figure, "fig-arm", W.limb);
  const forearm = stroke(figure, "fig-arm", W.limb);
  const neck = stroke(figure, "fig-neck", W.neck);

  // 头是 <ellipse> 而不是 <circle>：竖着略长一点才像头，正圆永远读成「球」。
  const head = document.createElementNS(NS, "ellipse");
  head.setAttribute("class", "fig-head");
  head.setAttribute("fill", "none");
  head.setAttribute("stroke", "currentColor");
  head.setAttribute("stroke-width", String(W.head));
  head.setAttribute("rx", String(headRx));
  head.setAttribute("ry", String(headRy));
  svg.append(head);

  const joints = [0, 1, 2].map(() => disc(figure, "fig-joint", jointRadius, { filled: true }));

  const propFront = document.createElementNS(NS, "g");
  propFront.setAttribute("class", "fig-prop");
  propFront.setAttribute("mask", `url(#${headMaskId})`);
  svg.append(propFront);

  // 器械：一根有粗细的杆 + 两头的杠片。杆用一条 1.8 单位的圆头线画，本身就是有宽度的杆；
  // 两条 1 单位的平行线拼出来的杆，在 96px 下会糊成一团。
  const makeProp = group => {
    const bar = stroke(group, "fig-prop", PROPS.barbell.bar);
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
    parts.bar.setAttribute("stroke-width", String(spec.bar));

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
      if (!viewBox) return;
      svg.setAttribute("viewBox", viewBox);
      // mask 的默认范围故意给得很大，这里只是把它收到视图附近：
      // 范围太小时远侧腿会在画面边缘被切一刀，而且没人会注意到是 mask 干的。
      const [x, y, w, h] = viewBox.split(" ").map(Number);
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
    },

    paint(pose) {
      // 远侧腿：细、淡、错开。被躯干和头挡住的一段由 mask 切掉。
      farThigh.setAttribute("d", bone(back(pose.hip), back(pose.kneeFar)));
      farShin.setAttribute("d", bone(back(pose.kneeFar), back(pose.ankleFar)));
      farFoot.setAttribute("d", bone(back(pose.footHeelFar), back(pose.footToeFar)));

      const trunk = spine(pose.hip, pose.shoulder, SPINE_BULGE);
      torso.setAttribute("d", trunk);
      torsoCut.setAttribute("d", trunk);

      // 近侧腿：大腿是外轮廓，最粗；小腿降一档。
      thigh.setAttribute("d", bone(pose.hip, pose.knee, jointGap));
      shin.setAttribute("d", bone(pose.knee, pose.ankle, jointGap));
      foot.setAttribute("d", bone(pose.footHeel, pose.footToe));
      upperArm.setAttribute("d", bone(pose.shoulder, pose.elbow, jointGap));
      forearm.setAttribute("d", bone(pose.elbow, pose.hand, jointGap));

      // 头沿脊柱方向抬一点，颈才有长度。
      const skull = {
        x: pose.head.x + Math.sin(pose.lean) * headLift,
        y: pose.head.y - Math.cos(pose.lean) * headLift,
      };

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
  };
}

export default { createSvgSkin };

// 契约入口：聚合页按 createSkin 这个名字找。
export const createSkin = createSvgSkin;
