# 动作系统：只保留两样东西

2026-11-07。SVG 线条小人这条路暂停。原因不在数学，在造型：风格该由人定，我一直在替着做决定。

这份文档是交接物。**只保留人体结构和运动轨迹两块**，其余的画法规范全部作废。

---

## 一、人体结构

### 1. 单位与身高

踝关节固定在原点 `y = 0`，所有高度都是「踝以上」。

踝到头顶 = 97.5 单位，等于 0.961 倍身高。
所以 **1 单位 ≈ 0.99% 身高**，全身约 101 单位。

身高 175cm 时 1 单位 ≈ 1.73cm；165cm 时 ≈ 1.64cm。

### 2. 分段长度

以 Drillis & Contini 1966 的闭合链为准（单位 = 身高百分比 → 换回本节单位）。

| 分段 | 长度 | 身高占比 | 依据 |
|---|---|---|---|
| 髋高（髖到踝） | 50 | 0.491 | 大转子 0.530 − 外踝 0.039 |
| 大腿 | 25 | 0.245 | 0.530 − 0.285 |
| 小腿 | 25 | 0.246 | 0.285 − 0.039 |
| 躯干（髖到肩峰） | 29.5 | 0.288 | 0.818 − 0.530 |
| 上臂 | 19 | 0.188 | 0.818 − 0.630 |
| 前臂 | 15 | 0.145 | 0.630 − 0.485 |
| 颈（肩峰到心头） | 11 | 0.107 | — |
| 头半径 | 7 | — | 用于闭合总高 |

验算链：髖 50 → 肩 79.5 → 腕 45.5 → 头心 90.5 → 头顶 97.5。真实人体对应 0.530 / 0.818 / 0.485 / 0.925 / 0.961 倍身高，每一环误差在 0.5% 内。

**两个判据**：腕落在髖下方 4.5 单位；站立时膝屈约 2°（不是 30°）。

### 3. 关节角度定义

| 关节 | 0 的定义 | 正方向 | 生理范围 |
|---|---|---|---|
| 膝 | 完全伸直 | 屈 | 0–140° |
| 髖 | 直立 | 屈 | 屈 120° / 伸 20° |
| 躯干 | 竖直 | 前倾 | — |
| 肩 | 自然下垂 | 前摆 / 外展 | 屈 180° |
| 肘 | 直臂 | 屈 | 0–145° |

肩屈曲 180° 里盂肱关节只贡献约 120°，剩下 60° 来自肩胛。两段骨没有肩胛，**过头推举的末端会系统性低估 5–7%**，这是模型边界。

### 4. 各体位的支撑关系

不同体位的「地面」不是同一个东西，这是最容易画错的地方。

| 体位 | 支撑 | 约束 |
|---|---|---|
| 站立 / 下蹲 | 双足 | 踝钉在地面线，髖高决定膝屈 |
| 俯身 | 双足 | 髖后移、膝微屈、踝不动 |
| 悬挂 | 双手 | 握点钉死，身体动；腿浮空 |
| 仰卧 | 背 / 臀 / 足 | 躯干放平，腿仍从髖往地面踩 |
| 俯卧 | 胸 / 手 / 足 | 躯干放平，臂垂直撑地 |
| 坐姿 | 臀 / 足 | 髖高 = 凳高，大腿水平 |
| 腾空（跑、跳） | 无 | 双脚都不接地，由髖高和摆动角决定 |

### 5. 侧视与正视的区别

- 侧视：看得到屈伸和上下，看不到外展和左右差。
- 正视：看得到外展和对称，看不到前后位移。
- 肩宽 19.5、髖宽 18（按 ANSUR 肩峰间宽 0.234H、大转子间宽 0.191H 换算，属估算）。

---

## 二、运动轨迹

每条轨迹的格式是「时间 + 相位 + 变化的关节量」。数值是**关节参数**，不是像素坐标，换任何画法都能直接用。

约束优先于数值：能用几何推出来的量不要手调。

- 手被器械钉住时（引体、悬挂），给定握点，身体位置由屈肘角推出来。
- 杠走直线时（硬拉、卧推），给定杠的横坐标和高度，手臂角度反解。
- 膝被凳面钉住时（坐姿腿屈伸），髖高固定、大腿角固定，只有膝屈在变。

### 深蹲（squat）  时长 3.8s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 6、elbow 158 |
| 1.25 | linear | hipHeight 30.4、hipShift -12.1、lean 26 |
| 1.75 | linear | （同上） |
| 3 | inOut | hipHeight 51.9、hipShift -2.1、lean 3 |
| 3.8 | linear | （同上） |

### 髋铰链（hinge）  时长 3.6s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 4、elbow 0、barHeight 45.5、barX 0 |
| 1.3 | inOut | hipHeight 46.7、hipShift -18、lean 62、barHeight 28 |
| 1.55 | linear | （同上） |
| 3 | inOut | hipHeight 51.9、hipShift -2.1、lean 3、barHeight 45.5 |
| 3.6 | linear | （同上） |

### 待机（idle）  时长 4s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 4、elbow 10 |
| 2 | inOut | lean 5.5、armSwing 7、elbow 14 |
| 4 | linear | lean 3、armSwing 4、elbow 10 |

### 站姿推举（press）  时长 2.9s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 8、elbow 150 |
| 0.9 | inOut | lean 2、armSwing 178、elbow 3 |
| 1.2 | linear | （同上） |
| 2.2 | linear | lean 3、armSwing 8、elbow 150 |
| 2.9 | linear | （同上） |

### 卧推（bench）  时长 3s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 26、hipShift -20、lean 90、barHeight 30、barX 12 |
| 1 | inOut | barHeight 59.5 |
| 1.3 | linear | （同上） |
| 2.2 | inOut | barHeight 30 |
| 3 | linear | （同上） |

### 侧平举（lateral-raise）  时长 2.6s · 视角 front

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 50、elbow 12、armAbduct 8、stance 7 |
| 0.8 | inOut | elbow 16、armAbduct 88 |
| 1.1 | linear | （同上） |
| 2 | linear | elbow 12、armAbduct 8 |
| 2.6 | linear | （同上） |

### 绳索下压（pushdown）  时长 2.4s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 6、elbow 100 |
| 0.7 | inOut | elbow 4 |
| 0.95 | linear | （同上） |
| 1.8 | linear | elbow 100 |
| 2.4 | linear | （同上） |

### 俯身划船（row）  时长 2.7s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 46.7、hipShift -16.7、lean 45、armSwing 2、elbow 0 |
| 0.75 | inOut | armSwing -35、elbow 120 |
| 1.05 | linear | （同上） |
| 1.9 | inOut | armSwing 2、elbow 0 |
| 2.7 | linear | （同上） |

### 引体向上（pull-up）  时长 3.2s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | lean 2、armSwing 179、elbow 6、freeThigh 8、freeKnee 48、gripY 115 |
| 1.2 | inOut | lean 4、armSwing 158、elbow 106、freeThigh 16、freeKnee 62 |
| 1.5 | linear | （同上） |
| 2.5 | linear | lean 2、armSwing 179、elbow 6、freeThigh 8、freeKnee 48 |
| 3.2 | linear | （同上） |

### 弯举（curl）  时长 2.6s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 51.9、hipShift -2.1、lean 3、armSwing 2、elbow 10 |
| 0.75 | inOut | elbow 130 |
| 1 | linear | （同上） |
| 1.9 | linear | elbow 10 |
| 2.6 | linear | （同上） |

### 保加利亚分腿蹲（split-squat）  时长 3.4s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 50、hipShift -6、lean 8、armSwing 30、elbow 40、farThigh -46、farKnee 96 |
| 1.15 | linear | hipHeight 34、hipShift -8、lean 16、armSwing 20、elbow 30、farThigh -58、farKnee 108 |
| 1.45 | linear | （同上） |
| 2.7 | inOut | hipHeight 50、hipShift -6、lean 8、armSwing 30、elbow 40、farThigh -46、farKnee 96 |
| 3.4 | linear | （同上） |

### 坐姿腿屈伸（leg-extension）  时长 2.8s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | hipHeight 32、hipShift -8、lean 6、armSwing 28、elbow 85、freeThigh 90、freeKnee 80 |
| 0.9 | inOut | freeKnee 2 |
| 1.2 | linear | （同上） |
| 2.2 | inOut | freeKnee 80 |
| 2.8 | linear | （同上） |

### 平板支撑（plank）  时长 5s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 26、lean 86、armSwing 86、elbow 12、anchorX -30、anchorY -22、rootTilt 8 |
| 2.5 | inOut | hipHeight 25.4 |
| 5 | linear | hipHeight 26 |

### 悬挂举腿（hanging-leg-raise）  时长 3.2s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | out | lean 3、armSwing 179、elbow 4、freeThigh 8、freeKnee 48、farThigh 11、farKnee 54、gripY 115、anchorX -6 |
| 1.1 | inOut | freeThigh 76、freeKnee 10、farThigh 70、farKnee 14 |
| 1.4 | linear | freeThigh 80、freeKnee 8、farThigh 74、farKnee 12 |
| 2.5 | in | freeThigh 8、freeKnee 48、farThigh 11、farKnee 54 |
| 3.2 | linear | （同上） |

### 跑步（run）  时长 1.2s · 视角 side

| t | 相位 | 变化的关节 |
|---|---|---|
| 0 | inOut | hipHeight 52、hipShift -2、lean 8、armSwing -22、elbow 88、freeThigh 32、freeKnee 18、farThigh -18、farKnee 105 |
| 0.3 | inOut | armSwing 34、elbow 78、freeThigh -18、freeKnee 105、farThigh 32、farKnee 18 |
| 0.6 | inOut | armSwing -22、elbow 88、freeThigh 32、freeKnee 18、farThigh -18、farKnee 105 |
| 0.9 | inOut | armSwing 34、elbow 78、freeThigh -18、freeKnee 105、farThigh 32、farKnee 18 |
| 1.2 | linear | armSwing -22、elbow 88、freeThigh 32、freeKnee 18、farThigh -18、farKnee 105 |

---

## 三、丢掉了什么

以下东西在 2026-11-07 之后**作废**，不要在新方案里沿用：

- 线宽分级、尺寸档、光学缩放（compact / regular / full 三档）
- 头身比、造型参数、关节圆点、手/脚的画法
- 正面的单线躯干 + 肩线髖线画法
- 视角规则（哪个动作该用哪个视角）
- 形状/剪影/体积线/3D 三套皮肤
- 预览页的排版与验收阈值

保留代码的价值只在于：解算器、轨迹数据、约束机制。皮肤和规范都可以扔。

## 四、换成精灵图之后，这两块怎么用

精灵图把「动作正确」变成绘图问题：帧由人画，播放器只负责按时间切帧。

那这份文档还有两个用处：

1. **画帧时的对照**：每帧的关节角度可以照第二节的轨迹表核对，不至于画出膝盖反折、肘超过 180° 这种硬伤。
2. **帧数与时长的依据**：每条的时长和关键帧时间点仍然有效，精灵图按同样的节奏切帧就能对上原来的观感。
