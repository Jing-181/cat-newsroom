# Wakeup8 越野跑辨识定向修复

主线程实际看page9 first上半、second上下96px深色截图；first下半未看，不能称8项8相位全审。无fileId不编路径。

静态证据：jump_rope75%绳过头清楚；badminton四相位头臂更分开；hanging_leg_raise后半头与双臂清楚且腿下降；russian_twist后半不再双头圈，四项static-fix-reviewed，非全周期。sit_up/crunch采样可辨仅partial。cable_crunch second50%头侧仍复杂，但未证实新几何错误，本批不改，需240px复查。

## 越野跑诊断/修复

世界已有真实交替支撑/腾空。原yaw+.5/elevation.18的八相位膝间距最小约3、足间距1.4 SVG单位，部分腿链重合显单腿屈伸。比较保持侧向的3/4而非端面相机后选yaw-.75/elevation.35；八相位膝最小12.6、足最小7.8、躯干投影26.6。只在skin对trail启用此camera，并以原world travel/slope重新计算跟随offset，避免回环跳变。世界模型、落脚、腿长、坡面、步态与户外跑均不改，无新增体块/粗线。

新增两项实际SVG测试：八个复查相位膝>12/足>7/躯干>26，平均膝分离至少原1.4倍；全周期足线接触原坡面、渲染相机连续首尾接续、skin不修改world对象。没有要求所有连续时刻双腿永不重叠，保留合理交叉相位。

check438/438、build退出0（695ms）、diff-check退出0；104真实SVG周期bounds回归通过。数值改善是工程证据，新视角仍fix-implemented-pending-review，待主线程查看96/240和完整周期。

其他动作轨迹/皮肤结果、引体、指标/vite/catalog不改，整体complete=false，无提交推送部署。
