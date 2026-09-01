# 猫咪生活报

复古报刊风格的个人生活工作台，提供桌面版和移动版布局，并通过 Supabase 在同一正式账号下同步数据。

## 功能概览

- 统一入口自动识别桌面或移动布局，也可手动选择 `自动 / 桌面 / 移动`；偏好保存在当前浏览器。
- 切换布局时保留当前业务模块，同源页面共享一份本地数据。
- 番茄钟启动后进入全页面专注模式，支持暂停、继续、提前结束、刷新恢复和 5 分钟休息。
- 运动模块按胸、背、肩、腿、手臂、全身和有氧恢复日提供快捷动作。
- 每个动作可记录重量、次数、RPE、完成组、训练日期、训练时长和备注，支持补录历史训练。
- 训练历史支持查看完整动作与组次详情，也可原地修改日期、重量、次数和备注。
- H5 快捷动作使用弹窗集中选择，整张动作卡可点击添加；训练保存栏针对窄屏重新排版。
- 旧版运动目标继续兼容展示；新训练以 Session 形式保存和同步。
- AI 周报支持汇总新训练数据，并排除草稿和已删除记录。
- 记录卡片支持标准、大图、引文三种样式；图片可上传到 Supabase Storage、粘贴外链，或使用内置默认配图。

## 本地运行

项目是静态页面，需要通过 HTTP 服务运行，避免直接打开文件时产生不同 Origin：

```bash
python3 -m http.server 8765
```

访问 `http://127.0.0.1:8765/`。默认入口 [index.html](index.html) 会根据当前视口和输入能力进入合适页面。

开发校验：

```bash
npm test
npm run check
```

`npm test` 执行设备模式、番茄钟、训练模型和同步核心测试；`npm run check` 额外检查同步脚本语法。

## 端模式与数据互通

端模式偏好保存在 `cat-newsroom-ui-mode-v1`：

| 模式 | 行为 |
| --- | --- |
| `auto` | 宽度不超过 820px，或粗指针设备宽度不超过 1024px 时使用移动版 |
| `desktop` | 始终进入桌面版 |
| `mobile` | 始终进入移动版 |

当前模块保存在 `cat-newsroom-last-view-v1`，手动切换后会恢复该模块。桌面版和移动版在同一域名、协议和端口下共享 `cat-newsroom-data-v2`；不同浏览器或物理设备需登录同一正式账号后通过 Supabase 互通。

## 同步约束

同步层严格区分全量同步和原子同步：

| 入口 | 允许场景 | 行为 |
| --- | --- | --- |
| `runFullSync({ reason: "page_init" })` | 页面每次重新进入后的首次初始化 | 处理 outbox，再拉取 records/meta 并合并 |
| `runFullSync({ reason: "manual" })` | 用户点击“立即同步” | 处理 outbox，再执行一次全量冲突合并 |
| `syncRecord({ moduleKey, record })` | 新增或编辑一条记录 | 只 upsert 对应记录 |
| `syncDelete({ moduleKey, recordId })` | 删除一条记录 | 只写对应 tombstone |
| `syncMetaField({ field, value })` | 头像、番茄统计或趋势变化 | 只更新对应 meta 字段 |

普通业务操作、自动重试和 Realtime 事件不会触发全量回拉。失败操作保存在 `cat-newsroom-sync-outbox-v1`，恢复连接后只重试对应单项操作。完整训练 Session 作为一条 JSONB 记录原子 upsert。

## Supabase 配置

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 [supabase-schema.sql](supabase-schema.sql)。
3. 在 Authentication 中开启 Anonymous 认证。
4. 在 [supabase-sync.js](supabase-sync.js) 顶部配置 Project URL 和 Publishable key。

```js
const SUPABASE_CONFIG = {
  url: "https://xxxxx.supabase.co", // Supabase Project URL
  anonKey: "sb_publishable_...", // 仅使用 Publishable/anon key
  reportFunction: "generate-weekly-report",
  mediaBucket: "card-images", // 卡片图片公开读取桶
};
```

Publishable/anon key 可放在前端，并由 RLS 限制数据访问；不要把 `service_role` key 写入仓库或前端代码。

卡片图片上传使用 `card-images` Storage bucket。SQL 脚本会创建公开读取桶，并限制正式登录用户只能写入自己 `userId/模块/记录/文件名` 目录；匿名会话仍可使用默认配图，但不能上传图片。

### AI 周报

执行数据库脚本后，使用 Supabase CLI 部署 Edge Function：

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy generate-weekly-report
```

在 Edge Function Secrets 中配置 `AIXLUV_API_KEY`，可选配置 `AIXLUV_MODEL`。AI 密钥只存在服务端。

## 部署

将仓库完整部署到 GitHub Pages，并让站点默认打开根目录的 `index.html`。保留 `workbench-desktop.html` 和 `workbench-mobile.html`，旧书签仍可访问，页面会根据已保存的端模式偏好纠正布局。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 统一入口和端模式解析 |
| `workbench-desktop.html` | 桌面端页面与 DOM 适配 |
| `workbench-mobile.html` | 移动端页面与 DOM 适配 |
| `js/device-mode.js` | 自动识别、模式偏好和模块恢复 |
| `js/pomodoro.js` | 番茄钟状态机与全页面专注层 |
| `js/workout-catalog.js` | 训练日与动作目录 |
| `js/workout.js` | 训练 Session 模型与统计 |
| `js/workout-ui.js` | 两端共享的训练状态、事件和原子保存控制器 |
| `js/workout-view.js` | 训练编辑器、历史卡片与详情弹窗视图 |
| `css/workout-ui.css` | 训练模块两端响应式样式与轻量动效 |
| `js/workbench-core.js` | 本地记录和元数据保存入口 |
| `js/record-media.js` | 记录默认配图、图片 URL 回退和图库选择 |
| `js/sync-core.js` | 全量合并、Realtime 应用和 outbox 去重 |
| `supabase-sync.js` | Supabase 认证、原子同步和手动/初始化全量同步 |
| `supabase/functions/generate-weekly-report/` | AI 周报 Edge Function |
| `supabase/migrations/20260901000000_card_images_storage.sql` | 卡片图片 Storage bucket 与 RLS 策略 |
| `tests/` | Node 核心逻辑测试 |
| `docs/implementation-plan-v3.md` | V3 需求、架构和验收依据 |

## 数据安全

- `workbench_records` 按记录存储各模块 JSONB 数据，训练 Session 也是其中一条记录。
- `workbench_meta` 存储头像、番茄统计和趋势数据；番茄运行倒计时只保存在本机。
- `weekly_reports` 按用户和周缓存生活周报。
- `card-images` 公开读取图片文件；写入、替换和删除均按用户目录隔离，并要求正式账号。
- 所有表使用 RLS 按 `auth.uid()` 隔离，匿名用户也拥有独立用户 ID。
