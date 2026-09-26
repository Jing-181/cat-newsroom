# 组件拆分与构建混淆方案

> 核对日期：2026-09-20。目标：业务组件拆成独立文件，构建产物逐文件压缩混淆，部署后访问地址不变。

## 1. 背景与参考

参考实现：`mojidict/contentDetails_v2/`（hybrid 发布形态）。

它的组织方式：

```text
contentDetails_v2/
  android/index.html        # 入口壳：挂载点 + 引 common/index.js
  ios/index.html            # 双端共用逻辑，只换 CSS
  common/
    index.js                # ES module 入口：createApp(App).mount('#app')
    App.vue                 # 根组件
    component/*.vue         # 每个业务组件一个独立文件（23 个）
    store/index.js          # 状态管理
    css/*.scss              # 共享样式
    use*.js / mock.js       # 逻辑 hooks
```

关键机制：

1. 源码是 **ES module + 逐文件 .vue**，`index.html` 只保留挂载点和模块入口。
2. 浏览器不能直接执行 `.vue`，因此**部署前必须构建**：每个 `.vue` 编译为独立 JS，产物保持相同的 `common/`、`android/` 目录结构。
3. `index.html` 的引入路径（`../common/index.js`）在源码和产物中一致，所以**部署后访问地址不变，但实际加载的是编译压缩后的代码**。
4. 组件内部用绝对路径（`/common/...`）互引，天然模块化，不依赖打包器合并。

这正是需求要复刻的形态：**开发态可读的独立组件源码 + 生产态同路径的压缩混淆产物 + 地址稳定**。

## 2. 目标形态

猫咪生活报改造后：

```text
src/                                  # 开发态（源码，可读）
  index.html                          # 入口：挂载点 + 引 main.js
  main.js                             # createApp(App).mount('#app')
  App.vue                             # 根布局（桌面侧栏/移动底栏分发）
  components/                         # 通用组件
    AppShell.vue
    SyncStatus.vue
    AuthModal.vue
    ...
  modules/                            # 业务组件，一模块一目录
    workout/{WorkoutEditor,ExercisePicker,WorkoutPlan,...}.vue
    todo/TodoPanel.vue
    habit/HabitPanel.vue
    diary/DiaryPanel.vue
    insight/InsightPanel.vue
    home/TodayFrontPage.vue
  services/                           # 领域服务（逐步从 supabase-sync.js 拆出）
    api-client.js
    auth.js
    records.js
    sync.js
    backup.js
  styles/                             # 引用 css/theme.css + css/components.css

dist/                                 # 生产态（构建产物，压缩混淆）
  index.html                          # 同名入口，注入产物引用，地址不变
  assets/
    main.js                           # 入口 chunk
    vue.js                            # 公共 vendor
    workout.js                        # 每组件独立 chunk
    todo.js
    habit.js
    ...
```

开发态与生产态映射：

| 维度 | 开发态（src/） | 生产态（dist/） |
| --- | --- | --- |
| 组件文件 | 独立 `.vue`，可读可维护 | 每个组件独立压缩 JS，结构对应 |
| 入口 | `src/index.html` | `dist/index.html`（同名） |
| 混淆 | 明文 | esbuild/terser 压缩混淆 |
| 访问地址 | `https://jing-181.github.io/cat-newsroom/` | 相同，不变 |

## 3. 两个可选构建方案

### 方案 A（推荐）：Vite 多 chunk 构建

利用 Vite + Rollup，让**每个业务组件独立成一个 chunk**，并关闭文件名 hash 保证地址稳定。

`vite.config.js` 核心：

```js
export default defineConfig({
  root: "src",
  plugins: [vue()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: "esbuild",            // 压缩混淆
    sourcemap: false,
    rollupOptions: {
      input: { main: "src/index.html" },
      output: {
        entryFileNames: "assets/[name].js",     // 无 hash，地址稳定
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/vue") || id.includes("node_modules/@vue")) return "vue";
          if (id.includes("src/modules/")) return id.split("src/modules/")[1].split("/")[0];
        },
      },
    },
  },
});
```

效果：`src/modules/workout/*.vue` → `dist/assets/workout.js`，每个模块一个独立压缩文件；vue 单独 vendor；`index.html` 由 Vite 自动注入产物引用。

优点：工程成熟、零手工维护、原生压缩混淆；`index.html` 由构建自动改写，不需要手动改引入。

注意：Rollup 会把跨组件的共享代码提升到公共 chunk，不保证"每个 .vue 严格一对一文件"，但每个**模块**独立文件是稳定的，符合"按业务组件拆分"的诉求。

### 方案 B（严格逐文件）：自写脚本编译

若要求产物与 `.vue` 文件严格一一对应（完全复刻 mojidict 的目录布局），用 Node 脚本逐文件处理：

```bash
node scripts/build-components.mjs
```

脚本流程：

1. 用 `@vue/compiler-sfc` 把每个 `.vue` 编译为独立 JS（template → render 函数）。
2. 用 `esbuild` 对每个文件单独 minify。
3. 产物输出到 `dist/`，**保持 `components/`、`modules/`、`services/` 目录结构**。
4. 复制 `index.html`，把引入路径指向产物。
5. 共享 vendor（vue 运行时）单独输出一个 `assets/vue.js`，入口通过 `<script>` 或 import map 加载。

优点：产物结构与源码完全一致、绝对可控、最贴近参考项目。
缺点：需要维护自定义构建脚本；依赖拆分、路径解析要自己处理，工作量大于方案 A。

### 对比

| 维度 | 方案 A（Vite 多 chunk） | 方案 B（逐文件脚本） |
| --- | --- | --- |
| 工程成熟度 | 高，Vite 原生支持 | 低，需自写维护 |
| 组件文件独立 | 模块级独立 | 文件级严格独立 |
| 压缩混淆 | esbuild/terser | esbuild |
| 地址稳定 | 是（无 hash） | 是 |
| 手工工作量 | 低 | 高 |
| 贴合参考项目 | 近似 | 完全一致 |

## 4. 推荐路线（结合当前项目）

当前项目已有 `frontend/` Vue 壳层 + `vite.config.js`，且旧入口必须保留回退。推荐方案 A，按下面顺序渐进执行，不一次性重写：

### 阶段 1：改造构建底座（不改业务）

1. 把 `vite.config.js` 的 `root` 从 `frontend` 调整，建立 `src/` 目录结构。
2. 配置 `manualChunks` 使模块独立 + 关闭文件名 hash。
3. 验证 `npm run build` 产物：`dist/assets/*.js` 每个模块独立、已压缩。
4. 旧入口 `workbench-desktop.html` / `workbench-mobile.html` 不动，继续可用。

### 阶段 2：拆第一个模块（运动，样板）

1. 把运动编辑器 `js/workout-ui.js` + `js/workout-view.js` 封装成 `modules/workout/*.vue` 组件。
2. 组件内继续调用现有 `js/workout.js`、`js/workout-catalog.js`、`js/sync-core.js`（UMD 全局），数据键 `cat-newsroom-data-v2` 不变。
3. 以 `src/index.html` 为入口跑通「开始训练 → 记录 → 保存」。
4. 用同一数据验证新旧入口切换不丢数据。

### 阶段 3：扩展模块迁移

按频率排序：Todo → 习惯 → 洞察/周报 → 日记。每迁移一个模块，保留旧入口回退开关，补测试，更新 `docs/design-demo.html`。

### 阶段 4：样式与入口收口

1. 公共 token/组件类从 `css/theme.css` + `css/components.css` 引用，不在组件里复制主题变量。
2. 双端只保留布局覆盖。
3. 视觉回归 375/390/430/820/1280/1440px。

## 5. 部署与地址稳定说明

1. 构建产物为 `dist/`，入口文件名保持 `index.html`，产物文件名无 hash。
2. GitHub Pages 部署 `dist/` 内容，根路径仍是 `https://jing-181.github.io/cat-newsroom/`，**访问地址不变**。
3. 用户访问到的 `assets/*.js` 是压缩混淆后的生产代码。
4. `workbench-desktop.html` / `workbench-mobile.html` 作为旧入口保留，旧书签仍可访问（同源数据键互通）。

## 6. 验证清单

- `npm run build` 成功，`dist/assets/` 每模块一个压缩 JS。
- 用浏览器打开 `dist/index.html`，运动全流程可用。
- 对比 `src/*.vue`（明文）与 `dist/assets/*.js`（混淆），确认已压缩。
- 旧入口与 `dist/index.html` 在同一数据键下切换，数据不丢。
- `npm test`、`npm run check` 继续通过。
- 375/390/430/820/1280/1440px 无横向溢出、键盘焦点可辨识、`prefers-reduced-motion` 生效。

## 7. 暂不做

- 不在本方案内引入 TypeScript（项目当前无 TS 约束，避免扩大改造面）。
- 不一次性重写全部模块；先拆运动作为样板验证。
- 不改变 `workout_session` 模型、数据键或同步协议。

## 8. 当前进度（2026-09-20）

已完成阶段 1（构建底座）、阶段 2（运动样板）和阶段 3（桌面端全部业务模块组件化）：

- `src/` 目录：`index.html`（入口，`body` 带 `desktop-shell` 类以提供 `--sidebar-w` 等变量）+ `main.js`（副作用导入全部共享领域库、暴露全局 `CONFIG`/`data`、桥接同步回调）+ `App.vue`（桌面外壳：侧栏品牌/导航/同步区/备份/设备切换 + 主视区按导航切换组件）。
- 业务模块全部为独立组件：`modules/home/HomeView.vue`（Bento 首页）、`modules/insight/InsightView.vue`（洞察复盘）、`modules/workout/SportView.vue`（WorkoutUI）、`modules/{todo,checkin,read,money,note,hot}/*View.vue`（6 个通用模块组件，包装共享引擎 `components/ModuleView.vue`）。
- 共享层 `src/lib/`：`config.js`（CONFIG 与主站一致）、`icons.js`、`utils.js`、`store.js`（全局 `data` 绑定 + 持久化 + 同步 + 订阅刷新）、`record-view.js`（记录卡/侧栏统计/分页）、`editor.js`（新建/编辑/删除弹窗）、`weekly-report.js`（AI 周报状态机）、`pomodoro.js`（番茄钟共享控制器）、`auth-modal.js`、`auth-ui.js`。
- 同步契约保持不变：`supabase-sync.js` 仍为全局经典脚本，`store.js` 绑定 `window.data` 供其读取；`sync-hooks.js`（经典脚本）把 `onSyncReady/onRemoteUpdate` 转发到 Vue 入口；跨标签 `storage` 事件、`pendingSyncRecords` 去重、`renderAfterWorkoutDialog` 等逻辑原样保留。
- `vite.config.js`：`base: "./"` + 无 hash 文件名 + `manualChunks`（`vue` 独立 vendor、`src/lib|components` → `shared`、`src/modules/*` 每模块独立 chunk）。
- 旧入口回退：`scripts/copy-supabase-sync.mjs` 在 `prebuild` 把 `workbench-desktop.html`、`workbench-mobile.html`、`assets/`、`css/`、`js/`、`supabase-sync.js` 一并拷入 `src/public/`，构建后旧书签与设备切换仍可用。
- 验证：`npm run build` 产物为 `dist/assets/{main,vue,shared,home,insight,workout,todo,checkin,read,money,note,hot}.js`（各自独立、压缩混淆）+ `dist/js/{supabase-sync,sync-hooks}.js` + 旧站点回退文件；`dist/index.html` 全部相对路径；`npm run check` 全量通过（含 `tests/vue-build.test.js` 的入口/产物结构断言与 `tests/sync-hooks.test.js` 的回调桥接用例）。
- 浏览器冒烟验证通过：首页完整渲染（时钟/聚焦/快速记录/概览环/习惯表/待办/番茄钟/趋势/开销/在读/目标/周报槽）、新建待办保存并写入本地、待办/打卡/阅读/记账/运动（WorkoutUI）视图切换、Supabase 匿名在线同步（「已同步 · 匿名用户」）。
- 遗留：移动端底栏/抽屉布局迁移（A1-02 剩余部分）；洞察/日记/收藏页与番茄钟完整训练流程待真实浏览器最终验收；正式账号登录后的云端同步/周报生成待实测。
