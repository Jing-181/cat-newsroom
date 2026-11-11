# 余下力量/功能六项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增cable_reverse_fly / arnold_press / single_arm_pushdown / farmer_carry / pallof_press / battle_rope，共92配图/12暂无，真实resolver/自动预览/图鉴接入；新visual均pending。

## 动作与限制

固定臂23+22、腿25+25，圆头无脸加粗单线。龙门反飞鸟两侧肩高锚与对侧手相连，微屈肘固定向外展开。阿诺德坐姿胸前起始，手路径向外/上、哑铃轴逐渐旋转；掌面在线稿不可见，器械轴转向不能替代全部解剖旋前/旋后展示，元信息明确。

单臂下压仅右臂伸肘，高锚固定、左手稳定。农夫双独立负重随手，2步小步循环，支撑脚世界固定、摆动脚离地，世界平移后相机跟随以回环，未滑回植地脚。帕洛夫侧锚固定、骨盆/肩中心不旋转、双手由胸前推出，非俄罗斯转体。

战绳远端固定、双手反相升降。每条绳41点开放折线，传播相位随时间/沿线位置变化；每帧以有界求解调整波幅使离散总长105单位，端点/地面非负/邻帧连续有测试。它是程序化波形，不是完整弹性柔体仿真。没有修改battle_rope记录形态或指标。

## 参考实际正文

成功读取：
https://www.strengthlog.com/arnold-press/
https://www.strengthlog.com/farmers-walk/
https://www.strengthlog.com/pallof-press/
https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/ （Step4明确可单臂）
https://www.acefitness.org/resources/everyone/exercise-library/376/asynchronous-waves/

龙门反飞鸟专用URL未获正文（404）；本批读到cable rear delt row但它是屈肘划船，明确不拿它当固定肘飞鸟证据。采用catalog交叉握绳细节＋前批已读取reverse-machine-fly肩水平外展原则，来源不足边界写入progress。未复制图片或医学效果。

## sit_up文案收口

仅定向改sit_up tips为屈膝脚落地、胸前手、不牵拉颈、较大幅受控坐起，明确区别低背贴地的卷腹。依据前批实际读取StrengthLog sit-up正文。同步既有示范movement删除旧冲突描述；动作ID/模型/历史数据不变，其他catalog不动。

## 验证

新增3组完整120Hz6映射/骨长/固定支持及滑轮/器械握点、投影回环；交叉绳左右、Arnold轴变化、抗旋、农夫支撑、战绳105长度/锚端/反相/邻帧连续；真实skin清理与起坐文案。

全部92实际SVG完整120Hz bounds含描边与1单位安全余量通过。check409/409、build和diff-check通过。本实例未看图，visual pending；主线程需查绳波可辨性、Arnold头/手投影、交叉拉索与农夫小步。预览 `/preview/motion.html?exercise=battle_rope&size=96&dark=1`。

无提交推送部署；原引体、其他几何及指标/vite不动。
