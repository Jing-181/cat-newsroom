# 手臂余项九个 · 2026-11-10

> 历史批次快照：本文的动作数量、测试数、来源缺口和待验状态仅代表该批次时点，不是当前总状态。当前为104项配图、整体未完成；以 [最终覆盖与验收清单](motion-final-coverage.md) 和 [机器进度表](motion-progress.json) 为准。

新增preacher_curl / cable_curl / incline_dumbbell_curl / reverse_curl / wrist_curl / bar_pushdown / overhead_extension / skull_crusher / cable_hammer_curl。65配图/39暂无，实际resolver/图鉴/预览自动接入。新增visual全pending。

## 几何与边界

固定上臂23、前臂22。牧师凳上臂支撑斜垫、肘不滑动；低位直把弯举固定低滑轮；上斜弯举靠背后倾，垂直上臂在躯干后；反握采用单杠，掌面不可见，元信息说明与普通弯举同族，不冒充独立视觉握姿。

腕弯举新增固定腕关节和6单位手段。肩/肘/腕及前臂凳面全固定，只手段绕腕转；skin识别可选wrist并画第四关节，不更改无wrist的旧动作。

直杆下压是一根杆双握点、高位拉索，区别双绳分叉。过顶/仰卧固定上臂朝上，前臂绕肘下放，头部世界间隙有检查；不通过裁线删关键前侧肢体。绳索锤式低滑轮＋双定长22分支，中立握掌面不可见但绳端可辨。

catalog冲突：overhead_extension的equipment写绳索，tips却说双手握哑铃。本图依器械字段及专门绳索参考，明确命名“过顶绳索臂屈伸”，低锚绳索版，未改catalog或假称两者同时表达。牧师凳catalog器械泛称，本图选凳+杠版本；腕弯举选哑铃，参考正文明确支持此替代。

## 实际正文来源

https://www.strengthlog.com/barbell-preacher-curl/
https://www.strengthlog.com/cable-curl-with-bar/
https://www.strengthlog.com/incline-dumbbell-curl/
https://www.strengthlog.com/reverse-barbell-curl/
https://www.strengthlog.com/barbell-wrist-curl/
https://www.strengthlog.com/tricep-pushdown-with-bar/
https://www.strengthlog.com/overhead-cable-triceps-extension/
https://www.strengthlog.com/barbell-lying-triceps-extension/
https://www.strengthlog.com/cable-curl-with-rope/

九篇均核对返回标题与操作正文。初始泛称URL的重定向/404不当作已验证，改用上面成功正文。未复制图片/医学效果；具体幅度是示意，不专业认证。

## 验证

新增3组测试，9映射全周期120Hz骨长/固定上臂/支撑/握点/拉索分叉/连续性；腕轴固定且手部真实旋转，过顶和下压方向，仰卧长杠世界头部距离，真实skin静帧/播放清理与腕四点输出。

全部65动作实际SVG输出进入120Hz完整周期bounds（含描边与1单位余量），通过；新画框0 -10 205 185覆盖过顶器械，不缩轨迹凑原框。check397/397、build、diff-check均通过。

本实例未看图；需主线程检查腕动作96px是否可辨、上臂垫/斜凳接触、过顶与仰卧的头圈投影、低位绳索与杆握点。不把世界不穿头等同投影无交叉，visual保持pending。

预览 `/preview/motion.html?exercise=wrist_curl&size=96&dark=1`，选择器可查其余。未改认可引体/指标/vite；无提交推送部署。
