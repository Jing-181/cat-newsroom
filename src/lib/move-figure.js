// 训练小人。真正的实现已经搬到 src/lib/motion/，这里只保留原来的入口。
//
// 留着这个文件是为了让使用处不必改：workout-ui.js 仍然 import { mountMoveFigure }。
// 新代码请直接用 motion/index.js 的 createFigure，并且用 kindForName(name) 挑动作，
// 不要在这里继续加分支。
//
// 为什么不用 GIF 也不用贴图：线条稿要和这套纸墨界面同一个笔触（圆头、一个粗细、
// currentColor 上色），而且动作幅度要跟着数据走。

import { createFigure, clipFor, kindForName } from "./motion/index.js";

export function mountMoveFigure(svg, { kind = "squat", scale = 1, speed = 1, clip } = {}) {
  return createFigure(svg, { clip: clip || clipFor(kind), scale, speed });
}

export { kindForName, clipFor };

export default { mountMoveFigure, kindForName, clipFor };
