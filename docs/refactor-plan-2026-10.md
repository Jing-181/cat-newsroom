# 业务代码整理方案（2026-10）

这个文件是「按单页应用该有的样子整理业务代码」这件事的地图：现状（实测）、目标结构、分阶段做什么、什么不许碰、每阶段怎么验证。
配套的设计与样式审查在 `docs/design-review-2026-10.md`，项目地图在根目录 `AGENTS.md`。

## 一、现状（都是实测，不是印象）

**入口。** 真正跑起来的只有一条：`src/index.html`（Vite root = `src`）。根 `index.html` 是跳转壳，跳到 `./dist/index.html`；`workbench-desktop.html` / `workbench-mobile.html` 也是跳转壳，只是给旧书签和设备切换器留的地址。`frontend/` 是空目录（只有 `.DS_Store`），没有内容。

**src/ 是 Vue 应用，但启动方式不是常规的 SPA 装配。** `src/index.html` 先用两个普通 script 标签加载 `/js/supabase-sync.js`、`/js/sync-hooks.js`，再加载 `./main.js`。`main.js` 里 15 行 `import` 全是副作用引入根目录 `js/*.js`，**顺序有讲究**：同步层要在前，workout 那一串要按 catalog → workout → plan → view → ui 排。

**视图切换没有路由。** `App.vue`（156 行）用 `ref view` + `<component :is :key>` 切模块，当前模块存进 `DeviceMode`，导航靠子组件 `emit("navigate")`。`components/ModuleView.vue`（183 行）是通用列表引擎，按 `CONFIG` 渲染头/搜索/列表/侧栏/分页。`modules/` 里 6 个模块只有 9 行包装，`home` 344 行、`insight` 51 行、`settings` 153 行，`workout/SportView.vue` 60 行且直接挂 `WorkoutUI`。

**两套模块机制并行。** `src/lib/*.js` 是标准 ESM（靠同目录 `package.json` 的 `{"type":"module"}`，依赖单向无环）；根 `js/*.js` 是手写 UMD，把 API 挂到 `window` 上（16 个文件共 2427 行）。同一件事有两处实现的地方目前只有零星工具函数：`esc` / `attr` 在每个经典脚本里各自内联一份，`supabase-sync.js` 自己又写了一套 `localDateKey`。

**数据。** 主键 `cat-newsroom-data-v2` 存全部模块数据；`store.js` 负责读写，`SportView.vue` 绕过它自己直接读写这个键。

**跨层 DOM。** `App.vue` 用 `document.querySelector("#sync-now" / ".js-avatar" / "#sync-indicator")` 去够经典脚本渲染的 DOM；`pomodoro.js` 找 `#pomo-*`；`store.js` 找 `#workout-dialog`；十几个文件用 `innerHTML` 整块重绘。

## 二、目标结构

```
src/                     ← 唯一应用根（Vite root）
  index.html
  main.js                ← 只做装配：import 各层、挂载 App、启动同步
  App.vue
  router.js              ← 阶段 3
  components/            ← 通用组件
  modules/<域>/          ← 一个域一个家：View.vue + 这个域自己的逻辑
  lib/                   ← 跨域逻辑与工具（ESM，不读写 window）
js/                      ← 只留必须全局的两个同步脚本
```

四条规则：

1. 业务代码都在 `src/` 下，用 `import` 连接。不依赖加载顺序，不用 `window` 传值。
2. 一个域一个目录。workout 的 catalog / plan / view / ui 应该跟 `SportView.vue` 住在一起，而不是漂在根目录。
3. `js/` 只留 `supabase-sync.js` 与 `sync-hooks.js`——它们必须先进全局，且属于同步协议。
4. 跨层不互相 `querySelector`。组件渲染自己的 DOM，跨层用事件或回调。

## 三、阶段

### 阶段 1：影子副本收口（已完成）

`scripts/copy-supabase-sync.mjs` 原来把 `css` 和整个 `js` 目录也拷进 `src/public`，而 `src/public` 里真正会被按 URL 取走的只有 `supabase-sync.js`、`sync-hooks.js` 和默认头像。现在拷贝清单只剩 5 项，`frontend/` 空目录删掉。

好处不只是省 200K JS + 48K CSS：**"改了根文件、页面读的却是旧副本"这个坑消失了**——这个坑之前真的绊过一次，改完 `js/` 还得记得跑拷贝脚本。

验证：`npm test` 99/99、`npm run build` 通过、`dist/js` 只剩两个脚本。

### 阶段 2：模块边界显式化（已完成）

把剩余经典脚本按域迁成 ESM，顺序按「被谁依赖」从叶子往根推，每迁一个跑一次测试与构建：

~~toast~~ → ~~app-dialog~~ → ~~device-mode~~ → ~~workbench-core~~ → ~~data-backup~~ → ~~record-list~~ → ~~record-media~~ → ~~pomodoro~~ → ~~workout-catalog~~ → ~~workout~~ → ~~workout-plan~~ → ~~workout-view~~ → ~~workout-ui~~。

**已迁 13/13**，`js/` 从 16 个文件减到 3 个（只剩常驻的 `sync-core.js`、`api-client.js`、`sync-hooks.js`），`src/lib/` 下对应：`toast.js`、`app-dialog.js`、`device-mode.js`、`workbench-core.js`、`data-backup.js`、`record-list.js`、`record-media.js`、`pomodoro-view.js`、`workout-catalog.js`、`workout.js`、`workout-plan.js`、`workout-view.js`、`workout-ui.js`。

**先做的前置：把测试也挪到 ESM。** 加 `tests/package.json`（`{"type":"module"}`），15 个测试文件的 `require` 改成 `import`。这样被测文件迁不迁都不影响测试的加载方式——ESM 的 default 导入对 CJS（UMD 包装的经典脚本）和 ESM 两种目标都成立，一次到位省掉以后每个文件的加载适配。

几个实测出来的约束：

- **Node 20.18 不支持 `require()` 加载 ESM**（要 22.12 以上），所以“测试继续 require、源码迁 ESM”这条路走不通。
- 迁移期先保留 `window.X = api` 那一行垫片，让还没改名的调用方（`src/App.vue`、`src/lib/editor.js` 这些）照旧能取用；**收尾时两件事必须同时做完**（删定义方的 `window.X` 赋值 + 把消费者改成 import），只做一半不会报错，只是功能静默消失。
- `src/lib/` 下的模块会被 Vite 合进 `shared` chunk，在 `main` chunk 之前执行。它们都是纯定义（只有函数声明，加载期不碰 DOM、不读写存储），所以提前执行不改变行为。
- `tests/workout-view.test.js` 原来用 `vm.runInNewContext` 造干净 window 再跑脚本；`workout-view.js` 迁完后改成直接 import，`loadView()` 退化成一行取模块。模块不再读全局，就不需要造 window 了。

测试跟着迁：`vue-build.test.js` 里“main.js 导入了哪些模块”改用“旧地或新地，且文件真实存在”，但 `pomodoro` 除外——它不再由 main.js 走全局，所以单独断言 `src/lib/pomodoro.js` 直接 import 了界面模块。迁 workout 那一串时同理。

**两个顺手的收敛**（都属于“调用方已是 ESM，就别再摸全局了”）：

- `data-backup.js` → `import AppDialog from "./app-dialog.js"`
- `src/lib/pomodoro.js` → `import Pomodoro from "./pomodoro-view.js"`、`import WorkbenchCore from "./workbench-core.js"`；`window.Pomodoro` 已无其他调用方，所以 `pomodoro-view.js` 干脆不挂全局。

**workout 家族不留垫片**：这 5 个模块的调用方都换成了 import（`SportView.vue` 直接 `import WorkoutUI`、`HomeView.vue` 直接 `import Workout`/`WorkoutPlan`、`tests/workout-view.test.js` 直接 import），所以它们干脆不写 `window.Workout*` 那行。家族内部也全部改成真 import：`workout-view.js` 吃 `Workout` 与 `WorkoutCatalog`，`workout-ui.js` 吃 `Workout`/`WorkoutCatalog`/`WorkoutPlan`/`WorkoutView`/`AppDialog`/`Toast`。

**嵌套模板缩进是个坑**：codemod 给代码行降缩进时，`${...}` 里再写 `` `...` `` 的嵌套模板会让「行内反引号计数」法判错，把嵌套模板里的内容行也降了一级（渲染出的 HTML 缩进变了）。改成写一个小的状态扫描器（代码帧/模板帧栈，顺手跳过字符串、注释、正则），每行按“行首是否落在模板文本里”决定要不要降缩进，才和旧实现逐字符一致。

**收尾项已全部完成**（垫片一个不剩）：7 个模块（`toast` / `app-dialog` / `data-backup` / `device-mode` / `record-list` / `record-media` / `workbench-core`）文件末尾的 `window.X = api` 删掉，摸全局的调用方全部改成 import——`src/lib/editor.js`、`src/lib/record-view.js` 的裸全局 `RecordMedia`（连带删掉那几处 `typeof RecordMedia === "undefined"` 守卫），`src/lib/weekly-report.js`、`src/modules/settings/SettingsView.vue` 的 `window.AppDialog` / `window.Toast`，`App.vue`（`AppDialog` / `DataBackup` / `DeviceMode`）与 `ModuleView.vue`（`RecordList` / `RecordMedia`）。`device-mode.js` 的死代码（`mountSwitcher` / `redirectFromEntry` / `redirectIfNeeded` / `pageFor` / `setPreference` / `getCurrentMode` / `getPreference`）随 W-010 的响应式单页化一起删，只剩 `resolveMode` / `saveView` / `restoreView`。

**顺手修掉一个被 `?.` 吞掉的 bug**：`daily-copy.js` 的「登录账号」按钮读 `window.openAuthModalRef` / `window.openAuthModal`，而这两个全局从来没被赋值（可选链把“点了没反应”吞了）。改成 `import { openAuthModal } from "./auth-modal.js"`。教训见 `docs/开发经验.md` 第 8 节。

**收尾后剩下的全局面（有意保留，都是与经典脚本的契约）**：`window.CONFIG`、`window.data` / `window.store`（`supabase-sync.js` 直接读）、`window.updateAuthUI`（同步层改完认证状态回调）、`window.DemoData`（样板数据守卫）、`window.__reloadDailyCopy`、`window.__onSyncReady` / `window.__onRemoteUpdate`（`sync-hooks.js` 桥接）。除这些之外，`src/` 里出现的 `window.X` 都是 `supabase-sync.js` 摊出来的函数（`syncRecord` / `syncDelete` / `syncMetaField` / `saveMetaCloud` / `getCurrentUser` / `runFullSync` / …）或浏览器 API。`tests/vue-build.test.js` 新增一条用例把“垫片不许回潮”钉住。

**已知撞名**：`src/lib/pomodoro.js`（40 行控制器）与原来的 `js/pomodoro.js`（184 行番茄钟界面）同名。界面那个迁到 `src/lib/pomodoro-view.js`，和 `record-view` / `workout-view` 一个命名范式。

按钮沉在 `window` 上的副作用是：新增一个文件必须手动插进 `main.js` 的正确位置，插错了不报错、只是偶尔行为不对。这一步就是为了把这件事消灭掉。

**大文件用机械转换，不手抄。** `record-media.js`（263 行，内嵌 8 组 SVG）、`pomodoro-view.js`（184 行）与 workout 家族 5 个文件（331/407 行那两个满是 HTML 模板）都是先写一次性 codemod 去 UMD 头尾、代码行降一级缩进，再用同源的旧模块与新模块做导出深比较才算过。对比办法按文件类型分开：动作库整份数据 deepEqual；领域逻辑比导出键 + 同输入下 7 组纯函数结果；训练计划比生成结果（时间戳与 id 归一化后）；界面模板把**同一个会话对象**喂给新旧两套模板，9 个生成函数的输出逐字符相等。模板字符串内部一行不动，字符串字节保持一致。校验脚本跑完就删，不进仓库。

### 阶段 3：视图切换收口（待定，需要你点头）

现在视图状态是 `ref` + `DeviceMode` 存档 + `emit("navigate")` 一条链。惯常做法是引入 vue-router，让 URL 成为唯一来源，顺带拿到刷新后停在当前页、浏览器前进后退、地址可分享。代价是导航语义变了：地址栏会出现 `#/todo` 这类路径。要不要走这步取决于你想不想要可分享地址，所以我不替你拍。

### 阶段 4：跨层 DOM 与全局读法收口（已完成）

- **`App.vue` 不再去 DOM 里读状态**：头像换成 `:src="avatarSrc"` 绑定（`applyAvatar` 只改 ref），同步指示器与「立即同步」的点击绑到模板（`@click="onSyncIndicatorClick"` / `@click="syncNow"`），备份三件套改用模板 ref 传给 `DataBackup.mount`。指示器的**文字与颜色仍归同步层写**（`updateSyncIndicator()` 里 `querySelectorAll("#sync-indicator")`）——那四个文件在不动名单上，所以只把「谁来触发」搬到模板，不新建状态桥。
- **`SportView.vue` 走 `store.js`**：原来它自己 `JSON.parse(localStorage)` 拿一份快照、改完再 `setItem` 写回，于是内存里的 `window.data.sport` 还是旧的，而且绕过了样板标识剥离与同步去重。现在直接拿 `getData().sport` 那一份给 `WorkoutUI`（控制器本就地增删改），保存/删除调 `persist(MODULE_KEY, record)` / `remove(MODULE_KEY, record.id)`。键与 `workout_session` 模型一字未动。
- **`store.js` 新增 `remove(moduleKey, recordId)` 与 `saveMetaField(field, value)`**：前者补齐删除入口（容忍调用方已自行把记录移出数组），后者接管 `__pomo` / `__homeOrder` 这类元数据字段。
- **删除 `src/lib/workbench-core.js`**：`createId` / `localDateKey` / `saveLocal` / `saveRecord` 已无调用方，唯一在用的 `saveMeta` 被 `store.saveMetaField` 顶替（`pomodoro.js`、`SettingsView.vue` 都改过来了）。它是最后一处绕过 store 直接写主数据键的地方。
- 测试跟着改口径：那条「运动组件复用 WorkoutUI」不再断言组件里出现数据键与 `syncRecord` 字样，而是断言它走 `persist` / `remove`、并且组件里**不再出现 `localStorage`**；`main.js` 的模块清单列表去掉 `workbench-core`。

## 四、不碰清单

- 本地数据键 `cat-newsroom-data-v2`。
- `workout_session` 的数据模型。
- 同步协议：`supabase-sync.js`、`sync-core.js`、`api-client.js`、`sync-hooks.js` 的行为。这四个在阶段 2 里也不动。

## 五、怎么算做对了

每阶段收尾都跑 `npm test`（现 112 个用例）与 `npm run build`；观感与交互以你在浏览器里实测为准——我读不到渲染结果，所以凡是“看起来怎样”的判断都得你过一眼。
