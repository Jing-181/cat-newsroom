# Page11 wakeup4 定向修复 · 2026-11-10

证据：主线程实际96px深色上下两张截图，无持久化fileId，不编路径。8项仅静态采样；smith_machine_squat/single_leg_press/single_leg_calf_raise/cable_hammer_curl记录partial-static-reviewed，非全周期通过。

## Wakeup5：固定支架遮挡修复（最新）

主线程实际96px深色上下截图复查：哥本哈根凳面/上腿支撑与阿诺德坐凳/靠背/支腿可辨，阿诺德25%手臂头侧拥挤改善，记录static-fix-reviewed，不代表完整周期。单臂下拉拉索已离开头圈，但固定柱穿头；反向划船近侧支架三相位穿头。无fileId，不编路径。

真实深度核查：下拉柱交叠在头后（原render yaw-.8）；反向划船原yaw+.45穿头柱在头前。前者直接纳入深度裁线，后者render-only改yaw-.45到对侧3/4后再裁后柱。世界关节/握点/支撑/器械坐标不变，不把真实前柱无差别抹掉。

通用契约修复：bench与fixtures primitives现在走与身体/器械相同的projectedPath；仅已有opt-in场景和本次invertedRow启用裁线，其他默认路径相同，冻结引体不走此skin。保留前侧线段规则，不填头圈。

新增实际DOM完整周期测试：两项fixtures端点与纯深度裁线结果一致，头圈净空，躯干投影>26（不端面缩没），支架可见总长>原75%；strict/bird/Arnold回归及全部104实际SVG120Hzbounds通过。

check430/430，build退出0（691ms），diff-check退出0。两项继续fix-implemented-pending-review，待主线程看新版；未提交推送部署。

## Wakeup4共因诊断（历史）

真实采样→skin检查证明fixtures并未漏画：三个场景bench=null，fixtures进入bench path。可见性弱有两层原因：统一1.9单位描边且opacity.45在96px接近淡细线；几何只给了极简甚至歧义的线。反向划船只有横杠、无支架；哥本哈根凳面是一条对角线+中心单柱；阿诺德只有座位轴线+靠背，无落地腿。

新增通用可选fixtureStyle，由场景显式指定width2.4/opacity.85；未指定场景仍1.9/.45，避免无端全局改变。支撑仍比人物3.8轻，无体块。测试读取实际SVG端点/宽度/opacity，不靠源码字符串猜是否绘制。

## 四项

1. 单臂绳索下拉：原yaw1.02易使高锚拉索穿头心；render-only改yaw-.8/elevation.2，沿用真实深度裁线，cableHandle绘制也走同一投影裁线路径。世界滑轮、连接点、手、支撑不变。全周期采样可见拉索与头心距离>9。
2. 反向划船：保留横杠原位置，补两端落地支柱和地面基线，双握点仍落在横杠上；人物体位/支撑轨迹未改。
3. 哥本哈根：凳面改平面矩形轮廓、两腿及地面线，上侧脚踝仍在原z23平面内部；未修改腿骨或体位。
4. 阿诺德：座面平面轮廓、两边靠背与两条落地腿/地面；对侧3/4观察yaw-.8/.2及后深度裁线缓解头/臂/器械拥挤；原世界手臂和器械轴轨迹不变。没有用体块或无差别擦除前臂遮盖。

## 验证

新增2组实际SVG测试：fixture所有声明端点逐项出现在真实path，样式明确、落地连接、手杠接触/凳面包含支持；完整120Hz单臂拉索及阿诺德臂段裁线后头心净空，采样对象未修改。全104真实SVG完整周期bounds通过。

check428/428、build退出0（687ms）、diff-check退出0。四项均fix-implemented-pending-review；主线程须复查96/240和全播放，数学净空不能替代辨识验收。整体complete=false。

原引体/其他动作几何/指标/vite不改；未提交推送部署。
