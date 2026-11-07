// 人偶的骨架摆放：把二维关节点变成一串「有厚度、有粗细、有朝向」的圆柱和球。
//
// 数据源是 solvePose 解出来的二维投影，没有第三条轴。这里不假装能反推真实三维姿态
// （关节角立刻穿帮），只补上一条厚度：
//
//   x, y  ← 直接取关节点
//   z     ← 按身体部位给固定厚度
//
// 于是它是一副厚度恒定的浮雕骨架，但每段肢体都是真的圆柱、有真的光照、有真的前后遮挡。
// 侧视动作里这一下就够读了。唯一的例外是仰卧（bench）：腿不再朝下支撑，
// 只能沿身体轴摊平，见 layout() 里的说明。

// 各处厚度，负值离镜头更远。
const DEPTH = {
  hip: 0,
  shoulder: 0,
  nearLeg: 5,
  farLeg: -11,
  arm: 6,
  farArm: -9,
  head: 0,
  foot: 9,
  farFoot: -6,
  propBack: -7.5,
  propHands: 4.2,
};

// 肢体粗细。橡皮人：四肢比写实粗一档，关节用球补圆，读起来才像玩具而不是解剖图。
const GIRTH = {
  thigh: 4.5,
  shin: 3.8,
  upperArm: 3.4,
  forearm: 3.0,
  torso: 7.0,
  neck: 2.8,
  head: 7.8,
  foot: 2.4,
  joint: { knee: 3.9, ankle: 3.3, shoulder: 3.7, elbow: 3.0 },
  plate: 5.6,
  bar: 1.2,
};

// 远侧肢体整体压暗一档，并往后退一层。
// 只压暗不够：正侧视里它和近侧腿在同一 x 上，形状完全重合，看着就是一条粗腿。
// 所以远侧那一副还要在 x 上错开几个单位——线条稿也是这么干的（farOffset 5），
// 两套画法错开的量保持一致，切换皮肤时腿的位置不会跳。
const SHADE = { near: 1, far: 0.6 };
const FAR_X = -5;

const FLOATS = 13;          // 见 three-shader.js 的顶点布局
const VERTS = 6;            // 两个三角形
// 包围盒四角，直接用 -1..1，省得在着色器里再换算。
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const ORDER = [0, 1, 2, 0, 2, 3];

// 写一个「包围盒」：6 个顶点、2 个三角形。base 是它在缓冲里的起始顶点号。
// flat=1 表示按平面着色（杠片），法线不随位置弯。
function writeQuad(out, base, a, b, radius, span, gear, shade, flat) {
  for (let i = 0; i < VERTS; i++) {
    const corner = CORNERS[ORDER[i]];
    const k = (base + i) * FLOATS;
    out[k] = a[0]; out[k + 1] = a[1]; out[k + 2] = a[2];
    out[k + 3] = b[0]; out[k + 4] = b[1]; out[k + 5] = b[2];
    out[k + 6] = corner[0]; out[k + 7] = corner[1];
    out[k + 8] = radius;
    out[k + 9] = span;
    out[k + 10] = gear;
    out[k + 11] = shade;
    out[k + 12] = flat;
  }
}

// 一根从 a 到 b 的胶囊。span 取「半长 + 半径」，包围盒一定罩得住。
function writeSegment(out, base, a, b, radius, gear = 0, shade = SHADE.near) {
  const half = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
  writeQuad(out, base, a, b, radius, half + radius, gear, shade, 0);
}

// 一个球：两端点重合，片元里的「轴退化成一点」自动变成球面求交。
function writeSphere(out, base, center, radius, gear = 0, shade = SHADE.near, flat = 0) {
  writeQuad(out, base, center, center, radius, radius, gear, shade, flat);
}

// pose 的 y 轴向下为负（SVG 习惯），世界坐标向上为正，这里翻一次。
const z = (point, depth) => [point.x, -point.y, depth];

// 躺姿：小腿不再朝下支撑。整条腿沿「肩→髋」的延长线摊平，
// 髋落在凳沿、膝在一半、踝在远端——躺下的人腿就是这个方向。
function flatLeg(pose) {
  const axis = [pose.hip.x - pose.shoulder.x, pose.hip.y - pose.shoulder.y];
  const len = Math.hypot(axis[0], axis[1]) || 1;
  const ux = axis[0] / len;
  const uy = axis[1] / len;
  const along = t => ({ x: pose.hip.x + ux * t, y: pose.hip.y + uy * t });
  return { knee: along(16), ankle: along(31), toe: along(38) };
}

// 缓冲容量：19 个身体部位 + 3 个器械槽（杆 + 两片），每个部位 6 个顶点，余两个空位。
// 按最大值一次分配，paint 里不做任何对象分配。
export const MAX_VERTS = 24 * VERTS;

// pose → 写进缓冲。返回实际用的顶点数。
// k 是比例系数（proportions.torso / 32）：换一套骨架比例时，粗细和厚度一起跟着变。
export function layout(out, pose, k = 1) {
  // lean ≈ 90° 就是躺下。只判幅度不判正负：仰卧到底是 +90 还是 -90 由 rootTilt 决定，
  // 这里要的只是「腿不再朝地面」。
  const lying = Math.abs(pose.lean) > 1.2;
  const leg = lying ? flatLeg(pose) : null;

  const nearKnee = leg ? leg.knee : pose.knee;
  const nearAnkle = leg ? leg.ankle : pose.ankle;
  const nearToe = leg ? leg.toe : pose.footToe;
  const nearHeel = leg ? leg.ankle : pose.footHeel;
  const farKnee = leg ? leg.knee : pose.kneeFar;
  const farAnkle = leg ? leg.ankle : pose.ankleFar;
  const farToe = leg ? leg.toe : pose.footToeFar;
  const farHeel = leg ? leg.ankle : pose.footHeelFar;

  const R = r => r * k;
  const at = (point, depth) => z(point, depth * k);

  const hip = at(pose.hip, DEPTH.hip);
  const shoulder = at(pose.shoulder, DEPTH.shoulder);

  let v = 0;
  const seg = (a, b, r, gear, shade) => { writeSegment(out, v, a, b, R(r), gear, shade); v += VERTS; };
  const ball = (center, r, gear, shade) => { writeSphere(out, v, center, R(r), gear, shade); v += VERTS; };

  // 远侧那一副整体错开：x 上退几个单位（跟线条稿的 farOffset 一致），z 上退到身后。
  const back = point => ({ x: point.x + FAR_X, y: point.y });

  const fk = at(back(farKnee), DEPTH.farLeg);
  const fa = at(back(farAnkle), DEPTH.farLeg);
  seg(hip, fk, GIRTH.thigh, 0, SHADE.far);
  seg(fk, fa, GIRTH.shin, 0, SHADE.far);
  seg(at(back(farHeel), DEPTH.farFoot), at(back(farToe), DEPTH.farFoot), GIRTH.foot, 0, SHADE.far);
  ball(fk, GIRTH.joint.knee, 0, SHADE.far);
  ball(fa, GIRTH.joint.ankle, 0, SHADE.far);

  // 手臂：数据里只有一条手臂，所以人偶是「双臂同动」——远侧那条照抄近侧的关节。
  // 也错开一点，否则两条手臂完全重合，看上去只有一只胳膊。
  seg(at(back(pose.shoulder), DEPTH.farArm), at(back(pose.elbow), DEPTH.farArm), GIRTH.upperArm, 0, SHADE.far);
  seg(at(back(pose.elbow), DEPTH.farArm), at(back(pose.hand), DEPTH.farArm), GIRTH.forearm, 0, SHADE.far);

  seg(hip, shoulder, GIRTH.torso, 0, SHADE.near);

  // 近侧手臂。放在躯干之前写、往前一层画：手臂贴着背或腹的时候，
  // 只靠明暗分不开，得靠这一层的遮挡关系才看得出是「一条胳膊压在身体上」。
  seg(at(pose.shoulder, DEPTH.arm), at(pose.elbow, DEPTH.arm), GIRTH.upperArm, 0, SHADE.near);
  seg(at(pose.elbow, DEPTH.arm), at(pose.hand, DEPTH.arm), GIRTH.forearm, 0, SHADE.near);

  seg(hip, at(nearKnee, DEPTH.nearLeg), GIRTH.thigh, 0, SHADE.near);
  seg(at(nearKnee, DEPTH.nearLeg), at(nearAnkle, DEPTH.nearLeg), GIRTH.shin, 0, SHADE.near);
  seg(at(nearHeel, DEPTH.foot), at(nearToe, DEPTH.foot), GIRTH.foot, 0, SHADE.near);

  // 关节球补圆：球心落在接缝上，只比两段肢体粗一点点。
  // 胶囊两端本来就是圆的，但两段肢体折出角度时外侧会留一道楔口，这颗球就是补那个口。
  ball(at(nearKnee, DEPTH.nearLeg), GIRTH.joint.knee, 0, SHADE.near);
  ball(at(nearAnkle, DEPTH.nearLeg), GIRTH.joint.ankle, 0, SHADE.near);
  // 肩球挂到手臂那一层，不要留在躯干中心：同 z 会和躯干打架，
  // 球会被「贴」在躯干表面成一枚圆斑。
  ball(at(pose.shoulder, DEPTH.arm), GIRTH.joint.shoulder, 0, SHADE.near);
  ball(at(pose.elbow, DEPTH.arm), GIRTH.joint.elbow, 0, SHADE.near);

  // 颈与头。头是落在 head 点的球：core 里 head 就是「颈顶」，不是头心。
  seg(shoulder, at(pose.head, DEPTH.head), GIRTH.neck, 0, SHADE.near);
  ball(at(pose.head, DEPTH.head), GIRTH.head, 0, SHADE.near);

  return v;
}

// 器械：一根圆杆 + 两端杠片，都是圆柱。
// 侧视里杠铃其实是端面，但画成一根横杆才读得出「这是杠铃」——
// 线条稿里也是这么骗的，两套画法要骗得一致。
export function layoutProp(out, base, prop, pose, k = 1) {
  if (!prop) return 0;
  // 不认识的器械（绳索、凳子）不画，不要当成杠铃画到手上。
  if (prop.kind !== "barbell" && prop.kind !== "bar" && prop.kind !== "dumbbell") return 0;
  const lying = Math.abs(pose.lean) > 1.2;
  const half = prop.kind === "dumbbell" ? 7 : 19;
  const plate = (prop.kind === "dumbbell" ? 3.6 : GIRTH.plate) * k;
  let center;
  let angle;
  if (prop.at === "back") {
    center = {
      x: pose.shoulder.x - Math.sin(pose.lean) * 4,
      y: pose.shoulder.y + Math.cos(pose.lean) * 4,
    };
    // 垂直躯干（CONTRACT 的约定）。lean 是躯干与竖直的夹角，垂直方向就是 lean 本身；
    // lean + π/2 得到的是沿脊柱的方向，杆会跟躯干叠在一起。
    angle = pose.lean;
  } else {
    // 手里：引体、卧推、硬拉。杆跟着拳走但保持水平（杠铃受重力，不会斜着挂）。
    // 仰卧时抬到拳上方一点：卧推的杆是架在手掌上的，不该穿过拳头。
    center = lying ? { x: pose.hand.x, y: pose.hand.y - 3 } : pose.hand;
    angle = 0;
  }
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // 背蹲的杆在上背**后面**：不放到躯干厚度之外，整根杆会被躯干吃掉，只剩两片杠片浮着。
  const depth = (prop.at === "back" ? DEPTH.propBack : DEPTH.propHands) * k;
  // 杆沿 z 也错开一点：斜向的杆两端不在同一个深度上，才看得出它是朝镜头伸过来的。
  const skew = Math.sin(angle) * 3 * k;
  // pose 的 y 向下为负，这里跟身体一起翻过来。
  const at = t => [center.x + ux * t, -(center.y + uy * t), depth + (t / half) * skew];

  writeSegment(out, base, at(-half), at(half), GIRTH.bar * k, 1, 1);
  // 杠片画成正对镜头的圆盘。真实侧视里它是边缘朝外的细条，屏幕上什么都看不见；
  // 这里跟线条稿一样选择「读得出来」而不是「投影正确」。
  // flat=1 让法线的 z 分量取常值：轮廓还是圆，明暗按平面算，才不会读成两个球。
  for (let i = 0; i < 2; i++) {
    writeSphere(out, base + VERTS * (i + 1), at(i === 0 ? -half : half), plate, 1, 1, 1);
  }
  return VERTS * 3;
}
