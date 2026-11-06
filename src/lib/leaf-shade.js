// 树影层：一层极淡的叶影铺在页面最底下，缓慢摇曳。
//
// 不用贴图，也不用逐帧造渐变：先把一团柔边阴影预渲染成一张 96×96 的精灵图，
// 再把它当成"一片叶子"反复缩放、旋转、漂移着画上去。几十片叶子就是一片树荫。
//
// 三个成本上的取舍：
// 1) 画布只有视口的三分之一分辨率，靠浏览器放大做自然虚化，省掉 ctx.filter 的模糊开销；
// 2) 精灵图只造一次，每帧只做 drawImage，没有每帧新建渐变对象；
// 3) 30fps 封顶、页面不可见时停，系统开了「减少动态效果」就只画一帧静态的。

const SHADOW = [72, 62, 44];      // 叶影颜色（暖褐，压在米色纸上偏冷一点）
const RENDER_SCALE = 1 / 3;       // 画布内部分辨率比例
const FPS = 30;

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

// 影子撒在哪里是固定的（同一台机器每次打开都看到同一片树荫），飘的只是相位。
// 锚点故意全压在四角与四条边上：中间那一片要留给字，树荫只从页面边缘漫进来。
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

export function mountLeafShade({ parent = document.body, opacity = 0.34 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "leaf-shade";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = String(opacity);
  parent.prepend(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return () => {};
  }

  const sprite = makeSprite();
  const clusters = buildClusters();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let width = 0;
  let height = 0;
  let frame = 0;
  let lastPaint = 0;
  let lastTime = 0;
  let running = true;

  const resize = () => {
    width = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
    height = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
    canvas.width = width;
    canvas.height = height;
    paint(lastTime, true);
  };

  const paint = (time, force = false) => {
    if (!width || !height) return;
    if (!force && time - lastPaint < 1000 / FPS) return;
    lastPaint = time;
    const t = time / 1000;
    context.clearRect(0, 0, width, height);
    const unit = Math.min(width, height);
    // 阵风：慢速起伏的包络。匀速摆动看着像机器在平移，有强弱才像风。
    const gust = 0.55 + 0.45 * Math.sin(t * 0.13) * Math.sin(t * 0.047 + 1.1);

    clusters.forEach(cluster => {
      // 整簇的漂移比单片叶子慢一档，像树在大周期地晃
      const offsetX = Math.sin(t * cluster.speed + cluster.size * 7) * cluster.driftX * width;
      const offsetY = Math.cos(t * cluster.speed * 0.78 + cluster.size * 5) * cluster.driftY * height;
      const cx = cluster.x * width + offsetX;
      const cy = cluster.y * height + offsetY;

      cluster.items.forEach(leaf => {
        // 摇摆叠两个周期：一个跟着全局风，一个走自己的频率，合起来不容易看出循环
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

  const loop = time => {
    if (!running) return;
    lastTime = time;
    paint(time);
    frame = requestAnimationFrame(loop);
  };

  const start = () => {
    if (reduceMotion) {
      paint(0, true);
      return;
    }
    if (!running) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  };

  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(frame);
      return;
    }
    running = true;
    start();
  };

  resize();
  if (!reduceMotion) start();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.remove();
  };
}

export default { mountLeafShade };
