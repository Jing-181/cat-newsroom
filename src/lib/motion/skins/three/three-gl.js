// 共享 WebGL 上下文。
//
// 为什么是共享的：一个页面会同时挂十几个小人（审查页一屏九个），而浏览器给单个页面的
// WebGL 上下文配额只有十几个（Chrome 16，Safari 更少），用满就整片黑掉。
// 所以这里只建一个离屏 canvas，所有实例轮流在上面画，画完立刻把像素搬进各自的 2D canvas。
// 上下文数量恒为 1。
//
// 代价是每个实例每帧多一次 drawImage。这个尺寸（~140×170 CSS px）下是 GPU 到 GPU 的
// blit，比多申请一个上下文的代价低得多。
//
// 引用计数归零时用 WEBGL_lose_context 主动释放：光靠 GC 回收 canvas 不够，
// 上下文要等浏览器自己发现，来回切几次页面就会撞上限。

import { createProgram, FLOATS_PER_VERTEX } from "./three-shader.js";

const NEAR_Z = -200;
const FAR_Z = 200;

let shared = null;

function compileProgram(gl) {
  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
  // 属性指针是全局状态，配上就不必每帧重设——每帧只换缓冲内容，不换布局。
  const layout = [
    ["aA", 3, 0], ["aB", 3, 3], ["aCorner", 2, 6],
    ["aRadial", 1, 8], ["aSpan", 1, 9], ["aStyle", 3, 10],
  ];
  for (const [name, size, offset] of layout) {
    const index = program.attributes[name];
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
  }
  return { program, buffer };
}

function createContext() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const attrs = {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  };
  const gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
  if (!gl) return null;

  let compiled;
  try {
    compiled = compileProgram(gl);
  } catch (error) {
    console.warn(error.message);
    return null;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.useProgram(compiled.program.program);

  const state = {
    canvas,
    gl,
    program: compiled.program,
    buffer: compiled.buffer,
    matrix: new Float32Array(16),
    capacity: 0,      // 缓冲能装多少顶点，只增不减
    width: 1,
    height: 1,
    lost: false,
    refs: 0,
    dispose() {
      const lose = gl.getExtension("WEBGL_lose_context");
      gl.deleteBuffer(compiled.buffer);
      compiled.program.dispose();
      // 主动丢上下文，别等浏览器自己回收：来回切页面时这一步决定会不会撞上限。
      if (lose) lose.loseContext();
    },
  };

  // 上下文丢失后不重建：重建要重编着色器，而丢上下文通常意味着页面正在回收资源，
  // 硬撑着重来只会让它反复丢。让实例停在最后一帧更稳。
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    state.lost = true;
  });
  return state;
}

// 正交投影：把 viewBox 的矩形原样映射到 canvas 像素，跟线条稿的坐标系一比一对齐。
function ortho(left, right, bottom, top, near, far, out) {
  out[0] = 2 / (right - left); out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 2 / (top - bottom); out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = -2 / (far - near); out[11] = 0;
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function acquireGL() {
  if (!shared) shared = createContext();
  if (!shared) return null;
  shared.refs += 1;
  return shared;
}

export function releaseGL(state) {
  if (!state) return;
  state.refs -= 1;
  if (state.refs > 0) return;
  state.dispose();
  if (shared === state) shared = null;
}

// 当前活着的上下文数量。审查页拿它确认「同时挂三个实例只占一个上下文」。
export function liveContexts() {
  return shared ? 1 : 0;
}

// 保证离屏画布至少这么大。只增不减：反复 realloc 比多留几十 KB 贵得多。
function ensureSize(state, width, height) {
  if (state.width >= width && state.height >= height) return;
  state.width = Math.max(state.width, width);
  state.height = Math.max(state.height, height);
  state.canvas.width = state.width;
  state.canvas.height = state.height;
}

// 把一个实例画进离屏画布，再拷到它自己的 2D canvas 上。
//
// 区域固定在画布左上角（视口 y 从底部数起，所以偏移 canvas.height - height），
// 这样 drawImage 直接取 (0,0,w,h) 就是刚画的那一块，不用记两套坐标。
export function renderTo(state, { data, count, rect, width, height, target }) {
  if (!state || state.lost || !count) return;
  ensureSize(state, width, height);
  const { gl, canvas } = state;

  gl.viewport(0, canvas.height - height, width, height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, canvas.height - height, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  ortho(rect.x, rect.x + rect.w, -(rect.y + rect.h), -rect.y, NEAR_Z, FAR_Z, state.matrix);
  gl.uniformMatrix4fv(state.program.uViewProj, false, state.matrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
  // 缓冲容量跟调用方的数组一样大（它本来就是按最大顶点数预分配的）。
  // 只分配一次，之后每帧整块上传：多传几百字节，换掉一个 subarray 视图，
  // 也避开 WebGL1 不认 bufferSubData 五参数重载这个坑——它只接受完整视图。
  if (data.length > state.capacity) {
    state.capacity = data.length;
    gl.bufferData(gl.ARRAY_BUFFER, state.capacity * 4, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  gl.drawArrays(gl.TRIANGLES, 0, count);

  target.clearRect(0, 0, width, height);
  target.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
}
