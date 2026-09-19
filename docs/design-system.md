# 猫咪生活报设计系统

> 视觉基准：复古报刊 × 个人生活 × 温暖 × 克制 × 一点猫咪趣味。规范描述规则，`design-demo.html` 展示实际效果。

## 使用规则

- 新组件先使用共享 CSS 变量和组件类，再添加页面或模块专属样式。
- 不在 workbench HTML 中新增主题变量；页面只保留布局和业务状态。
- 修改公共组件时同步更新本页与 `docs/design-demo.html`。
- 两端共用颜色、字体、状态和语义；桌面与移动只在布局尺寸、导航形态和可用空间上覆盖。
- 新颜色、圆角和阴影必须先说明用途，避免为单个页面创建相似 token。

## 品牌与色彩

| Token | 值 | 用途 |
| --- | --- | --- |
| `--page-bg` | `#f3ecd9` | 旧报纸页面底色 |
| `--surface-card` | `#faf3e3` | 卡片和控件表面 |
| `--surface-nested` | `#ede4cc` | 嵌套区域和输入背景 |
| `--text` | `#5a4a38` | 主文本 |
| `--text-secondary` | `#8a7560` | 辅助文本 |
| `--text-tertiary` | `#b09880` | 占位和弱提示 |
| `--accent` | `#c47128` | 主操作、头条强调 |
| `--module-1` | `#5c7a3e` | 完成、收入、成功 |
| `--module-2` | `#c47128` | 阅读、趋势、焦点 |
| `--module-3` | `#b89030` | 运动、星标、连续记录 |
| `--module-4` | `#8b6839` | 账本、训练辅助 |
| `--module-5` | `#4a6b5c` | 日记、生活记录 |
| `--danger` | `#b8482e` | 删除和错误 |

背景素材使用 `--greet-image` 和 `--page-texture`，统一从 `assets/` 加载。共享 CSS 位于 `css/`，因此资源路径使用 `../assets/`。

## 字体、间距与形状

- 报刊标题和内容使用 `--font`：Georgia、宋体优先。
- 控件标签、数字和密集信息使用 `--font-sans`。
- 间距基线：4、8、12、16、24、32、48px；优先使用 8 的倍数组织区块。
- `--radius-control` 用于输入、步进和小控件；`--radius-tile` 用于按钮、标签和小卡；`--radius-card` 用于模块卡；`--radius-sheet` 仅用于底部抽屉或大弹窗。
- 普通卡片使用 `--shadow-card`；弹窗、浮层和 Toast 使用 `--shadow-overlay`。

## 组件与状态

共享组件类位于 `css/components.css`：

- `.shared-btn`：默认、`.primary`、`.ghost`、`.danger`、禁用和键盘焦点。
- `.shared-field`：输入、选择、文本域及焦点状态。
- `.shared-card`：重复数据项和示例面板。
- `.shared-empty`：无数据状态，必须同时提供原因和下一步操作。
- `.shared-modal`：弹窗表面；实际确认逻辑继续使用 `js/app-dialog.js`。
- `.shared-status`：成功、警告和错误状态。

交互状态必须可辨识：hover 只增强边框或背景，active 有轻微位移，focus 使用 `--accent` 外描边，disabled 降低透明度且不可点击，loading 保留布局尺寸，error 使用 `--danger` 和可读文案。

## 双端规则

- 桌面：固定侧栏，内容区保持可扫描的多列布局；`--sidebar-w`、`--drawer-hover` 和 `--drawer-active` 属于桌面布局覆盖。
- 移动：单列内容，底部导航占用 `--nav-h`；抽屉和弹窗可以使用底部 sheet，并使用共享默认抽屉状态。
- 375、390、430px 宽度下不得出现横向滚动；数字、按钮和训练组需要稳定尺寸。
- 820px 是自动端模式边界；触控设备在 1024px 以下优先移动布局。
- `prefers-reduced-motion: reduce` 时取消非必要位移和动画。

## 回归入口

打开 `docs/design-demo.html` 检查颜色、字体、按钮、表单、卡片、弹窗、状态和移动布局。它使用与两个 workbench 相同的共享 CSS，并使用固定样例数据，不读写个人记录。
