// 树影层的档位判定。抽成纯函数，是为了能在 node 里测，也让「为什么没走 GPU」有单一出处。
//
// 三条硬事实决定了分档：
// 1) WebGPU 只在安全上下文暴露（HTTPS / localhost / 127.0.0.1）。手机用局域网
//    http://192.168.x.x 打开时 navigator.gpu 根本不存在，降级不是可选项，是前提。
// 2) 决定耗电的是每帧算多少像素、跑多少帧、定时器是否常驻，跟用 WebGPU 还是
//    2D canvas 关系不大。所以移动端一律不启用实时 shader，帧率也压到很低。
// 3) 系统开了减少动态效果时只留一帧，这条对所有档位都优先。

export const TIER = Object.freeze({
  GPU: "gpu",        // 桌面 + 安全上下文 + WebGPU：WGSL 实时，低分辨率低帧率
  CANVAS: "canvas",  // 2D 精灵图：移动端低帧率，桌面无 WebGPU 时正常帧率
  STILL: "still",    // 只画一帧，不排任何定时器
});

export function pickTier(env = {}) {
  const {
    reduceMotion = false,
    secureContext = false,
    hasGpu = false,
    mobile = false,
  } = env;
  if (reduceMotion) return TIER.STILL;
  if (!secureContext || !hasGpu || mobile) return TIER.CANVAS;
  return TIER.GPU;
}

// 帧率与画布分辨率按档位走。数字刻意压得低：树影是极慢的氛围层，
// 用 setTimeout 而不是 rAF，两次绘制之间让 CPU/GPU 真的空闲下来。
export function tierBudget(tier, mobile = false) {
  if (tier === TIER.GPU) return { fps: 12, scale: 1 / 4 };
  if (mobile) return { fps: 10, scale: 1 / 5 };
  return { fps: 24, scale: 1 / 3 };
}

// 环境读取单独放一处，测试时可以传 mock。
export function readEnv(win = window) {
  const media = win.matchMedia?.bind(win);
  const coarse = !!media?.("(pointer: coarse)")?.matches;
  const narrow = !!media?.("(max-width: 820px)")?.matches;
  return {
    reduceMotion: !!media?.("(prefers-reduced-motion: reduce)")?.matches,
    secureContext: !!win.isSecureContext,
    hasGpu: !!win.navigator?.gpu,
    mobile: narrow || coarse,
  };
}
