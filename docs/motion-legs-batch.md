# 腿部四动作批次 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

准确catalog ID：calf_raise（站姿提踵）、seated_calf_raise（坐姿提踵）、leg_extension（腿屈伸）、leg_curl（腿弯举）。后者catalog允许俯卧/坐姿，本图明确选坐姿，未将俯卧内容伪装成坐姿。

四项已接共享resolver、训练/图鉴及自动收集已配图项的预览。现在11已配图、93暂无；计数动态，不改记录指标、历史数据或vite配置。原引体未动。

## 约束与差别

比例：大腿30/小腿30、上臂16/前臂16、躯干25，周期内固定。空心圆头、无脸、人物3.8单描边，器械1.9；新增器械画在既有开放path，不添加身体体块。

- 站姿提踵：双前掌固定在踏板高度8，脚跟围绕前掌转动而非整脚平移。固定足段长度，踝沿足段旋转，髋/肩随踝升降，膝微屈不反折。示意器械肩垫随肩升降，框架固定。
- 坐姿提踵：骨盆和凳面固定，双前掌固定；脚跟升降引起膝小幅移动，大腿下端护垫随膝。用双骨长约束保持屈膝坐姿，没有抬凳或伸腿冒充提踵。
- 坐姿腿屈伸：大腿/膝轴固定，小腿从下垂向前上抬，保持少量屈膝不超伸；滚垫在小腿前侧下端，绕膝随小腿走。
- 坐姿腿弯举：大腿/膝轴固定，小腿从接近伸直向下后方屈曲；滚垫在小腿后侧下端，另有固定大腿压垫。方向和接触法向均与屈伸不同。

## 实际读取的参考与边界

- ACE https://www.acefitness.org/resources/everyone/exercise-library/51/calf-raises/ ：膝微屈、压前掌抬脚跟、受控回落。该页是杠铃地面版本；本图依catalog选器械踏板版，只引用足踝原理，不能声称器械外观获ACE验证。
- StrengthLog https://www.strengthlog.com/seated-calf-raise/ ：坐凳、调整膝垫、前掌踩支撑，踝屈伸抬落重量。
- StrengthLog https://www.strengthlog.com/leg-extension/ ：膝与器械轴对齐、背靠垫、受控伸膝、不超伸；滚垫位置同时参考catalog要点。正文有一处误称seated leg curl的明显模板笔误，不采用该句。
- StrengthLog https://www.strengthlog.com/seated-leg-curl/ ：膝与器械轴对齐，屈膝向下推动负重、受控回放，背靠垫。

只读取文字，不复制图片，未引入参考页的增肌/医学效果主张。绘图角度幅度为示意，不是个体训练处方或专业认证。

## 验证

新增tests/motion-legs.test.js四组：501帧固定骨长/支持/膝方向与连续性、前掌固定/脚跟升高、坐姿骨盆固定/屈膝、膝轴与滚垫接触及前后法向、真实resolver与静帧/播放创建幂等清理。坐姿/站姿均没有膝镜像反折。

`npm run check` 355/355通过；build通过；diff --check通过。指标代理早先看到的motion统计中间态失败已收敛，无需修改指标文件。

未看本批实际渲染，visual全为pending。主线程请查96/240px四项的足底/凳面与垫位、加粗后重叠、提踵是否足够可辨。预览例：`/preview/motion.html?exercise=seated_calf_raise&size=96&dark=1`，其余替换exercise ID。

另记录主线程锤式96px深色三静帧反馈：空心圆/单线/双器械可辨，目标位近侧器械与躯干重叠；仅static-reviewed-partial，未标整批视觉通过。没有捏造截图路径。

无提交、推送、部署，完成本批交接后停止扩展。
