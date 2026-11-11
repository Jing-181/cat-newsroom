# 腿后链余项七个 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增hack_squat / hip_thrust / seated_hip_adduction / seated_hip_abduction / nordic_curl / back_extension / single_leg_calf_raise，共72配图/32暂无。全部接真实resolver/预览/图鉴，visual pending。

## 接触/运动

腿30+30、臂16+16，空心圆加粗单线、器械轻。哈克脚固定，背/肩垫沿斜轨等向滑动；臀推上背凳沿和脚固定，髋绕固定上背升降，杠轴在髋上方3单位双手稳定，不穿过腹部。

内收/外展骨盆座背固定，髋带腿水平转动，膝屈坐姿；内收从宽到窄抵抗垫在腿内侧，外展从窄到宽垫在腿外侧。发现catalog的两条tips垫侧别写反，本轮授权只许改overhead条，故其余catalog不碰，在示范说明和progress明确冲突，不静默声称一致。

北欧固定膝与踝，膝到肩近直线整体绕膝前倾；采用有限幅度缓慢往返，不演示参考的触地/撑手恢复，不误画普通腿弯举。山羊固定髋垫/脚踝，以髋转动躯干至近腿身直线不过伸。单腿提踵右前掌固定、左腿悬空、左手固定扶柱，足段绕前掌抬跟。

## 实际参考正文

https://www.strengthlog.com/hack-squat-machine/
https://www.strengthlog.com/hip-thrust/
https://www.strengthlog.com/hip-adduction-machine/
https://www.strengthlog.com/hip-abduction-machine/
https://www.strengthlog.com/nordic-hamstring-eccentric/
https://www.strengthlog.com/back-extension/
https://www.strengthlog.com/standing-calf-raise/

均核对标题及操作正文。单腿提踵单侧/扶机来自catalog，外部是双侧器械提踵的足踝原则；北欧有限幅往返与参考离心触地恢复不同，已注明。无复制图片或医学主张，数值非个体处方。

## 过顶图文收口

按用户明确允许，仅修改workout-catalog.js的overhead_extension tips：低滑轮绳索，背对滑轮、上臂靠耳、肘屈伸。同步示范movement删除旧“仍有冲突”措辞。依据本任务前批已抓取的 https://www.strengthlog.com/overhead-cable-triceps-extension/。ID、equipment、字段结构与历史数据不改；新增测试断言该条tips含低位绳索且无哑铃。

## 验证

新增3组120Hz全周期真实映射、骨长/支撑/固定机架、哈克斜轨方向、髋承杠、内外垫方向、北欧膝轴直链、髋铰链、单前掌/悬空腿、真实skin清理与catalog一致性。全部72实际SVG完整周期bounds含描边/1单位余量通过。

check400/400通过；build、diff-check通过。未实际看图，需主线程检查凳沿/臀杠/机器垫/北欧头部及腿重叠。预览 `/preview/motion.html?exercise=nordic_curl&size=96&dark=1`。

未改引体/其他既有几何/指标/vite，无提交推送部署。
