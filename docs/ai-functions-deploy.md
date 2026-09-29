# AI Edge Function 部署指南（周报 / 训练计划）

静态站点由 GitHub Actions 自动部署到 Pages；**两个 AI Edge Function 需要手动用 Supabase CLI 部署**。

## 1. 设置密钥（一次即可）

在项目根目录执行（密钥只存进 Supabase Secret，不会进仓库）：

```bash
npx supabase secrets set \
  AIXLUV_API_KEY=sk-xxx \
  AIXLUV_MODEL=gpt-5.5 \
  SU8_API_KEY=su8-xxx \
  SU8_MODEL=gpt-5.5
```

说明：
- `AIXLUV_API_KEY` 为主链路密钥（若线上已有则无需重复设置）。
- `AIXLUV_MODEL` 建议固定为 `gpt-5.5`（实测可用；旧逻辑自动挑选 `codex-auto-review` 会被上游拒绝）。
- `SU8_API_KEY` 为兜底链路密钥；SU8 网关拒绝带 `temperature` 字段的请求，代码已按兼容模式提交（不带 temperature）。

## 2. 部署函数（代码变更后执行）

新版 Supabase CLI（v2.x）实测可用的部署命令：

```bash
# 项目引用：qqtasmilusrpyxhrqptd（可用 supabase functions list --project-ref <ref> 复核）
# 禁用遥测可避免沙箱/受限环境写入 ~/.supabase/telemetry.json 时报 EPERM
SUPABASE_TELEMETRY_DISABLED=1 npx supabase functions deploy generate-weekly-report --project-ref qqtasmilusrpyxhrqptd --use-api
SUPABASE_TELEMETRY_DISABLED=1 npx supabase functions deploy generate-workout-plan --project-ref qqtasmilusrpyxhrqptd --use-api
```

注意（新版 CLI 与旧文档的差异）：
- `--timeout-ms` 参数已废弃（旧版 CLI 专属），超时改由 `supabase/config.toml` 的 `[functions.<name>]` 段配置。
- 项目缺少 `supabase/config.toml` 时 CLI 读不到 project ref，需显式传 `--project-ref`；已建 `config.toml`（含周报函数的 `verify_jwt` 与 `timeout_seconds` 配置）。
- `--use-api` 走服务端打包，无需本地 Docker。
- 部署后验证：`SUPABASE_TELEMETRY_DISABLED=1 npx supabase functions list --project-ref qqtasmilusrpyxhrqptd`，看到 `generate-weekly-report` 为 ACTIVE 且 VERSION 递增即可；再 `curl -X POST https://<ref>.supabase.co/functions/v1/generate-weekly-report`（无凭证）应返回 `UNAUTHORIZED_NO_AUTH_HEADER`，说明函数在线且 JWT 校验生效。

## 2.5 变更记录

### 2026-09-29 补历史周功能部署

- 变更内容：`generate-weekly-report` 支持补生成历史周（list 返回最早记录周 + 失败状态、拒绝未来周、无日期记录按创建时间归属）。
- 部署结果：VERSION 13 → 14，ACTIVE（2026-09-29 02:13 UTC）。
- 遇到的问题与解决：
  1. 部署报 `EPERM ... ~/.supabase/telemetry.json.tmp`：CLI 遥测写入被环境拦截，加 `SUPABASE_TELEMETRY_DISABLED=1` 解决。
  2. `--timeout-ms` 报 `Unrecognized flag`：新版 CLI 已移除，改为 `config.toml` 的 `[functions.generate-weekly-report] timeout_seconds = 120`。
  3. `Cannot find project ref`：项目无 `config.toml`，先 `npx supabase init` 生成，再显式 `--project-ref qqtasmilusrpyxhrqptd`。
- 前端静态站由 GitHub Actions 自动发布（含周选择器补生成入口）。

## 3. 故障排查

- 错误 `502 Upstream access forbidden`：主链路（aixluv）上游抖动，代码已做 3 次重试，失败自动切 SU8 兜底。
- 错误 `codex request was rejected`：请求带了 `temperature`（SU8 会拒绝），确认 SU8 链路按兼容模式提交。
- 错误 `400 模型未配置价格`：aixluv 该 key 下该模型无价格，改用 `AIXLUV_MODEL=gpt-5.5`。
- 本地验证：`node scripts/demo-ai-report.mjs`（读取 `.env.local`，已 gitignore）。

## 4. 环境变量总表

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `AIXLUV_API_KEY` | 主链路密钥（必填之一） | - |
| `AIXLUV_BASE_URL` | 主链路地址 | `https://api.aixluv.com` |
| `AIXLUV_MODEL` | 主链路模型 | 自动挑选（白名单优先 `gpt-5.5`） |
| `SU8_API_KEY` | 兜底链路密钥（可选） | - |
| `SU8_BASE_URL` | 兜底链路地址 | `https://www.su8.codes` |
| `SU8_MODEL` | 兜底链路模型 | `gpt-5.5` |
