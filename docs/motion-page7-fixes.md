# Wakeup12 page7前三项定向修复

主线程真实page7 first上下96px深色0/12.5/25/37.5截图；后半与全周期未知。cable_curl/reverse_curl/rope_pushdown/bar_pushdown仅方向可辨partial；wrist_curl变化小留240px/后半查看，不增假幅度。无截图文件ID，不编路径。

## Wakeup13证据追加（仅文档）

主线程实际page7 first下半、second上下96px截图成功：上斜哑铃弯举后半靠背/支腿可辨；窄距卧推头侧重叠改善、凳支撑清楚；过顶绳索伸展已查看前后半中头圈/上臂分离改善。三项对应问题记static-fix-reviewed，不升为全周期或用户最终通过。

新版first上半本次未看，不称八相位全覆盖。cable_curl/reverse_curl/rope_pushdown/bar_pushdown后半回程采样可辨，仍仅partial；wrist_curl继续待240px连续播放，绝不增假幅度。

随后page6-first导航和首article滚动成功，截图UnknownVizError；验收游标page6-first，暂无该页本轮视觉证据。来源为当前主会话真实截图，无fileId不编路径，不推测宿主原因。

本次无新增代码缺陷，仅更新本文/progress；未改代码或重跑测试。下方445/445属于上一代码批次。overall.complete=false，无提交推送部署。

## 诊断

上斜弯举确为后倾而非普通坐姿改名：髋(0,0,28)、肩(-13,0,51)，躯干后倾atan(13/23)≈29.5°；双肘x=-13/z28固定，位于躯干后侧，骨长23+22。原靠背只有中心线与躯干重合，默认.45透明度使凳难辨。补双侧背沿/座沿/落地腿与地面，局部fixtureStyle2.4/.85，世界人/器械轨迹不改。

窄距卧推原世界握距26、肘朝向无新错误，render-only沿已验证的侧向yaw-.35/elevation.4并加入后深度裁线，凳fixture局部加强；不改既有已认可杠铃卧推或其他变式。

过顶绳索固定上臂头侧/低锚原本正确，但原观察下臂线进入圆头。采样后用yaw1.2/elevation.3的3/4，躯干投影仍>25并可辨双臂，后深度裁线；上臂肘、低滑轮、分叉绳及世界运动不变，不靠挪肘避头。仍需截图验证前侧臂段保留和绳索可读。

## 验证

新增2组：上斜躯干角度/后侧肘/真实SVG所有fixture端点与落地结构；窄距/过顶全120Hz实际SVG裁线头净空、采样对象不改、固定支撑/肘/锚及非端面躯干长度。

check445/445、build退出0（698ms）、diff-check退出0，104实际SVG完整周期bounds通过。3项fix-implemented-pending-review，整体false。未改引体/指标/vite/catalog，无提交推送部署。
