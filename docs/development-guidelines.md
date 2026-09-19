# 开发规范

## 技术边界

新功能优先使用 `js/` 下的共享模块和 `css/` 下的样式文件。主题 token 和通用组件以 `css/theme.css`、`css/components.css` 为单一来源。`workbench-mobile.html` 与 `workbench-desktop.html` 只作为页面入口，避免继续新增内联业务逻辑。

## 目录与命名

视图模块使用 PascalCase 导出的渲染函数，纯函数使用描述性 camelCase。模块专属代码放在 `js/`，跨模块逻辑集中维护，样式按通用组件和模块文件拆分。

## 状态与数据

组件只维护界面状态；本地记录继续使用现有数据键和 `workout_session` 模型。云端写入通过现有同步层或明确的 API 模块，不能在组件中重复实现同步。

## AI 与错误

密钥只能存在 Supabase Secret。接口必须定义输入、输出、错误响应并校验模型返回；AI 输出只提供建议，不写入完成历史，不提供医疗结论。

## 验证与提交

提交前运行 `npm run check` 和 `npm test`；当前项目没有 `npm run build` 脚本。涉及 Edge Function 时同时验证未登录、匿名账号、上游错误和非法 JSON。新增行为必须补纯函数测试或组件测试。视觉改动需同步检查 `docs/design-demo.html`、两个 workbench 入口以及 375/390/430px 移动和 1280/1440px 桌面视口。

## 设计回归

修改公共颜色、字体、按钮、表单、空状态或弹窗时，先更新 `docs/design-system.md`，再更新 `docs/design-demo.html`。页面专属差异必须记录为布局覆盖，不能复制一份新的主题变量。
