# 104配图覆盖交接（不是最终验收）· 2026-11-10

## 最新鸟狗v3复查修正

主线程截图否决鸟狗v2端面视角：动作像站立人，属于辨识退步。v3已恢复明显侧方3/4，保留真实深度裁线、增加地面参照，世界支撑未变；新增躯干投影长度和伸展端点分离测试。仍待主线程图像复查。stretch/swim同次截图仅记static-fix-reviewed，非全周期pass。最新check426/426、build697ms、diff-check通过；总体complete=false，视觉总计未变。

## 前次page12截图修复（历史，鸟狗视角以v3为准）

宿主截图在主线程间歇恢复，page12实际96px深色截图已暴露鸟狗穿头、小腿拉伸后膝/脚跟/可见墙接触、自由泳近直臂风车三项问题。本批已定向实现修复，见[motion-page12-fixes.md](motion-page12-fixes.md)，全部待主线程复查，不标visual pass。其余page12五项只记partial-static-reviewed。

当前visual：pending99、fix-implemented-pending-review4（原实力推＋本次三项）、user_accepted1冻结引体，仍103项缺完整验收，overall.complete=false。最新check426/426、build退出0（699ms）、diff-check退出0；104完整实际SVG周期bounds通过。

## 历史收口记录：浏览器结构已通过，当时视觉截图阻塞

主线程实际浏览器DOM检查全部13页，记录为 **browser-structure-pass**：104个唯一ID，顺序与catalog一致，每页8行×3帧=24 SVG；第一页测得所有SVG为96 CSS px；activePlayers=0；在782×697视口下，各页document.scrollWidth≤innerWidth；上一页/下一页正常。证据由主线程本会话报告，无持久化截图ID，不编路径。

截图仍返回 **UnknownVizError**。这是宿主截图能力阻塞，不能把成功读取DOM、分页和无横向溢出称为动作画面通过，也未据此修改任何visual字段。整体complete仍false，当前loop的完整验收目标尚未满足。

### 可操作剩余验收清单

- [ ] **恢复宿主截图/画面检查**：保留可工作的原motion tab，确认截图不再UnknownVizError；不绕路冒称已看图。
- [ ] **103项完整视觉验收**：102 pending＋实力推1项fix-implemented-pending-review。按13页记录ID、相位、尺寸、主题；每项再进入单页查完整播放和96/240px。仅原引体1项已有用户认可，保持冻结。
- [ ] **逐ID缺陷复核**：实力推已确认的静态穿头缺陷修复仍需完整周期；锤式器械/躯干、卧推小尺寸、腿屈伸双腿/滚垫等已记录重叠重新看实际新版。bounds不证明遮挡正确。
- [ ] **来源验收**：羽毛球BWF403待获取可读可靠正文；其他来源按文档审核变式/机器型号/掌面不可见限制，不能将有URL等同具体几何认证。跑步等新增父会话补证已列，边界保留。
- [ ] **真实WorkoutUI焦点回归**：隔离本地测试数据，输入重量/次数/时长时切组、切动作、刷新局部DOM，验证焦点/光标/键盘稳定，保存内容准确。当前未执行，不以单测替代。
- [ ] **移动与生命周期**：375/390/430/820px实际交互，软键盘、横竖屏、全屏切换、重复进出训练/图鉴/预览、减少动态设置、后台恢复；目前仅782×697分页DOM结构检查通过。
- [ ] **同步与数据回归**：仅经授权的隔离账号/环境验证草稿、保存/重载、跨设备同步、离线重试及示范不污染个人记录。当前未实测正式或隔离同步，不自行触碰真实数据。
- [ ] **最终决策**：同版本参考/几何/视觉/接入与交互证据齐全后由主线程/用户验收；不自动complete、不提交推送部署。

最终本地核对：catalog104、registry104、progress104、真实clip104，ID集合完全一致且唯一；currentBatch的8个sourceFiles均存在；唯一空source为badminton。最终执行 `npm run check` **423/423通过（0失败/0跳过）**，`npm run build` **退出0、构建684ms**，`git diff --check` **退出0**。构建产物留在项目dist，未部署。首次合并检查命令被沙盒将正则误识别为路径拦截，改为无该正则的只读检查后通过，无权限提升或文件绕写。

18篇本项目批次文档均加了“历史快照”标记，旧3/7等配图数与旧测试数只保留为历程，当前统计以本文件和motion-progress.json为准。旧motion-system/biomechanics不是本轮恢复的规范。

## 最新参考补证（元信息更新，不改轨迹）

以下由主线程委托只读代理实际fetch正文，已同步resolver元信息与progress。只支持一般动作原则，不提升geometry或visual状态：
- 户外跑：https://health.clevelandclinic.org/perfect-your-running-gait-to-avoid-injury-improve-your-time ，一般协调/个体差异，不验证步幅。
- 越野缓坡：https://runnersconnect.net/hill-running-form/ ，教练媒体上坡前倾但不折腰，非8%坡或复杂越野认证。
- 跳绳：https://health.clevelandclinic.org/jump-rope-benefits ，绳过头脚下时跳、腕转、轻落地、略屈膝。
- 自由泳：https://www.swimming.org/justswim/tips-for-getting-front-crawl-right/ 与 https://www.swimming.org/masters/improving-front-crawl-technique/ ，交替划臂与小幅打腿；示范仍不包含呼吸/滚转。
- 扶墙小腿拉伸：https://www.acefitness.org/resources/everyone/exercise-library/152/standing-dorsi-flexion-calf-stretch/ ，后跟地、后腿直、前膝屈；仅支持选定恢复动作。
- 爬楼：https://health.clevelandclinic.org/stairmaster-benefits-and-workouts ，台阶下行/人上攀、核心平衡及扶栏稳定，不验证具体落脚膝角；机械厂家资料保留。

羽毛球BWF目标 https://shuttletime.bwfbadminton.com/activity-of-the-month/july-forehand-clear 返回403未读，reference仍pending。下方历史“最后六项参考均缺失”等叙述以本更新为准；较早同族/型号证据仍需按范围审核。视觉未验数量不变。

## 静帧分页验收入口（最新）

`/preview/motion.html?review=1&page=0&dark=1`：按catalog原顺序，每页8项，共13页，默认真实96 CSS px高。每行名称/ID及0%、25%、50%周期静帧；秒数来自各clip.duration，静态保持明确标注。不是默认把25%当中段或50%当顶点。

上一页/下一页、96/240切换与深浅均可用。约130px/行，窄屏仅行容器横向滚动，页面不依赖全页溢出。每行“完整相位／播放”进入原有单动作预览；不带review参数时默认行为保留。所有帧使用真实resolveDemo/createDemoFigure/skin，staticTime强制静帧；翻页、切尺寸、离开会清理旧skin，不创建player/rAF。

可供主线程登记证据的DOM查询：
```js
JSON.parse(document.querySelector('#motion-review-state').textContent)
// page/pageCount/ids/size/theme，以及每项clipId/duration/frames[{phase,seconds,staticHold}]
```
另有`#grid[data-review-page][data-review-ids]`、每行`data-exercise-id`和每帧`data-phase/data-seconds`。这些状态只描述当前画面，不写visual通过或持久化验收。

新增4组分页/真实解析和采样/无rAF/翻页销毁/失败清理测试。check423/423、build、diff-check通过。未实际查看本页截图或移动布局，需主线程按13页采集证据；当前完整视觉未验仍103项（102 pending+1实力推待完整复查），原冻结引体1项用户认可。

## 当前统计

104/104 catalog均有实际clip/skin，0目录占位；未知自定义仍诚实占位。supportType=exact100、simplified4（越野缓坡、羽毛球基础挥拍、自由泳基础、扶墙小腿拉伸）。这里exact仅表示对应目录动作，不是解剖精确/已验收/专业认证。

progress visual：pending102、user_accepted1（冻结引体）、fix-implemented-pending-review1（实力推；已有具体静态缺陷修复证据，但全周期未验）。overall.complete=false。每项还需同版本几何、参考适用范围、视觉与接入全部满足，禁止按数量结束。

## 最后六项

- 户外跑：平地小步跑，支撑脚世界固定，交替腾空/摆动；跟随相机平移回环。
- 越野跑：明确8%连续缓坡小步示意，地形线与支撑足底一致，略前倾，不做障碍危险跳跃；不代表全部越野环境。
- 跳绳：双脚基本跳，一根开放连续绳连接双手，绕手旁轴转，离散总长度恒定，绳靠地时双脚离地、其余相位落地。无双摇/花式。
- 羽毛球：仅右手无球正手头顶挥拍准备/上举/回位，拍柄与右手相连、拍面法向给定；没有球路/来球判断，不冒充完整高远球教学或整项运动。
- 游泳：独立水平自由泳示意，双臂反相划水/回臂、交替打腿、水面线；没有跑步旋转，也未模拟完整屈肘水感、身体滚转、换气或转身。
- 恢复：只选扶墙后腿小腿静态拉伸，staticHold不启动播放器，不假称涵盖全部拉伸和泡沫轴。

全部空心圆单线固定比例，新增world模型独立。运动幅度只是绘图设计。

## 参考可信度与支持类型拆分

resolver新增supportType与referenceStatus，预览直接展示两维。calibrated旧状态仍指工程样片，绝不代表引用验证；前五器械不再因缺引文标为跨动作同类。

最终六项本实例尝试：REI403、SwimEngland404、StrengthLog跳绳404、BadmintonBible返回空正文、ACE数字URL重定向为无关动作、Bing结果无关。均不作引用，六项source空、referenceStatus=pending。动作约束来自明确范围的实现与catalog，需补可靠正文；不得伪称读过成功来源。

## 主线程补证已同步（依据其实际web_fetch摘要，不重复声称本实例抓取）

- 跑步机：https://health.clevelandclinic.org/treadmill-or-elliptical-how-to-decide-whats-your-best-workout （2022-11-25）电机带走跑/坡角独立；不认证具体相位/尺寸。
- 坡走：https://health.clevelandclinic.org/12-3-30-workout （2021-12-30）自然摆臂、不始终抓扶手；12%只是例子非默认处方。
- 单车：https://health.clevelandclinic.org/benefits-of-cycling （2022-06-06）室内座/把/踏板调整、轻握肘微屈；不认证半径膝角。
- 椭圆：https://health.clevelandclinic.org/elliptical-machine-benefits （2024-10-22），另有第一条页面：踏板循环/手柄往复，尺寸不适会踮足驼背；不认证精确相位。
- 爬楼：https://www.lifefitness.com/en-us/catalog/cardio/stair-climbers-stepper-machines/powermill-climber 及 https://www.corehandf.com/products/stairmaster-8gx-1 ，只支持电机连续步进、扶手与SPM配置；referenceStatus=mechanical-source-human-reference-pending。不作楼层步数换算。

此前文档中“机器专页缺失”是历史状态，此处补证优先。

## 验证

新增3组：完整120Hz骨长/路径/回环、跑步世界植地足/缓坡接触、跳绳长度/握点/离地通过、球拍附着、自由泳交替、恢复静态、真实skin清理、支持与引用状态分离。

全部104实际SVG完整周期120Hz含描边和1单位余量bounds通过。check419/419、build、diff-check通过。统计由catalog/resolver/progress实际计算，非手填声称。

## 下一轮最终验收缺口

1. 102项无完整视觉验收；实力推只有已记录局部static-fix-verified，需全周期/240px复查；引体继续冻结。
2. 最后六项缺外部正文；爬楼有人体技术参考缺口；较早龙门反飞鸟、单腿/单臂及部分机器型号为catalog+同族原则，需按各批次文档审查来源范围，不能因source URL存在认定独立验证。
3. 已记录局部重叠：锤式目标器械/躯干、腿屈伸双腿/滚垫、卧推小尺寸等，需看新版实际图，不用bounds替代遮挡验收。
4. 本批羽毛球/泳姿/拉伸明确只演示指定范围；动作项目覆盖不等于技能全覆盖。
5. 工程测试是密集采样，非连续解析证明、生物力学认证或个体训练处方。

未改指标/vite/历史数据/冻结引体，没有提交推送部署。交回主线程进入最终审查，不自动宣称完成。
