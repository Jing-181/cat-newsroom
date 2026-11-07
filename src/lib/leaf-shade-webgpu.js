// 树影的 WebGPU 路径：一份 WGSL 着色器 + 一条最小渲染管线。
//
// 只画一个全屏三角形，没有顶点缓冲、贴图、采样器，也没有任何新依赖。
// 叶影的形状全在片元里用解析式算，放大不会出现多边形棱角，
// 也省掉每帧上传几何。所有实例只占一个 device，跟项目里那套自研 WebGL
// 渲染器共用上下文的思路一致，但这里是独立的一层，不挂靠 motion/ 的任何东西。
//
// 省电靠三件事，都不在「用哪个 API」上：
//   - 请求低功耗适配器（powerPreference: "low-power"），不惊动独显
//   - 画布只有视口的 1/4，噪声只叠两层 octave
//   - 帧率与定时器由 leaf-shade.js 的 startClock 统一压到 12fps，
//     页面不可见时连 device 一起停绘

// 结构四个 f32，正好 16 字节，满足 uniform buffer 的对齐要求。
export const UNIFORM_BYTES = 16;

export const WGSL = `
struct Uniforms {
  time: f32,
  width: f32,
  height: f32,
  intensity: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  return vec4<f32>(corners[index], 0.0, 1.0);
}

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let a = mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), s.x);
  let b = mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), s.x);
  return mix(a, b, s.y);
}

// 两层就够。第三层 octave 在这层淡影上看不出区别，却要多一倍采样。
fn fbm(p: vec2<f32>) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var q = p;
  for (var k = 0; k < 2; k = k + 1) {
    v = v + amp * valueNoise(q);
    q = q * 2.03;
    amp = amp * 0.5;
  }
  return v;
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag.xy / vec2<f32>(u.width, u.height);
  let t = u.time;
  // 阵风：快慢两个周期相乘，匀速摆动会读成机器在平移。
  let gust = 0.55 + 0.45 * sin(t * 0.13) * sin(t * 0.047 + 1.1);
  // 八个叶影团共用一张噪声场，只错开相位，不重算 fbm。
  let edgeField = fbm(uv * 7.0 + vec2<f32>(t * 0.05, -t * 0.03));

  // 锚点全压在四角与四边，中间那一片留给字，跟 2D 版的 ANCHORS 同一组中心。
  var centers = array<vec2<f32>, 8>(
    vec2<f32>(0.04, 0.05), vec2<f32>(0.96, 0.09),
    vec2<f32>(0.03, 0.94), vec2<f32>(0.95, 0.90),
    vec2<f32>(0.52, 0.01), vec2<f32>(0.02, 0.52),
    vec2<f32>(0.99, 0.50), vec2<f32>(0.50, 0.99),
  );

  var acc = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let drift = vec2<f32>(
      sin(t * 0.11 + fi * 1.7) * 0.022 * gust,
      cos(t * 0.087 + fi * 1.3) * 0.016 * gust,
    );
    let c = centers[i] + drift;
    // 压扁成叶影椭圆；中心实、边缘散，对应 2D 精灵图的径向渐变。
    let d = (uv - c) * vec2<f32>(1.0, 1.0 / 0.62);
    let edge = fract(edgeField + fi * 0.37);
    let r = length(d) + (edge - 0.5) * 0.085;
    let blob = 1.0 - smoothstep(0.14, 0.40, r);
    acc = min(1.0, acc + blob * 0.42);
  }

  // 细噪声打散大团的塑料感，纸纤维那种粒度。
  let grain = fbm(uv * 22.0 + vec2<f32>(t * 0.008, 0.0));
  let alpha = clamp(acc * (0.74 + 0.26 * grain) * u.intensity, 0.0, 1.0);
  let shadow = vec3<f32>(0.282, 0.243, 0.173); // 72,62,44 暖褐，跟 2D 版同色
  return vec4<f32>(shadow * alpha, alpha);      // premultiplied，配 alphaMode
}
`;

// 返回 { render, resize, destroy, lost }。
// 任何一步失败都抛，交给 leaf-shade.js 统一回落 2D；这里不自己吞错。
export async function createGpuLeafShade(canvas) {
  if (!navigator.gpu) throw new Error("WebGPU 不可用");

  // 低功耗适配器是首选，但有些实现（含软件后端、只挂独显的机器）在 low-power
  // 下直接返回 null。拿不到就退回默认适配器：省电的大头是低分辨率与低帧率，
  // 不该为了一个偏好把整条路径弄没了。
  let adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("拿不到 GPU 适配器");
  const device = await adapter.requestDevice();

  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new Error("拿不到 webgpu canvas 上下文");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  const configure = () => context.configure({ device, format, alphaMode: "premultiplied" });
  configure();

  const shader = device.createShaderModule({ code: WGSL });
  // 编译错误要到建管线才抛，主动问一次能更早拿到人话。
  let compilation = null;
  try { compilation = await shader.getCompilationInfo?.(); } catch { /* 实现没这方法就交给管线报错 */ }
  const errors = compilation?.messages?.filter(item => item.type === "error") ?? [];
  if (errors.length) {
    device.destroy();
    throw new Error(`WGSL 编译失败：${errors.map(item => item.message).join("; ")}`);
  }

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shader, entryPoint: "vs" },
    fragment: {
      module: shader,
      entryPoint: "fs",
      targets: [{
        format,
        // 片元输出 premultiplied，跟 alphaMode 对齐。
        blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });

  const uniforms = device.createBuffer({
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  });
  const scratch = new Float32Array(4);

  let disposed = false;

  function render(seconds, intensity = 1) {
    if (disposed) return;
    scratch[0] = seconds;
    scratch[1] = canvas.width;
    scratch[2] = canvas.height;
    scratch[3] = intensity;
    device.queue.writeBuffer(uniforms, 0, scratch);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function resize(width, height) {
    if (disposed) return;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    configure(); // 尺寸变了重配一次，避开各实现在 resize 上的差异
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    context.unconfigure?.();
    uniforms.destroy();
    device.destroy();
  }

  return { render, resize, destroy, lost: device.lost };
}

export default { createGpuLeafShade, WGSL, UNIFORM_BYTES };
