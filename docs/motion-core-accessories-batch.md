# 核心余项六个 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增sit_up / crunch / russian_twist / hanging_leg_raise / cable_crunch / ab_wheel，86配图/18暂无，真实resolver/预览/图鉴自动接入，新visual均pending。

## 体位/接触

臂20+20、腿25+25；可选torsoChain字段让皮肤绘制分段单线躯干，无此字段时旧动作仍原二点线，不动引体和已认可几何。

起坐骨盆/双脚固定，三个9单位躯干段随卷起较大幅折叠；卷腹固定骨盆与前两段低背，仅上胸小幅卷曲。catalog起坐tips描述接近卷腹，本图按名称与独立参考明确较大幅起坐版，元信息提示差异，未擅自改catalog。

俄罗斯转体选脚落地后倾版，骨盆/中心躯干固定，胸肩横轴与双臂绕轴左右转动。悬垂举腿固定握杠/肩/髋高度，近直腿绕髋抬起，不身体上拉。

绳索卷腹固定髋/膝/踝、高滑轮，三个固定长度脊柱段逐级卷曲，双手保持头侧相对位置；不是手臂单独下压。健腹轮固定膝和小腿，髋肩协调前移、躯干单直段不腰折，手附轮轴、轮心高度=半径6，辐条角随位移/半径变化（真正滚动示意）。

## 逐项成功正文

https://www.strengthlog.com/sit-up/
https://www.strengthlog.com/crunch/
https://www.strengthlog.com/core-twist/
https://www.strengthlog.com/hanging-leg-raise/
https://www.strengthlog.com/cable-crunch/
https://www.strengthlog.com/kneeling-ab-wheel-roll-out/

均核对返回标题/正文。转体不加重、脚落地；举腿近直腿；卷腹有限幅；健腹轮跪姿有限滚出。未复制图片/医学断言或将示意比例当训练处方。

## 验证

新增3组：真实6映射，完整120Hz骨长/分段脊柱长度/支撑/连续/回环；起坐与卷腹幅度和低背差异；转体固定骨盆与胸肩变化；悬垂固定上身；手头关系固定；轮地面接触、位移与轮角、手轴附着；实际skin可选躯干链与清理。

全部86实际SVG完整120Hz周期bounds含描边及1单位余量通过。check406/406、build、diff-check通过。首次回环测试捕获sin(2π)浮点尾差，时间在采样入口规范到周期范围后全绿，未改变轨迹。

本实例未看图，需主线程查分段躯干可读性、坐起/卷腹差异、转体不漂、头/拉索投影、轮子与膝支撑。预览 `/preview/motion.html?exercise=ab_wheel&size=96&dark=1`。

未改指标/vite/原引体，无提交推送部署。
