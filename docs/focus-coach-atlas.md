# Focus coach 与运动总览 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

最新接入更新：经用户明确授权，深蹲与卧推已换为 `candidate-clips.js` 的固定比例 3D→SVG 新版，`demos.js` 同时登记配套皮肤，训练与图鉴共用。引体未改。旧二维深蹲/卧推仍保留在预览用于前后对照。视觉 pending 不阻挡本地接入；全量测试 335/335、构建通过。主线程已能打开浏览器并观察截图，发现脚形与小尺寸遮挡待优化，详情见 `focus-coach-candidates.md` 和 `motion-progress.json`。下文为首批实现记录。

## 本轮范围

独立分支 `feat/focus-coach-atlas`，不提交、不推送、不部署。未改 localStorage 数据键、workout_session 或同步协议。未读取/修改/纳入用户的 `.artifacts/` 与 `assets/workout/squat-optimized.svg`。

训练逐组屏、运动总览、样片预览共用 `motion/demos.js` 的解析。以 exercise_id 为主，已有 ID 即使未知也不按名称猜测；仅完全缺少 ID 时允许 catalog 精确名称匹配。104 个 ID 显式登记，新增动作需在映射和测试中作出支持决策。

状态分为校准样片、同类示意、暂无示范。目前 **3 校准样片、0 同类示意、101 暂无示范**。校准指绘图接触约束，不代表专业认证；界面明确标注待视觉验收。未知及自定义动作静态占位，取消跨动作错误代演。旧 CLIPS 留作内部兼容，没有通过修键批量启用；旧正则归类已移除。

## 三个样片

`demo-clips.js` 输出世界支撑、身体关节、器械变换和视图 framing；`demo-skin.js` 只消费几何数据，可替换画法。未使用 3D 依赖、未恢复旧头身比/线宽硬规范。

| 动作 | 视图 | 固定支撑 | 运动 |
| --- | --- | --- | --- |
| 杠铃深蹲 | 侧面 | 双脚地面接触 | 髋膝屈伸，杠铃与握点沿足中上方升降 |
| 引体向上 | 正面 | 横杠、双手握点 | 双臂屈伸，身体升降，双脚悬空 |
| 杠铃卧推 | 侧面 | 头/肩背/髋与凳面、双脚地面 | 真正仰卧，手与杠铃同步升降，非旋转站姿 |

侧视双手/杠杆为投影简化，器械角度为水平，不展示三维握距或个体动作差异。具体坐标为示意单位，未经过生物力学验证，不作为深度、负荷或医学处方。

动作接触与相位参考（未复制图片）：
- https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/
- https://www.acefitness.org/resources/everyone/exercise-library/191/pull-ups/
- https://www.acefitness.org/resources/everyone/exercise-library/5/chest-press/

## 图鉴与入口

桌面侧栏「运动总览」；移动底栏「更多」打开抽屉，再选「运动总览」。仅本地 UI 状态，104 动作支持名称/肌群搜索、器械和示范状态筛选，展示 catalog 既有知识，不添加处方。

列表默认静帧，详情选择后仍静帧，用户点击播放才启动一个播放器。筛掉选中动作、换动作、关闭详情、离开视图均清理。系统减少动态效果时保持静帧。

预览：`http://localhost:5176/preview/motion.html`，`?dark=1` 检查深色；默认静帧，提供播放与 0.35× 慢放。预览也走真实 catalog → resolver → clip，不再绕过映射；无个人存储/同步操作。

## 播放与验证

速度在播放器累计时间阶段应用，之后才取模；暂停与后台恢复维持同一时间语义。createFigure 的动态/静帧均返回幂等清理，销毁 player 与 skin；旧 skin 的 ResizeObserver 因而得到 disconnect。新增皮肤无 ResizeObserver，绘制期不创建 DOM。

测试覆盖 104 映射、未知 ID、实际剪辑采样、固定点、手/器械关系、引体骨长、卧推接触、有限坐标与画框、慢放接缝、暂停/恢复、visibility 监听、动态及静态清理、训练共享解析和图鉴只读边界。

验证：`npm run check` 327/327，通过；`npm run build` 通过。Vite 保留既有 CJS Node API 弃用提示。

## 待验收

浏览器工具启动状态为运行中，但两次本地导航报 `Browser view layout did not become ready`，未能完成页面实测或截图。还需主线程/用户确认：三个样片的实际观感、focus-coach 小尺寸可读性、移动 375/390/430px 无横向溢出、键盘筛选与选中详情、反复进出页面的实际监听/rAF、减少动态效果设置。自动测试不代表这些视觉项已验收。
