# 手机focus收敛修复（未发布）

分支fix/mobile-focus-layout。用户明确要求恢复已部署2.20.0交互，基线bdab316026b2ca784688019a3e2ace020d546360。本次仅保留手机删除冗余导航和局部间距，不提交部署。

## 已撤销本轮不成立方案

通过git diff与基线逐项对照，结构化edit撤销focus-bottom wrapper/display:contents/mobile grid、右侧悬浮预留列、示范order/grid/flex/min-height覆盖、主按钮重排、新外壳padding、更改输入高/字号/内边距、全子项flex-shrink覆盖、额外副按钮尺寸/提示重排。workout-view.js与基线完全一致。

造成风险的明确差异：新wrapper让coach/hint/actions/extras不再是线上父flex独立子项，而成为flex:0 0 auto、margin-top:auto的grid；移动viewport CSS只对直属子项设flex规则，原coach空间分配不再等价。外壳padding、auto标题和grid最小高度叠加，改变滚动空间/按钮位置。此前“未改JS所以交互不变”的判断不成立。真机米白空白的唯一底层原因未在本实例证实，不臆测浏览器Bug。

## 仅保留差异

同一手机media块：隐藏focus-nav整行（切动作按钮，桌面保留）；标题95px降80px，维持固定flex-basis同值，22px/1.35两行可读；标题上下文/状态栏/字段/上次记录间距适度压缩。字段控件尺寸、coach、actions/extras和DOM顺序回到线上。

没有新增overflow/height/top/bottom/order/sticky/viewport模型；移动既有overflow-y:auto和两行setbar属于2.20.0原行为，原样保留。css/mobile-viewport.css、mobile-viewport.js、WorkoutUI手势JS、非全屏/全屏safe-area与底栏规则均与基线一致。无全仓reset，无私人文件清理。

## 验证入口与边界

本次最终check464/464通过，build退出0（813ms），diff-check通过。对照基线workout-view.js、mobile-viewport CSS/JS及WorkoutUI均无差异；实际产品代码只余workout-ui.css八行局部排版覆盖。测试是模板/样式契约回归，不代表真机问题已完全消失。


真实App：`http://localhost:5176/#/sport`，应在真机对非全屏/全屏、上下滚动、键盘、底栏和左右滑动逐项复查。

隔离dev样例`/preview/mobile-focus.html?long=1&exercise=rope_pushdown&finished=1`复用恢复后的真实editorHtml/CSS，仅合成数据/静帧，不代表真实App交互验收。

最新附件sf_33fc28ce30da53e7读取一次返回session file not found，未反复尝试；本实例依据主线程描述记录：iPhone上滑出现米白空白、棕卡位移、滚动条与底栏脱节、主按钮不见。未声称看过附件或回撤后真机完全修复。待主线程复查，继续不做版式试验。
