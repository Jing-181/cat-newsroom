// 把「文献里的关节角度」换算成剪辑里的 hipHeight / hipShift。
//
// 剪辑用髋高和髋前后位移摆姿势（直观、好调），文献给的是角度。这个脚本负责两头对接。
//
//   node scripts/pose-solve.mjs                    # 报出所有剪辑每个关键帧的角度
//   node scripts/pose-solve.mjs 102 2 22           # 反解：膝屈 102° / 肩在足中 x=2 / 躯干 22°
//
// 两个约束是这么选的：
//   1) 膝屈角 —— 文献里口径最干净的一个量，所有深蹲/硬拉资料都给。
//   2) 肩的横向位置 —— 杠铃技术的总原则是「杠始终在足中线上方」。
//      这一条把整个姿势钉死，比再找一个角度可靠：它同时管住了髋往后退多少。
// 髋屈角、胫骨前倾反解完顺手报出来，用来和文献交叉验证，不作为输入。
//
// 反解没有闭式解，用粗扫 + 细扫。精度 0.1 个单位，比这套线条稿能表达的分辨率细。

import { CLIPS } from "../src/lib/motion/clips.js";
import { prepareClip, sampleClip, solvePose, jointAngles } from "../src/lib/motion/core.js";

const fmt = n => n.toFixed(0);

function report() {
  for (const clip of Object.values(CLIPS)) {
    const prepared = prepareClip(clip);
    console.log(`\n== ${clip.id} (${clip.duration}s)`);
    for (const track of clip.tracks) {
      const pose = solvePose(sampleClip(prepared, track.at));
      const a = jointAngles(pose);
      console.log(
        `  t=${String(track.at).padEnd(5)} 膝屈 ${fmt(a.kneeFlex).padStart(3)}°  胫骨 ${fmt(a.shinLean).padStart(3)}°  髋屈 ${fmt(a.hipFlex).padStart(3)}°  躯干 ${fmt(a.trunkLean).padStart(2)}°  肩x ${pose.shoulder.x.toFixed(1).padStart(5)}`,
      );
    }
  }
}

function solve(targetKnee, targetShoulderX, lean) {
  const cost = (h, s) => {
    const pose = solvePose({ hipHeight: h, hipShift: s, lean });
    const a = jointAngles(pose);
    return Math.abs(a.kneeFlex - targetKnee) + Math.abs(pose.shoulder.x - targetShoulderX) * 1.5;
  };

  let best = { h: 50, s: 0, cost: Infinity };
  for (let h = 18; h <= 54; h += 0.5) {
    for (let s = -26; s <= 14; s += 0.5) {
      const c = cost(h, s);
      if (c < best.cost) best = { h, s, cost: c };
    }
  }
  for (let h = best.h - 0.6; h <= best.h + 0.6; h += 0.1) {
    for (let s = best.s - 0.6; s <= best.s + 0.6; s += 0.1) {
      const c = cost(h, s);
      if (c < best.cost) best = { h, s, cost: c };
    }
  }

  const pose = solvePose({ hipHeight: best.h, hipShift: best.s, lean });
  const a = jointAngles(pose);
  console.log(`目标 膝屈 ${targetKnee}° / 肩x ${targetShoulderX} / 躯干 ${lean}°`);
  console.log(`→ hipHeight ${best.h.toFixed(1)}  hipShift ${best.s.toFixed(1)}`);
  console.log(`实际 膝屈 ${a.kneeFlex.toFixed(1)}° / 肩x ${pose.shoulder.x.toFixed(1)} / 胫骨 ${a.shinLean.toFixed(1)}° / 髋屈 ${a.hipFlex.toFixed(1)}°`);
  console.log(`误差 ${best.cost.toFixed(2)}`);
}

const args = process.argv.slice(2).map(Number);
if (args.length === 3 && args.every(Number.isFinite)) solve(args[0], args[1], args[2]);
else report();
