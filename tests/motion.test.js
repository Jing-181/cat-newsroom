// 动作系统的护栏。动画本身没法断言「好看」，但可以断言它不会崩、不会抖、不会演错动作。
//
// 这一层测试跑在 node 里，不需要浏览器——因为 core 不碰 DOM。
// 这正是把数学层单独拆出来的好处：换项目时把它带走，护栏一起带走。

import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_POSE,
  EASINGS,
  PROPORTIONS,
  clamp,
  lerp,
  prepareClip,
  sampleClip,
  solveArm,
  solveKnee,
  solvePose,
} from "../src/lib/motion/core.js";
import { CLIPS, CLIP_IDS, clipFor, kindForName, NAME_RULE_TARGETS } from "../src/lib/motion/clips.js";

// 这四个动作归到正确的模式。其余四类按训练日走，不逐个列。
test("动作名归到正确的动作模式", () => {
  assert.equal(kindForName("杠铃深蹲"), "squat");
  assert.equal(kindForName("保加利亚蹲"), "split-squat");
  assert.equal(kindForName("罗马尼亚硬拉"), "hinge");
  assert.equal(kindForName("臀推"), "hinge");
  assert.equal(kindForName("哑铃卧推"), "bench");
  assert.equal(kindForName("站姿推举"), "press");
  assert.equal(kindForName("绳索下压"), "pushdown");
  assert.equal(kindForName("蝴蝶机夹胸"), "lateral-raise");
  assert.equal(kindForName("绳索夹胸"), "lateral-raise");
  assert.equal(kindForName("反向蝴蝶机"), "lateral-raise");
  assert.equal(kindForName("坐姿绳索划船"), "row");
  assert.equal(kindForName("哑铃弯举"), "curl");
  assert.equal(kindForName("引体向上"), "pull-up");
  assert.equal(kindForName("坐姿腿屈伸"), "leg-extension");
  assert.equal(kindForName("平板支撑"), "plank");
  assert.equal(kindForName("跑步机爬坡"), "run");
  assert.equal(kindForName("户外跑步"), "run");
  assert.equal(kindForName("跳绳"), "run");
  assert.equal(kindForName(""), "idle");
});

// 长正则优先：容易搞错的几对要是排序不对，就会被笼统的关键字抢走。
test("归类不会让笼统关键字抢走具体动作", () => {
  assert.equal(kindForName("俯身飞鸟"), "lateral-raise", "不能被「推」抢走");
  assert.equal(kindForName("腿举"), "squat");
  assert.equal(kindForName("保加利亚分腿蹲"), "split-squat", "不能被「蹲」抢走");
  assert.equal(kindForName("坐姿腿弯举"), "leg-extension", "不能被「弯举」抢走");
  assert.equal(kindForName("悬挂举腿"), "hanging-leg-raise", "不能被「悬挂」或「平板」抢走");
  assert.equal(kindForName("悬垂举腿"), "hanging-leg-raise");
  assert.equal(kindForName("悬垂"), "pull-up", "单纯的悬挂还是引体");
  assert.equal(kindForName("双杠臂屈伸"), "pushdown");
  assert.equal(kindForName("过顶臂屈伸"), "pushdown");
});

// 归类表里的每一个目标都必须真的能落到剪辑上。
// 这条是给「键用 camelCase、id 用 kebab-case」那类错配兜底的：改规则忘了改 id，
// 不写这条断言就只会表现为「动作照常播，但演的是另一个动作」，人眼很难发现。
test("归类表里每个目标都能取到真实剪辑，不落 idle", () => {
  for (const target of NAME_RULE_TARGETS) {
    const clip = clipFor(target);
    assert.notEqual(clip.id, "idle", `归类目标 "${target}" 取不到剪辑，回落成了 idle`);
    assert.equal(clip.id, target, `归类目标 "${target}" 取到的是 "${clip.id}"`);
  }
});

// 每个剪辑都能被 clipFor 按 id 取到，且 id 不重复。
test("每条剪辑都能按 id 取到，且 id 唯一", () => {
  assert.equal(new Set(CLIP_IDS).size, CLIP_IDS.length, "有剪辑 id 重复");
  for (const id of CLIP_IDS) {
    assert.equal(clipFor(id).id, id, `clipFor("${id}") 没取到自己`);
  }
});

// 真实训练里高频出现的动作名，逐个确认它们演的是对的那件事。
// 和上面那条不同：这里查的是「名字 → 最终剪辑」整条链路。
test("真实动作名端到端落到正确的剪辑", () => {
  const cases = [
    ["杠铃深蹲", "squat"],
    ["哑铃卧推", "bench"],
    ["站姿推举", "press"],
    ["引体向上", "pull-up"],
    ["坐姿绳索划船", "row"],
    ["罗马尼亚硬拉", "hinge"],
    ["哑铃弯举", "curl"],
    ["保加利亚分腿蹲", "split-squat"],
    ["坐姿腿屈伸", "leg-extension"],
    ["哑铃侧平举", "lateral-raise"],
    ["绳索下压", "pushdown"],
    ["平板支撑", "plank"],
    ["悬挂举腿", "hanging-leg-raise"],
    ["户外跑步", "run"],
    ["", "idle"],
    ["某个没听过的动作", "idle"],
  ];
  for (const [name, expectedId] of cases) {
    assert.equal(clipFor(kindForName(name)).id, expectedId, `"${name}" 演的不是 ${expectedId}`);
  }
});

// 视角是数据，不是 if。判据：动作在哪个运动平面发生，就用哪个视角看。
// 矢状面（前屈后伸、上下）用侧视；额状面（向两侧展开）用正面。
// 写错不会报错，只会「动作看着在动但该动的关节没动」——所以要测。
test("每条剪辑都声明了合法视角", () => {
  for (const clip of Object.values(CLIPS)) {
    assert.ok(clip.view === undefined || clip.view === "side" || clip.view === "front",
      `${clip.id} 的视角 "${clip.view}" 不认识`);
  }
});

// 正面解算器不读 armSwing / lean / freeLegs / gripY / barHeight。
// 在正面剪辑里写这些字段不会报错，只会默默失效——效果就是小人在原地不动。
test("正面剪辑不用只属于侧面的参数", () => {
  const SIDE_ONLY = ["armSwing", "freeLegs", "freeThigh", "freeKnee", "gripY", "gripX", "barHeight", "barX"];
  for (const clip of Object.values(CLIPS)) {
    if (clip.view !== "front") continue;
    for (const track of clip.tracks || []) {
      for (const key of SIDE_ONLY) {
        assert.equal(track.pose[key], undefined,
          `${clip.id} 是正面视角，却在 t=${track.at} 写了 ${key}，正面解算器不读它`);
      }
    }
  }
});

// 正面视角要对称：没有侧倾时，两只手、两只脚应该是镜像。
// 不对称说明解算里某一边的方向符号写反了，画出来就是一只胳膊长一只短。
test("正面视角左右对称", () => {
  for (const clip of Object.values(CLIPS)) {
    if (clip.view !== "front") continue;
    const prepared = prepareClip(clip);
    for (let i = 0; i <= 24; i++) {
      const p = solvePose(sampleClip(prepared, (i / 24) * prepared.duration));
      const pairs = [["手", p.handNear, p.handFar], ["膝", p.kneeNear, p.kneeFar], ["肩", p.shoulderNear, p.shoulderFar]];
      for (const [what, near, far] of pairs) {
        assert.ok(Math.abs(near.x + far.x) < 1e-6, `${clip.id} 的${what}左右不对称`);
        assert.ok(Math.abs(near.y - far.y) < 1e-6, `${clip.id} 的${what}左右不等高`);
      }
    }
  }
});

// 正面剪辑必须有一个正面看得见的关节真在动，否则就是「声明了正面却设东西可看」。
test("正面剪辑真的在动", () => {
  for (const clip of Object.values(CLIPS)) {
    if (clip.view !== "front") continue;
    const prepared = prepareClip(clip);
    const first = solvePose(sampleClip(prepared, 0));
    let moved = 0;
    for (let i = 1; i <= 24; i++) {
      const p = solvePose(sampleClip(prepared, (i / 24) * prepared.duration));
      moved = Math.max(moved, Math.hypot(p.handNear.x - first.handNear.x, p.handNear.y - first.handNear.y));
    }
    assert.ok(moved > 10, `${clip.id} 是正面视角，但手只走了 ${moved.toFixed(1)} 单位`);
  }
});

// 每条剪辑的元信息都要齐，预览页和归类都靠它。
test("所有剪辑都有必要的元信息", () => {
  for (const clip of Object.values(CLIPS)) {
    assert.equal(typeof clip.id, "string", `${clip.id} 缺 id`);
    assert.equal(typeof clip.label, "string", `${clip.id} 缺 label`);
    assert.equal(typeof clip.group, "string", `${clip.id} 缺 group`);
    assert.ok(clip.label.length > 0, `${clip.id} 的 label 是空的`);
    assert.ok(clip.viewBox, `${clip.id} 缺 viewBox`);
    assert.ok(clip.stillAt >= 0 && clip.stillAt <= clip.duration, `${clip.id} 的 stillAt 落在时长外`);
  }
});

// 静帧要停在「看得见动作」的地方。停在起始位等于没演，审查页就会骗人。
test("静帧不落在起始姿势上", () => {
  for (const clip of Object.values(CLIPS)) {
    const prepared = prepareClip(clip);
    const start = sampleClip(prepared, 0);
    const still = sampleClip(prepared, clip.stillAt);
    const moved = Object.keys(BASE_POSE).some(key => Math.abs(still[key] - start[key]) > 1e-3);
    assert.ok(moved, `${clip.id} 的静帧 ${clip.stillAt}s 和起始帧几乎一样，看不出动作`);
  }
});

// 所有关节点必须落在 viewBox 里。上一版就因为框算错，小人整个跑出去叠在文字上。
test("所有动作的所有帧都落在 viewBox 里", () => {
  for (const clip of Object.values(CLIPS)) {
    const [vx, vy, vw, vh] = clip.viewBox.split(" ").map(Number);
    const prepared = prepareClip(clip);
    for (let i = 0; i <= 120; i++) {
      const pose = solvePose(sampleClip(prepared, (i / 120) * prepared.duration));
      for (const [name, point] of Object.entries(pose)) {
        if (!point || typeof point.x !== "number") continue;
        assert.ok(
          point.x >= vx && point.x <= vx + vw && point.y >= vy && point.y <= vy + vh,
          `${clip.id} 的 ${name} 在 (${point.x.toFixed(1)}, ${point.y.toFixed(1)})，超出 viewBox ${clip.viewBox}`,
        );
      }
    }
  }
});

// 屈肘只能往前折。符号写反时手会折到肩膀后面去，看上去像一把刀插在脖子旁边。
test("屈肘方向朝前，手不会折到肩后", () => {
  const shoulder = { x: 0, y: -82 };
  for (const swing of [2, 8, 45, 90]) {
    for (const elbow of [30, 90, 150]) {
      const { hand } = solveArm(shoulder, swing, elbow, 13, 13);
      assert.ok(hand.x >= shoulder.x - 0.5, `swing ${swing} / elbow ${elbow} 时手跑到肩后 x=${hand.x.toFixed(1)}`);
    }
  }
});

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("缓动都从 0 到 1，且单调不减", () => {
  for (const [name, fn] of Object.entries(EASINGS)) {
    assert.equal(fn(0), 0, name);
    assert.equal(fn(1), 1, name);
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = fn(i / 100);
      assert.ok(v >= prev - 1e-9, `${name} 在 ${i / 100} 处回退了`);
      prev = v;
    }
  }
});

test("两骨 IK：膝盖到髋、到踝的距离就是骨长", () => {
  const cases = [
    [{ x: 0, y: -50 }, { x: 0, y: 0 }],
    [{ x: 0, y: -31 }, { x: 0, y: 0 }],
    [{ x: -8, y: -42 }, { x: 0, y: 0 }],
    [{ x: 9, y: -20 }, { x: -3, y: 0 }],
  ];
  for (const [hip, ankle] of cases) {
    const knee = solveKnee(hip, ankle, PROPORTIONS.thigh, PROPORTIONS.shin);
    assert.ok(near(Math.hypot(knee.x - hip.x, knee.y - hip.y), PROPORTIONS.thigh, 1e-6));
    assert.ok(near(Math.hypot(knee.x - ankle.x, knee.y - ankle.y), PROPORTIONS.shin, 1e-6));
  }
});

test("腿够不到时膝盖落到髋踝连线上，不出 NaN", () => {
  const hip = { x: 0, y: -400 };
  const ankle = { x: 0, y: 0 };
  const knee = solveKnee(hip, ankle, PROPORTIONS.thigh, PROPORTIONS.shin);
  assert.ok(Number.isFinite(knee.x) && Number.isFinite(knee.y));
  // 夹到极限后膝盖会贴着髋踝连线，横向偏不到一个单位；大于这个数就是解算错了
  assert.ok(Math.abs(knee.x) < 1, "直腿时膝盖横向偏出去太多");
});

test("剪辑采样：关键帧上取到的就是那一帧本身", () => {
  for (const clip of Object.values(CLIPS)) {
    const prepared = prepareClip(clip);
    for (const track of clip.tracks) {
      const params = sampleClip(prepared, track.at);
      for (const [key, value] of Object.entries(track.pose)) {
        if (key === "ease") continue;
        assert.ok(near(params[key], value, 1e-6), `${clip.id} @${track.at}s 的 ${key} 对不上`);
      }
    }
  }
});

test("剪辑采样：循环首尾相接，不会在接缝处跳一下", () => {
  for (const clip of Object.values(CLIPS)) {
    const prepared = prepareClip(clip);
    if (!prepared.loop) continue;
    const atZero = sampleClip(prepared, 0);
    const atEnd = sampleClip(prepared, prepared.duration - 1e-9);
    for (const key of Object.keys(BASE_POSE)) {
      assert.ok(near(atZero[key], atEnd[key], 1e-3), `${clip.id} 的 ${key} 在接缝处跳了`);
    }
  }
});

test("所有动作在整条时间轴上都是有限数", () => {
  for (const clip of Object.values(CLIPS)) {
    const prepared = prepareClip(clip);
    for (let i = 0; i <= 240; i++) {
      const pose = solvePose(sampleClip(prepared, (i / 240) * prepared.duration));
      for (const [name, point] of Object.entries(pose)) {
        // pose 里不只有点，还有标量（lean、headR）和字符串（view），
        // 一刀切当成点会让新增字段直接把测试撞下来——这里按类型分开查。
        if (typeof point === "number") {
          assert.ok(Number.isFinite(point), `${clip.id} 的 ${name} 不是有限数`);
          continue;
        }
        if (!point || typeof point !== "object") continue;
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${clip.id} 的 ${name} 出界了`);
      }
    }
  }
});

test("剪辑的时间戳递增，时长覆盖得到最后一帧", () => {
  for (const clip of Object.values(CLIPS)) {
    assert.ok(clip.duration > 0, `${clip.id} 没有时长`);
    let prev = -Infinity;
    for (const track of clip.tracks) {
      assert.ok(track.at >= prev, `${clip.id} 的关键帧没排序`);
      assert.ok(track.at <= clip.duration, `${clip.id} 有关键帧超出时长`);
      prev = track.at;
    }
    assert.ok(prepareClip(clip).segments.length >= clip.tracks.length - 1);
  }
});

test("认不出的动作回待机，而不是回深蹲", () => {
  assert.equal(clipFor("nope").id, "idle");
  assert.equal(clipFor(undefined).id, "idle");
});

test("工具函数边界", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(lerp(10, 20, 0.5), 15);
});
