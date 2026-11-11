# 背部六动作 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增准确ID：lat_pulldown_wide / lat_pulldown_close / lat_pulldown_reverse / single_arm_cable_pulldown / seated_cable_row / seated_cable_row_wide。真实resolver接入21项，83暂无；预览自动收集新增项，图鉴动态统计。

## 共享与独立边界

同族共享骨架、两骨求解和时间轴，不声称六套完全独立几何。上臂23/前臂22，下肢22+22，固定骨长。下拉与水平划船有不同路径：下拉手下降37/39单位；划船手向腹部收回29单位，高度固定。骨盆/座位、双脚、膝垫或脚踏板、滑轮固定。肩胛以小幅肩根前后/上下位移示意，躯干受控变化不超过7度，不机械锁死全身，也不大幅借力。

- 宽下拉：56单位握距、长直把、外展肘。
- 窄下拉：14单位握距、V把、收拢肘。
- 反手下拉：26单位肩宽握距、直把、较贴身肘。掌面在圆头单线图中不可见，反手仅由元信息说明，不能宣称从画面可识别旋后。
- 单臂下拉：仅一手连高位拉索；另一手固定扶立柱，单把独立连接。采用坐姿，不侧倾借力。
- 窄划船：14单位V把、向腹部收回、肘靠近体侧。
- 宽划船：52单位直把、较高的下胸路径、肘外展。掌向亦有投影限制。

器械完整链路是固定滑轮→可变长度可见拉索→器械连接点→握把→手；不是固定滑轮跟着手跑。拉索长度变化表示收放缆，不是绳体弹性。机器配重/卷绕过程未画。

## 已实际读取参考正文

全部StrengthLog，均确认返回标题与正文而非只凭URL：
- https://www.strengthlog.com/lat-pulldown-with-pronated-grip/
- https://www.strengthlog.com/neutral-close-grip-lat-pulldown/
- https://www.strengthlog.com/lat-pulldown-with-supinated-grip/
- https://www.strengthlog.com/one-handed-lat-pulldown/
- https://www.strengthlog.com/cable-close-grip-seated-row/
- https://www.strengthlog.com/cable-wide-grip-seated-row/

下拉资料支持大腿垫固定、拉至上胸/体侧；划船资料允许小幅前后倾与肩胛运动，结合catalog“不借力/稳定躯干”选择克制幅度。单臂扶机手来自catalog。宽划船资料写腹部，catalog写下胸，本图沿catalog选择较高的拉点。未复制图片，未沿用训练效果/医学断言；绘图角度不代表个体处方。

## 验证

tests/motion-back.test.js三组：六真实映射、501帧固定骨长/支撑/滑轮、连接点/单双手/真实握距、垂直与水平路径方向、有限画框与连续性、实际皮肤和播放/静帧清理。局部3/3通过。

全量check本次363/365，2个并行指标测试因跑步机新增速度/坡度字段失败（workout-metrics-batch2.test.js、workout.test.js），未越界修改。build与diff-check通过。后续指标代理需收口；不把共享失败算本批已全绿。

未看六项实际渲染，visual全部pending。主线程用原motion tab检查拉索是否穿头、肘方向、V把/宽把、坐姿支撑和96px重叠。

## 实力推已有视觉缺陷

主线程真实96px深色截图：中段近侧手臂穿过空心圆头中心，起始/顶部可辨。progress已改needs-fix，resolver标签改“示范待修 · 中段头臂投影重叠”。未编造截图文件路径。

本轮做了投影段到头心距离诊断：对多个固定相机方位/仰角、完整周期采样，单改相机不能可靠消除全部头/手臂/杠轴投影交叉。保留实际手杠约束与现有几何，未硬挪手。后续应做不增加体块的线段分层/头圈范围裁线，补投影交叉约束并由主线程看图；本批明确未修复此项，不再用世界空间不穿头宣称视觉校准。

未改workout指标/vite、未改认可引体；无提交推送部署。本批完成交接。
