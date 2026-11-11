# 核心/自重八项 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增push_up / plank / side_plank / copenhagen_plank / dips / inverted_row / dead_bug / bird_dog，80配图/24暂无。真实resolver与自动预览/图鉴接入；新visual全部pending。

## 独立体位

臂20+20、腿25+25，空心圆无脸/既有单线画法。俯卧撑/反向划船以固定足端为轴构造刚性肩髋腿链，手分别固定地面/低杠；肘屈伸。双杠固定双握点、身体垂直移动、双腿屈曲悬空。

平板、侧平板、哥本哈根明确staticHold，采样不变化，即使用户播放也不创建player/rAF；不假做重复。前臂接地点z=0，侧支撑以一侧前臂/脚外侧；哥本哈根选择上脚踝凳面23高度的长杠杆静态版，下腿屈曲悬空，未采用初学者屈膝上凳版本。

死虫仰卧固定背/骨盆，8秒对侧手腿交替伸展收回；鸟狗独立四点跪姿，活动臂与对侧腿伸展，非活动手/膝保持地面支撑，回到四点再换侧。躯干不随肢体扭转。鸟狗采用近伸直保留小余量的手臂求解，不追求锁死；死虫不做过度低放。

## 成功读取参考

https://www.strengthlog.com/push-up/
https://www.strengthlog.com/plank/
https://www.strengthlog.com/side-plank/
https://www.strengthlog.com/copenhagen-plank/
https://www.strengthlog.com/bar-dip/
https://www.strengthlog.com/inverted-row/
https://www.strengthlog.com/dead-bugs/
https://www.acefitness.org/resources/everyone/exercise-library/14/bird-dog/

逐项核对正文；404路径未当证据，改为实际成功URL。选择静态哥本哈根、双侧轮换死虫/鸟狗，未复制图片/健康效果。绘图比例和幅度非专业认证或个体处方。

## 两条catalog定向纠正

用户本轮授权，seated_hip_adduction改为双腿位于垫外、大腿内侧贴垫；seated_hip_abduction改为大腿外侧贴垫。依据前批已读取StrengthLog hip-adduction-machine/hip-abduction-machine正文与抵抗方向。同步示范movement删除“仍有冲突”描述；ID/字段结构/历史数据不改，其余catalog不动。测试验证两条新措辞。

## 验证与待验

新增3组：真实8映射，全周期120Hz骨长/刚性躯干/支撑/连续/回环；静态语义与不分配player、前臂地面、哥本哈根凳面、死虫鸟狗对侧与换侧接触；实际skin清理和catalog修正。全部80实际SVG120Hz完整周期bounds含描边/1单位余量通过。

check403/403通过，build和diff-check通过。未实际看图；主线程需验俯卧/仰卧朝向、侧支撑与凳面、双杠腿脚、鸟狗换侧落地、静态按钮语义。预览 `/preview/motion.html?exercise=bird_dog&size=96&dark=1`。

未改冻结引体/其他认可几何/指标/vite；无提交推送部署。
