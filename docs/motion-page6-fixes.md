# Wakeup14 page6支撑诊断与修复

证据为主线程真实page6 first上下96px深色0/12.5/25/37.5。后半/完整连续未看，无fileId不编路径。push_up/plank/dumbbell_curl/hammer_curl/barbell_curl只记partial-static-reviewed。

## Wakeup15证据追加（仅归档）

主线程实际page6新版first下半＋second上下96px深色截图：nordic_curl后半踝固定滚垫/支架可辨；seated_calf_raise后半座面、踏板与膝垫可辨；preacher_curl已查看前后半中的斜垫边沿/支架可辨。对应三项记static-fix-reviewed，不升级完整验收。

新版first上半本次未看，不补证。push_up后半伸肘起身、dumbbell_curl/hammer_curl/barbell_curl器械差异可辨，仍仅partial。plank静态姿势可辨，其他视口及完整验收未测，不作全局pass。

随后page5-first导航、首article滚动成功，截图UnknownVizError。游标page5-first，该页本轮无视觉证据；原因未证实，无fileId不编路径。

本次只改本文和progress，不修改代码、不跑测试或构建，不制造新缺陷。下方448/448等为上一代码批次结果。overall.complete=false，无提交推送部署。

## 先诊断世界接触

牧师凳原supports.upperPads包含肩到肘整段，肩肘全周期固定，且该整段作为fixture绘制，不是只固定肘。问题是垫线与3.8上臂重合被盖住、默认.45较淡。补斜垫外轮廓（y±18，相对上臂y±13有边距）、上下横边及落地支腿；局部fixtureStyle2.4/.85。肩/肘/手/杠轨迹不变。

北欧原固定踝(-30,±10,3)，原压杆z5横跨但仅单线、无落地约束可读。新增每踝上方半径3滚垫，底部恰触踝点；横杆两端固定腿和地面脚支撑。膝/踝/刚性膝肩链完全不变，纯线圈器械非体块。

坐姿提踵原垫是knee+(-4,0,3)短线，只跟膝偏移，没有保证与实际大腿切向接触。改contact=hip+26*大腿单位向量，normal为矢状面正交向上单位向量，center=contact+3*normal、r3。于是滚垫始终相切于大腿下端，随原腿姿升降；人物关节不改。补座面两侧/落地腿、前掌踏板落地支腿，保留脚前掌固定。

## 验证

新增3组实际SVG+几何测试：牧师凳全上臂接触固定/所有边沿端点绘制；北欧真实滚垫位置与踝接触/落地结构；提踵接触位于大腿段26处、法向正交、半径相切、实际SVG圆位置。全部120Hz周期检查支撑，104全渲染bounds通过。

check448/448、build退出0（688ms）、diff-check退出0。三项fix-implemented-pending-review，不冒称截图已通过。引体/指标/其他轨迹不动，overall.false，无提交推送部署。
