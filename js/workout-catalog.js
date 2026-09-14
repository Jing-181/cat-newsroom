(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorkoutCatalog = api;
})(typeof window !== "undefined" ? window : null, function () {
  const trainingDays = [
    { id: "chest", name: "胸日" },
    { id: "back", name: "背日" },
    { id: "shoulders", name: "肩日" },
    { id: "legs", name: "腿日" },
    { id: "arms", name: "手臂日" },
    { id: "full_body", name: "全身日" },
    { id: "cardio", name: "有氧恢复" },
  ];

  const BADGE = {
    dumbbell_bench_press:"卧推", dumbbell_bench_press_incline:"上斜", machine_chest_press:"推胸",
    machine_chest_press_incline:"斜推", machine_chest_press_decline:"下斜", barbell_bench_press:"杠卧",
    barbell_bench_press_incline:"上杠", dips:"双杠", cable_fly_high:"高夹", cable_fly_mid:"中夹",
    cable_fly_low:"低夹", pec_deck:"蝴蝶",
    pull_up:"引体", lat_pulldown_wide:"宽拉", lat_pulldown_close:"窄拉", barbell_row:"杠划",
    seated_cable_row:"坐划", one_arm_dumbbell_row:"单划", machine_row:"器划", straight_arm_pulldown:"直压",
    strict_press:"实推", dumbbell_shoulder_press:"肩推", machine_shoulder_press:"器肩",
    dumbbell_lateral_raise:"侧举", cable_lateral_raise:"索侧", reverse_pec_deck:"反蝶", face_pull:"面拉",
    barbell_squat:"深蹲", hack_squat:"哈克", leg_press:"腿举", romanian_deadlift:"硬拉", conventional_deadlift:"传统硬拉",
    bulgarian_split_squat:"保加利亚蹲", walking_lunge:"弓步走", leg_extension:"屈伸", leg_curl:"腿弯", hip_thrust:"臀推", calf_raise:"提踵",
    push_up:"俯卧撑", plank:"平板支撑",
    dumbbell_curl:"哑弯", hammer_curl:"锤弯", barbell_curl:"杠弯", preacher_curl:"牧师",
    cable_curl:"索弯", rope_pushdown:"索压", bar_pushdown:"杆压", overhead_extension:"过顶",
    skull_crusher:"仰卧",
    treadmill:"跑步", outdoor_run:"户外", bike:"单车", elliptical:"椭圆",
    rowing_machine:"船机", stair_climber:"爬楼", stretch:"拉伸",
  };
  const exercise = (id, name, days, bodyPart, equipment, extra = {}) => ({
    id, name, trainingDays: days, bodyPart, equipment, availableOnAllDays: false, ...extra,
    icon: BADGE[id] || name.slice(0, 2),
  });
  const allDay = (id, name, bodyPart, equipment, extra = {}) => exercise(id, name, ["arms"], bodyPart, equipment, { availableOnAllDays: true, ...extra });

  const exercises = [
    exercise("dumbbell_bench_press", "哑铃卧推", ["chest", "full_body"], "胸", "哑铃", { angle:"水平", muscles:"胸大肌、三角肌前束、肱三头肌", tips:"仰卧水平凳，双脚踩实，肩胛收紧后收。下落至胸侧缓慢控制，推起均匀发力至接近伸直但不锁死。全程核心稳定，避免腰背过度拱起。" }),
    exercise("dumbbell_bench_press_incline", "哑铃卧推（上斜）", ["chest"], "上胸", "哑铃", { angle:"上斜", muscles:"胸大肌上束、三角肌前束、肱三头肌", tips:"上斜 30-45 度，肩胛贴靠垫。下落至胸上侧，推起想象向天花板方向推，顶峰收缩 1 秒。肘部约 45 度，避免外展过大造成肩关节压力。" }),
    exercise("machine_chest_press", "推胸机（水平）", ["chest"], "胸", "器械", { angle:"水平", muscles:"胸大肌、三角肌前束、肱三头肌", tips:"调整座椅使把手与胸部中线对齐，肩胛贴靠垫。沿固定轨迹前推至接近伸直不锁死，返回时缓慢控制保持胸肌张力，避免耸肩。" }),
    exercise("machine_chest_press_incline", "推胸机（上斜）", ["chest"], "上胸", "器械", { angle:"上斜", muscles:"胸大肌上束、三角肌前束、肱三头肌", tips:"调整上斜座椅使把手与上胸对齐，挺胸收肩。沿轨迹前推重点感受上胸发力，返回时缓慢控制保持肘部微屈，避免身体前倾借力。" }),
    exercise("machine_chest_press_decline", "推胸机（下斜）", ["chest"], "下胸", "器械", { angle:"下斜", muscles:"胸大肌下束、三角肌前束、肱三头肌", tips:"调整下斜座椅使把手与下胸对齐，肩胛贴靠垫挺胸收腹。沿轨迹前推感受下胸发力，手臂接近伸直不锁死。返回时缓慢控制保持张力，避免肩胛过度外展。" }),
    exercise("barbell_bench_press", "杠铃卧推", ["chest", "full_body"], "胸", "杠铃", { angle:"水平", muscles:"胸大肌、三角肌前束、肱三头肌、前锯肌", tips:"仰卧水平凳，肩胛收紧后收，双脚踩实。握距略宽于肩，杠铃下落至中胸部轻触后推起。肘部约 45 度避免外展过大，杠铃沿胸部中线垂直运动，核心全程收紧。" }),
    exercise("barbell_bench_press_incline", "上斜杠铃卧推", ["chest"], "上胸", "杠铃", { angle:"上斜", muscles:"胸大肌上束、三角肌前束、肱三头肌", tips:"上斜 30-45 度，肩胛贴紧靠垫。握距略宽于肩，杠铃下落至胸上侧轻触后推起。肘部约 45 度避免过度外展，核心收紧，杠铃轨迹沿胸部中线垂直运动。" }),
    exercise("dips", "双杠臂屈伸", ["chest", "arms"], "胸/三头", "自重", { muscles:"肱三头肌、胸大肌下束、三角肌前束、前锯肌", tips:"双手握杠身体垂直下落，肘部向后。下落至肩部略低于肘部或无痛深度，躯干直立核心收紧避免摆动。推起时肩胛下沉避免耸肩，不要过度下落导致肩关节压力。" }),
    exercise("cable_fly_high", "绳索夹胸（高位）", ["chest"], "下胸", "绳索", { muscles:"胸大肌下束及内侧、前锯肌", tips:"高位滑轮，双脚前后站立身体略后倾。双臂展开肘微屈 10-20 度，从高位向低胸画弧合拢。顶峰挤压胸肌 1-2 秒，肘部角度不变，返回时缓慢控制不过度打开。" }),
    exercise("cable_fly_mid", "绳索夹胸（中位）", ["chest"], "胸", "绳索", { muscles:"胸大肌中束、前锯肌", tips:"中位滑轮与胸部齐高，双脚前后站立。双臂从两侧打开肘微屈 10-20 度，沿水平弧线向胸前合拢。顶峰挤压胸肌保持肘部角度不变，返回时缓慢控制保持胸部张力。" }),
    exercise("cable_fly_low", "绳索夹胸（低位）", ["chest"], "上胸", "绳索", { muscles:"胸大肌上束及内侧、前锯肌", tips:"低位滑轮，双脚前后站立身体略后倾。双臂从低位向中胸画弧合拢，肘微屈 10-20 度。顶峰挤压胸肌保持肘部角度不变，返回时缓慢控制避免过度打开，核心收紧。" }),
    exercise("pec_deck", "蝴蝶机夹胸", ["chest"], "胸", "器械", { muscles:"胸大肌、前锯肌", tips:"调整座椅使把手与胸部中线对齐，背部贴紧靠垫挺胸收肩。肘部微屈沿轨迹向胸前合拢，顶峰挤压胸肌避免锁死。返回时缓慢控制保持胸部张力。" }),
    exercise("pull_up", "引体向上", ["back", "full_body"], "背", "自重", { muscles:"背阔肌、大圆肌、肱二头肌、菱形肌、斜方肌中下部", tips:"正手握杠略宽于肩，肩胛先下沉后收，用背部发力拉起身体至下巴过杠。下落时不完全放松肩胛避免借力摆动，全程核心收紧躯干稳定不摇晃。" }),
    exercise("lat_pulldown_wide", "高位下拉（宽握）", ["back"], "背阔肌", "绳索", { muscles:"背阔肌上束及外侧、大圆肌、肱二头肌、后三角肌、菱形肌", tips:"正手握宽把，大腿固定坐直挺胸。肩胛下沉后收，下拉想象肘部向后下方拉至横杆到上胸部。顶峰挤压背部 1-2 秒，返回时缓慢控制避免耸肩和过度后仰。" }),
    exercise("lat_pulldown_close", "高位下拉（窄握）", ["back"], "背阔肌", "绳索", { muscles:"背阔肌下束及内侧、菱形肌、肱二头肌、后三角肌", tips:"使用 V 把略窄于肩，坐直挺胸。肩胛下沉后收，下拉时肘部靠近身体拉至中上胸位置。顶峰挤压背部，返回时缓慢控制保持肘部贴紧躯干避免借力。" }),
    exercise("barbell_row", "杠铃划船", ["back", "full_body"], "中背", "杠铃", { muscles:"背阔肌、菱形肌、斜方肌中下部、后三角肌、肱二头肌、竖脊肌", tips:"双脚与肩同宽，髋部前倾约 45 度背部挺直。握距略宽于肩，沿大腿内侧将杠铃拉至下腹或肋骨附近，顶峰挤压肩胛。返回时缓慢控制，避免弓背或身体摆动。" }),
    exercise("seated_cable_row", "坐姿绳索划船", ["back"], "中背", "绳索", { muscles:"背阔肌、菱形肌、斜方肌中下部、后三角肌、肱二头肌", tips:"坐姿挺胸双脚踩踏板膝盖微屈。发力时先沉肩再沿身体两侧将手把拉至下胸或腹部，顶峰挤压肩胛。返回时缓慢控制，避免身体后仰借力，保持脊柱中立。" }),
    exercise("one_arm_dumbbell_row", "单臂哑铃划船", ["back"], "背阔肌", "哑铃", { muscles:"背阔肌、菱形肌、斜方肌中下部、后三角肌、肱二头肌", tips:"单膝跪于凳上同侧手扶凳，躯干接近水平背部挺直。肩胛先下沉后收，沿侧面向髋部拉起，顶峰挤压背部避免耸肩。返回时缓慢控制，保持躯干稳定避免身体旋转。" }),
    exercise("machine_row", "器械划船", ["back"], "中背", "器械", { muscles:"背阔肌、菱形肌、斜方肌中下部、后三角肌、肱二头肌", tips:"调整座椅使把手与胸部或腹部对齐，挺胸收肩双脚踩实。沿固定轨迹将把手拉至躯干附近，顶峰挤压肩胛。返回时缓慢控制，避免身体前倾或后仰借力。" }),
    exercise("straight_arm_pulldown", "直臂下压", ["back"], "背阔肌", "绳索", { muscles:"背阔肌、胸大肌下束、肱三头肌长头、前锯肌", tips:"站直微屈膝，双手握杠或绳索手臂保持微屈固定。从头顶前方沿弧线向下压至大腿前侧，顶峰收紧肩胛。手臂角度固定不变，避免肘部弯曲或身体后仰，返回时感受背部拉伸。" }),
    exercise("strict_press", "实力推", ["shoulders", "full_body"], "肩", "杠铃", { muscles:"三角肌前束、三角肌中束、肱三头肌、上斜方肌、核心", tips:"双脚与肩同宽，腰背挺直，杠铃置于颈前。向上推至头顶锁定，下放吸气推举呼气。保持杠铃在脚掌中线上垂直移动，避免耸肩、过度拱腰，核心持续收紧。" }),
    exercise("dumbbell_shoulder_press", "哑铃肩推", ["shoulders"], "肩", "哑铃", { muscles:"三角肌前束、三角肌中束、肱三头肌、上斜方肌", tips:"坐姿或站姿腰背挺直，小臂垂直地面。哑铃置于耳侧推至顶端肘微屈不锁死，下放吸气推举呼气。避免耸肩借力、躯干后仰和手腕后折，注意肩部稳定。" }),
    exercise("machine_shoulder_press", "器械推肩", ["shoulders"], "肩", "器械", { muscles:"三角肌前束、三角肌中束、肱三头肌、上背部", tips:"调整座椅使肩与把手高度匹配，推起至手臂微屈避免超伸。推起呼气回落吸气，避免躯干前倾、握距过宽过窄或下落过深，保持躯干稳定。" }),
    exercise("dumbbell_lateral_raise", "哑铃侧平举", ["shoulders"], "中束", "哑铃", { muscles:"三角肌中束、三角肌前束、上斜方肌", tips:"双脚与肩同宽，肘微屈 20-30 度并全程锁定。以手肘为引导向两侧抬起至肩高，上举呼气下放吸气。避免耸肩甩臂借力，重量不宜过大，动作要慢。" }),
    exercise("cable_lateral_raise", "绳索侧平举", ["shoulders"], "中束", "绳索", { muscles:"三角肌中束、三角肌后束", tips:"单手持绳索把手，躯干稳定手臂自然下垂。沉肩后以肩为轴向侧方抬起至肩高，上举呼气返回吸气。避免身体晃动耸肩，手臂不低于肩或肘部低于肩膀水平。" }),
    exercise("reverse_pec_deck", "反向蝴蝶机", ["shoulders", "back"], "后束", "器械", { muscles:"三角肌后束、菱形肌、中下斜方肌", tips:"调整座椅使肩与转轴同高，胸部贴靠垫肘微屈。向后打开至最大幅度停顿 1-2 秒，向后呼气还原吸气。避免耸肩、伸直锁死、后仰借力或重量过大。" }),
    exercise("face_pull", "面拉", ["shoulders", "back"], "后束", "绳索", { muscles:"三角肌后束、菱形肌、中下斜方肌、肩袖肌群", tips:"绳索固定于额头高度，双手握把手。大臂与肩同高，手肘外翻拉至额头两侧同步肩外旋，拉回呼气还原吸气。避免耸肩、下拉过低和斜方肌主导。" }),
    exercise("barbell_squat", "杠铃深蹲", ["legs", "full_body"], "股四头、臀部、腘绳肌", "杠铃", { muscles:"股四头肌、臀大肌、腘绳肌、核心", tips:"站距略宽于髋，脚尖自然外旋 15 到 30 度。吸气收紧腹压，髋膝同步下蹲，膝盖沿脚尖方向移动；下降到大腿至少平行地面，脚掌三点受力后稳定站起。全程保持脊柱中立，避免塌腰、膝内扣和脚跟离地。" }),
    exercise("bulgarian_split_squat", "保加利亚分腿蹲", ["legs", "full_body"], "股四头、臀部", "哑铃/自重", { muscles:"股四头肌、臀大肌、腘绳肌、中臀肌、核心", tips:"后脚背放在凳上，前脚站稳并保持足弓支撑。屈髋屈膝垂直下沉，前膝对准脚尖，下降到舒适深度后以前脚中部和脚跟发力站起。先用自重熟悉平衡，再逐步增加哑铃重量，避免身体左右晃动和膝盖内扣。" }),
    exercise("walking_lunge", "行走弓步", ["legs", "full_body"], "股四头、臀部", "哑铃/自重", { muscles:"股四头肌、臀大肌、腘绳肌、小腿、核心", tips:"站直收紧核心，向前迈步后屈膝下沉，前脚全脚掌着地且膝盖对准脚尖。后腿膝盖接近地面但不猛触地，前脚蹬地迈向下一步。保持躯干稳定和步幅一致，避免膝盖内扣或用后脚蹬地借力。" }),
    exercise("conventional_deadlift", "传统硬拉", ["legs", "back", "full_body"], "后链", "杠铃", { muscles:"臀大肌、腘绳肌、竖脊肌、背阔肌、核心", tips:"杠铃贴近小腿，双脚与髋同宽，髋部后移并屈膝握杠。吸气收紧腹压，保持背部中立，脚跟蹬地并伸髋站起，杠铃始终贴身。站直时臀部收紧但不要后仰，放回时先推髋后屈膝，避免圆背、耸肩和杠铃远离身体。" }),
    exercise("hack_squat", "哈克深蹲", ["legs"], "股四头", "器械", { muscles:"股四头肌、臀大肌、腘绳肌、小腿三头肌", tips:"背靠器械双脚与肩同宽脚尖稍外展。吸气下蹲至大腿低于膝盖或接近水平，呼气站起。膝盖对准脚尖，避免内扣、骨盆翻转、背弓和膝过脚尖。" }),
    exercise("leg_press", "腿举", ["legs"], "腿", "器械", { muscles:"股四头肌、臀大肌、腘绳肌", tips:"背部紧贴靠垫双脚与肩同宽踩踏板。吸气缓慢下放至大腿与小腿约 90 度，呼气蹬起顶端微屈不锁死。避免弓背、臀部抬起、膝盖内扣或快速蹬起。" }),
    exercise("romanian_deadlift", "罗马尼亚硬拉", ["legs", "full_body"], "后链", "杠铃", { muscles:"腘绳肌、臀大肌、竖脊肌", tips:"双脚与髋同宽核心收紧背部挺直。臀部向后推以髋铰链前倾，杠铃紧贴大腿垂直下放。下落吸气起身呼气，避免膝盖弯曲角度变化、圆背和杠铃远离身体。" }),
    exercise("leg_extension", "腿屈伸", ["legs"], "股四头", "器械", { muscles:"股四头肌", tips:"坐稳背部贴靠垫大腿贴座椅前沿，双脚背勾住垫板。发力呼气抬起至接近伸直顶端保持 1 秒，缓慢回落吸气。避免膝盖完全锁死、借助惯性甩动和身体晃动。" }),
    exercise("leg_curl", "腿弯举", ["legs"], "腘绳肌", "器械", { muscles:"腘绳肌、小腿肌群", tips:"俯卧或坐姿大腿贴垫板，脚踝放滚轮下方。呼气弯曲小腿向臀部贴近顶峰停留 1-2 秒，吸气缓慢放回。避免臀部抬起、下背拱起、借力甩动和动作过快。" }),
    exercise("hip_thrust", "臀推", ["legs"], "臀", "杠铃", { muscles:"臀大肌、腘绳肌、核心", tips:"肩胛骨下缘靠椅缘双脚踩地与肩同宽膝约 90 度。呼气脚跟蹬地推髋至肩髋膝成直线停顿 1-2 秒，下沉吸气。避免顶腰、耸肩、髋部上抬过多和膝盖内扣。" }),
    exercise("calf_raise", "提踵", ["legs"], "小腿", "器械", { muscles:"腓肠肌、比目鱼肌", tips:"前脚掌站台阶边缘脚跟悬空，身体直立膝盖微屈不锁死。上抬呼气顶峰停顿 2-3 秒，下降吸气充分拉伸。避免弹跳、脚跟砸地、踝关节内翻外翻。" }),
    exercise("push_up", "俯卧撑", ["chest", "full_body"], "胸、三头", "自重", { muscles:"胸大肌、肱三头肌、三角肌前束、核心", tips:"双手略宽于肩，身体从头到脚保持一直线。吸气屈肘下放至胸部接近地面，肘部约 30 到 45 度，呼气推起至手臂接近伸直。全程收紧核心，避免塌腰、耸肩和头部先着地。" }),
    exercise("plank", "平板支撑", ["full_body"], "核心", "自重", { muscles:"腹横肌、腹直肌、臀部、肩带", tips:"前臂与脚尖支撑，肘部位于肩膀正下方，头、肩、髋、脚跟保持一直线。收紧腹部和臀部，保持自然呼吸，避免塌腰或抬髋。以稳定姿势计时，出现腰部代偿时结束本组。" }),
    allDay("dumbbell_curl", "哑铃弯举", "二头", "哑铃", { muscles:"肱二头肌、肱肌、肱桡肌、前臂屈肌", tips:"双脚与肩同宽挺胸收紧核心，大臂贴紧身体固定。掌心朝前以肘为轴弯曲上举至靠近胸部，顶点挤压。缓慢下放约 3 秒最低点不完全伸直，向上呼气向下吸气。避免前倾借力和肘部前移。" }),
    allDay("hammer_curl", "锤式弯举", "二头", "哑铃", { muscles:"肱二头肌、肱肌、肱桡肌", tips:"双脚与肩同宽，双手对握哑铃大臂贴紧身体。仅弯曲肘关节至肩部前方，顶点挤压二头肌和肱肌。全程掌心保持相对不旋转，手腕锁直缓慢下放。向上呼气向下吸气。避免手腕内翻和肘部前移。" }),
    allDay("barbell_curl", "杠铃弯举", "二头", "杠铃", { muscles:"肱二头肌、肱肌、肱桡肌、前臂屈肌", tips:"挺胸站立双脚与肩同宽膝盖微曲，反手握杠握距与肩同宽。肘部紧贴身体两侧不动，以肘弯曲上举至锁骨高度顶点停顿 1 秒。缓慢下放 3 秒底部不完全放松，向上呼气向下吸气。避免弓背借力和肘部前移。" }),
    allDay("preacher_curl", "牧师凳弯举", "二头", "器械", { muscles:"肱二头肌（重点短头）、前臂肌群", tips:"调整座椅使腋窝舒适靠在垫子顶部，上臂紧贴垫面固定。以肘关节弯曲上举至肩前方顶点挤压，缓慢下放至手臂几乎伸直但保持张力不完全锁死。向上呼气向下吸气。避免肘部滑动和臀部离座借力。" }),
    allDay("cable_curl", "绳索弯举", "二头", "绳索", { muscles:"肱二头肌、肱肌、肱桡肌", tips:"把手装于低位滑轮，双脚与肩同宽反手握把挺胸。仅弯曲肘关节将把手向肩膀拉起，顶点挤压肘部不后移肩膀不耸起。缓慢下放至手臂伸直绳索保持紧绷，向上呼气向下吸气。避免身体后仰借力和拱背甩动。" }),
    allDay("rope_pushdown", "绳索下压", "三头", "绳索", { muscles:"肱三头肌", tips:"面对高位滑轮双脚与肩同宽膝盖微屈核心收紧。双手正握绳索肘部紧贴身体不动，呼气下压至大腿旁手臂伸直时分绳两端挤压三头肌，顶峰 1 秒。缓慢回放至肘屈略大于 90 度。避免身体前倾借力和肘部外张。" }),
    allDay("bar_pushdown", "直杆下压", "三头", "绳索", { muscles:"肱三头肌", tips:"面对高位滑轮双脚与肩同宽，正握直杆与肩同宽。肘部紧贴身体固定核心收紧，呼气下压至手臂完全伸直感受三头肌收缩。缓慢控制回放至胸部高度肘部不外漂。避免身体重量下压和下放过快。" }),
    allDay("overhead_extension", "过顶臂屈伸", "三头", "绳索", { muscles:"肱三头肌", tips:"站立或坐姿，双手合握哑铃于头顶肘部靠近头部指向正前方。呼气伸直双臂推回起始位置肘部固定不外张，吸气缓慢下放至耳后感受三头肌拉伸。肋骨下沉不弓背。避免肘部外扩和弓背借力。" }),
    allDay("skull_crusher", "仰卧臂屈伸", "三头", "杠铃", { muscles:"肱三头肌", tips:"仰卧长凳双手正握杠铃或哑铃，上臂垂直地面固定不动。吸气屈肘将重量向额头方向下放至耳后感受拉伸，呼气以三头肌发力推回完全伸直。背部贴紧凳面上臂不晃动。避免上臂移动和下放过快。" }),
    exercise("treadmill", "跑步机", ["cardio"], "心肺", "有氧", { muscles:"心肺、臀腿", tips:"抬头、收紧核心，步频自然。先以能完整说话的强度热身，再逐步提速。" }),
    exercise("outdoor_run", "户外跑", ["cardio"], "心肺", "有氧", { muscles:"心肺、臀腿", tips:"选择平整路线，保持轻快步频。跑前热身，出现疼痛及时停止。" }),
    exercise("bike", "动感单车", ["cardio"], "心肺", "有氧", { muscles:"心肺、股四头、臀部", tips:"座椅高度以膝盖微屈为宜，保持脊柱中立，避免耸肩。" }),
    exercise("elliptical", "椭圆机", ["cardio"], "心肺", "有氧", { muscles:"心肺、臀腿", tips:"双脚稳定踩实踏板，避免膝盖内扣，阻力由低到高调整。" }),
    exercise("rowing_machine", "划船机", ["cardio"], "心肺", "有氧", { muscles:"背部、核心、臀腿", tips:"依次发力：腿、躯干、手臂；回程反向进行，保持背部平直。" }),
    exercise("stair_climber", "爬楼机", ["cardio"], "心肺", "有氧", { muscles:"臀大肌、股四头肌、腘绳肌、小腿三头肌、核心", tips:"面向机器站稳双脚踩实踏板，后脚掌蹬踏臀部主导发力。上半身微前倾重心落脚后跟，膝盖对准脚尖不内扣不锁死。核心收紧保护腰椎，扶手仅平衡不支撑体重，保持匀速节奏。" }),
    exercise("stretch", "拉伸与泡沫轴", ["cardio"], "恢复", "恢复", { muscles:"全身筋膜与关节活动度", tips:"保持舒适牵拉感，不要弹震。每个位置平稳呼吸 20 到 30 秒。" }),
  ];

  function forDay(day) {
    return exercises.filter(item => item.availableOnAllDays || item.trainingDays.includes(day));
  }

  return { trainingDays, exercises, forDay };
});
