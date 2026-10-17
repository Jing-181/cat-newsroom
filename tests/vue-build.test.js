import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const MODULE_KEYS = ["todo", "checkin", "read", "sport", "money", "note", "hot"];

const walkSource = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
  const relative = `${dir}/${entry.name}`;
  if (entry.isDirectory()) return walkSource(relative);
  return /\.(js|vue)$/.test(entry.name) ? [relative] : [];
});

test("领域库不再给经典脚本留全局垫片，只剩约定好的几个契约", () => {
  // 已收尾：这些模块只走 import，不再挂 window
  const removedShims = ["Toast", "AppDialog", "DataBackup", "DeviceMode", "RecordList", "RecordMedia", "WorkbenchCore"];
  const shimPattern = new RegExp(`window\\.(${removedShims.join("|")})\\b`);
  for (const file of [...walkSource("src"), "supabase-sync.js"]) {
    assert.doesNotMatch(read(file), shimPattern, `${file} 还在用已删掉的全局垫片`);
  }
  // 剩下的就是 supabase-sync.js（经典脚本）与渲染层之间的明确契约
  const contracts = read("src/main.js") + read("src/lib/store.js");
  assert.match(contracts, /window\.CONFIG =/);
  assert.match(contracts, /window\.data =/);
});

test("vite 配置使用带内容 hash 文件名、相对 base、模块独立 chunk 与共享层 chunk", () => {
  const config = read("vite.config.js");
  assert.match(config, /base:\s*"\.\/"/);
  assert.match(config, /entryFileNames:\s*"assets\/\[name\]-\[hash\]\.js"/);
  assert.match(config, /chunkFileNames:\s*"assets\/\[name\]-\[hash\]\.js"/);
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
  // 顺序：先声明钩子的 supabase-sync，再桥接，最后才是挂处理函数的入口模块
  assert.ok(html.indexOf("/js/supabase-sync.js") < html.indexOf("/js/sync-hooks.js"), "sync-hooks 应在 supabase-sync 之后加载");
  assert.ok(html.indexOf("/js/sync-hooks.js") < html.indexOf('type="module" src="./main.js"'), "sync-hooks 应在入口模块之前加载");
});

test("main.js 副作用导入全部领域库并暴露全局 CONFIG/同步钩子", () => {
  const main = read("src/main.js");
  for (const moduleName of [
    "sync-core", "api-client", "data-backup", "app-dialog",
    "device-mode", "workout-catalog", "workout", "workout-plan", "workout-view", "workout-ui",
    "record-media", "record-list", "toast",
  ]) {
    // 迁移期里每个模块要么还在根目录 js/（经典脚本），要么已迁到 src/lib/（ESM）；
    // 断言写入的文件真的存在，避免路径写错也蒙混过关
    const fromClassic = main.includes(`import "../js/${moduleName}.js"`);
    const fromMigrated = main.includes(`import "./lib/${moduleName}.js"`);
    assert.ok(fromClassic || fromMigrated, `${moduleName} 没有被 main.js 导入`);
    const target = fromClassic ? `js/${moduleName}.js` : `src/lib/${moduleName}.js`;
    assert.ok(fs.existsSync(path.join(root, target)), `${moduleName} 导入的文件不存在：${target}`);
  }
  // 番茄钟界面不再是全局脚本：由同域的 src/lib/pomodoro.js 直接 import
  assert.match(read("src/lib/pomodoro.js"), /import Pomodoro from "\.\/pomodoro-view\.js"/);
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

test("运动组件复用 WorkoutUI，并通过 store.js 读写同一数据键", () => {
  const component = read("src/modules/workout/SportView.vue");
  assert.match(component, /WorkoutUI\.mount/);
  // 落盘与同步统一走 store：组件不再自己解析 localStorage，也不再重复调同步层
  assert.match(component, /persist\(MODULE_KEY, record\)/);
  assert.match(component, /remove\(MODULE_KEY, record\.id\)/);
  assert.doesNotMatch(component, /localStorage/);
  assert.match(component, /addEventListener\("storage"/);
  const store = read("src/lib/store.js");
  assert.match(store, /export function remove\(moduleKey, recordId/);
  assert.match(store, /window\.syncDelete\(\{ moduleKey, recordId \}\)/);
});

test("首页与洞察接入训练周复盘槽，共享层含编辑/复盘/番茄钟", () => {
  const home = read("src/modules/home/HomeView.vue");
  const insight = read("src/modules/insight/InsightView.vue");
  assert.match(home, /trainingReviewSlotHTML/);
  assert.match(insight, /trainingReviewSlotHTML/);
  assert.match(home, /initTrainingReview\(root\.value\)/);
  assert.match(insight, /initTrainingReview\(root\.value\)/);
  // 旧的 AI 生活报整条链路不得再被引用（文件已删，import 还在就会构建失败）
  assert.doesNotMatch(home, /weekly-report/);
  assert.doesNotMatch(insight, /weekly-report/);
  assert.ok(!fs.existsSync(path.join(root, "src/lib/weekly-report.js")), "weekly-report.js 应已删除");
  assert.ok(!fs.existsSync(path.join(root, "src/lib/weekly-report-utils.js")), "weekly-report-utils.js 应已删除");
  const lib = read("src/lib/editor.js");
  assert.match(lib, /export function openEditor/);
  const reviewLib = read("src/lib/training-review.js");
  assert.match(reviewLib, /export async function initTrainingReview/);
  assert.match(reviewLib, /export function trainingReviewSlotHTML/);
  assert.match(reviewLib, /training_reports_feed/);
  assert.match(reviewLib, /training-review-history/);
  assert.match(read("src/lib/pomodoro.js"), /export function ensurePomodoroController/);
});

test("响应式外壳：样式入口引入 responsive.css，App 含移动顶栏/底部导航/抽屉", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /@import "\.\/responsive\.css";/);
  const app = read("src/App.vue");
  assert.match(app, /class="m-topbar"/);
  assert.match(app, /class="m-tabs"/);
  assert.match(app, /class="m-scrim"/);
  assert.match(app, /'m-open'/); // 侧栏抽屉开合
  assert.doesNotMatch(app, /deviceSwitcherRef|mountSwitcher/); // 设备切换已废弃
  const sync = read("supabase-sync.js");
  assert.match(sync, /querySelectorAll\("#sync-indicator"\)/); // 顶栏与侧栏同步指示器一并更新
});

test("训练周复盘槽位带 b12 全宽类，首页 bento 网格中不被压缩成窄条", () => {
  const reviewLib = read("src/lib/training-review.js");
  assert.match(reviewLib, /training-review-slot" class="b12"/);
  assert.match(reviewLib, /tile b12 report-card/); // 复用 tile 卡片外观并占满整行
  const styles = read("src/desktop.css");
  assert.match(styles, /\.report-card \{ margin-top:16px; \}/); // 洞察页块级上下文保留间距
  assert.match(styles, /\.bento \.report-card \{ margin-top:0; \}/); // 首页 bento 内由 gap 控制间距
});

test("个人配置页的示范数据清理：先扫描、确认后才真删、再重拉云端", () => {
  const settings = read("src/modules/settings/SettingsView.vue");
  assert.match(settings, /const scan = await purge\(\);/); // 先 dry-run
  assert.match(settings, /await purge\(\{ commit: true \}\)/); // 确认后才删
  assert.match(settings, /await window\.runFullSync\?\.\(\{ reason: "manual" \}\)/); // 删完让本地跟上
  const sync = read("supabase-sync.js");
  assert.match(sync, /async function purgeDemoRecords\(options = \{\}\)/);
  assert.match(sync, /if \(!commit\) return \{ commit: false/);
  assert.match(sync, /if \(currentUser\.is_anonymous\) throw new Error/); // 匿名账号不让动云端
});

test("开发服务器启动脚本：后台运行、日志落盘、关终端不会被杀", () => {
  const script = read("scripts/dev-server.sh");
  // 直接跑 vite 入口，不经过 npx：npx 会多包一层进程，pid 文件就指不准了
  assert.match(script, /nohup node "\$ROOT\/node_modules\/vite\/bin\/vite\.js"/);
  assert.match(script, /copy-supabase-sync\.mjs/); // 启动前先刷新 src/public 副本
  assert.match(script, /--strictPort/); // 端口被占时直接报错，不偷偷换端口
  assert.match(script, /lsof -nP -iTCP:"\$PORT" -sTCP:LISTEN/); // 用真实监听进程判断起没起来
  assert.match(read("package.json"), /"dev:start": "sh scripts\/dev-server\.sh start"/);
});

test("构建产物（如存在）：相对路径、同步脚本与每个模块独立压缩 chunk", () => {
  if (!fs.existsSync(path.join(root, "dist/index.html"))) return; // 未构建时跳过
  const html = read("dist/index.html");
  assert.match(html, /src="\.\/assets\/main-[^"]+\.js"/); // 带内容 hash 文件名
  assert.match(html, /src="\.\/js\/supabase-sync\.js"/);
  assert.match(html, /src="\.\/js\/sync-hooks\.js"/);
  assert.ok(fs.existsSync(path.join(root, "dist/js/sync-hooks.js"))); // 预构建脚本整目录拷贝 js/
  for (const key of [...MODULE_KEYS, "home", "insight"]) {
    const name = key === "sport" ? "workout" : key; // 运动目录名为 workout
    const matches = fs.readdirSync(path.join(root, "dist/assets")).filter(file => file.startsWith(`${name}-`) && file.endsWith(".js"));
    assert.ok(matches.length === 1, `缺少 ${name}.js 的 hash chunk`);
    const size = fs.statSync(path.join(root, "dist/assets", matches[0])).size;
    assert.ok(size < 20000, `${name}.js 应为压缩后的独立 chunk（当前 ${size}B）`);
  }
});
