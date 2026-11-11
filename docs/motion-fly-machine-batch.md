# 胸部机器/飞鸟九项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

准确ID：machine_chest_press / machine_chest_press_incline / machine_chest_press_decline / dumbbell_fly / incline_dumbbell_fly / pec_deck / cable_fly_high / cable_fly_mid / cable_fly_low。已接真实resolver、预览自动选择器和图鉴，48已配图、56暂无。所有新visual pending。

## 独立差别与共享

共享固定上臂23/前臂22、上肢强调比例、空心圆无脸、人物3.8单线/器械1.9。新fly-clips家族，不改已有几何；skin仅增双拉索分支。

三种推胸机：固定座/背/双脚；不同靠背倾向及手柄导向，分别水平、前上30°、前下20°。选择简化直线导向机构，不伪称所有机器都直线或对应特定厂商；下斜推向配前倾座背只是此绘图型号。

两种哑铃飞鸟：水平凳或真实30°上斜，凳面轴与躯干一致，脚仍位于世界地面。肘屈16°在全周期固定，上臂/前臂一起绕肩内收而非卧推伸肘。两件独立哑铃。

蝴蝶机：固定靠背、双侧枢轴、臂垫/手柄；按catalog选择微屈手柄式，不把参考的90°屈肘垫式直接复刻；机架连接为简化联动，不表示单根连杆长度约束。

高/中/低绳索：两侧锚点高度103/69/10固定，手从侧方向前下/水平/前上内收，肘角16°固定。双拉索世界端固定、手端随握点。相位终点留握距而非两手穿过彼此。

## 参考正文与限制

实际成功读取：
- https://www.strengthlog.com/machine-chest-press/ （前推/受控回放通用原则）
- https://www.strengthlog.com/dumbbell-chest-fly/ （近直臂绕肩展开合拢）
- https://www.strengthlog.com/pec-deck/ （固定靠背及臂垫前合，型号与catalog区别已说明）
- https://www.strengthlog.com/standing-cable-chest-fly/ （继续读取正文，明确高位向下、低位向上）

上斜哑铃飞鸟专页404，采用catalog30–45度中的30度加通用飞鸟原则；上/下斜机器也只有catalog变式描述+通用机器正文，不宣称9篇独立外部证明。中位夹胸水平路径来自catalog。未复制图片/医学效果，绘图角度不是个体训练处方。

## 测试/验收

新增motion-fly.test.js四组：9映射、401帧骨长/支撑/握点/固定肘角、连续画框、机器导向差异、30度斜凳、高中低固定拉索和运动方向、蝴蝶枢轴、实际skin静帧/播放清理。

check388/388通过；build、diff-check通过。未看实际画面，需主线程检查96/240闭合手位/器械重叠、下斜机器是否可辨、斜凳接触、拉索是否挡头及飞鸟是否读成内收。预览例 `/preview/motion.html?exercise=cable_fly_high&size=96&dark=1`。

没有提交、推送、部署；不碰指标/vite/已有动作。
