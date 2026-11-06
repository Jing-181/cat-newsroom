// 玩偶人偶的着色器。
//
// 一段肢体在屏幕上就是一个「胶囊的包围盒」，片元里对每个像素做一次解析求交：
// 把它投到骨骼轴上，落到半径内才算命中，算出法线再着色。命中不了就 discard。
//
// 为什么不在顶点里摆真几何：这套人偶每帧要重算，而它只有胶囊和球两种形状。
// 解析求交的轮廓是精确的（放大不会出现多边形棱角），顶点数固定成 6 个，
// 每个实例每帧只发一次 drawArrays；换成真网格要么重建缓冲要么上几十个 draw call。
//
// 光照三层，缺一层就会掉进「塑料 3D 建模」那个观感：
//   1. 包裹式半兰伯特：没有硬阴影，像橡皮玩具那样缓缓过渡
//   2. 接缝与端部压暗：接缝是模具线，端部是关节被挡住的地方，玩具感的来源
//   3. 边缘冷色反光：从前上方打来的暖光要留出环境余量，深底上轮廓才不会糊掉

const SUIT_COLOR = "#d4733a";   // 玩偶主色：哑光陶土橙
const GEAR_COLOR = "#b8934a";   // 器械：旧黄铜

// 光从前上方偏左来：跟卡片里那道暖光同侧，人偶就不会像贴上去的。
const LIGHT = normalize([-0.52, 0.58, 0.63]);
// 接缝的间距（身体单位）。太密像缠了绷带，太疏就没有体积提示。
const SEAM_GAP = 3.4;

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const glslVec3 = v => `vec3(${v.map(n => n.toFixed(4)).join(", ")})`;

const glslColor = hex => {
  const n = parseInt(hex.replace("#", ""), 16);
  const rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  return glslVec3(rgb.map(c => Math.pow(c, 2.2)));
};

// 每顶点 13 个 float：aA(3) aB(3) aCorner(2) aRadial(1) aSpan(1) aStyle(3)
// 五个属性，在 WebGL1 保证的 8 个以内。
export const FLOATS_PER_VERTEX = 13;

const VERTEX_SOURCE = `
attribute vec3 aA;       // 轴线起点（球的话 aB 与它重合）
attribute vec3 aB;       // 轴线终点
attribute vec2 aCorner;  // 包围盒四角，-1..1
attribute float aRadial; // 半径
attribute float aSpan;   // 包围盒半宽，= 半长 + 半径
attribute vec3 aStyle;   // (器械, 明暗, 平面着色)

uniform mat4 uViewProj;

varying vec3 vA;
varying vec3 vB;
varying float vRadial;
varying vec2 vWorld;
varying vec3 vStyle;

void main() {
  vA = aA;
  vB = aB;
  vRadial = aRadial;
  vStyle = aStyle;

  // 正交相机下包围盒就是一张正对镜头的方块，四角各撑 aSpan。
  // 深度取骨骼自己的 z（整张片恒定），前后遮挡因此按部位判——
  // 这跟「每段肢体一个固定厚度」的模型是一回事，也省掉手工排序。
  vec3 center = (aA + aB) * 0.5;
  vec3 world = center + vec3(aCorner, 0.0) * aSpan;
  vWorld = world.xy;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision highp float;

varying vec3 vA;
varying vec3 vB;
varying float vRadial;
varying vec2 vWorld;
varying vec3 vStyle;

const vec3 LIGHT = ${glslVec3(LIGHT)};
const vec3 SUIT = ${glslColor(SUIT_COLOR)};
const vec3 GEAR = ${glslColor(GEAR_COLOR)};
const float SEAM_GAP = ${SEAM_GAP.toFixed(3)};

void main() {
  // 解析求交：把像素投到骨轴上，落到半径内才算命中。
  // 轴两端 z 相同（球的话两端重合），所以这段数学在 XY 平面上就够了，
  // 半径方向由勾股补出 z 分量——正是一个胶囊的正面。
  vec2 axis = vB.xy - vA.xy;
  float axisLen2 = dot(axis, axis);
  float t = axisLen2 > 1e-6 ? clamp(dot(vWorld - vA.xy, axis) / axisLen2, 0.0, 1.0) : 0.0;
  vec2 delta = vWorld - (vA.xy + axis * t);
  float dist = length(delta);
  if (dist > vRadial) discard;

  float reach = sqrt(max(vRadial * vRadial - dist * dist, 0.0));
  // flat（杠片）几乎正对镜头：法线的 xy 只留一点点，整片基本是一个亮度，
  // 再靠轮廓光和边缘压暗收边。不这样做，圆盘会被球面明暗画成两个球。
  float radialScale = mix(1.0, 0.22, vStyle.z);
  float nz = mix(reach / vRadial, 1.0, vStyle.z);
  vec3 normal = dist > 1e-5 ? normalize(vec3(delta / vRadial * radialScale, nz)) : vec3(0.0, 0.0, 1.0);

  vec3 view = vec3(0.0, 0.0, 1.0);
  // 包裹式漫反射：明暗不要做成一条硬交界线。橡皮玩具上没有交界线，
  // 光是被表面慢慢吃掉一半的，所以把兰伯特两端各包进去 0.35 再平方。
  float wrap = clamp((dot(normal, LIGHT) + 0.35) / 1.35, 0.0, 1.0);
  float diffuse = wrap * wrap;
  // 右侧的冷补光：只在侧面给一个冷暖差。圆柱的曲率主要靠这个差被读出来。
  float fill = max(dot(normal, vec3(0.58, -0.20, 0.42)), 0.0);
  float rim = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.2);
  vec3 halfway = normalize(LIGHT + view);
  // 一点高光：哑光塑料的表面，没有它整块看起来就是黏土。
  float spec = pow(max(dot(normal, halfway), 0.0), 24.0) * 0.42;

  vec3 albedo = mix(SUIT, GEAR, vStyle.x);
  vec3 color = albedo * (0.13 + 1.00 * diffuse + 0.12 * fill);
  color += albedo * diffuse * diffuse * 0.10;
  color += vec3(1.0, 0.96, 0.90) * spec;
  // 轮廓光取暖金而不是冷蓝：深墨卡上本来就有一道金色暖光，两者同侧才对得上。
  color = mix(color, vec3(0.98, 0.74, 0.44), rim * 0.26);

  // 模具接缝：沿肢体等距的细暗线。玩具感的来源，不要换成噪点或肌理。
  // 球（轴退化成一个点）没有接缝，跳过——给光头画接缝会读成一颗足球。
  if (axisLen2 > 1e-6) {
    float along = dot(vWorld - vA.xy, axis) * inversesqrt(axisLen2);
    float phase = abs(fract(along / SEAM_GAP + 0.5) - 0.5) * 2.0;
    float seam = smoothstep(0.82, 1.0, phase);
    // 端部压暗：关节被下一段肢体挡住的地方天然更暗，交界处就不会平掉。
    float capAO = smoothstep(0.0, 0.10, t) * smoothstep(1.0, 0.90, t);
    color *= (1.0 - 0.26 * seam) * mix(0.80, 1.0, capAO);
  }

  // albedo 和光照都在线性空间里算，最后再回 sRGB。
  // 少了这一步，中间调会整体压暗、颜色发浑，放在浅底上就是一团酱油色。
  color = pow(max(color, 0.0), vec3(0.4545));
  gl_FragColor = vec4(color * vStyle.y, 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[three-skin] 着色器编译失败：${log}`);
  }
  return shader;
}

// 编译一份程序，并把属性固定到编译器分到的槽位上。
// 同一份程序被多个实例共用，位置必须稳定，不能靠编译器自己排。
export function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE));
  const attributes = { aA: 0, aB: 1, aCorner: 2, aRadial: 3, aSpan: 4, aStyle: 5 };
  for (const [name, index] of Object.entries(attributes)) gl.bindAttribLocation(program, index, name);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`[three-skin] 着色器链接失败：${gl.getProgramInfoLog(program)}`);
  }
  return {
    program,
    uViewProj: gl.getUniformLocation(program, "uViewProj"),
    attributes,
    dispose() { gl.deleteProgram(program); },
  };
}
