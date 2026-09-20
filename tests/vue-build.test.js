const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("vite 配置使用无 hash 文件名、相对 base 和模块独立 chunk", () => {
  const config = read("vite.config.js");
  assert.match(config, /base:\s*"\.\/"/);
  assert.match(config, /entryFileNames:\s*"assets\/\[name\]\.js"/);
  assert.match(config, /chunkFileNames:\s*"assets\/\[name\]\.js"/);
  assert.match(config, /outDir:\s*"\.\.\/dist"/);
  assert.match(config, /manualChunks/);
  assert.match(config, /src\/modules/);
});

test("Vue 入口以普通 script 加载 supabase-sync 并挂载 main", () => {
  const html = read("src/index.html");
  assert.match(html, /<script src="\/js\/supabase-sync\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\.\/main\.js"><\/script>/);
  assert.match(html, /<div id="app"><\/div>/);
});

test("main.js 副作用导入运动领域库并保持主站数据键", () => {
  const main = read("src/main.js");
  for (const moduleName of ["sync-core", "api-client", "workout-catalog", "workout", "workout-view", "app-dialog", "workout-ui"]) {
    assert.match(main, new RegExp(`import "../js/${moduleName}\\.js"`));
  }
  assert.match(main, /storageKey:\s*"cat-newsroom-data-v2"/);
  assert.match(main, /key:\s*"sport"/);
});

test("运动样板组件复用 WorkoutUI 并读写同一数据键", () => {
  const component = read("src/modules/workout/WorkoutSample.vue");
  assert.match(component, /WorkoutUI\.mount/);
  assert.match(component, /cat-newsroom-data-v2/);
  assert.match(component, /moduleKey: MODULE_KEY/);
  assert.match(component, /syncRecord\?\./);
  assert.match(component, /syncDelete\?\./);
  assert.match(component, /addEventListener\("storage"/);
});

test("构建产物（如存在）每个模块独立且已压缩", () => {
  if (!fs.existsSync(path.join(root, "dist/index.html"))) return; // 未构建时跳过
  const html = read("dist/index.html");
  assert.match(html, /src="\.\/assets\/main\.js"/);
  assert.match(html, /src="\.\/js\/supabase-sync\.js"/);
  const workout = fs.readFileSync(path.join(root, "dist/assets/workout.js"), "utf8");
  assert.ok(workout.length < 5000, "workout.js 应为压缩后的独立 chunk");
  assert.match(workout, /WorkoutSample/); // 组件标识保留（压缩后仍可定位）
});
