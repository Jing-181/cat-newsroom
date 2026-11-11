// 组装层：把动作剪辑、时间、画法接成一样东西。
//
// 使用处只跟这一层打交道：给一个 <svg> 和一个动作名，拿回一个 cleanup。
// 想换风格就传自己的 skin，想换节奏就传自己的 clip，不必改这里的代码。

import { prepareClip, sampleClip, solvePose, PROPORTIONS } from "./core.js";
import { createPlayer, prefersReducedMotion } from "./player.js";
import { createSvgSkin } from "./svg-skin.js";
import { clipFor, kindForName, CLIPS } from "./clips.js";

import { resolveDemo } from './demos.js';
import { createPlaceholder } from './demo-skin.js';

const NOOP = () => {};

export function createDemoFigure(svg, { exercise, reduced, speed = 1, skin, player = createPlayer, staticTime } = {}) {
  if (!svg || typeof document === 'undefined') return NOOP;
  const demo = resolveDemo(exercise);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${demo.clip?.label || '动作'} · ${demo.label}`);
  if (!demo.clip) return createPlaceholder(svg);
  const fixedTime = Number.isFinite(staticTime);
  const clip = fixedTime ? { ...demo.clip, stillAt: Math.max(0, Math.min(demo.clip.duration, staticTime)) } : demo.clip;
  return createFigure(svg, { clip, reduced: fixedTime ? true : reduced, speed, skin: skin || demo.skin, player });
}

export function createFigure(svg, {
  clip,
  kind = "squat",
  scale = 1,
  speed = 1,
  reduced,          // 传 true 强制静帧，传 false 强制播放；不传则跟随系统设置
  proportions = PROPORTIONS,
  skin: makeSkin = createSvgSkin,
  player: makePlayer = createPlayer,
} = {}) {
  if (!svg || typeof document === "undefined") return NOOP;

  const source = clip || clipFor(kind);
  const prepared = source.sample ? source : prepareClip(source);
  const skin = makeSkin(svg, { proportions });
  skin.resize(source.viewBox);

  if (scale !== 1) svg.style.setProperty("--fig-scale", String(scale));

  // 减少动态效果时不播，但也不是留一张空白：停在这一条剪辑里最有代表性的一秒。
  const draw = time => {
    const pose = source.sample ? source.sample(time) : solvePose(sampleClip(prepared, time), proportions);
    skin.paint(pose);
    skin.paintProp?.(source.prop, pose);
  };

  let player;
  let destroyed = false;
  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    player?.destroy();
    skin.destroy?.();
  };
  if (source.staticHold || (reduced ?? prefersReducedMotion())) {
    draw(prepared.stillAt);
    return cleanup;
  }

  draw(prepared.stillAt);
  player = makePlayer({
    duration: prepared.duration,
    loop: prepared.loop,
    speed,
    onFrame: draw,
  });
  player.play();

  return cleanup;
}

export { clipFor, kindForName, CLIPS, prepareClip, sampleClip, solvePose, PROPORTIONS };
export default { createFigure, clipFor, kindForName, CLIPS };
