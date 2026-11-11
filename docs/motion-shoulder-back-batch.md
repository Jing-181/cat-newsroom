# 肩背余项八个 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增machine_row / straight_arm_pulldown / shrug / machine_shoulder_press / cable_lateral_raise / reverse_pec_deck / face_pull / bent_over_reverse_fly，56配图/48暂无。仅新增shoulder-back-clips与resolver/测试/文档；沿用现有skin颈线与描边，未改已有动作轨迹/引体/指标。

## 区别与约束

统一上臂23/前臂22、下肢23+23；空心圆无脸、人物3.8、器械1.9单线。
- 器械划船：固定座靠与双脚，手柄沿水平导向向躯干收回，肘屈伸；简化直线导向型号。
- 直臂下压：16°肘角固定，以肩为轴由前上方向大腿压，固定高滑轮+长把；不是绳索下压的固定上臂伸肘。
- 耸肩：肩根、肘、手整体垂直上移5单位，头/躯干/双脚固定，手臂始终下垂不弯举；肩中心仍代表胸廓，肩带两端升降单独表达。
- 机器推肩：固定座背，双侧竖直导向手柄由肩侧上推，IK屈伸；不复刻特定品牌连杆。
- 绳索侧举：固定低滑轮，右侧固定微屈肘向侧方上举，左手固定扶机。catalog某句“手臂不低于肩”与自然下垂冲突，按动作上下文及参考采用侧下方起始至肩高。
- 反蝶：固定座位/胸垫，微屈肘从前方向两侧后展开；器械枢轴/连接示意，不声称单连杆等长机械仿真。
- 面拉：额头高滑轮固定，25单位分支绳长度固定，双手拉向面侧分开、肘外展且前臂向上；掌向线稿不可见，头部投影仍待审。
- 俯身飞鸟：静态髋铰链近水平躯干、固定微屈肘向左右外展，两件哑铃，避免用起身代替肩运动。

## 已实际读取正文

https://www.strengthlog.com/seated-machine-row/
https://www.strengthlog.com/straight-arm-lat-pulldown/
https://www.strengthlog.com/dumbbell-shrug/
https://www.strengthlog.com/machine-shoulder-press/
https://www.strengthlog.com/cable-lateral-raise/
https://www.strengthlog.com/reverse-machine-fly/
https://www.strengthlog.com/face-pull/
https://www.strengthlog.com/reverse-dumbbell-flyes/

八项均核对对应标题和操作正文；不复制图片/健康效果。型号用简化导向/连杆，绘图角度与数值不是个体训练处方。

## 验证

新增3组motion-shoulder-back测试：120Hz完整周期固定骨长/支撑/实际映射/握点/微屈角度/连续性、肩带升降区别于弯举、伸肘/拉向/展开方向、固定导向/滑轮/分叉绳长度、真实皮肤播放/静帧清理。

全56配图使用实际skin输出的全渲染bounds检查，完整duration120Hz+循环边界，头圈/描边/颈/脚/器械及支撑皆在viewBox内保留1单位余量。新增更高滑轮和侧向展开使用明确较宽画框0 -5 205 180，不缩运动幅度凑旧框。

check394/394通过；build与diff-check通过。新增visual全pending，未实际看图；预览例 `/preview/motion.html?exercise=face_pull&size=96&dark=1`。需检查面拉绳/脸圈投影、耸肩是否可辨、反蝶胸垫/导向和单臂扶机。

未提交、推送、部署，完成本批交接。
