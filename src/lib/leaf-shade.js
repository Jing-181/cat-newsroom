// 树影层：一层极淡的叶影铺在页面最底下，缓慢摇曳。
//
// 三条路径，按耗电从高到低：
//   gpu    —— 桌面 + 安全上下文 + WebGPU：WGSL 片元着色器直接算叶影，
//             1/4 分辨率、12fps、低功耗适配器，见 leaf-shade-webgpu.js
//   canvas —— 手机 / 无 WebGPU：2D 精灵图，手机 1/5 分辨率 10fps，
//             桌面无 GPU 时 1/3 分辨率 24fps
//   still  —— 系统开了减少动态效果：只画一帧，不排任何定时器
//
// 手机上不走 WebGPU，一半是我选的，一半是浏览器定的：局域网 http://192.168.x.x
// 不是安全上下文，navigator.gpu 根本不存在；就算存在，给一层氛围常驻跑 shader
// 也是白费电。决定耗电的是每帧算多少像素、跑多少帧，不是用 WebGPU 还是 2D canvas。
// 两条动态路径都用 setTimeout 而非 rAF：树影不需要跟 vsync 对齐，
// 两次绘制之间让 CPU/GPU 真的空闲下来，这才是省电的大头。
//
// 2D 路径不用贴图，也不逐帧造渐变：把一团柔边阴影预渲染成 96×96 精灵图，
// 反复缩放、旋转、漂移着画上去，几十片叶子就是一片树荫。

import { TIER, pickTier, tierBudget, readEnv } from "./leaf-shade-tier.js";
import { createGpuLeafShade } from "./leaf-shade-webgpu.js";

const SHADOW = [72, 62, 44];      // 叶影颜色（暖褐，压在米色纸上偏冷一点）

// 影子撒在哪里是固定的（同一台机器每次打开都看到同一片树荫），飘的只是相位。
// 锚点故意全压在四角与四条边上：中间那一片要留给字，树荫只从页面边缘漫进来。
// WGSL 版用的是同一组中心点，见 leaf-shade-webgpu.js 的 centers。
const ANCHORS = [
  { x: 0.04, y: 0.05, size: 0.34 },
  { x: 0.96, y: 0.09, size: 0.3 },
  { x: 0.03, y: 0.94, size: 0.32 },
  { x: 0.95, y: 0.9, size: 0.36 },
  { x: 0.52, y: 0.01, size: 0.26 },
  { x: 0.02, y: 0.52, size: 0.26 },
  { x: 0.99, y: 0.5, size: 0.24 },
  { x: 0.5, y: 0.99, size: 0.22 },
];

function makeSprite(size = 96) {
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d");
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // 中心实、边缘散。椭圆压扁之后就是一片叶子投下的影子。
  // 核心占半径的一半以上：太软会糊成一团污渍，叶影需要有边界才认得出来。
  gradient.addColorStop(0, `rgba(${SHADOW.join(",")},1)`);
  gradient.addColorStop(0.52, `rgba(${SHADOW.join(",")},.92)`);
  gradient.addColorStop(0.76, `rgba(${SHADOW.join(",")},.45)`);
  gradient.addColorStop(1, `rgba(${SHADOW.join(",")},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

function buildClusters() {
  return ANCHORS.map((anchor, index) => {
    const seed = index * 2.399963; // 黄金角，分布不扎堆
    const leaves = 9 + (index % 4);
    const items = [];
    for (let leaf = 0; leaf < leaves; leaf += 1) {
      const angle = seed + leaf * 1.13;
      const distance = 0.2 + ((leaf * 37) % 62) / 100;
      items.push({
        angle,
        distance,
        radius: 0.11 + ((leaf * 53) % 40) / 240,
        squash: 0.4 + ((leaf * 29) % 44) / 100,
        rotation: angle * 1.7,
        phase: (leaf * 1.31 + index) % (Math.PI * 2),
        sway: 0.6 + ((leaf * 17) % 50) / 60,
      });
    }
    return {
      x: anchor.x,
      y: anchor.y,
      size: anchor.size,
      driftX: 0.055 + (index % 3) * 0.02,
      driftY: 0.042 + (index % 4) * 0.014,
      speed: 0.16 + (index % 5) * 0.042,
      items,
    };
  });
}

// 统一的节拍器。刻意不用 rAF：rAF 跟着 vsync 每 16ms 唤醒一次，
// 而树影十几帧就够，中间那些唤醒纯属耗电。页面不可见时连定时器一起停。
function startClock({ fps, draw, resize }) {
  const interval = 1000 / fps;
  let timer = 0;
  let running = true;

  const tick = () => {
    if (!running || document.hidden) { timer = 0; return; }
    draw(performance.now() / 1000);
    timer = window.setTimeout(tick, interval);
  };
  const start = () => {
    if (!running || timer || document.hidden) return;
    timer = window.setTimeout(tick, interval);
  };
  const stop = () => { window.clearTimeout(timer); timer = 0; };
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  const onResize = () => { resize(); if (!document.hidden) draw(performance.now() / 1000); };

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  resize();
  draw(performance.now() / 1000); // 首帧立刻出，不等第一个 interval
  start();
  return () => {
    running = false;
    stop();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

function mount2D(canvas, { scale, fps, still }) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const sprite = makeSprite();
  const clusters = buildClusters();

  const resize = () => {
    canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
    canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
  };

  // 时间单位是秒。阵风、整簇漂移、单片摇摆三层周期错开，看不出循环。
  const draw = t => {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const unit = Math.min(width, height);
    const gust = 0.55 + 0.45 * Math.sin(t * 0.13) * Math.sin(t * 0.047 + 1.1);

    clusters.forEach(cluster => {
      const offsetX = Math.sin(t * cluster.speed + cluster.size * 7) * cluster.driftX * width;
      const offsetY = Math.cos(t * cluster.speed * 0.78 + cluster.size * 5) * cluster.driftY * height;
      const cx = cluster.x * width + offsetX;
      const cy = cluster.y * height + offsetY;

      cluster.items.forEach(leaf => {
        const sway = Math.sin(t * cluster.speed * 1.7 + leaf.phase) * gust
          + Math.sin(t * cluster.speed * 0.63 + leaf.phase * 1.7) * 0.35;
        const radius = leaf.radius * cluster.size * unit;
        const px = cx + Math.cos(leaf.angle + sway * 0.34) * leaf.distance * cluster.size * unit;
        const py = cy + Math.sin(leaf.angle + sway * 0.34) * leaf.distance * cluster.size * unit;
        context.save();
        context.translate(px, py);
        context.rotate(leaf.rotation + sway * 0.5);
        // 透明度和风同相：叶影迎光时变淡，这一下才像有光在动
        context.globalAlpha = 0.15 + 0.08 * Math.abs(Math.sin(t * 0.31 + leaf.phase)) + 0.05 * gust;
        context.drawImage(sprite, -radius, -radius * leaf.squash, radius * 2, radius * 2 * leaf.squash);
        context.restore();
      });
    });
  };

  if (still) {
    const onResize = () => { resize(); draw(0); };
    window.addEventListener("resize", onResize);
    resize();
    draw(0);
    return () => window.removeEventListener("resize", onResize);
  }
  return startClock({ fps, draw, resize });
}

function mountGpu(canvas, ctrl, { scale, fps, onLost }) {
  let stopped = false;
  ctrl.lost?.then(() => { if (!stopped) onLost?.(); });
  const resize = () => ctrl.resize(
    Math.max(1, Math.round(window.innerWidth * scale)),
    Math.max(1, Math.round(window.innerHeight * scale)),
  );
  const stop = startClock({ fps, draw: t => ctrl.render(t), resize });
  return () => {
    stopped = true;
    stop();
    ctrl.destroy();
  };
}

export function mountLeafShade({ parent = document.body, opacity = 0.34, env } = {}) {
  const host = parent || document.body;
  const options = env || readEnv();
  const tier = pickTier(options);
  const budget = tierBudget(tier, options.mobile);

  const makeCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.className = "leaf-shade";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.opacity = String(opacity);
    canvas.dataset.shadeTier = tier; // DevTools 里能直接确认走了哪档
    host.prepend(canvas);
    return canvas;
  };

  let canvas = makeCanvas();
  let disposed = false;
  let fellBack = false;
  let teardown = () => {};

  // 回落必须换一张 canvas：取过 webgpu context 的 canvas 不能再取 2d。
  const fallback = reason => {
    if (disposed || fellBack) return;
    fellBack = true;
    teardown();
    canvas.remove();
    canvas = makeCanvas();
    canvas.dataset.shadeTier = TIER.CANVAS;
    canvas.dataset.shadeFallback = typeof reason === "string" ? reason : (reason?.message || "device lost");
    teardown = mount2D(canvas, { ...tierBudget(TIER.CANVAS, options.mobile), still: false });
  };

  if (tier === TIER.GPU) {
    createGpuLeafShade(canvas)
      .then(ctrl => {
        if (disposed) { ctrl.destroy(); return; }
        teardown = mountGpu(canvas, ctrl, { ...budget, onLost: fallback });
      })
      .catch(fallback);
  } else {
    teardown = mount2D(canvas, { ...budget, still: tier === TIER.STILL });
  }

  return () => {
    if (disposed) return;
    disposed = true;
    teardown();
    canvas.remove();
  };
}

export default { mountLeafShade };
