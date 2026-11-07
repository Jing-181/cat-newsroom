import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIER, pickTier, tierBudget, readEnv } from "../src/lib/leaf-shade-tier.js";
import { WGSL, UNIFORM_BYTES } from "../src/lib/leaf-shade-webgpu.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("安全上下文、WebGPU、桌面三者齐了才走 WGSL 实时", () => {
  assert.equal(pickTier({ secureContext: true, hasGpu: true, mobile: false }), TIER.GPU);
});

test("手机局域网 http 不是安全上下文，自动落 2D", () => {
  assert.equal(pickTier({ secureContext: false, hasGpu: false, mobile: true }), TIER.CANVAS);
  // 退一步说，就算将来手机有了 WebGPU，也不给它跑实时 shader
  assert.equal(pickTier({ secureContext: true, hasGpu: true, mobile: true }), TIER.CANVAS);
});

test("缺 WebGPU 或不安全上下文时桌面回落 2D，但不退化成静帧", () => {
  assert.equal(pickTier({ secureContext: true, hasGpu: false, mobile: false }), TIER.CANVAS);
  assert.equal(pickTier({ secureContext: false, hasGpu: true, mobile: false }), TIER.CANVAS);
});

test("减少动态效果最优先，任何档位都只留静帧", () => {
  assert.equal(pickTier({ reduceMotion: true, secureContext: true, hasGpu: true }), TIER.STILL);
  assert.equal(pickTier({ reduceMotion: true, secureContext: false, hasGpu: false, mobile: true }), TIER.STILL);
});

test("帧预算按档位收紧，移动端最省", () => {
  const gpu = tierBudget(TIER.GPU);
  const mobile = tierBudget(TIER.CANVAS, true);
  const desktop = tierBudget(TIER.CANVAS, false);
  assert.ok(gpu.fps <= 12, "实时档不超过 12fps");
  assert.ok(mobile.fps <= 10, "移动端不超过 10fps");
  assert.ok(mobile.fps < desktop.fps);
  assert.ok(mobile.scale <= desktop.scale);
  assert.ok(gpu.scale < 1 && desktop.scale < 1, "画布一律降分辨率");
});

test("环境读取字段齐全，粗指针设备算移动端", () => {
  const desktop = readEnv({
    isSecureContext: true,
    navigator: { gpu: {} },
    matchMedia: () => ({ matches: false }),
  });
  assert.deepEqual(desktop, { reduceMotion: false, secureContext: true, hasGpu: true, mobile: false });
  assert.equal(pickTier(desktop), TIER.GPU);

  const phone = readEnv({
    isSecureContext: false,
    navigator: {},
    matchMedia: q => ({ matches: q.includes("pointer: coarse") || q.includes("820px") }),
  });
  assert.equal(phone.mobile, true);
  assert.equal(phone.hasGpu, false);
  assert.equal(pickTier(phone), TIER.CANVAS);
});

test("WGSL 具备顶点/片元入口、uniform 与 premultiplied 输出", () => {
  assert.match(WGSL, /@vertex/);
  assert.match(WGSL, /@fragment/);
  assert.match(WGSL, /@group\(0\) @binding\(0\) var<uniform>/);
  assert.match(WGSL, /@builtin\(vertex_index\)/);
  assert.match(WGSL, /fn fbm\(/);
  assert.match(WGSL, /return vec4<f32>\(shadow \* alpha, alpha\)/);
  assert.match(WGSL, /0\.282, 0\.243, 0\.173/, "叶影色跟 2D 路径一致");
});

test("uniform 是 4 个 f32，正好 16 字节对齐", () => {
  assert.equal(UNIFORM_BYTES, 16);
  for (const field of ["time", "width", "height", "intensity"]) {
    assert.match(WGSL, new RegExp(`${field}: f32`));
  }
});

test("树影层保持原接口，用定时器而非 rAF，回落时换 canvas", () => {
  const src = read("src/lib/leaf-shade.js");
  assert.match(src, /export function mountLeafShade\(/);
  assert.match(src, /opacity = 0\.34/);
  assert.match(src, /canvas\.className = "leaf-shade"/);
  assert.match(src, /import \{ createGpuLeafShade \}/);
  assert.match(src, /setTimeout/);
  assert.doesNotMatch(src, /requestAnimationFrame/, "不该再跟 vsync 对齐，那是白费唤醒");
  assert.match(src, /visibilitychange/);
  assert.match(src, /prefers-reduced-motion|TIER\.STILL/);
  // 取过 webgpu context 的 canvas 不能再取 2d，回落必须换一张
  assert.match(src, /canvas = makeCanvas\(\);/);
  assert.match(src, /powerPreference|createGpuLeafShade/);
});

test("GPU 管线请求低功耗适配器，且不引入新依赖", () => {
  const gpu = read("src/lib/leaf-shade-webgpu.js");
  assert.match(gpu, /powerPreference: "low-power"/);
  assert.match(gpu, /requestAdapter\(\)/, "低功耗适配器拿不到时要能退回默认适配器");
  assert.match(gpu, /getPreferredCanvasFormat\(\)/);
  assert.match(gpu, /alphaMode: "premultiplied"/);
  assert.match(gpu, /context\.unconfigure/);
  assert.doesNotMatch(gpu, /from "three|from "babylon|import .* from "https?:/);
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["vue"]);
});
