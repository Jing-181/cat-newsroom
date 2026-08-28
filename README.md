# 猫咪生活报 · 云端同步版

卡通小猫 × 复古报刊编辑部风格的个人工作台，支持 GitHub Pages 托管 + Supabase 云端数据同步。

## 快速部署（3 步）

### 第 1 步：创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com) 注册并创建新项目
2. 进入 **SQL Editor**，粘贴 `supabase-schema.sql` 的内容并执行
3. 进入 **Authentication > Providers**，开启 **Anonymous** 认证（即开即用）
4. 进入 **Project Settings > API**，记下：
   - **Project URL**（如 `https://xxxxx.supabase.co`）
   - **Publishable key**（`sb_publishable_...`，旧项目也可能显示为 anon key）

### 第 2 步：配置同步模块

打开 `supabase-sync.js`，在顶部填入你的配置：

```js
const SUPABASE_CONFIG = {
  url: "https://xxxxx.supabase.co",    // 替换为你的 Project URL
  anonKey: "sb_publishable_..."        // 替换为你的 Publishable key
};
```

> anon key 是公开密钥，配合 RLS 行级安全策略使用，可以安全地放在前端代码中。
> 永远不要把 service_role key 放到前端。

### 第 3 步：部署到 GitHub Pages

1. 在 GitHub 创建新仓库（如 `cat-newsroom`）
2. 将以下文件上传到仓库根目录：
   ```
   workbench-desktop.html
   supabase-sync.js
   supabase-schema.sql
   assets/
     greet-banner.jpg
     paper-texture.jpg
     avatar.jpg
   ```
3. 进入仓库 **Settings > Pages**
4. **Source** 选择 `Deploy from a branch`
5. **Branch** 选 `main`，文件夹选 `/ (root)`
6. 保存后等待 1-2 分钟，访问 `https://你的用户名.github.io/cat-newsroom/workbench-desktop.html`

### 第 4 步：部署 AI 周报（可选）

1. 在 Supabase SQL Editor 执行更新后的 `supabase-schema.sql`，会升级记录主键并创建 `weekly_reports`。
2. 使用 Supabase CLI 部署 `supabase/functions/generate-weekly-report/index.ts`。
3. 在 Edge Function Secrets 中配置 `AIXLUV_API_KEY`，可选配置 `AIXLUV_MODEL`。
4. AI 密钥只保存在 Edge Function，前端不会直接暴露密钥。

命令行部署方式：`supabase link --project-ref <project-ref>`、`supabase db push`、`supabase functions deploy generate-weekly-report`。

## 使用方式

- **未配置 Supabase 时**：纯本地模式，数据存在浏览器 localStorage
- **配置 Supabase 后**：打开页面自动匿名登录，数据静默同步到云端
- **正式账号后**：每周首次访问首页会生成或读取本周 AI 生活报，洞察页可手动重生成
- **点击侧栏底部同步指示器**：
  - 匿名用户 → 弹出登录/注册弹窗，升级为正式账号
  - 已登录用户 → 可登出
  - 离线状态 → 重新连接云端

## 数据架构

```
GitHub Pages（静态托管）
       ↓
  workbench-desktop.html（前端 UI）
       ↓
  supabase-sync.js（同步层）
       ↓
  Supabase（PostgreSQL + Auth + Realtime）
       ↓
  workbench_records 表（JSONB 存储所有模块数据）
  workbench_meta 表（头像/番茄钟/趋势等元数据）
  weekly_reports 表（按用户和周保存 AI 生活报）
```

### 数据表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `workbench_records` | 所有模块的记录 | `id`, `user_id`, `module_key`, `data`(JSONB) |
| `workbench_meta` | 用户元数据 | `user_id`, `avatar`, `pomo_stats`, `trend_data` |
| `weekly_reports` | AI 周报缓存 | `user_id`, `week_start`, `payload`, `source_snapshot` |

每个用户的记录通过 `user_id` 隔离，RLS 策略确保用户只能读写自己的数据。

## 本地开发

直接用浏览器打开 `workbench-desktop.html` 即可。如果 `supabase-sync.js` 中的配置为空，会自动降级为纯本地模式。

## 文件说明

| 文件 | 说明 |
|------|------|
| `workbench-desktop.html` | 主应用（单文件，含全部 UI 和逻辑） |
| `supabase-sync.js` | 云端同步模块（SDK 加载 + 认证 + CRUD + 实时） |
| `supabase-schema.sql` | 数据库建表脚本（含 RLS 策略） |
| `assets/` | 首页横幅、纸张纹理、默认头像 |

## 安全说明

- **anon key** 可安全暴露在前端代码中（Supabase 设计如此），它只拥有 anon 权限
- **service_role key** 永远不要放到前端
- 数据隔离靠 RLS 行级安全策略，每个用户只能访问 `user_id = auth.uid()` 的记录
- 匿名用户也有 `auth.uid()`，数据同样被隔离保护
- 匿名用户升级为正式账号后，数据不丢失（同一 user_id）
