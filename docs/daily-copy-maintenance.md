# 每日一卡：本地月度内容

自 2026 年 11 月起，首页使用项目内原创短句，不读取云端批次、不调用生成 API、不依赖登录。已配置 2026-11 共 30 条，主题为生活、猫、阅读与运动，不作名人引文或知识断言。

## 维护

- 编辑 `src/lib/daily-copy-content.js` 的 `DAILY_COPY_MONTHS`，以 `YYYY-MM` 为键，数组第 1 项对应当月 1 日；条数必须与该月天数一致。新增月份时补完整日期覆盖测试。
- 日期使用设备本地年/月/日，禁止用 `toISOString()` 截日期。没有对应年月时固定显示 `DAILY_COPY_FALLBACK`，不会循环借用旧月份。
- 「换一条」只在当前月内循环；当天偏移保存在 sessionStorage，存储受限时退回内存。下次渲染或点击时跨天归零；不启动午夜定时器。缺月兜底没有换条按钮。
- 旧云端批次 localStorage 不再读取，也不删除；业务数据键、账号与同步协议保持不变。

## 接口与边界

`daily-copy.js` 保留 `dailyCopySlotHTML`、`refreshDailyCopySlot`、`initDailyCopy`。首页仍调用前者生成内容、后者绑定本地按钮。移除生成接口、批次信息接口、全局补拉钩子；设置页只保留说明，不订阅每日一卡同步刷新。

本次不修改 `supabase-sync.js` 的历史 `generateDailyCopy` / `fetchDailyCards` 包装（交主 agent 清理），不删除云端函数、表或迁移。`supabase/functions/generate-daily-copy` 与迁移文件继续保留为历史资源，前端每日一卡不再调用。README、AGENTS、旧 AI 部署文档和开发经验中仍有旧架构描述，涉及每日一卡时以本页为准。

验证：`node --test tests/daily-copy.test.js tests/vue-build.test.js`、`npm run check`、`npm run build`。行为测试覆盖 30 天内容、年月边界、双时区、换条、跨天、存储不可用及无网络调用；入口测试防止旧生成与补拉重新接入。
