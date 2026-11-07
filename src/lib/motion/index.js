// 组装层：把动作剪辑、时间、画法接成一样东西。
//
// 使用处只跟这一层打交道：给一个 <svg> 和一个动作名，拿回一个 cleanup。
// 想换风格就传自己的 skin，想换节奏就传自己的 clip，不必改这里的代码。

import { prepareClip, sampleClip, solvePose, PROPORTIONS } from "./core.js";
import { createPlayer, prefersReducedMotion } from "./player.js";
import { createSvgSkin } from "./svg-skin.js";
import { clipFor, kindForName, CLIPS } from "./clips.js";

const NOOP = () => {};

export function createFigure(svg, {
  clip,
  kind = "squat",
  scale = 1,
  speed = 1,
  reduced,          // 传 true 强制静帧，传 false 强制播放；不传则跟随系统设置
  proportions = PROPORTIONS,
  skin: makeSkin = createSvgSkin,
  skinOptions = {},   // 透传给皮肤的画法参数（body: "stick" | "shape" 等）
  player: makePlayer = createPlayer,
} = {}) {
  if (!svg || typeof document === "undefined") return NOOP;

  const source = clip || clipFor(kind);
  const prepared = prepareClip(source);
  const skin = makeSkin(svg, { proportions, ...skinOptions });
  skin.resize(source.viewBox);

  if (scale !== 1) svg.style.setProperty("--fig-scale", String(scale));

  // 减少动态效果时不播，但也不是留一张空白：停在这一条剪辑里最有代表性的一秒。
  const draw = time => {
    const pose = solvePose(sampleClip(prepared, time), proportions);
    skin.paint(pose);
    skin.paintProp?.(source.prop, pose);
  };

  if (reduced ?? prefersReducedMotion()) {
    draw(prepared.stillAt);
    return NOOP;
  }

  const player = makePlayer({
    duration: prepared.duration,
    loop: prepared.loop,
    onFrame: time => draw(time * speed),
  });
  player.play();

  return () => player.destroy();
}

export { clipFor, kindForName, CLIPS, prepareClip, sampleClip, solvePose, PROPORTIONS };
export default { createFigure, clipFor, kindForName, CLIPS };
