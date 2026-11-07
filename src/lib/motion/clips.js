// 动作剪辑库：每个动作是一组带缓动的关键姿势，不是一段路径动画。
//
// 一个关键帧只写「这个动作真正在变的量」，其余落回 BASE_POSE。
// 想改节奏，只动 at 上的秒数；想改幅度，只动 pose 里的角度；想改画风，这里一个字都不用改。
//
// 角度不是拍脑袋定的。每个姿势都从 docs/motion-biomechanics.md 的文献区间出发，
// 用 scripts/pose-solve.mjs 反解出 hipHeight / hipShift。改任何一个数之前先跑那个脚本。
//
// viewBox 共用同一个，不按动作单独调。
//
// 全部动作实测包围盒：x ∈ [-25, 30]、y ∈ [-112, 0]。加线宽与边距后取
// x ∈ [-28, 34]、y ∈ [-116, 6]；宽度拉到 106 是为了把宽高比维持在 0.87 上下
// （跟原来 96/110 一致），否则切动作时图在页面上的占地宽度会跳。
//
// 脚在 y=0，所有动作共用同一条地平线，所以共用框不会让它们上下跳。
const FIGURE_BOX = "-50 -116 106 122";
// 正面框：额状面动作的手臂向两侧展开，比矢状面宽得多（外展到肩高时手到 ±45），
// 高度反而矮（头顶 97.5）。用侧面那个高长框，两侧手臂会被框切掉。
const FRONT_BOX = "-56 -104 112 110";

// 站直：膝屈 5°、胫骨 0°、躯干 3°。
// 这几个数字看着琐碎，但第一版把「站直」写成了膝屈 32°，等于所有动作的起点都是微蹲。
const STAND = { hipHeight: 51.9, hipShift: -2.1, lean: 3, armSwing: 4, elbow: 0 };

// 同一姿态换个手位：很多动作只差手臂，用展开写法省得每次抄一遍站姿。
const at = (pose, overrides) => ({ ...pose, ...overrides });

// ─────────────────────────────────────────────────────────────
// 基础模式：蹲、髋铰链、待机
// ─────────────────────────────────────────────────────────────

// 深蹲：杠铃背蹲。站直 → 蹲到底 → 停 → 起来 → 歇。
// 最低点取平行蹲：膝屈 102°，文献区间 100–105°；躯干 26° 落在高杠的 15–25° 上限附近，
// 解出来的胫骨前倾 29° 也在踝背屈的正常范围里。肩落在足中 x≈2，杠在脚心上方。
// 手是握杠位：上臂略往后、屈肘，拳落在肩后上方，不是前平举。
const SQUAT_STAND = at(STAND, { armSwing: 6, elbow: 158 });
const squat = {
  id: "squat",
  label: "深蹲",
  group: "基础模式",
  view: "side",
  prop: { kind: "barbell", at: "back" },
  duration: 3.8,
  stillAt: 1.5,    // 减少动态效果时停在这一秒：蹲到底之后、起来之前，动作最明确的一刻
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: SQUAT_STAND, ease: "inOut" },
    { at: 1.25, pose: { hipHeight: 30.4, hipShift: -12.1, lean: 26, armSwing: 6, elbow: 158 } },
    { at: 1.75, pose: { hipHeight: 30.4, hipShift: -12.1, lean: 26, armSwing: 6, elbow: 158 } },
    { at: 3.0, pose: SQUAT_STAND, ease: "inOut" },
    { at: 3.8, pose: SQUAT_STAND },
  ],
};

// 髋铰链（罗马尼亚硬拉）：膝几乎不动，髋往后推，躯干折下去，手臂垂直吊着。
// 文献：罗马尼亚硬拉躯干 60–75°（与竖直）、膝屈 15–25°；传统硬拉起肘更低、膝屈 55–65°。
// 这里取 RDL 的折法，因为它在侧视里最能和深蹲区分开。
//
// 手臂写 barX/barHeight 而不是角度：硬拉的第一要义就是**杠始终在足中上方、只上下不走**。
// 旧版用角度正解，杠在水平方向漂了 6.35 个单位（相当于 11cm），那就是「拖腿」错状。
// 杠高不能拍脑袋，由臂长反推：站立时肩在 79.5，手臂自然下垂 34，掌就在 45.5。
// 上一版的 58 是旧臂长（26）留下的，现在手只能够到 45.5，再写 58 就是「屈肘撞硬拉锁定」。
// 底部从 lean 45 改成 62：手臂 34 从肩（俯身时高 60.6）往下量，只能够到 26.6，
// 不能再直立。正好这也是真实 RDL 底部的背角（离水平 30°左右），不是为凑数改的。
const hinge = {
  id: "hinge",
  label: "髋铰链",
  group: "基础模式",
  view: "side",
  duration: 3.6,
  stillAt: 1.42,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { barX: 0, barHeight: 45.5 }), ease: "inOut" },
    { at: 1.3, pose: { hipHeight: 46.7, hipShift: -18, lean: 62, barX: 0, barHeight: 28 }, ease: "inOut" },
    { at: 1.55, pose: { hipHeight: 46.7, hipShift: -18, lean: 62, barX: 0, barHeight: 28 } },
    { at: 3.0, pose: at(STAND, { barX: 0, barHeight: 45.5 }), ease: "inOut" },
    { at: 3.6, pose: at(STAND, { barX: 0, barHeight: 45.5 }) },
  ],
};

// 不认识的动作用呼吸顶着。它不假装自己在演那个动作——
// 演错了比不演更让人分心。
// 起伏只给躯干角度和手臂：髋高一旦变动，膝盖会被 IK 拉着大幅屈伸
// （髋高差 0.35 就能让膝屈从 15° 跳到 23°），看上去就不是呼吸而是微蹲。
const idle = {
  id: "idle",
  label: "待机",
  group: "基础模式",
  view: "side",
  duration: 4,
  stillAt: 2,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { lean: 3, armSwing: 4, elbow: 10 }), ease: "inOut" },
    { at: 2, pose: at(STAND, { lean: 5.5, armSwing: 7, elbow: 14 }), ease: "inOut" },
    { at: 4, pose: at(STAND, { lean: 3, armSwing: 4, elbow: 10 }) },
  ],
};

// ─────────────────────────────────────────────────────────────
// 推：站姿推举、卧推、侧平举、三头下压
// ─────────────────────────────────────────────────────────────

// 站姿推举：杠架在锁骨上方 → 直臂举过头顶。
//
// 两个关键点来自动作规范，不是估算：
// - 起始手位在锁骨上方、上臂略前，靠 elbow 150° 把前臂往前折，拳落在肩前。
// - 锁定位肩屈 178° 而不是 180°：手略微偏前 2° 是刻意留的，
//   这样手臂和头不会完全重叠，侧视里才看得出是「手在头后面」而不是「穿过头」。
const press = {
  id: "press",
  label: "站姿推举",
  group: "推",
  view: "side",
  prop: { kind: "barbell", at: "hands" },
  duration: 2.9,
  stillAt: 1.05,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { lean: 3, armSwing: 8, elbow: 150 }), ease: "out" },
    { at: 0.9, pose: at(STAND, { lean: 2, armSwing: 178, elbow: 3 }), ease: "inOut" },
    { at: 1.2, pose: at(STAND, { lean: 2, armSwing: 178, elbow: 3 }) },
    { at: 2.2, pose: at(STAND, { lean: 3, armSwing: 8, elbow: 150 }) },
    { at: 2.9, pose: at(STAND, { lean: 3, armSwing: 8, elbow: 150 }) },
  ],
};

// 卧推：仰卧、躯干贴凳，杆从胸口推到直臂。
//
// 关键一：不用旋转整个人。躯干放平靠 lean 90°，腿仍然从髋往地面踩——
// 这样腿就不会跟着躯干横过来。上一版用 rootTilt 90° 把整个人转倒，
// 结果腿和躯干叠成一个 V 字，就是这个原因。
//
// 关键二：杆的路径是约束。侧视里卧推的杆就是一条竖线（在胸正上方上下），
// 所以写 barX/barHeight。旧版写角度，杆往头那侧漂了 12.8 个单位，看着像在做“从脚往头方向拖”。
// barX 取 12：那是肩在程度（hipShift -20 + torso 32）的位罝，也就是胸正上方。
// 杠行程也不是拍的。旧版 36↔51 的顶位 51 恰好是旧臂长 26 的天花板——
// 手够不到了，所以人被限制在那儿。臂长 34 之后，顶位回到解剖位置：肩 26 + 臂 34 ≈ 60。
// 底位 30：躯干水平 90° 时胸口就压在肩线上，杠落在胸口略上方，肘在杠下。
// 侧视里读起来就是「杠从胸口推到臂直」，这也是卧推在侧视里唯一诚实的读法。
// 试：卧推走正面（从脚那头看）。躯干沿视线压缩，双臂向上推，横杠跨在两手之间。
const BENCH_BASE = { hipHeight: 26, hipShift: -20, lean: 90, barX: 12 };
const benchPress = {
  id: "bench",
  label: "卧推",
  group: "推",
  view: "side",
  prop: { kind: "barbell", at: "hands", setup: "bench" },
  duration: 3.0,
  stillAt: 0.45,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { ...BENCH_BASE, barHeight: 30 }, ease: "out" },
    { at: 1.0, pose: { ...BENCH_BASE, barHeight: 59.5 }, ease: "inOut" },
    { at: 1.3, pose: { ...BENCH_BASE, barHeight: 59.5 } },
    { at: 2.2, pose: { ...BENCH_BASE, barHeight: 30 }, ease: "inOut" },
    { at: 3.0, pose: { ...BENCH_BASE, barHeight: 30 } },
  ],
};

// 侧平举：站直，手臂从体侧抬到与肩同高。
// 「与肩同高」在正向解算里就是 armSwing 90°，肘微屈 15°——不是直臂，直臂会被读成机器。
// 侧平举：**正面视角**。这是一个额状面动作：手臂向体侧外展。
// 用侧视摆它，手臂「抬到肩高」在矢状面投影里本来就不该离开身体轮廓，
// 那个姿势是假的，读起来像前后摆臂。正面才看得到外展角本身。
const lateralRaise = {
  id: "lateral-raise",
  label: "侧平举",
  group: "推",
  view: "front",
  prop: { kind: "dumbbell", at: "hands" },
  duration: 2.6,
  stillAt: 0.95,
  viewBox: FRONT_BOX,
  tracks: [
    { at: 0, pose: { hipHeight: 50, armAbduct: 8, elbow: 12, stance: 7 }, ease: "out" },
    { at: 0.8, pose: { hipHeight: 50, armAbduct: 88, elbow: 16, stance: 7 }, ease: "inOut" },
    { at: 1.1, pose: { hipHeight: 50, armAbduct: 88, elbow: 16, stance: 7 } },
    { at: 2.0, pose: { hipHeight: 50, armAbduct: 8, elbow: 12, stance: 7 } },
    { at: 2.6, pose: { hipHeight: 50, armAbduct: 8, elbow: 12, stance: 7 } },
  ],
};

// 三头下压：上臂固定在体侧，只有前臂在动。
// 这是「只有一条手臂也能演清楚」的典型：上臂几乎不动，前臂从屈 100° 伸直。
const pushdown = {
  id: "pushdown",
  label: "绳索下压",
  group: "推",
  view: "side",
  prop: { kind: "cable", at: "hands" },
  duration: 2.4,
  stillAt: 0.82,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { armSwing: 6, elbow: 100 }), ease: "out" },
    { at: 0.7, pose: at(STAND, { armSwing: 6, elbow: 4 }), ease: "inOut" },
    { at: 0.95, pose: at(STAND, { armSwing: 6, elbow: 4 }) },
    { at: 1.8, pose: at(STAND, { armSwing: 6, elbow: 100 }) },
    { at: 2.4, pose: at(STAND, { armSwing: 6, elbow: 100 }) },
  ],
};

// ─────────────────────────────────────────────────────────────
// 拉：俯身划船、引体向上、弯举
// ─────────────────────────────────────────────────────────────

// 俯身划船：折髋 45°、膝微屈 → **肘往身后驱动**、拳拉到下肋。
// 躯干 45° 是标准杠铃划船最常被引用的数字；膝屈 35° 而不是第一版的 63°（那个是半蹲着划船）。
//
// 上一版只改了 elbow（0→125），armSwing 五帧全部写死 2，实测上臂相对躯干
// 每一帧都是 -43°——那就是「大臂不动、只折小臂」，而划船的第一口令恰恰是「肘往身后走」。
// 现在 armSwing 从 2 拉到 -35，上臂相对躯干走 37°，肘真的到身后去了。
//
// 已知限制：这副骨架的手臂只有 26 个单位，肩到腹的距离是 26.6，
// 所以杠怎么解都碰不到肚子。那是比例问题不是角度问题，见 docs/skeleton-design.md。
const ROW_BOTTOM = { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 0 };
const ROW_TOP = { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: -35, elbow: 120 };
const row = {
  id: "row",
  label: "俯身划船",
  group: "拉",
  view: "side",
  prop: { kind: "barbell", at: "hands" },
  duration: 2.7,
  stillAt: 0.9,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: ROW_BOTTOM, ease: "out" },
    { at: 0.75, pose: ROW_TOP, ease: "inOut" },
    { at: 1.05, pose: ROW_TOP },
    { at: 1.9, pose: ROW_BOTTOM, ease: "inOut" },
    { at: 2.7, pose: ROW_BOTTOM },
  ],
};

// 引体向上：栁是钉死的，人往上走。
// 所以下面每个关键帧都不写 hipHeight，只写 gripY（同一个值）和手臂角。
// 身体升多少完全由屈肘角推出来，不需要人猜——上一版就是因为它要人猜，
// 结果手在水平方向漂了 10 个单位，看着像在拉杠下来而不是引体。
const PULLUP_HANG = {
  gripY: 115, gripX: 0, freeLegs: true,
  lean: 2, armSwing: 179, elbow: 6, freeThigh: 8, freeKnee: 48,
};
const PULLUP_TOP = {
  gripY: 115, gripX: 0, freeLegs: true,
  lean: 4, armSwing: 158, elbow: 106, freeThigh: 16, freeKnee: 62,
};
const pullUp = {
  id: "pull-up",
  label: "引体向上",
  group: "拉",
  view: "side",
  prop: { kind: "bar", at: "hands" },
  duration: 3.2,
  stillAt: 1.35,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: PULLUP_HANG, ease: "out" },
    { at: 1.2, pose: PULLUP_TOP, ease: "inOut" },
    { at: 1.5, pose: PULLUP_TOP },
    { at: 2.5, pose: PULLUP_HANG },
    { at: 3.2, pose: PULLUP_HANG },
  ],
};

// 弯举：上臂固定垂在体侧，只有前臂从伸直到屈肘约 130°。
// 侧视里最清楚的动作之一，因为整个动作就是它
// 那个纯粹的肘关节旋转。
const curl = {
  id: "curl",
  label: "弯举",
  group: "拉",
  view: "side",
  prop: { kind: "dumbbell", at: "hands" },
  duration: 2.6,
  stillAt: 0.88,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { armSwing: 2, elbow: 10 }), ease: "out" },
    { at: 0.75, pose: at(STAND, { armSwing: 2, elbow: 130 }), ease: "inOut" },
    { at: 1.0, pose: at(STAND, { armSwing: 2, elbow: 130 }) },
    { at: 1.9, pose: at(STAND, { armSwing: 2, elbow: 10 }) },
    { at: 2.6, pose: at(STAND, { armSwing: 2, elbow: 10 }) },
  ],
};

// ─────────────────────────────────────────────────────────────
// 腿：保加利亚分腿蹲、坐姿腿屈伸
// ─────────────────────────────────────────────────────────────

// 保加利亚分腿蹲：前腿踩地单腿下蹲，后脚搭高。
// 这一次是真两条腿：远侧腿用 farThigh/farKnee 单独摆（大腿往后上折、膝明显屈），
// 而不是把近侧腿平移一下假装。
const SPLIT_TOP = { hipHeight: 50, hipShift: -6, lean: 8, armSwing: 30, elbow: 40, farThigh: -46, farKnee: 96 };
const SPLIT_BOTTOM = { hipHeight: 34, hipShift: -8, lean: 16, armSwing: 20, elbow: 30, farThigh: -58, farKnee: 108 };
const splitSquat = {
  id: "split-squat",
  label: "保加利亚分腿蹲",
  group: "腿",
  view: "side",
  duration: 3.4,
  stillAt: 1.3,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: SPLIT_TOP, ease: "inOut" },
    { at: 1.15, pose: SPLIT_BOTTOM },
    { at: 1.45, pose: SPLIT_BOTTOM },
    { at: 2.7, pose: SPLIT_TOP, ease: "inOut" },
    { at: 3.4, pose: SPLIT_TOP },
  ],
};

// 坐姿腿屈伸：小腿从垂直（膝屈 90°）踢到伸直。
// 侧视里坐姿靠髋高 + 躯干角度表达，不需要另写骨骼：
// 髋落低、躯干立起、膝屈 90°，读起来就是「坐着」。
const LEG_EXT_BASE = {
  freeLegs: true, footFlat: true, hipHeight: 32, hipShift: -8, lean: 6,
  freeThigh: 90, armSwing: 28, elbow: 85,
};
const legExtension = {
  id: "leg-extension",
  label: "坐姿腿屈伸",
  group: "腿",
  view: "side",
  prop: { kind: "seat", at: "back" },
  duration: 2.8,
  stillAt: 1.05,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { ...LEG_EXT_BASE, freeKnee: 80 }, ease: "out" },
    { at: 0.9, pose: { ...LEG_EXT_BASE, freeKnee: 2 }, ease: "inOut" },
    { at: 1.2, pose: { ...LEG_EXT_BASE, freeKnee: 2 } },
    { at: 2.2, pose: { ...LEG_EXT_BASE, freeKnee: 80 }, ease: "inOut" },
    { at: 2.8, pose: { ...LEG_EXT_BASE, freeKnee: 80 } },
  ],
};

// ─────────────────────────────────────────────────────────────
// 核心与有氧：平板支撑、悬挂举腿、跑步
// ─────────────────────────────────────────────────────────────

// 平板支撑：⚠ 同样不可用（visible: false），原因跟卧推一样。
// 身体拉成水平后，腿不再是「向下支撑」而是「向后平伸」，脚不在地面上。
// 平板、卧推、俯卧撑这一整类趴姿/躺姿动作，都需要先加「腿部支撑约束」。
const PLANK_BASE = { hipHeight: 26, lean: 86, rootTilt: 8, anchorX: -30, anchorY: -22 };
const plank = {
  id: "plank",
  label: "平板支撑",
  group: "核心有氧",
  view: "side",
  visible: false,
  duration: 5,
  stillAt: 2.5,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { ...PLANK_BASE, armSwing: 86, elbow: 12 }, ease: "inOut" },
    { at: 2.5, pose: { ...PLANK_BASE, hipHeight: 25.4, armSwing: 86, elbow: 12 }, ease: "inOut" },
    { at: 5, pose: { ...PLANK_BASE, armSwing: 86, elbow: 12 } },
  ],
};

// 悬挂举腿：手握杠不动，动的应该是腿。
// 上一版用「躯干折角」近似抬腿，因为当时骨架只有一条腿、腿还钉在地上。
// 现在 freeLegs 把腿从髋正解， gripY 把手钉住，于是能演真的：双腿抬到接近水平。
// 两腿给一点角度差，看上去才不像纸片。
// 悬挂类共用底子：杠钉在 115 高，掍点锁死。
// 杠高不是随便定的：臂长 34、躯干 29.5、腿 50，挂下来从杠到踝共 113.5 单位。
// 原来写 110 是旧臂长（26）下的值，那时人比现在高挂 8 单位，刚好能离地；
// 臂长修正后同一条杠会把人往下放 8 单位，脚踝只剩 2.7，看着像站在地上。
// 115 是框顶（116）能容下的最高杠位，踝落到 7.7，珠尖 0.8，人真离了地。
const HANG_BASE = {
  gripY: 115, gripX: 0, freeLegs: true,
  lean: 3, armSwing: 179, elbow: 4,
  // 腿抬到接近水平时脚尖会探出框右边，所以整体左移 6 个单位。
  // 平移量恒定不变，不影响「握点不动」这条断言。
  anchorX: -6,
};
// 悬挂举腿：握点钉住，膝盖抬到接近水平。
const HANG_BOX = "-50 -116 106 126"; // 框底比站姿动作低 4：挂下来的时候「地面」不是约束
const hangingLegRaise = {
  id: "hanging-leg-raise",
  label: "悬挂举腿",
  group: "核心有氧",
  view: "side",
  duration: 3.2,
  stillAt: 1.25,
  viewBox: HANG_BOX,
  tracks: [
    { at: 0, pose: { ...HANG_BASE, freeThigh: 8, freeKnee: 48, farThigh: 11, farKnee: 54 }, ease: "out" },
    { at: 1.1, pose: { ...HANG_BASE, freeThigh: 76, freeKnee: 10, farThigh: 70, farKnee: 14 }, ease: "inOut" },
    { at: 1.4, pose: { ...HANG_BASE, freeThigh: 80, freeKnee: 8, farThigh: 74, farKnee: 12 } },
    { at: 2.5, pose: { ...HANG_BASE, freeThigh: 8, freeKnee: 48, farThigh: 11, farKnee: 54 }, ease: "in" },
    { at: 3.2, pose: { ...HANG_BASE, freeThigh: 8, freeKnee: 48, farThigh: 11, farKnee: 54 } },
  ],
};

// 跑步：跑步机和户外跑共用。
//
// 现在能演真的交替了：跑步有腾空 phase，脚本来就不接地，所以用 freeLegs 把两条腿都改成角度正解，
// 两腿反相。上一版两条腿每帧角度完全相同（实测 25/25、3/3），所以看上去只有一条腿。
// 大腿摆幅按跑步的髋屈伸范围给：前腿抬到 +32、后腿蹬到 -18，共 50°。
// 手臂跟同侧腿反相（近腿往前时近臂往后），肘角锁在 90±10，这是跑步摆臂的标准姿态。
const RUN_A = {
  freeLegs: true, footFlat: true, hipHeight: 52, hipShift: -2, lean: 8,
  freeThigh: 32, freeKnee: 18, farThigh: -18, farKnee: 105,
  armSwing: -22, elbow: 88,
};
const RUN_B = {
  freeLegs: true, footFlat: true, hipHeight: 52, hipShift: -2, lean: 8,
  freeThigh: -18, freeKnee: 105, farThigh: 32, farKnee: 18,
  armSwing: 34, elbow: 78,
};
const run = {
  id: "run",
  label: "跑步",
  group: "核心有氧",
  view: "side",
  duration: 1.2,
  stillAt: 0.3,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: RUN_A, ease: "inOut" },
    { at: 0.3, pose: RUN_B, ease: "inOut" },
    { at: 0.6, pose: RUN_A, ease: "inOut" },
    { at: 0.9, pose: RUN_B, ease: "inOut" },
    { at: 1.2, pose: RUN_A },
  ],
};

export const CLIPS = {
  squat, hinge, idle,
  press, benchPress, lateralRaise, pushdown,
  row, pullUp, curl,
  splitSquat, legExtension,
  plank, hangingLegRaise, run,
};

// 对象键是 camelCase 的历史包袱（benchPress/pullUp/...），对外唯一的规范身份是 clip.id。
// 之前 clipFor() 直接 CLIPS[kind]，而归类规则返回的是 kebab-case 的 id，
// 于是 bench / pull-up / split-squat / leg-extension / lateral-raise 五条
// 全部静默摸到 undefined、回落成 idle——动作照常播，只是演的不是那件事。
// 现在所有查询走 id，键只留给老调用兼容。
const BY_ID = new Map(Object.values(CLIPS).map(clip => [clip.id, clip]));

/** 全部规范 id，顺序同 CLIPS 声明顺序。测试用它查漏。 */
export const CLIP_IDS = Object.freeze([...BY_ID.keys()]);

// 动作名 → 规范 id。长正则在前（先具体后笼统），否则「俯身飞鸟」会被「推」抢走、
// 「腿举」会被「腿屈伸」抢走这类错配会到处出现。
// 认不出的回 idle，宁可不动也不要演错。
const NAME_RULES = [
  ["bench", /卧推/],
  // 举腿必须排在 plank 和 pull-up 之前：「悬挂举腿」同时含「悬挂」和「举腿」，
  // 排在后面就会被引体抢走；而它本身跟平板支撑是两个动作，不能共用一条剪辑。
  ["hanging-leg-raise", /举腿/],
  ["plank", /卷腹|仰卧起坐|死虫|健腹轮|平板|支撑/],
  ["pull-up", /引体|悬垂|悬挂/],
  ["split-squat", /保加利亚|分腿蹲/],
  ["leg-extension", /腿屈伸|腿弯举|腿内收|腿外展|内收|外展/],
  ["lateral-raise", /侧平举|反向蝴蝶|夹胸|面拉|俯身飞鸟|侧举/],
  ["pushdown", /下压|臂屈伸|过顶|双杠/],
  ["curl", /弯举/],
  ["run", /跑步|爬坡|跳绳|椭圆|单车|划船机|有氧|越野|游泳|爬楼|跑步机/],
  ["squat", /深蹲|哈克|腿举|腿蹬|蹲/],
  ["hinge", /硬拉|髋铰链|臀推|早安|髋伸|山羊/],
  ["press", /推举|肩推|推胸|实力推|俯卧撑|推/],
  ["row", /划船|下拉|拉/],
];

export function kindForName(name = "") {
  for (const [kind, pattern] of NAME_RULES) {
    if (pattern.test(name)) return kind;
  }
  return "idle";
}

/** 归类表里出现过的所有目标 id。测试用它确认每一条都真能落到剪辑上。 */
export const NAME_RULE_TARGETS = Object.freeze(NAME_RULES.map(([id]) => id));

export function clipFor(kind) {
  // 认规范 id 优先，再退到对象键（兼容老调用），都不是才回 idle。
  return BY_ID.get(kind) || CLIPS[kind] || CLIPS.idle;
}

export default { CLIPS, CLIP_IDS, clipFor, kindForName, NAME_RULE_TARGETS };
