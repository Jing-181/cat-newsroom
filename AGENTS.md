# cat-newsroom · 私人工作台

给 Jing 和 AI 助手看的项目地图。动手之前先读完这一页。
这是**私人生活工作台**（猫主子的生活报），不是工作项目台；工作项目在 `/Users/hugecore/project`，两条线互不合并。

## 这是什么

猫咪生活报（Cat Life Daily）：一个单人用的生活工作台。十个模块——首页概览、洞察周报、待办、习惯打卡、阅读进度、运动健身、记账、日记、今日收藏、设置。

训练周复盘是只读展示：数据由 Hana 的定时任务每周一 07:30 写入 Supabase，前端读只读视图 `training_reports_feed`，不在浏览器里生成。
只有 Jing 一个用户。数据存浏览器 localStorage，可选经 Supabase 跨设备同步。

## 跑起来

```bash
npm install
npm run dev:start   # 启动 dev server（默认 5176）：nohup 后台跑，日志 .dev-server.log，关掉终端不会被杀
npm run dev:status  # 看是否在跑 + 日志末尾
npm run dev:stop    # 停掉（PID 存在 .dev-server.pid）
npm run dev:vue     # 前台跑（调试用），终端一关就结束
npm test            # node --test tests/*.test.js
npm run check       # 语法检查（supabase-sync.js）+ 全部测试
npm run build       # 产出 dist/（含 prebuild 拷贝步骤）
```

端口被占或想换端口：`sh scripts/dev-server.sh start 5180`。脚本用的是 `--strictPort`，端口被占会直接报错，不会偷偷换端口。

改视觉必须看 `docs/design-demo.html` 和 `docs/design-system.md`。

## 架构一览

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 统一入口 | `index.html` → `src/` | Vue 3 + Vite，root 指向 `src` |
| 视图 | `src/modules/<key>/<Name>View.vue` | 10 个视图；6 个是薄包装，复用 `src/components/ModuleView.vue` 的通用引擎 |
| 领域库 | `src/lib/*.js` | 全部业务领域模块：config / store / record-view / training-review / editor / icons / utils，以及从 `js/` 迁过来的弹窗、设备模式、备份、toast、记录列表与配图、番茄钟界面、训练家族（catalog / workout / plan / view / ui）。数据读写统一走 `store.js`（`getData` / `persist` / `remove` / `saveMetaField`），视图不再自己碰数据键 |
| 共享运行时 | `js/*.js` | 只剩三个同步层经典脚本（`sync-core` / `api-client` / `sync-hooks`），挂到 `window`，由 `src/main.js` 副作用导入。其余模块已全部迁到 `src/lib/` 的 ESM 且**不再挂全局垫片**：消费者一律直接 `import`，与经典脚本之间只剩 `window.CONFIG` / `window.data` / `window.store` / `window.updateAuthUI` / `window.DemoData` 这几个明确契约，见 `docs/refactor-plan-2026-10.md` |
| 共享样式 | `css/*.css`（theme / components / workout-ui / app-dialog / record-media） | 全局 token 与组件 |
| 桌面布局样式 | `src/desktop.css`、`src/responsive.css` | 由 `src/styles.css` @import |
| 构建副本 | `src/public/` | **自动生成，不要手改** |

关键点：Vue 组件用 `innerHTML` 渲染 HTML 字符串（`record-view.js`、各 module 的 JS 里），所以样式几乎全在全局 CSS，不在 SFC 的 `<style scoped>` 里。

`src/lib/package.json` 里只有 `{"type":"module"}`，作用是把 `src/lib` 划成 ES 模块作用域：这些文件本来就全是 ESM 语法，`tests/` 会直接 `import` 它们，少了这个标记 Node 会按 CommonJS 解析并报 `Cannot use import statement outside a module`。Vite 打包不依赖它。

### 模块 → 视图

`home` `insight` `todo` `checkin` `read` `sport`(workout) `money` `note` `hot` `settings`
模块定义（图标、配色、seed 数据、字段）都在 `src/lib/config.js` 的 `CONFIG.modules`。

## 构建副本的坑

`scripts/copy-supabase-sync.mjs` 在 `predev:vue` / `prebuild` 时只把**运行期真的会按 URL 取**的 5 项拷进
`src/public/`：`supabase-sync.js` → `js/supabase-sync.js`、`js/sync-hooks.js`、`workbench-desktop.html`、
`workbench-mobile.html`、`assets/`（`src/App.vue` 的默认头像走 `/assets/avatar.jpg`）。
再由 Vite 原样输出到 `dist/`。

应用自己的 `css/` 与 `js/` 由 Vite 直接从源码树取（`src/styles.css` @import、`src/main.js` 副作用 import），
**不再往里拷副本**——之前源文件与副本并存，出现过“改了根文件、页面读的却是旧副本”的坑。

- 改样式/脚本请改根目录的 `css/`、`src/lib/`、`src/*.css`（`js/` 下只剩同步层三个脚本）。
- **绝不直接改 `src/public/` 里的东西**，下次构建会被覆盖；它现在只剩上面那 5 项。
- `workbench-desktop.html` / `workbench-mobile.html` 已退役，只剩跳转壳；真实设备切换由 `src/responsive.css` 的 820px 断点完成。

## 数据与同步

- localStorage 键：`cat-newsroom-data-v2`（`CONFIG.storageKey`）。**不要改这个键名**，会丢用户数据。
- **演示数据隔离**：`load()` 造样板记录时给每条打 `__seed: true`（`src/lib/demo-data.js`）。同步层不看标识本身，而是拿「记录内容与 `CONFIG` 样板模板逐字段比对（忽略 `__seed` / `updated_at`）」来判是不是演示数据：完全一致的不上云，用户新增或改过的记录内容不同，照常同步（`syncRecord`、`queueLocalAccountMigration`、outbox 三处都设了卡）。上云副本会去掉 `__seed`。经典脚本读守卫走 `window.DemoData` 桥。
- 已经混进账号的样板数据用 `purgeDemoRecords({ commit: true })` 清（浏览器控制台 `await purgeDemoRecords()` 先盘点），只删内容与样板完全一致的行，用户改过的不会命中。
- 同步：`supabase-sync.js` 负责认证与记录同步；AI 相关的 Edge Function 只剩 `generate-daily-copy` 与 `generate-workout-plan`；`src/main.js` 里把 `onSyncReady` / `onRemoteUpdate` 桥接到 `src/lib/store.js`。
- 版本号：`src/lib/config.js` 的 `CONFIG.APP_VERSION`，发布新功能时手动 bump。

## 硬约束（改代码前先确认没踩线）

来自 `docs/任务表.md` 的执行约束：

- 不改本地数据键、不改 `workout_session` 数据模型、不改同步协议。
- 复杂 Todo、打卡奖励、社交、AI 聊天**不进近期排期**。
- 共享颜色/字体/状态语义两端一致，桌面与移动只在布局尺寸和导航形态上覆盖。
- 新 token 必须先说明用途，不为单个页面造相似 token。

## 视觉规范

设计系统正本：`docs/design-system.md`；实物样例：`docs/design-demo.html`。
token 在 `css/theme.css`：颜色（`--page-bg` `--surface-*` `--text*` `--accent` `--module-1..5` `--danger`）、深色卡专用（`--ink-*`：暖棕渐变底加米色文字与分隔线，番茄钟、时钟卡、概览侧栏共用）、字体（`--font` 报刊衬线 / `--font-sans` 控件）、圆角（`--radius-control|tile|card|sheet|pill`）、阴影（`--shadow-card` / `--shadow-hover` / `--shadow-overlay`）、动效（`--dur-fast` / `--dur-base` / `--ease-out`）。

形状与层级约定：

- 圆角：控件 10px，卡面统一 12px（`--radius-tile` 与 `--radius-card` 同值），弹窗/大抽屉 20px，胶囊 999px。新样式只用 token，不写一次性字面量。
- 阴影：默认 `--shadow-card`；浮层/弹窗/Toast 用 `--shadow-overlay`；hover 用 `--shadow-hover`。
- hover **只**增强边框或底色，不做位移抬升（`translateY`）；active 才允许轻微位移。
- 层级靠字号与字重区分，正文 14px，标题 700，超大数字/刊头才用 800。

## 文档索引

- `docs/任务表.md` — 当前排期与执行约束（最该先看）
- `docs/设计系统` → `docs/design-system.md`
- `docs/design-review-2026-10.md` — 审美与代码细节审查
- `docs/refactor-plan-2026-10.md` — 业务代码整理方案（现状 / 目标结构 / 四阶段 / 不碰清单）
- `docs/开发经验.md`、`docs/development-guidelines.md` — 约定与历史
- `docs/frontend-migration-plan.md`、`docs/implementation-plan-v3.md` — 迁移/演进记录
