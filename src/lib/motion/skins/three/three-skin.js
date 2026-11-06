// 3D 玩偶皮肤：契约入口。
//
// 方案 C——不追求解剖学意义上的三维姿态，只做「3D 渲染质感」。
// 数据源是二维关节点，硬反推三维关节角必然穿帮；这里给每个部位补一条固定厚度，
// 剩下的交给真实的光照、真实的圆柱、真实的前后遮挡。侧视动作读起来就是立体人偶。
//
// 每帧只做三件事：改写一个 Float32Array、一次 bufferSubData、一次 drawArrays。
// paint 里不建几何、不建材质、不读布局、不分配对象。
//
// 多个实例共用一个 WebGL 上下文（见 three-gl.js）。WebGL 不可用时整体退回线条稿，
// 不白屏——两套画法用的是同一份关节数据，退化后姿势仍然是对的。

import { createSkin as createLineSkin } from "../line/line-skin.js";
import { PROPORTIONS } from "../../core.js";
import { acquireGL, releaseGL, renderTo, liveContexts } from "./three-gl.js";
import { layout, layoutProp, MAX_VERTS } from "./three-doll.js";
import { FLOATS_PER_VERTEX } from "./three-shader.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// 默认框跟 clips.js 的 FIGURE_BOX 一致：聚合页可能不调 resize，只设 viewBox 属性。
const DEFAULT_BOX = "-50 -116 106 122";
// 投影框比 viewBox 各边多留一点：圆柱有粗细，末端会伸出关节点之外。
const PAD = 12;
// 离屏画布的单边上限。超过这个尺寸收益全在抗锯齿上，不值。
const MAX_SIDE = 720;
const MAX_DPR = 2;

// 没有 DOM 时的空皮肤：SSR、测试、被误调用都不该炸。
const NOOP_SKIN = { resize() {}, paint() {}, paintProp() {}, destroy() {} };

// 同一轮任务里的多个实例合成一次渲染。paint 和 paintProp 是两次调用，
// 中间不能画——否则器械会晚一帧，静帧（只调一次 paint/paintProp）里干脆没有器械。
const pending = new Set();
let flushQueued = false;

function schedule(instance) {
  pending.add(instance);
  if (flushQueued) return;
  flushQueued = true;
  const run = () => {
    flushQueued = false;
    const batch = [...pending];
    pending.clear();
    for (const item of batch) item.flush();
  };
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else Promise.resolve().then(run);
}

function parseBox(text) {
  const nums = String(text || "").trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some(n => !Number.isFinite(n))) return null;
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

// viewBox 可能是 "0 0 100 100" 也可能是四个数字的数组，两种都收。
function boxOf(value, svg) {
  if (Array.isArray(value)) {
    const [x, y, w, h] = value.map(Number);
    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w, h };
  }
  return parseBox(value) || parseBox(svg.getAttribute("viewBox")) || parseBox(DEFAULT_BOX);
}

function createDollSkin(svg, proportions) {
  if (!svg || typeof document === "undefined") return NOOP_SKIN;

  const gl = acquireGL();
  if (!gl) throw new Error("[three-skin] WebGL 不可用");

  const P = { ...PROPORTIONS, ...proportions };
  // 换一套骨架比例时，粗细和厚度一起跟着变，不能只缩关节位置。
  const girth = (P.torso || PROPORTIONS.torso) / PROPORTIONS.torso;
  const box = boxOf(null, svg);
  const rect = {
    x: box.x - PAD,
    y: box.y - PAD,
    w: box.w + PAD * 2,
    h: box.h + PAD * 2,
  };

  svg.innerHTML = "";
  const host = document.createElementNS(SVG_NS, "foreignObject");
  host.setAttribute("x", String(rect.x));
  host.setAttribute("y", String(rect.y));
  host.setAttribute("width", String(rect.w));
  host.setAttribute("height", String(rect.h));
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);
  svg.append(host);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    releaseGL(gl);
    svg.innerHTML = "";
    throw new Error("[three-skin] 2D canvas 不可用");
  }

  const data = new Float32Array(MAX_VERTS * FLOATS_PER_VERTEX);
  // 身体占多少顶点由 layout 自己报，器械紧接在后面。不另存一份部位清单，
  // 免得两张表不同步（上一版就因为清单里漏了手臂，整条胳膊没画出来）。
  let body = 0;
  let count = 0;
  let alive = true;
  let observer = null;

  // 量尺寸只在 resize 与尺寸变化时做，paint 里绝不读布局。
  const measure = () => {
    if (!alive) return;
    let cssW = 0;
    let cssH = 0;
    if (typeof svg.getBoundingClientRect === "function") {
      const bounds = svg.getBoundingClientRect();
      cssW = bounds.width;
      cssH = bounds.height;
    }
    // viewBox → 元素框是 preserveAspectRatio 的 meet 缩放，取两个方向的较小者。
    const fit = cssW && cssH ? Math.min(cssW / box.w, cssH / box.h) : 0;
    // 还没上屏（宽高为 0）时先按一个保守值画，ResizeObserver 会再来一次。
    const scale = fit > 0 ? fit : 160 / box.h;
    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_DPR);
    // 两个方向用同一个系数缩放：分别夹取会把长宽比拉歪，小人就被压扁了。
    const wanted = Math.max(rect.w, rect.h) * scale * dpr;
    const shrink = wanted > MAX_SIDE ? MAX_SIDE / wanted : 1;
    const width = Math.max(8, Math.round(rect.w * scale * dpr * shrink));
    const height = Math.max(8, Math.round(rect.h * scale * dpr * shrink));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  measure();

  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(measure);
    observer.observe(svg);
  }

  const instance = {
    flush() {
      if (!alive) return;
      renderTo(gl, {
        data,
        count,
        rect,
        width: canvas.width,
        height: canvas.height,
        target: ctx,
      });
    },
  };

  return {
    resize(viewBox) {
      if (!alive) return;
      if (viewBox) svg.setAttribute("viewBox", String(viewBox));
      const next = boxOf(viewBox, svg);
      box.x = next.x; box.y = next.y; box.w = next.w; box.h = next.h;
      rect.x = box.x - PAD;
      rect.y = box.y - PAD;
      rect.w = box.w + PAD * 2;
      rect.h = box.h + PAD * 2;
      host.setAttribute("x", String(rect.x));
      host.setAttribute("y", String(rect.y));
      host.setAttribute("width", String(rect.w));
      host.setAttribute("height", String(rect.h));
      measure();
    },

    paint(pose) {
      if (!alive || !pose) return;
      body = layout(data, pose, girth);
      count = body;
      schedule(instance);
    },

    paintProp(prop, pose) {
      // 没先画身体就不画器械：器械紧接在身体的顶点后面，body 还是 0 时无从对齐。
      if (!alive || !body || !pose) return;
      const used = layoutProp(data, body, prop, pose, girth);
      count = body + used;
      schedule(instance);
    },

    destroy() {
      if (!alive) return;
      alive = false;
      pending.delete(instance);
      if (observer) observer.disconnect();
      observer = null;
      releaseGL(gl);
      host.remove();
    },

    // 审查页与测试用的旁路信息，不属于契约。
    stats() {
      return {
        verts: count,
        draws: count ? 1 : 0,
        pixels: [canvas.width, canvas.height],
        contexts: liveContexts(),
      };
    },
  };
}

export function createSkin(target, { proportions = {} } = {}) {
  try {
    return createDollSkin(target, proportions);
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[three-skin] 退回线条稿：", error.message);
    }
    if (target) target.innerHTML = "";
    // 线条稿用的是同一份关节点，退化后姿势仍然正确，只是换了个画法。
    // 但要标出来：对照页上不标的话，会被误认为“3D 就长这样”。
    const fallback = createLineSkin(target, { proportions });
    fallback.fallback = true;
    fallback.fallbackReason = error && error.message || String(error);
    return fallback;
  }
}

export default { createSkin };
