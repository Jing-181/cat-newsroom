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
const SQUAT_STAND = at(STAND, { armSwing: -22, elbow: 148 });
const squat = {
  id: "squat",
  label: "深蹲",
  group: "基础模式",
  prop: { kind: "barbell", at: "back" },
  duration: 3.8,
  stillAt: 1.5,    // 减少动态效果时停在这一秒：蹲到底之后、起来之前，动作最明确的一刻
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: SQUAT_STAND, ease: "inOut" },
    { at: 1.25, pose: { hipHeight: 30.4, hipShift: -12.1, lean: 26, armSwing: -22, elbow: 148 } },
    { at: 1.75, pose: { hipHeight: 30.4, hipShift: -12.1, lean: 26, armSwing: -22, elbow: 148 } },
    { at: 3.0, pose: SQUAT_STAND, ease: "inOut" },
    { at: 3.8, pose: SQUAT_STAND },
  ],
};

// 髋铰链（罗马尼亚硬拉）：膝几乎不动，髋往后推，躯干折下去，手臂垂直吊着。
// 文献：罗马尼亚硬拉躯干 60–75°（与竖直）、膝屈 15–25°；传统硬拉起肘更低、膝屈 55–65°。
// 这里取 RDL 的折法，因为它在侧视里最能和深蹲区分开。
const hinge = {
  id: "hinge",
  label: "髋铰链",
  group: "基础模式",
  duration: 3.6,
  stillAt: 1.42,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { armSwing: 0 }), ease: "inOut" },
    { at: 1.3, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 0, elbow: 0 } },
    { at: 1.55, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 0, elbow: 0 } },
    { at: 3.0, pose: at(STAND, { armSwing: 0 }), ease: "inOut" },
    { at: 3.6, pose: at(STAND, { armSwing: 0 }) },
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

// 卧推：仰卧、躯干贴凳，手臂从「屈肘」推到「直臂」。
//
// 关键：不用旋转整个人。躯干放平靠 lean 90°，腿仍然从髋往地面踩——
// 这样腿就不会跟着躯干横过来。上一版用 rootTilt 90° 把整个人转倒，
// 结果腿和躯干叠成一个 V 字，就是这个原因。
const BENCH_BASE = { hipHeight: 26, hipShift: -20, lean: 90 };
const benchPress = {
  id: "bench",
  label: "卧推",
  group: "推",
  prop: { kind: "barbell", at: "hands" },
  duration: 3.0,
  stillAt: 0.45,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { ...BENCH_BASE, armSwing: 92, elbow: 95 }, ease: "out" },
    { at: 1.0, pose: { ...BENCH_BASE, armSwing: 179, elbow: 8 } },
    { at: 1.3, pose: { ...BENCH_BASE, armSwing: 179, elbow: 8 } },
    { at: 2.2, pose: { ...BENCH_BASE, armSwing: 92, elbow: 95 }, ease: "inOut" },
    { at: 3.0, pose: { ...BENCH_BASE, armSwing: 92, elbow: 95 } },
  ],
};

// 侧平举：站直，手臂从体侧抬到与肩同高。
// 「与肩同高」在正向解算里就是 armSwing 90°，肘微屈 15°——不是直臂，直臂会被读成机器。
const lateralRaise = {
  id: "lateral-raise",
  label: "侧平举",
  group: "推",
  duration: 2.6,
  stillAt: 0.95,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: at(STAND, { armSwing: 2, elbow: 8 }), ease: "out" },
    { at: 0.8, pose: at(STAND, { armSwing: 90, elbow: 15 }), ease: "inOut" },
    { at: 1.1, pose: at(STAND, { armSwing: 90, elbow: 15 }) },
    { at: 2.0, pose: at(STAND, { armSwing: 2, elbow: 8 }) },
    { at: 2.6, pose: at(STAND, { armSwing: 2, elbow: 8 }) },
  ],
};

// 三头下压：上臂固定在体侧，只有前臂在动。
// 这是「只有一条手臂也能演清楚」的典型：上臂几乎不动，前臂从屈 100° 伸直。
const pushdown = {
  id: "pushdown",
  label: "绳索下压",
  group: "推",
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

// 俯身划船：折髋 45°、膝微屈 → 肘后收、拳拉到下肋。
// 躯干 45° 是标准杠铃划船最常被引用的数字；膝屈 35° 而不是第一版的 63°（那个是半蹲着划船）。
const row = {
  id: "row",
  label: "俯身划船",
  group: "拉",
  duration: 2.7,
  stillAt: 0.9,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 0 }, ease: "out" },
    { at: 0.75, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 125 } },
    { at: 1.05, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 125 } },
    { at: 1.9, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 0 }, ease: "inOut" },
    { at: 2.7, pose: { hipHeight: 46.7, hipShift: -16.7, lean: 45, armSwing: 2, elbow: 0 } },
  ],
};

// 引体向上：悬垂，手臂伸直过头顶 → 身体上移，手臂收到屈肘、拳到肩旁。
// 身体跟着上移，这是这个动作唯一的「位移」信息，不能省。
const PULLUP_HANG = { hipHeight: 40, hipShift: 0, lean: 3, armSwing: 178, elbow: 0 };
const pullUp = {
  id: "pull-up",
  label: "引体向上",
  group: "拉",
  prop: { kind: "bar", at: "hands" },
  duration: 3.2,
  stillAt: 1.35,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: PULLUP_HANG, ease: "out" },
    { at: 1.2, pose: { hipHeight: 52, hipShift: 0, lean: 5, armSwing: 168, elbow: 110 }, ease: "inOut" },
    { at: 1.5, pose: { hipHeight: 52, hipShift: 0, lean: 5, armSwing: 168, elbow: 110 } },
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
const legExtension = {
  id: "leg-extension",
  label: "坐姿腿屈伸",
  group: "腿",
  duration: 2.8,
  stillAt: 1.05,
  viewBox: FIGURE_BOX,
  tracks: [
    // 坐到板凳高度：髋高 33、髋往后 8，膝屈约 90°，小腿垂直向下
    { at: 0, pose: { hipHeight: 33, hipShift: -8, lean: 4, armSwing: 40, elbow: 80 }, ease: "out" },
    // 踢直：小腿从垂直转到水平向前，靠 hipShift 往前推进表达「膝伸」
    { at: 0.9, pose: { hipHeight: 33, hipShift: 4, lean: 4, armSwing: 40, elbow: 80 }, ease: "inOut" },
    { at: 1.2, pose: { hipHeight: 33, hipShift: 4, lean: 4, armSwing: 40, elbow: 80 } },
    { at: 2.2, pose: { hipHeight: 33, hipShift: -8, lean: 4, armSwing: 40, elbow: 80 } },
    { at: 2.8, pose: { hipHeight: 33, hipShift: -8, lean: 4, armSwing: 40, elbow: 80 } },
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

// 悬挂举腿：悬垂，身体从垂直到折叠。
// 单腿骨架演不了「双腿抬平」，所以改用躯干折角近似 —— 看上去是身体在卷。
// 这一条是已知限制，写进 docs/motion-system.md，不当成正确表现。
const hangingLegRaise = {
  id: "hanging-leg-raise",
  label: "悬挂举腿",
  group: "核心有氧",
  duration: 3.2,
  stillAt: 1.25,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { hipHeight: 40, hipShift: 0, lean: 3, armSwing: 178, elbow: 0 }, ease: "out" },
    { at: 1.1, pose: { hipHeight: 40, hipShift: 0, lean: 62, armSwing: 178, elbow: 0 }, ease: "inOut" },
    { at: 1.4, pose: { hipHeight: 40, hipShift: 0, lean: 58, armSwing: 178, elbow: 0 } },
    { at: 2.5, pose: { hipHeight: 40, hipShift: 0, lean: 3, armSwing: 178, elbow: 0 } },
    { at: 3.2, pose: { hipHeight: 40, hipShift: 0, lean: 3, armSwing: 178, elbow: 0 } },
  ],
};

// 跑步：跑步机和户外跑共用。
// 侧面跑步的核心是「双腿交替」，单腿骨架演不了交替，只能靠整体起伏 + 摆臂近似。
// 这一条是真的限制，不是妥协：要演交替必须给骨架加第二条腿。
const run = {
  id: "run",
  label: "跑步",
  group: "核心有氧",
  duration: 1.2,
  stillAt: 0.3,
  viewBox: FIGURE_BOX,
  tracks: [
    { at: 0, pose: { hipHeight: 48, hipShift: -2, lean: 10, armSwing: 60, elbow: 80 }, ease: "inOut" },
    { at: 0.3, pose: { hipHeight: 52, hipShift: -2, lean: 8, armSwing: 100, elbow: 60 }, ease: "inOut" },
    { at: 0.6, pose: { hipHeight: 48, hipShift: -2, lean: 10, armSwing: 60, elbow: 80 }, ease: "inOut" },
    { at: 0.9, pose: { hipHeight: 52, hipShift: -2, lean: 8, armSwing: 20, elbow: 100 }, ease: "inOut" },
    { at: 1.2, pose: { hipHeight: 48, hipShift: -2, lean: 10, armSwing: 60, elbow: 80 } },
  ],
};

export const CLIPS = {
  squat, hinge, idle,
  press, benchPress, lateralRaise, pushdown,
  row, pullUp, curl,
  splitSquat, legExtension,
  plank, hangingLegRaise, run,
};

// Legacy preview API only. Product surfaces use demos.js, never this unreviewed library.
const NAME_KINDS = {
  '杠铃深蹲': 'squat', '杠铃卧推': 'benchPress', '引体向上': 'pullUp',
  '保加利亚分腿蹲': 'splitSquat', '腿屈伸': 'legExtension',
  '哑铃侧平举': 'lateralRaise', '悬挂举腿': 'hangingLegRaise',
};
export function kindForName(name = '') {
  return NAME_KINDS[name] || 'idle';
}

export function clipFor(kind) {
  return CLIPS[kind] || CLIPS.idle;
}

export default { CLIPS, clipFor, kindForName };
