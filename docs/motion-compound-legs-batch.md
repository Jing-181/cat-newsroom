# 腿部复合六项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增bulgarian_split_squat / walking_lunge / lateral_lunge / smith_machine_squat / leg_press / single_leg_press。39项已接共享resolver，65暂无；图鉴/预览动态收集，未改指标/vite或原引体。

## 实现与简化

腿30+30，臂16+16，空心圆无脸、加粗单线、器械轻。

- 保加利亚：自重示范，前脚地面、后脚凳面21高度固定，垂直下沉，独立双腿IK。
- 行走弓步：8秒两步，迈步抬脚→落地→下降→起身换腿，支撑脚在世界坐标固定，活动脚抬起前移。两步后整个世界平移40单位，用跟随相机抵消平移以连续回环；不是把植地脚反向滑回。初始为行走中的分腿过渡而非首次起步并脚，循环中的相位接触可测试。自重版，无外加负重。
- 侧弓步：依catalog固定宽站距，髋在额状面左右移重心；相机较正面。参考的侧迈步被简化为宽站换边，元信息明确。
- 史密斯：竖直导轨型号，杠端x/y固定，脚略前于杠垂线，手附着长杠。
- 腿举：固定座靠/骨盆，双踝接触移动踏板，板沿倾斜导轨收放，小腿与膝由IK求解，不用站姿蹲代替。
- 单腿举：右脚贴踏板，左腿全链静置、脚在底部休息位，不随板漂动。

共享project增加默认值不变的offsetX，仅行走使用camera tracking。现有场景数值不改。脚线是接触示意，不模拟完整鞋底压力或器械厚度。

## 实际参考

成功读取对应正文：
https://www.strengthlog.com/bulgarian-split-squat/
https://www.strengthlog.com/dumbbell-walking-lunge/
https://www.strengthlog.com/side-lunges-bodyweight/
https://www.strengthlog.com/smith-machine-squat/
https://www.strengthlog.com/leg-press/

单腿专页404，单腿细节依据catalog、外部仅通用腿举原则，不伪称独立外部证据。史密斯参考脚在杠下，catalog要求略前，本图遵循catalog并声明型号；行走参考哑铃版可支持交替步骤，本图自重。未复制图片/医学断言，绘图坐标非个体处方。

## 验证

tests/motion-compound-legs.test.js四组：真实六映射，801帧固定骨长/膝朝向/画框/连续性，步态摆动脚离地与支撑脚固定，双侧交替、投影首尾接续；凳面/Smith杠端/踏板与非活动侧关系；实际skin创建清理。

check384/384通过，build与diff-check通过。新增visual均pending，本实例未看图。预览例 `/preview/motion.html?exercise=walking_lunge&size=96&dark=1`。需主线程检查步态相位、回环是否自然、腿举踏板和脚线、侧弓步膝方向与重叠。

主线程已报告实力推96px深色三静帧具体缺陷修复：中段斜臂不再穿头中心，圆头与长杠清晰；已记static-fix-verified，不代表全周期/240px或用户批准，无持久化截图ID不编路径。

未提交、推送、部署，完成本批交回。
