#!/usr/bin/env node
// 悬垂动作反解：给定握点高度和手臂/腿的角度，看身体实际落在哪。
// 用法：node scripts/hang-solve.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { prepareClip, sampleClip, solvePose, PROPORTIONS } = await import(
  pathToFileURL(resolve(root, "src/lib/motion/index.js"))
);

const probe = (label, pose) => {
  const p = solvePose({ freeLegs: true, ...pose }, PROPORTIONS);
  const ys = ["head", "shoulder", "hip", "knee", "ankle", "footToe"].map(k => -p[k].y);
  console.log(
    label.padEnd(14),
    "手高", (-p.hand.y).toFixed(1).padStart(6),
    "x", p.hand.x.toFixed(1).padStart(6),
    "| 头/肩/髋/膝/踝/趾 高度:",
    ys.map(v => v.toFixed(0).padStart(4)).join(" "),
  );
};

console.log("── 现状（髋高写死，手在飘）──");
probe("悬垂", { hipHeight: 40, armSwing: 178, elbow: 0, lean: 3 });
probe("顶点", { hipHeight: 52, armSwing: 168, elbow: 110, lean: 5 });

console.log("\n── 反解：握点钉在 104，只改手臂角 ──");
for (const el of [0, 30, 60, 90, 110, 125, 140]) {
  probe(`屈肘 ${el}°`, { gripY: 104, gripX: 0, armSwing: 178 - el * 0.09, elbow: el, lean: 3, freeThigh: 8, freeKnee: 45 });
}

console.log("\n── 新引体数据实測 ──");
const { CLIPS } = await import(pathToFileURL(resolve(root, "src/lib/motion/clips.js")));
for (const key of ["pullUp", "hangingLegRaise"]) {
  const clip = CLIPS[key];
  if (!clip) continue;
  const prepared = prepareClip(clip);
  for (let i = 0; i <= 5; i += 1) {
    const t = (prepared.duration * i) / 5;
    const p = solvePose(sampleClip(prepared, t), PROPORTIONS);
    const box = ["head", "hand", "hip", "ankle", "footToe", "kneeFar", "footToeFar"]
      .map(k => [p[k].x, -p[k].y]);
    const xs = box.map(v => v[0]); const ys = box.map(v => v[1]);
    console.log(
      clip.id.padEnd(18), `t=${t.toFixed(2)}`,
      "手", `${p.hand.x.toFixed(1)},${(-p.hand.y).toFixed(1)}`.padStart(13),
      "踝高", (-p.ankle.y).toFixed(1).padStart(5),
      "包围盒 x[", Math.min(...xs).toFixed(0), ",", Math.max(...xs).toFixed(0), "]",
      "y[", Math.min(...ys).toFixed(0), ",", Math.max(...ys).toFixed(0), "]",
    );
  }
}

for (const [t, k] of [[8, 0], [8, 45], [15, 70], [22, 95], [30, 110]]) {
  probe(`腿 ${t}/${k}`, { gripY: 104, gripX: 0, armSwing: 168, elbow: 110, lean: 3, freeThigh: t, freeKnee: k });
}
