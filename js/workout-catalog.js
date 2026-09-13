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

  const exercise = (id, name, days, bodyPart, equipment, extra = {}) => ({
    id, name, trainingDays: days, bodyPart, equipment, availableOnAllDays: false, ...extra,
  });
  const allDay = (id, name, bodyPart, equipment) => exercise(id, name, ["arms"], bodyPart, equipment, { availableOnAllDays: true });

  const exercises = [
    exercise("dumbbell_bench_press", "哑铃卧推", ["chest", "full_body"], "胸", "哑铃", { angle: "水平" }),
    exercise("dumbbell_bench_press_incline", "哑铃卧推（上斜）", ["chest"], "上胸", "哑铃", { angle: "上斜" }),
    exercise("machine_chest_press", "推胸机（水平）", ["chest"], "胸", "器械", { angle: "水平" }),
    exercise("machine_chest_press_incline", "推胸机（上斜）", ["chest"], "上胸", "器械", { angle: "上斜" }),
    exercise("machine_chest_press_decline", "推胸机（下斜）", ["chest"], "下胸", "器械", { angle: "下斜" }),
    exercise("barbell_bench_press", "杠铃卧推", ["chest", "full_body"], "胸", "杠铃", { angle: "水平" }),
    exercise("barbell_bench_press_incline", "上斜杠铃卧推", ["chest"], "上胸", "杠铃", { angle: "上斜" }),
    exercise("dips", "双杠臂屈伸", ["chest", "arms"], "胸/三头", "自重"),
    exercise("cable_fly_high", "绳索夹胸（高位）", ["chest"], "下胸", "绳索"),
    exercise("cable_fly_mid", "绳索夹胸（中位）", ["chest"], "胸", "绳索"),
    exercise("cable_fly_low", "绳索夹胸（低位）", ["chest"], "上胸", "绳索"),
    exercise("pec_deck", "蝴蝶机夹胸", ["chest"], "胸", "器械"),
    exercise("pull_up", "引体向上", ["back", "full_body"], "背", "自重"),
    exercise("lat_pulldown_wide", "高位下拉（宽握）", ["back"], "背阔肌", "绳索"),
    exercise("lat_pulldown_close", "高位下拉（窄握）", ["back"], "背阔肌", "绳索"),
    exercise("barbell_row", "杠铃划船", ["back", "full_body"], "中背", "杠铃"),
    exercise("seated_cable_row", "坐姿绳索划船", ["back"], "中背", "绳索"),
    exercise("one_arm_dumbbell_row", "单臂哑铃划船", ["back"], "背阔肌", "哑铃"),
    exercise("machine_row", "器械划船", ["back"], "中背", "器械"),
    exercise("straight_arm_pulldown", "直臂下压", ["back"], "背阔肌", "绳索"),
    exercise("strict_press", "实力推", ["shoulders", "full_body"], "肩", "杠铃"),
    exercise("dumbbell_shoulder_press", "哑铃肩推", ["shoulders"], "肩", "哑铃"),
    exercise("machine_shoulder_press", "器械推肩", ["shoulders"], "肩", "器械"),
    exercise("dumbbell_lateral_raise", "哑铃侧平举", ["shoulders"], "中束", "哑铃"),
    exercise("cable_lateral_raise", "绳索侧平举", ["shoulders"], "中束", "绳索"),
    exercise("reverse_pec_deck", "反向蝴蝶机", ["shoulders", "back"], "后束", "器械"),
    exercise("face_pull", "面拉", ["shoulders", "back"], "后束", "绳索"),
    exercise("barbell_squat", "杠铃深蹲", ["legs", "full_body"], "股四头、臀部、腘绳肌", "杠铃", { muscles:"股四头肌、臀大肌、腘绳肌、核心", tips:"站距略宽于髋，脚尖自然外旋 15 到 30 度。吸气收紧腹压，髋膝同步下蹲，膝盖沿脚尖方向移动；下降到大腿至少平行地面，脚掌三点受力后稳定站起。全程保持脊柱中立，避免塌腰、膝内扣和脚跟离地。" }),
    exercise("hack_squat", "哈克深蹲", ["legs"], "股四头", "器械"),
    exercise("leg_press", "腿举", ["legs"], "腿", "器械"),
    exercise("romanian_deadlift", "罗马尼亚硬拉", ["legs", "full_body"], "后链", "杠铃"),
    exercise("leg_extension", "腿屈伸", ["legs"], "股四头", "器械"),
    exercise("leg_curl", "腿弯举", ["legs"], "腘绳肌", "器械"),
    exercise("hip_thrust", "臀推", ["legs"], "臀", "杠铃"),
    exercise("calf_raise", "提踵", ["legs"], "小腿", "器械"),
    allDay("dumbbell_curl", "哑铃弯举", "二头", "哑铃"),
    allDay("hammer_curl", "锤式弯举", "二头", "哑铃"),
    allDay("barbell_curl", "杠铃弯举", "二头", "杠铃"),
    allDay("preacher_curl", "牧师凳弯举", "二头", "器械"),
    allDay("cable_curl", "绳索弯举", "二头", "绳索"),
    allDay("rope_pushdown", "绳索下压", "三头", "绳索"),
    allDay("bar_pushdown", "直杆下压", "三头", "绳索"),
    allDay("overhead_extension", "过顶臂屈伸", "三头", "绳索"),
    allDay("skull_crusher", "仰卧臂屈伸", "三头", "杠铃"),
    exercise("treadmill", "跑步机", ["cardio"], "心肺", "有氧", { icon:"🏃", muscles:"心肺、臀腿", tips:"抬头、收紧核心，步频自然。先以能完整说话的强度热身，再逐步提速。" }),
    exercise("outdoor_run", "户外跑", ["cardio"], "心肺", "有氧", { icon:"🏃", muscles:"心肺、臀腿", tips:"选择平整路线，保持轻快步频。跑前热身，出现疼痛及时停止。" }),
    exercise("bike", "动感单车", ["cardio"], "心肺", "有氧", { icon:"🚴", muscles:"心肺、股四头、臀部", tips:"座椅高度以膝盖微屈为宜，保持脊柱中立，避免耸肩。" }),
    exercise("elliptical", "椭圆机", ["cardio"], "心肺", "有氧", { icon:"◌", muscles:"心肺、臀腿", tips:"双脚稳定踩实踏板，避免膝盖内扣，阻力由低到高调整。" }),
    exercise("rowing_machine", "划船机", ["cardio"], "心肺", "有氧", { icon:"🚣", muscles:"背部、核心、臀腿", tips:"依次发力：腿、躯干、手臂；回程反向进行，保持背部平直。" }),
    exercise("stretch", "拉伸与泡沫轴", ["cardio"], "恢复", "恢复", { icon:"↔", muscles:"全身筋膜与关节活动度", tips:"保持舒适牵拉感，不要弹震。每个位置平稳呼吸 20 到 30 秒。" }),
  ];

  function forDay(day) {
    return exercises.filter(item => item.availableOnAllDays || item.trainingDays.includes(day));
  }

  return { trainingDays, exercises, forDay };
});
