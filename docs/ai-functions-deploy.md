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

```bash
npx supabase functions deploy generate-weekly-report --timeout-ms 120000
npx supabase functions deploy generate-workout-plan --timeout-ms 120000
```

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
