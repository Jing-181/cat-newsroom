# 实力推投影修复与胸部六项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

## 实力推

仅渲染观察方向换为另一侧三分之四（yaw=-0.6），世界关节、手杠关系与轨迹完全不变。新纯函数 projected-lines.js 将投影线段按圆盘交点及深度平面分段，只移除头圈范围内且位于头后方的部分；前方线段保留，外部/相切/混合深度均有测试。头本身保持fill=none，无背景色填脸、无体块。裁线范围含线宽余量。

诊断过程：原观察方向的交叉主要在头前方，直接按深度裁线不能删除；所以先换另一侧观察方向，使可裁交叉真正处在头后。没有为了通过测试把前侧手臂全部删掉。完整周期测试确认存在实际裁线，并确认保留下来的线段不进入头后圆盘；独立合成前侧与混合深度测试验证关键前侧线段保留。DOM测试确认不修改采样场景，圆头无填充。

状态 fix-implemented-pending-review。未看实际画面，仍需主线程查中段、长杠连续性、裁线端点和前侧可读性，不标visual pass。

## 胸部新增

六个准确ID已接共享resolver：dumbbell_bench_press / dumbbell_bench_press_incline / barbell_bench_press_incline / close_grip_bench_press / smith_machine_bench_press / one_arm_dumbbell_bench_press。总27已配图/77暂无。预览与图鉴自动更新。

新增chest-clips.js沿卧推空间求解方法建独立家族，不修改已认可candidate-clips.js的barbellBench几何。固定上臂25/前臂23、腿23+23，空心圆火柴人，单描边人物与器械沿现有层级。

- 哑铃平卧：两件独立器械，上推时略收握距，底部胸侧展开。
- 哑铃上斜：30°靠背/身体接触平面，两件独立器械；腿/脚仍按世界地面构建，非整幅旋转平卧人。
- 杠铃上斜：同30°支撑平面，固定双握距与单长杠。
- 窄距：26单位握距，肘hint较贴身并朝脚端，窄于常规48单位。
- 史密斯：选择竖直导轨型号，两导轨世界固定、杠两端x/y始终对齐轨道，只有z变化。
- 单臂：仅右手一件哑铃，左手固定腹侧，骨盆不旋转。

头背骨盆接触与凳面、脚支撑均固定。斜凳头中心保留1单位绘图颈头偏移；接触测试明确该偏移，不将头中心当物理接触点。底部活动手均高于肘，肘朝脚端/对应身体侧，骨长固定。掌面无绘制，不能宣称线稿表达全部握姿细节。

## 正文参考

实际抓取并核对标题/正文：
- https://www.strengthlog.com/dumbbell-chest-press/
- https://www.strengthlog.com/dumbbell-incline-press/ （30–45度，本图取30度）
- https://www.strengthlog.com/incline-bench-press/
- https://www.strengthlog.com/close-grip-bench-press/
- https://www.strengthlog.com/smith-machine-bench-press/ （固定直线轨迹）

单臂专页404；单臂活动/扶腹侧依据已有catalog，外部来源只支持通用哑铃卧推，不伪称六项各有完整独立外部验证。未复制图片/效果断言；具体数值和比例未专业认证。

## 验证/交接

新增胸部3组、投影3组测试全通过：全周期骨长/支撑/斜面、器械接触、轨道、肘朝向/底部关系、真实映射及创建清理、裁线纯函数/真实周期/DOM。全量check377/377通过，build与diff-check通过。并行指标中间态失败已收敛。

预览：`/preview/motion.html?exercise=strict_press&size=96&dark=1`，选择器可查六新项并播放/逐相位拖动。新增六项visual pending，实力推fix-implemented-pending-review。

未改workout指标/vite、原引体或原杠铃卧推轨迹；无提交、推送、部署。
