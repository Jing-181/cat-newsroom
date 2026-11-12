# 助手表情素材

来源：`workspace/design/image-gen/characters/hanako/runs/2026-11-12-ensemble-expressions-v1/candidate.webp`。
这是已有 Q 版候选的应用预览，不代表 workspace 里的正式定稿；原资产与审核状态未改动。

三行分别是 Hanako、源、悠；每行三列按原顺序组成 768×256 WebP 精灵图。原图 1254×1254，每格 418×418，四边内裁 12px 后缩至 256×256，质量 83。去掉格线，保留原画颜色、头发、配饰与动作；没有重绘角色。

角色文字来自各自的 `characters/<id>/setting.md`。身份对照 2026-11-12 的 sheet-repair：Hanako v1、源 v2、悠 v1。Hanako 猫耳耳机在颈部，源是普通耳机在颈部，悠猫耳耳机在头上。

资源经 Vite import 打包带哈希文件，不经过 `src/public/`。动画是三帧表情切换，不是插帧视频。每次可见后播放 2.4 秒即停；离屏/后台暂停，减少动态时只显示末帧。组件卸载释放监听与播放器。
