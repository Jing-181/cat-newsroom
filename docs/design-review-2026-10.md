# 视觉与代码细节审查 · 2026-10

## 前提

本轮改动的依据是源码与 token 的静态分析。我这边**起不了 dev server**（沙盒禁止监听端口），也读不了截图，所以没有肉眼验证过渲染结果；下面每一条都写清了"为什么这么改"，请你用本地 `npm run dev:vue` 或直接打开 `docs/design-demo.html` 复核。

复核重点：首页的模块卡 / 快速记录 / 置顶卡 hover，模块页的区块小标题与右侧统计栏，运动页的历史卡与计划卡，个人配置页。

---

## 一、已改（本轮落地）

### 1. hover 和自己的规范打架

`docs/design-system.md` 写着「hover 只增强边框或背景」，但代码里 `.modcard`、`.qbtn`、`.pin`、`.history-card`、`.plan-day-card` 都在 hover 时 `translateY(-1px / -2px)` 并把阴影跳到最重的 `--shadow-overlay`。结果是鼠标划过时整页在轻微上下跳，卡片之间互相推挤的错觉。

改为：hover 只换边框色加新加的中间档阴影 `--shadow-hover`，位移去掉。`.ws-cell:hover` 同因去位移；`.hcell:hover` 从 `scale(1.12)` 收到 `1.06`（12% 放大在 22px 的格子上显得毛躁）。现在整仓源码里已经没有 hover 位移。

### 2. 圆角家族分裂

改动前，同一屏里能数出五种圆角：模块卡 14px、瓷砖/记录卡 10px、按钮和图标底板 11px、勾选框 6–7px，装饰段再用 `!important` 把打卡格压成 4px。token 明明有，字面量却在各处自己长。

现在统一到一套：

| token | 值 | 用途 |
| --- | --- | --- |
| `--radius-control` | 10px | 输入、步进、图标底板 |
| `--radius-tile` | 12px | 按钮、标签、小卡、记录卡 |
| `--radius-card` | 12px | 模块卡与瓷砖（与 tile 同值，暂不分化） |
| `--radius-sheet` | 20px | 通栏、抽屉、大弹窗 |
| `--radius-pill` | 999px | 胶囊 |

`src/desktop.css`、`src/responsive.css`、`css/workout-ui.css` 里的 `10px / 11px / 12px / 14px / 999px` 字面量全部并入 token（运动模块 23 处），`.hcell` 的 `border-radius: 4px !important` 删掉。仍保留字面量的只有小于 22px 的方框（6–8px 的勾选框、图标小底、步进按钮拼接角），那是设计系统明确允许的小圆角档。

### 3. 字重整体偏吵

800 出现 63 次，另有 20 处非标准 `750`。标题、区块小标题、侧栏卡头、设置项名一水儿 800，层级是靠"更黑"堆出来的，不是靠尺寸。

本轮把**标题与标签层级**从 800 收到 700：`.header h2`、`.hero-banner .hi`、`.sec-title`、`.sec-grp .zh/.en`、`.tile-h .zh/.en`、`.modcard .mc-name/.mc-main`、`.side-card .sh`、`.panel .ph`、`.set-name`、`.clock-card .hi`、`.m-topbar .m-brand h1`，加上运动模块的 7 处（`.workout-panel-title`、`.session-exercise-head strong`、`.set-progress`、`.workout-completion-title`、`.history-month`、`.history-card h4`、`.workout-fold > summary`）。

`750` 全部并在 `700`。这里没有视觉风险：PingFang SC 的静态字重只有 Medium(500)/Semibold(600)，750 和 700 都会落到 Semibold，只是把噪声去掉。

**保留 800** 的：超大数字与报刊刊头（`.clock-card .clk`、`.stat-big`、`.hero-v`、`.spend-total`、`.pomo .ptime .t`、`.ov2-stat .s-v`）。重数字是这个"报纸"的性格，削掉反而没劲。

### 4. 弱提示字号偏小、颜色偏浅

`.tile-h .en` 只有 9.5px、`.sec-grp .en` 10.5px，配 `--text-tertiary #b09880` 在 `--surface-card #faf3e3` 上对比度只有 **2.48:1**，连大字号 AA 的 3:1 都不到。

字号提到 11px，`--text-tertiary` 加深到 `#a08a70`（约 3.0:1）。`--text-secondary` 保持 3.96:1 不动，见「未改」第 4 条。

### 5. squircle：把 Hanako 的招牌圆角借过来

新增 `*, *::before, *::after { corner-shape: squircle; }`，圆角按超椭圆渲染，比正圆角柔和一档，和这套暖纸调性很搭。不支持的浏览器自动回退为普通圆角，属于纯增强。

需要保持正圆的元素（圆点、圆形关闭按钮、开关滑块）显式写回 `corner-shape: round`。

### 6. 明确缺陷

- **`body { min-width: 1000px }` 与 820px 断点冲突**：821–999px 区间会顶出横向滚动条。删掉 min-width，并在 `src/responsive.css` 末尾补一个 `821–1099px` 的中间断点，让多列网格降成两列，而不是挤在一起。**这一条是我的判断，等你确认**。
- **`body::before` 声明了两次**：顶部 `opacity:.5`，装饰段又 `opacity:.35; mix-blend-mode:multiply`。合并到顶部一处，留 .35 加 multiply（纸纹更服帖）。
- **`!important` 清理**：`.hcell{border-radius:4px!important}`、`.hero.has-cover{border:2px dashed!important}`。它们在文件里出现得更晚、优先级也够，`!important` 是多余的。`.stepper input{border-radius:0!important}` 我留着没动，它可能是为覆盖某个全局输入样式而写的，删掉要单独验证。
- **补 `prefers-reduced-motion` 全局兜底**：原来只关了 `.btn` 和 `.modal`，现在统一降到 0.001ms。
- **`transition: all` 收窄**：`.pomo .pctl button` 的 `transition:all .15s` 改成只过渡 `background` / `border-color`，避免把布局属性拖进动画。
- **动效时长统一**：散写的 `.12s / .15s / .18s / .2s` 在改到的规则里换成 `--dur-fast` / `--dur-base`。

### 7. 深色卡 token 化

`src/desktop.css` 里番茄钟、时钟卡、概览侧栏的深棕渐变与米色文字，共 14 处字面量换成 `--ink-bg-from|mid|to` / `--ink-text` / `--ink-text-mute` / `--ink-hover` / `--ink-line`。这几个色值现在在 `src/desktop.css` 里归零，改深色卡只要动 `css/theme.css` 一处。

剩下的 `rgba(240,232,213,.08/.16/.22/.38)` 是同一支墨水的不同透明度档位，没有一一对应的 token，暂留字面量，免得为四点几的差异造一堆 token。

### 8. token 补齐

`css/theme.css` 新增：`--radius-pill`、`--shadow-hover`、`--ease-out` / `--dur-fast` / `--dur-base`，以及深色卡一组 `--ink-*`。

---

## 二、未改 / 建议你定夺

1. **`shared-*` 与线上遗留类的漂移**。`design-system.md` 规定用 `.shared-btn` / `.shared-field`，`design-demo.html` 也按 shared 版展示，但实际页面用的是遗留的 `.btn` 和原生 `input`。两者视觉靠同一套 token 兜住了，所以不算破相，但文档和现实是两张皮。统一要动所有编辑表单和按钮，改动面大，留给你点头。
2. **记录卡大量 inline style**。`src/lib/record-view.js` 里有 27 处 `style="..."`。其中一半是动态值（模块色、进度百分比）必须留内联；另一半是固定组合，比如 `margin-left:0;color:var(--text-tertiary)`、`background:var(--accent-muted);color:var(--accent)`，可以收成 `.rdate--flat` / `.badge--accent` 这类 class。这是全项目里唯一还没收口的样式散落点，但它是渲染代码，我改不了图看效果，所以停在这里。
3. **800 仍剩 34 处**（含 `src/public` 副本，源码里约 17 处），基本都是数字。如果你觉得整体还是偏重，可以把数字也降到 600/700，观感会更"安静"，但刊头感会弱一些。
4. **`--text-secondary` 3.96:1 未过正文 AA（4.5:1）**。这是暖纸低对比调性的固有取舍，要达标就得整体加深，会牺牲"旧报纸"的淡雅。你更看重哪个？

---

## 三、顺带修掉的既有问题

`npm test` 原本有 12 个失败，全在 `tests/weekly-report-utils.test.js`：模块是 ESM 语法但文件是 `.js`、根 `package.json` 没有 `type: module`，Node 按 CommonJS 解析，报 `Cannot use import statement outside a module`。

试过把文件改名 `.mjs`，但它的依赖 `./icons.js` 才是真正报错的那一环（`Named export 'esc' not found`），单改一个文件名治不了。最后加了 `src/lib/package.json`（内容只有 `{"type":"module"}`），把整个 `src/lib` 划成 ES 模块作用域，文件名保持不变。

选这条路的理由：改动只落在一个新增的小文件上，不动根 `package.json`（那里必须留 CommonJS，测试和 `supabase-sync.js` 都按 CJS 跑），也不动任何文件名。现在 `npm test` 是 **99 / 99 通过**。

---

## 四、批注驱动的调整（2026-10-08，两处批注）

### 1. 运动偏好入口先撤下来

批注：「现在不要了，后面再重新考虑怎么实现运动偏好和计划的组合」。

做法是**只撤入口、不动实现**：把 `编辑运动偏好` 从运动页头部的 ☰ 菜单里拿掉（`js/workout-view.js` 的 `idleHtml`），弹窗本体与 `cat-newsroom-workout-preferences-v1` 这个键都留在 `js/workout-ui.js` 里，并加了注释。偏好与计划的组合方式重新想好之后，把按钮挂回菜单就能接上。`生成六天计划` / `查看计划` 两个入口没动（它们读不到偏好键时走默认值，逻辑不变）。`tests/workout-view.test.js` 的对应用例改成断言该入口不存在。

### 2. 动作卡（`article[data-exercise-card]`）的样式

批注：「看看样式有什么可以再优化的」。逐一看了卡片四层（头部 / 上次表现 / 组列表 / 脚部），改了五处：

- **头部的移除叉降档**。它原本还是 `.icon-action` 的默认外观（1px 边框 + 卡底色），成了头部边框最重的元素；而组里的删除早就按「次要操作去掉边框与底色」处理过。现在头部这个也去掉边框与底色，悬停转 `--danger`，点击区尺寸不变。
- **聚焦阴影降一档**。`.session-exercise:focus-within` 用的是 `--shadow-overlay`，那是弹窗级阴影（`.workout-dialog`、计划菜单共用），在组里输入时整张卡会飘起来。改为 `--shadow-hover`。
- **组进度胶囊提到正文色**。它是这张卡唯一的进度读数，却是 11px 配 `--text-secondary`（约 3.96:1），达不到小字号 AA。改成 `--text`，形状与字重不动，仍然是头部第三项。
- **上次表现那行加 6px 顶距**。原来顶距 0，直接贴着头部的分隔线，和头部自身 11px 的内边距不对称。
- **`.plan-menu-icon` 的过渡时长换成 token**（`.15s ease` → `--dur-fast`），这是全文件最后一处散写时长。

### 3. 动作卡的信息去重（批注确认后重设）

批注确认「确实是重复了然后冗余」。诊断出来的问题是同一份事实出现两遍：「上次」这个词两次，组数两次。

定的原则是：**一个事实只说一遍，并且说在「用得上的地方」**。

- 卡片级那行原本是 `上次 <日期> 自重×8 / 自重×8 / 自重×8 共 3 组`，三段式；现在只剩 `上次 <日期> · 3 组`。整段每组明细等于把刚数过的组又抄一遍（训练里组间重量往往相同，这串字符几乎没有信息量），删掉。
- 每组的具体参照值贴到它自己那一行上（`第 N 组` 旁边），并去掉「上次」二字，只留数值；完整语义移进 `title="上次这一组：…"`。「上次」这个前提由卡片级那行给出，不在两处各写一遍（顺带补上了 `title`，以前鼠标悬停看不到完整含义）。
- 组数提到与日期同一档（`--text-secondary` / 12px）。这行现在只有两个事实，再弱下去「上次练了几组」就读不出来了。
- `.exercise-last b` 的样式规则随之删除（无引用）。

改完之后，卡里三个事实各占一处：**本次进度**在头部胶囊、**上次哪天练了几组**在「上次」行、**这一组上次多少**在对应组行上。

---

## 改动文件清单

| 文件 | 改了什么 |
| --- | --- |
| `css/theme.css` | token 补齐与归并（圆角、阴影、动效、`--ink-*`、`--text-tertiary`） |
| `src/desktop.css` | hover 收敛、圆角归并、字重下调、深色卡 token 化、squircle、`min-width` 与重复声明与 `!important` 修复、reduced-motion |
| `src/responsive.css` | 中间断点、圆角 token、字重、注释同步 |
| `css/workout-ui.css` | 23 处圆角归并、7 处字重下调、hover 收敛、动效时长、`transition:all` 收窄；动作卡头部删除降档、聚焦阴影降档、组进度胶囊提到正文色、上次表现行补顶距；信息去重后删掉 `.exercise-last b` |
| `js/workout-view.js` | 运动偏好入口下架（实现保留），`idleHtml` 菜单只剩生成/查看计划；卡片级「上次」行收成日期 + 组数，每组参照值只在组行出现 |
| `js/workout-ui.js` | 偏好弹窗实现保留并加注释说明入口已暂停 |
| `tests/workout-view.test.js` | 偏好入口用例改为断言其不存在；上次表现用例按新信息设计重写 |
| `js/pomodoro.js` | 2 处 `font-weight:750` → `700` |
| `src/lib/package.json` | 新增，`{"type":"module"}`，修掉 12 个测试失败 |
| `AGENTS.md` | 新增，私人工作台地图 |
| `docs/design-system.md` | 同步 token 表、圆角与字重规则、hover 描述、中间断点 |
| `src/public/*` | 由 `npm run build` 的 prebuild 自动同步，未手改 |

验证：`npm run build` 通过（`main` CSS 87.01 kB），`npm test` 99 / 99 通过。

仍然没有肉眼验证：本地开发服务器是 `npm run dev:vue -- --port 5176`，页面观感得在浏览器里过一遍。
