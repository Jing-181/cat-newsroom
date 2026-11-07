#!/usr/bin/env node
// 动作不变量检查器。
//
// 存在的理由：Jing 问「怎么让你自己判断动作合理」。答案是——
// 不能靠肉眼一张张看，要靠「这个动作物理上什么必须不动」这类可判定命题。
// 每条剪辑声明自己的不变量，检查器逐帧量，量不到就报错。
// 这是「自己判断」唯一能自动化的形式：把直觉翻译成断言。
//
// 用法：
//   node scripts/motion-invariants.mjs            检查全部
//   node scripts/motion-invariants.mjs pull-up    只查一条
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const { CLIPS, prepareClip, sampleClip, solvePose, PROPORTIONS } = await import(
  pathToFileURL(resolve(root, "src/lib/motion/index.js"))
);

// 采样精度：每条剪辑切成 60 段，够抓到任何一次越界。
const SAMPLES = 60;

function frames(clip) {
  const prepared = prepareClip(clip);
  const out = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (prepared.duration * i) / SAMPLES;
    out.push({ t, pose: solvePose(sampleClip(prepared, t), PROPORTIONS) });
  }
  return out;
}

// 声明式不变量：按剪辑 id 挂上去。
// 一条剪辑可以有多个；没有声明的剪辑只查通用项（不越界、不折叠）。
const INVARIANTS = {
  // 引体向上：手是握点，杠是固定的。所以手的轨迹必须几乎是一个点。
  // 身体靠手臂收拢往上抬，脚跟着走。手要是能移动，就是在演「拉杠下来」，那是错的动作。
  "pull-up": [
    {
      name: "握点不动（杠固定，身体动）",
      max: 2.5,
      measure: f => {
        const xs = f.map(x => x.pose.hand.x);
        const ys = f.map(x => x.pose.hand.y);
        return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      },
    },
    {
      name: "身体真的有位移（髋至少升 8 个单位）",
      min: 8,
      measure: f => {
        const ys = f.map(x => x.pose.hip.y);
        return Math.max(...ys) - Math.min(...ys);
      },
    },
    {
      name: "人是挂在杠上，不是站在地上做引体（全程踝高于地面线）",
      pass: f => f.every(x => -x.pose.ankle.y > 4),
    },
  ],
  // 深蹲：脚踩实地面，踝不能飘。
  squat: [
    {
      name: "踝不离地（脚踩实）",
      pass: f => f.every(x => Math.abs(x.pose.ankle.y) < 0.6),
    },
    {
      name: "膝不内 fold：髋降到底时仍高于踝",
      pass: f => f.every(x => x.pose.hip.y < x.pose.ankle.y),
    },
  ],
  // 硬拉：杠贴小腿垂直起落，水平漂移要小。
  hinge: [
    {
      name: "杠路径接近垂直（手的水平漂移 < 4）",
      max: 4,
      measure: f => {
        const xs = f.map(x => x.pose.hand.x);
        return Math.max(...xs) - Math.min(...xs);
      },
    },
    {
      name: "踝不离地",
      pass: f => f.every(x => Math.abs(x.pose.ankle.y) < 0.6),
    },
  ],
  // 卧推：肩胛贴凳，头和髋不能上下起伏（弓背除外）。
  bench: [
    {
      name: "躯干高度稳定（肩的垂直漂移 < 3）",
      max: 3,
      measure: f => {
        const ys = f.map(x => x.pose.shoulder.y);
        return Math.max(...ys) - Math.min(...ys);
      },
    },
    {
      name: "杠只上下不走（手的水平漂移 < 3）",
      max: 3,
      measure: f => {
        const xs = f.map(x => x.pose.hand.x);
        return Math.max(...xs) - Math.min(...xs);
      },
    },
  ],
  // 推举：站姿，杠从锁骨头顶过，垂直起落。
  press: [
    {
      name: "踝不离地",
      pass: f => f.every(x => Math.abs(x.pose.ankle.y) < 0.6),
    },
    {
      name: "杠在头顶收（顶点手高于头）",
      pass: f => Math.min(...f.map(x => x.pose.hand.y)) < f[0].pose.head.y,
    },
  ],
  // 划船：俯身稳定，杠拉到腹，躯干不该跟着大幅起伏。
  row: [
    {
      name: "髋高度稳定（俯身锁住，垂直漂移 < 3）",
      max: 3,
      measure: f => {
        const ys = f.map(x => x.pose.hip.y);
        return Math.max(...ys) - Math.min(...ys);
      },
    },
  ],
  // 弯举：上臂钉在体侧，只有前臂动。所以「肩和肘都不动」才是对的，动的应该是手。
  // 检查器第一版把这条写反了（要求肘的位移大于肩），那本身就是个错断言。
  curl: [
    {
      name: "肩与肘都钉住（上臂不跟着抬）",
      max: 1.2,
      measure: f => {
        const span = get => {
          const xs = f.map(x => get(x).x);
          const ys = f.map(x => get(x).y);
          return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        };
        return Math.max(span(x => x.pose.shoulder), span(x => x.pose.elbow));
      },
    },
    {
      name: "手真的走了一大段（前臂绕肘转）",
      min: 12,
      measure: f => {
        const xs = f.map(x => x.pose.hand.x);
        const ys = f.map(x => x.pose.hand.y);
        return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      },
    },
  ],
};

// 自动断言：不由人写，从剪辑自己的声明推出来。
// 这类断言的价值在于它不会因人的疏忽而漏：写了 gripY 就必然被查。
function autoRules(clip) {
  const out = [];
  const grips = clip.tracks.filter(k => Number.isFinite(k.pose?.gripY));
  if (grips.length) {
    out.push({
      name: `握点钉死（声明了 gripY，共 ${grips.length}/${clip.tracks.length} 帧）`,
      max: 0.6,
      measure: f => {
        const xs = f.map(x => x.pose.hand.x);
        const ys = f.map(x => x.pose.hand.y);
        return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      },
    });
    if (grips.length < clip.tracks.length) {
      out.push({
        name: "声明了 grip 的剪辑，每一帧都该写 gripY（漏一帧就会跳）",
        pass: () => grips.length === clip.tracks.length,
      });
    }
  }
  return out;
}

const only = process.argv[2];
let failed = 0;
let checked = 0;

for (const [key, clip] of Object.entries(CLIPS)) {
  if (only && clip.id !== only && key !== only) continue;
  const list = [...autoRules(clip), ...(INVARIANTS[clip.id] || [])];
  if (!list.length) {
    console.log(`· ${clip.label}（${clip.id}）未声明不变量，跳过`);
    continue;
  }
  const fs = frames(clip);
  const lines = [];
  let ok = true;
  for (const rule of list) {
    checked += 1;
    let pass;
    let detail = "";
    if (rule.pass) {
      pass = rule.pass(fs);
    } else {
      const value = rule.measure(fs);
      detail = value.toFixed(2);
      pass = rule.max !== undefined ? value <= rule.max : value >= rule.min;
    }
    if (!pass) ok = false;
    lines.push(`    ${pass ? "✓" : "✗"} ${rule.name}${detail ? `  实测 ${detail}` : ""}`);
  }
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${clip.label}（${clip.id}）`);
  console.log(lines.join("\n"));
}

console.log(`\n${checked - failed ? "" : ""}不通过的动作：${failed}`);
process.exit(failed ? 1 : 0);
