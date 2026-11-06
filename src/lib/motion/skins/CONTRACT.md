# 皮肤契约

> 三种画法共用同一份关节数据。皮肤只负责「怎么画」，不负责「怎么动」。

## 为什么要有这一层

动作数据（`core.js` + `clips.js`）解出来的是一组关节点：

```js
{
  hip, knee, ankle,            // 近侧腿
  kneeFar, ankleFar,           // 远侧腿
  shoulder, elbow, hand,       // 手臂
  head,                        // 头心
  footHeel, footToe,           // 近侧脚掌
  footHeelFar, footToeFar,     // 远侧脚掌
  lean,                        // 躯干倾角（弧度）
}
```

坐标原点在脚踝，y 轴向上为负，单位是「身体单位」（不是 px）。皮肤拿到这份数据，爱怎么画怎么画。

**加一种画法 = 写一个新的皮肤目录，不改 core、不改 clips。**

## 必须实现的接口

```js
export function createSkin(target, { proportions } = {}) {
  return {
    resize(viewBox),        // viewBox 字符串，如 "-50 -116 106 122"
    paint(pose),            // 画人
    paintProp(prop, pose),  // 画器械，prop 可能是 undefined
    destroy?.(),            // 可选：清 canvas / 释放 GPU 资源
  };
}
```

- `target` 是宿主元素。SVG 皮肤拿到的是 `<svg>`；canvas / WebGL 皮肤拿到的也是同一个 `<svg>`，自己往里插 `<canvas>` 或 `<foreignObject>` 都行，但**不要替换掉 svg 本身**。
- `paint` 每帧调用一次，一秒最多 60 次。不要在里面读布局、不要创建 DOM。
- `paintProp` 和 `paint` 分开：器械不属于人体，但它跟着人体动。

## 器械（prop）

```js
{ kind: "barbell" | "bar" | "dumbbell", at: "back" | "hands" }
```

- `at: "back"`：杠压在上背（背蹲）。中心点在上背，**杆与躯干垂直**。
  注意角度怎么算：躯干方向是 `(sin lean, -cos lean)`，跟它垂直的方向是 `(cos lean, sin lean)`，
  也就是在 `(cos, sin)` 参数化下直接取 `lean`。
  写成 `lean + π/2` 会得到一根**豎着的杆**（这个坑踩过，线条稿和体积线分别发现了）。
- `at: "hands"`：杆在手里（卧推、引体、硬拉）。中心点在 `pose.hand`，杆保持世界水平。
  这里不跟躯干走：杠铃受重力，挂在手里时它是水平的。

## 三条硬规矩

1. **不碰 `src/lib/motion/` 下除自己目录以外的任何文件。** 要改 core 或 clips，先在会话里说明理由，不要直接动。
2. **不新增依赖。** 现在项目只有 vue + vite。要用 Three.js 之类，先在会话里提出来等确认。
3. **减少动态效果时必须有一帧可看的静帧。** 播放层已经处理了，皮肤只要保证 `paint(pose)` 是幂等的。

## 尺寸档（重要）

同一副骨架，在不同出场尺寸下要用不同的画法。**不要把大图按比例缩成小图。**

工具在 `skins/optical.js`：

```js
import { sizeTier, strokeUnits, measureHeight, viewBoxHeight } from "../optical.js";

const tier = sizeTier(measureHeight(svg));   // "compact" | "regular" | "full"
const w = strokeUnits(px, 3.3);               // 参考尺寸下的 3.3 → 当前尺寸该用的值
```

三档的分工：

| 档 | 尺寸 | 怎么画 |
| --- | --- | --- |
| `compact` | ≤ 128px | **真实出场尺寸。**只留剪影 + 2–3 处结构线。去掉关节圆点、去掉远侧肢体细节、肌肉线减到最多三笔但不减粗细 |
| `regular` | ≤ 220px | 层次齐全，审阅页就是这个尺寸 |
| `full` | > 220px | 细节全部铺满，大图与海报用 |

**小图不是缩小版。** 96px 下一条 0.8px 的肌肉线读不出肌肉，只会变成一层灰雾。
宁可少画三笔、把剩下的画粗，也不要均匀地铺满细节。

线宽以 px 为准而不是以身体单位为准：`strokeUnits` 会按 `1/size^0.65` 缩，
两端都立得住。直接用身体单位会导致小图线太粗、大图线太细。

`resize(viewBox)` 里量一次尺寸就够，不要每帧量——`getBoundingClientRect` 会强制重排。

## 目录

```
src/lib/motion/skins/
  CONTRACT.md         ← 本文件
  line/               ← 线条稿（当前默认）
  volume/             ← 体积线
  three/              ← 3D
```

每个目录导出 `createSkin`。聚合页 `src/preview/skins.html` 会把三个目录都接上，
已经做好的显示真画法，还没做的会回退到线条稿。

**为什么每个目录都得有一个能 import 的文件：** Vite 在编译期就解析 `import()` 的字面量路径，
文件不存在会让整个页面模块解析失败，而且 **try/catch 拦不住**。所以路径必须始终存在。
子会话交付时直接覆盖同名文件即可，不要只留空目录。

## 两个共用视图

- `src/preview/motion.html` — 动作审查页：每个动作一张卡，看姿势对不对、节奏对不对。
- `src/preview/skins.html` — 画法对照页：同一动作横向比三种画法，同一行严格同帧。

两个都进了 `vite.config.js` 的 build input，部署后也在。

### 三种画法的现状

| 画法 | 目录 | 状态 |
| --- | --- | --- |
| 线条稿 | `skins/line/` | 可用。三级线宽、关节圆点、远侧腿用 mask 真切除 |
| 体积线 | `skins/volume/` | 可用。实心身体 + 概括肌肉线，需要在大尺寸上才读得清肌肉 |
| 3D | `skins/three/` | 可用，但需要 WebGL。不可用时自动退回线条稿，**对照页会标「已降级」** |

3D 没用 Three.js，而是自己写了个 6KB 的解析渲染器：形状只有胶囊和球，
且对照页一屏就有九个实例，Three 是每实例一个 WebGL 上下文，挂到四五个就会撞上限。
代价是拿不到材质和后期；将来真需要骨骼网格或贴图，换回 Three 才是对的。

## 器械朝向（踩过的坑）

背蹲的杆是**与躯干垂直**。躯干方向是 `(sin lean, -cos lean)`，垂直于它是 `(cos lean, sin lean)`，
在 `(cos, sin)` 参数化下就是 `lean`。写成 `lean + π/2` 会得到一根**豎着的杆**，
这个错在三种画法下分别被发现过一次，现在统一成 `lean`。

手里的杆（卧推、引体）保持世界水平，不跟躯干走——杠铃受重力。
