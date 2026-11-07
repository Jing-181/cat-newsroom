# 动作图解库：静态图解资产层

2026-11-07。分支 `wip/motion-skeleton-sprite` 这一步接入的资产。

## 一句话

Jing 给了 56 个动作的手绘小人图集（1536×1024）。这一层把**人画好的造型**接成可按动作名查询的静态图解；不改画、不加工，代码只登记裁剪窗口和取格方式。

## 为什么不进逐帧播放器

`src/lib/sprite/player.js` 和预览页 `src/preview/sprite.html` 里的「精灵图」是**一个动作的多帧动画 sheet**：一行 N 帧，播放器按 `fps` 逐帧切，画面动起来。

这张图集是 **56 个不同动作各一张静态图解**。把它丢进 `createSprite` 会变成 56 个动作快速乱闪，那不是动画，是错用。

所以两者是并列的两层，不是一前一后的替换：

| | 静态图解（本文） | 逐帧动画（player.js） |
| --- | --- | --- |
| 一张图里 | 56 个动作 | 1 个动作的 N 帧 |
| 取哪一格 | 按动作名 | 按时间 |
| 入口 | `figureFor(name)` / `cssFor(cell)` | `createSprite(el, {src, cols, rows, fps})` |
| 状态 | **已接入**，56 张可用 | 播放器与预览页已就绪，真帧图还没画 |

`docs/motion-keep.md` 第四节留了两条给画帧用的东西：人体结构（对照关节角度，别画出反折的膝盖）、运动轨迹（帧数与关键帧时间点，节奏对得上原观感）。等要扩展成逐帧时，这两条就是依据。

## 文件

| 文件 | 作用 |
| --- | --- |
| `assets/motion-library.png` | 原图，不加工。构建时由 `scripts/copy-supabase-sync.mjs` 拷进 `src/public/assets/` |
| `src/lib/sprite/frames.js` | 56 个 `[x, y, w, h]` 裁剪框，脚本生成，勿手改 |
| `src/lib/sprite/library.js` | 数据层：分组、名字查询、别名、CSS 取格 |
| `scripts/motion-frames.py` | 从原图量框；换素材重跑它 |
| `src/preview/library.html` | 验收页：查名字、看框位、看覆盖率、出 CSS |
| `docs/motion-library-frames.png` | 带框的验收图 |
| `tests/sprite-library.test.js` | 回归测试 |

## 怎么用

```js
import { figureFor, cssFor, mountFigure } from "./sprite/library.js";

const cell = figureFor("杠铃卧推");   // 找不到返回 null
if (cell) mountFigure(el, cell, { width: 96 });
// 或者自己拿样式：Object.assign(el.style, cssFor(cell, 96))
```

`figureFor` 三级匹配：**精确名 → 别名表 → 去括号变体（且候选唯一）**。

第三条有硬约束：只有图集里那个名字本身**不带括号修饰**时才参与回落。否则「坐姿绳索划船（宽握）」会被归一化成「坐姿绳索划船」，落进图里唯一的「（窄握）」那张——宽握窄握是两个动作，配错比没有更糟。这和 `clips.js` 里 `kindForName` 的「认不出的回 idle，宁可不动也不要演错」是同一条规矩。

**认不出就返回 `null`**，调用方回退到原来的文字徽章。别自己补一张像的图上去。要补映射就往 `ALIASES` 加一行明确的等价叫法，别写正则。

## 覆盖率

预览页会算 `workout-catalog.js` 里 104 个动作有多少能查到图。**这个数字不追求 100%**：图集只有 56 张，动作库名字更细（宽握/窄握、上斜/下斜、各种器械），没图是预期状态。

要补覆盖，三条路，按代价从小到大：

1. 加 `ALIASES`，把明确等价的叫法指过去（如「坡走」→「跑步机爬坡」）；
2. 补画缺的动作，扩图集，重跑 `motion-frames.py`；
3. 接受没图，UI 显示文字。

## 换素材 / 调框

换一套图：覆盖 `assets/motion-library.png`，改 `scripts/motion-frames.py` 顶部的 `GROUPS`（分组、网格、动作名顺序）和 `SEARCH_OVERRIDES`，然后：

```bash
python3 scripts/motion-frames.py --verify > src/lib/sprite/frames.js
npm test
```

脚本用纯标准库读 PNG，找每个网格里深棕线条的包围盒；靠「小人和名字之间那段连续空白行」自动把名字文字挡在框外。举过头、躺姿、名字写在右侧的动作，用 `SEARCH_OVERRIDES` 单独钉搜索窗口。

只想微调某一个框，直接改 `frames.js` 里那一行 `[x, y, w, h]`。改完打开 `src/preview/library.html` 核对，或看生成的 `docs/motion-library-frames.png`。

`IMAGE` 里的宽高（1536×1024）也要跟着改，否则 `cssFor` 的缩放会算错。

## 部署路径

`cssFor` / `mountFigure` 默认 `src` 是 `/assets/motion-library.png`，和 `App.vue` 的默认头像同一约定。GitHub Pages 子路径部署下绝对路径会指到域名根，预览页因此显式传纯相对字符串 `../assets/motion-library.png`（CSS 背景图的相对路径相对 HTML 文档解析，dev 与部署后都正确）。**应用里接入时也要传自己的 base**：

```js
mountFigure(el, name, { width: 96, src: `${import.meta.env.BASE_URL}assets/motion-library.png` });
```

别用 `new URL(..., import.meta.url)` 算这个路径：Vite 会把内联 module script 抽成独立 JS chunk，`import.meta.url` 的基址就从 HTML 变成了 JS 文件，两种环境下只是碰巧都对。

`vite.config.js` 的 `rollupOptions.input` 里已挂上 `library` / `sprite` / `body` 三张预览页（之前只挂了 `motion` / `skins`，部署后这三页会 404）。

## 后续扩展成逐帧

接口留好了，不用返工：

- `library.js` 只认「名字 → 一张框」，逐帧是「名字 → 一组框/一张 sheet」，可以在 `figureFor` 之上加 `clipFor(name)` 返回 `src + cols + rows + fps`，交给 `createSprite`；
- `CELLS` 的 `group` / `name` / `id` 可以直接复用做帧图的索引键；
- `docs/motion-keep.md` 第二节的 15 条轨迹表给帧数和时长，第三节作废的画法规范不要沿用；
- 静态图解保留作「认不出帧图时的兜底」，两者不互相覆盖。
