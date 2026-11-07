// 精灵图播放器。
//
// 为什么单独一个模块：风格和运动要解耦。帧怎么画归设计，播到第几帧归这里。
// 换一套美术只需要换图片和行列数，代码不动。
//
// 用法：
//   const sprite = createSprite(el, { src: "/sheets/squat.png", cols: 6, rows: 1, fps: 12 });
//   sprite.play(); sprite.pause(); sprite.setFrame(3); sprite.destroy();
//
// 约定：
//   - 帧按行优先读：左上开始，往右排，一列一行。
//   - frames 不给时取 cols × rows。
//   - 图没加载完之前调用 play() 不会报错，加载完自动开始。

const DEFAULTS = {
  cols: 1,
  rows: 1,
  frames: null,
  fps: 12,
  loop: true,
  // 像素画要关掉平滑，否则放大之后糊成一团。手绘线条图要开着。
  pixelated: false,
  // 容器宽度没给时按自然尺寸撑开。
  size: null,
};

export function createSprite(el, options = {}) {
  if (!el) return NOOP;

  const opts = { ...DEFAULTS, ...options };
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  if (opts.pixelated) canvas.style.imageRendering = "pixelated";
  el.innerHTML = "";
  el.append(canvas);

  const ctx = canvas.getContext("2d");
  const image = new Image();
  let frameCount = opts.frames ?? opts.cols * opts.rows;
  let frame = 0;
  let playing = false;
  let raf = 0;
  let lastTime = 0;
  let acc = 0;
  let ready = false;
  let destroyed = false;

  const frameSize = () => ({
    w: image.naturalWidth / opts.cols,
    h: image.naturalHeight / opts.rows,
  });

  const fitCanvas = () => {
    if (!ready) return;
    const { w, h } = frameSize();
    // 画布按帧的原始像素建，显示尺寸交给 CSS。
    // 这样换显示大小不需要重建，也不会因为反复缩放把线条磨掉。
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    if (opts.size) {
      el.style.width = `${opts.size}px`;
      el.style.height = `${(opts.size * h) / w}px`;
      el.style.aspectRatio = `${w} / ${h}`;
    }
    draw();
  };

  const draw = () => {
    if (!ready || destroyed) return;
    const { w, h } = frameSize();
    const col = frame % opts.cols;
    const row = Math.floor(frame / opts.cols) % opts.rows;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, col * w, row * h, w, h, 0, 0, canvas.width, canvas.height);
  };

  const step = time => {
    if (!playing || destroyed) return;
    if (!lastTime) lastTime = time;
    const delta = time - lastTime;
    lastTime = time;
    acc += delta;
    const interval = 1000 / Math.max(1, opts.fps);
    // 用 while 而不是 if：掉帧时补上，不让播放速度跟着机器快慢漂。
    while (acc >= interval) {
      acc -= interval;
      const next = frame + 1;
      if (next >= frameCount) {
        if (opts.loop) frame = 0;
        else { playing = false; frame = frameCount - 1; draw(); return; }
      } else {
        frame = next;
      }
      draw();
    }
    raf = requestAnimationFrame(step);
  };

  image.onload = () => {
    ready = true;
    fitCanvas();
    if (playing) { lastTime = 0; raf = requestAnimationFrame(step); }
  };
  image.onerror = () => {
    console.warn("[sprite] 图片加载失败：", opts.src);
  };
  if (opts.src) image.src = opts.src;

  return {
    play() {
      if (!opts.loop && frame >= frameCount - 1) frame = 0;
      playing = true;
      lastTime = 0;
      acc = 0;
      cancelAnimationFrame(raf);
      if (ready) raf = requestAnimationFrame(step);
      return this;
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
      return this;
    },
    setFrame(i) {
      frame = ((i % frameCount) + frameCount) % frameCount;
      draw();
      return this;
    },
    /** 按 0–1 的相位定位。拖时间轴、做静帧都用它。 */
    seek(phase) {
      const t = Math.min(0.999, Math.max(0, phase));
      return this.setFrame(Math.floor(t * frameCount));
    },
    /** 换图或换行列数：不重建播放器，避免丢掉播放状态以外的所有引用。 */
    setSheet({ src, cols, rows, frames }) {
      if (cols) opts.cols = cols;
      if (rows) opts.rows = rows;
      if (frames) opts.frames = frames;
      frameCount = opts.frames ?? opts.cols * opts.rows;
      if (frame >= frameCount) frame = 0;
      ready = false;
      if (src) image.src = src;
      return this;
    },
    get frame() { return frame; },
    get frames() { return frameCount; },
    get playing() { return playing; },
    destroy() {
      destroyed = true;
      playing = false;
      cancelAnimationFrame(raf);
      image.onload = null;
      image.onerror = null;
      el.innerHTML = "";
    },
  };
}

const NOOP = {
  play() { return this; },
  pause() { return this; },
  setFrame() { return this; },
  seek() { return this; },
  setSheet() { return this; },
  destroy() {},
  frame: 0,
  frames: 0,
  playing: false,
};

export default { createSprite };
