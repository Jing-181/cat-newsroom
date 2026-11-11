// 时间层：所有「什么时候画下一帧」的判断只在这里做一次。
//
// 之前每写一个动画都要自己来一遍 rAF + 减少动态效果 + 页面切走要不要停，
// 于是有的停了有的没停，有的在后台还在跑。现在统一收在这里：
// 页面不可见就停、系统要求减少动态就不播、掉帧严重时按上限限速。

const DEFAULT_RAF = cb =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : setTimeout(() => cb(Date.now()), 16);

const DEFAULT_CANCEL = id =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

const DEFAULT_NOW = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// fps = 0 表示不限速。人物这类小面积矢量图不必限速，
// 但全屏 canvas 那种（树影）传 30 能省一半电。
export function createPlayer({
  duration = 1,
  loop = true,
  onFrame = () => {},
  fps = 0,
  speed = 1,
  raf = DEFAULT_RAF,
  cancel = DEFAULT_CANCEL,
  now = DEFAULT_NOW,
  watchVisibility = true,
} = {}) {
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('speed must be positive');
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('duration must be positive');
  let id = null;
  let running = false;
  let wanted = false;   // 用户想要它播；页面切走时会被暂停，回来要能自动续上
  let origin = 0;       // 本次播放的起点
  let offset = 0;       // 之前累积的进度，暂停后接着播用
  let lastPaint = -Infinity;
  let destroyed = false;

  const timeNow = () => offset + (now() - origin) / 1000 * speed;

  const tick = () => {
    if (destroyed || !running) return;
    const t = now();

    if (!loop && timeNow() >= duration) {
      offset = duration;
      running = false;
      id = null;
      onFrame(duration, { done: true });
      return;
    }

    if (fps > 0 && t - lastPaint < 1000 / fps - 0.5) {
      id = raf(tick);
      return;
    }
    lastPaint = t;

    const time = timeNow();
    onFrame(loop ? time % duration : time);
    if (!destroyed && running) id = raf(tick);
  };

  const play = () => {
    if (destroyed) return;
    wanted = true;
    if (running) return;
    running = true;
    origin = now();
    lastPaint = -Infinity;
    id = raf(tick);
  };

  const pause = () => {
    if (!running) return;
    offset = timeNow();
    if (loop && duration > 0) offset %= duration;
    running = false;
    if (id !== null) cancel(id);
    id = null;
  };

  const stop = () => {
    wanted = false;
    pause();
    offset = 0;
  };

  const seek = seconds => {
    if (destroyed) return;
    offset = loop && duration > 0 ? ((seconds % duration) + duration) % duration : Math.max(0, seconds);
    origin = now();
    if (!running) onFrame(offset);
  };

  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.hidden) pause();
    else if (wanted) play();
  };

  if (watchVisibility && typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", onVisibility);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    wanted = false;
    pause();
    if (watchVisibility && typeof document !== "undefined" && document.removeEventListener) {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };

  return { play, pause, stop, seek, destroy, get running() { return running; } };
}

export default { createPlayer, prefersReducedMotion };
