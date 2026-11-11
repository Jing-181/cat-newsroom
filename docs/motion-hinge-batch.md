# 后链与自由划船六项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增romanian_deadlift / conventional_deadlift / single_leg_rdl / barbell_row / one_arm_dumbbell_row / t_bar_row，真实resolver与预览自动收集33项，71暂无。所有新视觉pending，未改已有动作/原引体/指标/vite。

## 几何

后链：腿30+30、臂21+21、躯干30；划船：腿25+25、臂23+22。保持空心圆无脸、现有加粗单线与轻器械。

- RDL站姿开始，固定脚踝，髋到踝距离恒定使膝屈程度保持，髋后移并折身，杠降到小腿区，不落地冒充传统硬拉。
- 传统硬拉从髋低、屈膝更多的近地面杠位起始，膝髋同步展开；单长杠与双握点。采样曾发现杠轴穿腿，已向前调整整根杠的固定路径并重新求手臂，完整周期杠轴与腿线间距>2.5绘图单位，不通过画法掩盖。
- 单腿RDL仅右脚是支撑，左腿整条链后伸、保持离地，骨盆水平；两件独立哑铃。另一只脚不是假固定支点。
- 杠铃划船保持俯身躯干，肘向后，单杠由伸臂位置拉近下腹。
- 单臂划船左手/左膝在z=18凳面固定，右脚地面固定，右手一件哑铃；左腿跪姿与右腿支撑分别建模。
- T杠地面枢轴(-45,0,0)固定、60单位杠长，端点沿18–33°圆弧转动；横向握把双手附着杠端，不是普通杠平移。

## 成功读取参考

均核对实际标题与正文：
https://www.strengthlog.com/romanian-deadlift/
https://www.strengthlog.com/deadlift/
https://www.strengthlog.com/single-leg-romanian-deadlift/
https://www.strengthlog.com/barbell-row/
https://www.strengthlog.com/dumbbell-row/
https://www.strengthlog.com/t-bar-row/

单腿参考以杠铃演示，采用catalog的哑铃器械；T杠参考为固定路径器械型，本图按用户指定地面枢轴型实现，不声称精确复制该器械。单臂参考明确同侧手膝支撑凳、躯干接近水平。只借用动作关系，不复制图片/健康效果或将绘图幅度当处方。

## 测试和待核

新增3组完整周期测试：真实6映射、骨长、躯干长度、固定支持、握点/器械、T杠固定枢轴与半径、传统/RDL起点差异、单腿离地、凳面接触、杠腿线间距、连续/画框、实际skin创建与幂等清理。check380/380通过，build及diff-check通过。

参考为动力关系，不代表工程数值经过生物力学认证；投影层面杠腿/膝肘遮挡、单腿足线、T端配重与凳面可读性尚未实际看图。预览 `/preview/motion.html?exercise=conventional_deadlift&size=96&dark=1`；选择器可查其余项。

未提交、推送、部署，完成本批交接。
