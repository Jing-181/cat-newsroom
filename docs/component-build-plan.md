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

已完成阶段 1（构建底座）和阶段 2 的运动样板：

- `src/` 目录建立：`index.html`（入口）、`main.js`（副作用导入共享领域库 + CONFIG）、`App.vue`（布局）、`modules/workout/WorkoutSample.vue`（运动容器组件）。
- `vite.config.js`：`base: "./"` + 无 hash 文件名 + `manualChunks`（vue 独立 vendor、`src/modules/` 每模块独立 chunk）。
- `supabase-sync.js`（顶层声明，非 IIFE）通过 `scripts/copy-supabase-sync.mjs` 在 `prebuild` 拷入 `src/public/js/`，以普通 script 加载进入全局。
- 运动样板复用现有 `WorkoutUI.mount`，读写 `cat-newsroom-data-v2` 的 `sport` 键，保存/删除通过全局 `syncRecord/syncDelete` 走原有同步层；与主站数据互通。
- 验证：`npm run build` 产物为 `dist/assets/main.js + vue.js + workout.js`（模块独立、压缩混淆）+ `dist/js/supabase-sync.js`（原样）；`dist/index.html` 全部相对路径，子路径部署可访问；`npm test` 45 项通过（含新增 `tests/vue-build.test.js` 5 项）。
- 遗留：浏览器实际操作验收（开始训练 → 记录 → 保存 → 与主站数据同步）待真实环境确认；旧入口 `workbench-desktop.html` / `workbench-mobile.html` 继续可用。
