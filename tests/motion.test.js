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
import { CLIPS, clipFor, kindForName } from "../src/lib/motion/clips.js";

test('legacy exact-name lookup returns real clip keys', () => {
  for (const [name, kind] of Object.entries({ '杠铃深蹲': 'squat', '杠铃卧推': 'benchPress', '引体向上': 'pullUp', '保加利亚分腿蹲': 'splitSquat', '腿屈伸': 'legExtension', '哑铃侧平举': 'lateralRaise', '悬挂举腿': 'hangingLegRaise' })) {
    assert.equal(kindForName(name), kind);
    assert.equal(clipFor(kind), CLIPS[kind]);
  }
});
test('legacy lookup does not fuzzy-match unrelated activities', () => {
  for (const name of ['游泳', '单车', '拉伸', '俯卧撑', '腿举', '']) assert.equal(kindForName(name), 'idle');
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
        if (name === "lean") {
          assert.ok(Number.isFinite(point), `${clip.id} 的 lean 不是数`);
          continue;
        }
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
