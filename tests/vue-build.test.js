const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const MODULE_KEYS = ["todo", "checkin", "read", "sport", "money", "note", "hot"];

test("vite 配置使用无 hash 文件名、相对 base、模块独立 chunk 与共享层 chunk", () => {
  const config = read("vite.config.js");
  assert.match(config, /base:\s*"\.\/"/);
  assert.match(config, /entryFileNames:\s*"assets\/\[name\]\.js"/);
  assert.match(config, /chunkFileNames:\s*"assets\/\[name\]\.js"/);
  assert.match(config, /outDir:\s*"\.\.\/dist"/);
  assert.match(config, /manualChunks/);
  assert.match(config, /src\/modules/);
  assert.match(config, /src\/lib\/.*src\/components/); // 共享层合并进 shared chunk
});

test("Vue 入口以普通 script 加载同步脚本并挂载 main", () => {
  const html = read("src/index.html");
  assert.match(html, /<body class="desktop-shell">/); // 提供 --sidebar-w 等变量
  assert.match(html, /<script src="\/js\/supabase-sync\.js"><\/script>/);
  assert.match(html, /<script src="\/js\/sync-hooks\.js"><\/script>/); // 回调桥接
  assert.match(html, /<script type="module" src="\.\/main\.js"><\/script>/);
  assert.match(html, /<div id="app"><\/div>/);
});

test("main.js 副作用导入全部领域库并暴露全局 CONFIG/同步钩子", () => {
  const main = read("src/main.js");
  for (const moduleName of [
    "sync-core", "api-client", "workbench-core", "data-backup", "app-dialog", "pomodoro",
    "device-mode", "workout-catalog", "workout", "workout-plan", "workout-view", "workout-ui",
    "record-media", "record-list",
  ]) {
    assert.match(main, new RegExp(`import "../js/${moduleName}\\.js"`));
  }
  assert.match(main, /window\.CONFIG = CONFIG/);
  assert.match(main, /window\.__onSyncReady = applyCloud/);
  assert.match(main, /window\.__onRemoteUpdate = applyRemote/);
  assert.match(main, /runFullSync\?\.\(\{ reason: "page_init" \}\)/);
});

test("共享数据仓库绑定全局 data 并调用同步接口", () => {
  const store = read("src/lib/store.js");
  assert.match(store, /window\.data = load\(\)/);
  assert.match(store, /syncRecord\(\{ moduleKey, record \}\)/);
  assert.match(store, /addEventListener\("storage"/);
});

test("CONFIG 保留全部 7 个业务模块与主站一致", () => {
  const config = read("src/lib/config.js");
  assert.match(config, /storageKey: "cat-newsroom-data-v2"/);
  for (const key of MODULE_KEYS) {
    assert.match(config, new RegExp(`key: "${key}"`));
  }
});

test("6 个通用模块各自是独立组件并接入通用引擎", () => {
  for (const key of ["todo", "checkin", "read", "money", "note", "hot"]) {
    const name = `${key[0].toUpperCase()}${key.slice(1)}View.vue`;
    const component = read(`src/modules/${key}/${name}`);
    assert.match(component, /import ModuleView from "\.\.\/\.\.\/components\/ModuleView\.vue"/);
    assert.match(component, new RegExp(`<ModuleView module-key="${key}"`));
  }
});

test("运动组件复用 WorkoutUI 并读写同一数据键", () => {
  const component = read("src/modules/workout/SportView.vue");
  assert.match(component, /WorkoutUI\.mount/);
  assert.match(component, /cat-newsroom-data-v2/);
  assert.match(component, /moduleKey: MODULE_KEY/);
  assert.match(component, /syncRecord\?\./);
  assert.match(component, /syncDelete\?\./);
  assert.match(component, /addEventListener\("storage"/);
});

test("首页与洞察接入周报槽，共享层含编辑/周报/番茄钟", () => {
  const home = read("src/modules/home/HomeView.vue");
  const insight = read("src/modules/insight/InsightView.vue");
  assert.match(home, /weeklyReportSlotHTML/);
  assert.match(insight, /weeklyReportSlotHTML/);
  const lib = read("src/lib/editor.js");
  assert.match(lib, /export function openEditor/);
  assert.match(read("src/lib/weekly-report.js"), /export async function maybeGenerateWeeklyReport/);
  assert.match(read("src/lib/pomodoro.js"), /export function ensurePomodoroController/);
});

test("构建产物（如存在）：相对路径、同步脚本与每个模块独立压缩 chunk", () => {
  if (!fs.existsSync(path.join(root, "dist/index.html"))) return; // 未构建时跳过
  const html = read("dist/index.html");
  assert.match(html, /src="\.\/assets\/main\.js"/);
  assert.match(html, /src="\.\/js\/supabase-sync\.js"/);
  assert.match(html, /src="\.\/js\/sync-hooks\.js"/);
  for (const key of [...MODULE_KEYS, "home", "insight"]) {
    const file = path.join(root, `dist/assets/${key === "sport" ? "workout" : key}.js`); // 运动目录名为 workout
    assert.ok(fs.existsSync(file), `缺少 ${key}.js chunk`);
    const size = fs.statSync(file).size;
    assert.ok(size < 20000, `${key}.js 应为压缩后的独立 chunk（当前 ${size}B）`);
  }
});
