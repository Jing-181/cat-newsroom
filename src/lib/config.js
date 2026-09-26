// 全局配置：与主站 workbench-desktop.html 的 CONFIG 完全一致（数据键、模块定义、快速记录、概览环、每日一句）
import { isoToday, today, avgProgress, localDateKey } from "./utils.js";

// mock 训练记录用的相对日期：n 天前的 ISO 日期，让历史列表和「动作进展」一打开就有内容。
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return localDateKey(d); };
// 运动 seed 里的动作实例统一走这里，字段与 Workout.addExercise 产出的结构保持一致。
const seedExercise = (slot, id, name, bodyPart, equipment, extra, sets) => ({
  id: `seed-exercise-${slot}-${id}`, exercise_id: id, name, body_part: bodyPart, equipment,
  angle: extra.angle || "", icon: extra.icon || name.slice(0, 2),
  muscles: extra.muscles || bodyPart,
  tips: extra.tips || "控制动作节奏，保持躯干稳定；重量以动作质量为先。",
  planned_sets: sets.length,
  sets: sets.map(([weight_kg, reps, rpe]) => ({ weight_kg, reps, rpe, note: "" })),
  note: "",
});
const seedSession = (slot, { title, training_day, days, duration_min, note, exercises }) => ({
  id: `seed-workout-${slot}`, schema_version: 2, kind: "workout_session", status: "completed",
  title, training_day, date: daysAgo(days), duration_min, note: note || "",
  updated_at: new Date().toISOString(), exercises,
});

export const CONFIG = {
  storageKey: "cat-newsroom-data-v2",   // 桌面与手机版共享数据
  owner: "猫咪生活报",                  // 侧栏顶部标题
  slogan: "Cat Life Daily",

  // 每日一句（一周七天各一句，按星期轮换：周一→周日）
  quotes: [
    "新的一周，像小猫伸个懒腰，精神抖擞地开始。",   // 周一
    "稳步前行，猫步虽小，日积月累便走得很远。",       // 周二
    "把大目标拆成小块，一口一口吃，像猫吃鱼一样耐心。", // 周三
    "坚持到一半最难，想想窗台上晒太阳的猫，它从不放弃。", // 周四
    "收个尾，给这周一个漂亮收场，猫儿也会在脚边蹭蹭你。", // 周五
    "允许自己慢下来，猫的一天大半在打盹，那也是正经事。", // 周六
    "复盘一下，猫回头看看自己的脚印，为下周留点方向。",   // 周日
  ],

  // 今日概览环形（value 为 0-100 的完成度，calc 返回 {value, sub}）
  overview: [
    { key: "todo", label: "待办事项", icon: "list", color: "var(--accent)",
      calc: d => { const it = d.todo || []; const done = it.filter(x => x.done).length; return { value: it.length ? Math.round(done / it.length * 100) : 0, sub: `${done}/${it.length} 项` }; } },
    { key: "checkin", label: "打卡", icon: "leaf", color: "var(--module-1)",
      calc: d => { const it = d.checkin || []; const t = today(); const done = it.filter(x => x.log && x.log[t]).length; return { value: it.length ? Math.round(done / it.length * 100) : 0, sub: `${done}/${it.length} 项` }; } },
    { key: "read", label: "阅读", icon: "book", color: "var(--module-2)", calc: d => avgProgress(d.read) },
    { key: "sport", label: "运动", icon: "activity", color: "var(--module-3)", calc: d => avgProgress(d.sport) },
  ],

  // 本周状态趋势（真实数据：读取用户填写的 __trend，7 个数字；没有就留空）
  trend: {
    title: "本周状态趋势", unit: "分",
    series: d => (Array.isArray(d.__trend) && d.__trend.length === 7) ? d.__trend : [],
  },

  // 快速记录按钮（点了直接给对应模块新建）
  quickAdd: [
    { label: "记运动", icon: "activity", module: "sport", tint: "#f5ead0", color: "var(--module-3)" },
    { label: "记打卡", icon: "check", module: "checkin", tint: "#e8efd8", color: "var(--module-1)" },
    { label: "记一笔", icon: "wallet", module: "money", tint: "#f0e6d0", color: "var(--module-4)" },
    { label: "写日记", icon: "pen", module: "note", tint: "#dfeae2", color: "var(--module-5)" },
  ],

  // ============ 模块定义 ============
  modules: [
    { key: "todo", name: "待办事项", icon: "list", tint: "#f5e8cf", color: "var(--accent)", type: "todo", desc: "待办清单与进度追踪",
      priorities: [{ key: "P0", label: "重要", color: "#f0dccd", text: "#b8482e" }, { key: "P1", label: "一般", color: "#f5e8cf", text: "#c47128" }, { key: "P2", label: "随手", color: "#e8efd8", text: "#5c7a3e" }],
      seed: [{ id: 11, title: "给猫主子换水换粮", priority: "P0", done: false, note: "记得检查自动喂食器余量" },
             { id: 12, title: "整理本周工作纪要", priority: "P1", done: false, note: "" },
             { id: 13, title: "铲猫砂 + 梳毛 10min", priority: "P2", done: true, note: "" }] },
    { key: "checkin", name: "习惯打卡", icon: "leaf", tint: "#e8efd8", color: "var(--module-1)", type: "checkin", desc: "日常习惯·猫咪照料·每日打卡",
      seed: [{ id: 21, title: "喂猫粮 + 换水", log: {} }, { id: 22, title: "铲猫砂", log: {} }, { id: 23, title: "陪猫玩耍 15min", log: {} }] },
    { key: "read", name: "阅读进度", icon: "book", tint: "#f5e8cf", color: "var(--module-2)", type: "progress", unit: "页", desc: "书籍进度·摘录·想法",
      seed: [{ id: 31, title: "《猫的优雅》", current: 128, target: 240, unit: "页", note: "了解猫的行为语言，和主子更好地沟通" }, { id: 32, title: "《认知觉醒》", current: 90, target: 300, unit: "页", note: "专注力训练，每天早晚各读 30 分钟" }] },
    { key: "sport", name: "运动健身", icon: "activity", tint: "#f5ead0", color: "var(--module-3)", type: "workout", desc: "力量训练·有氧·拉伸，按组记录",
      // seed 全部是 workout_session v2：与 Workout.createSession / addExercise 产出的结构一致。
      // 同一天里安排两次胸日，是为了让「动作进展」一打开就能看到卧推重量从 18kg 涨到 22.5kg。
      seed: [
        seedSession("chest-1", {
          title: "胸日", training_day: "chest", days: 20, duration_min: 50,
          note: "先把卧推的动作轨迹练稳，重量慢慢加。",
          exercises: [
            seedExercise("chest-1", "dumbbell_bench_press", "哑铃卧推", "胸", "哑铃", { angle: "水平", icon: "卧推", muscles: "胸大肌、三角肌前束、肱三头肌" },
              [[18, 10, 8], [18, 10, 8], [18, 8, 9]]),
            seedExercise("chest-1", "pec_deck", "蝴蝶机夹胸", "胸", "器械", { icon: "蝴蝶", muscles: "胸大肌、前锯肌" },
              [[30, 12, 8], [30, 12, 8], [30, 10, 9]]),
          ],
        }),
        seedSession("chest-2", {
          title: "胸日", training_day: "chest", days: 6, duration_min: 55,
          note: "卧推 +2.5kg，最后一组有点吃力但姿势没散。",
          exercises: [
            seedExercise("chest-2", "dumbbell_bench_press", "哑铃卧推", "胸", "哑铃", { angle: "水平", icon: "卧推", muscles: "胸大肌、三角肌前束、肱三头肌" },
              [[22.5, 10, 8], [22.5, 9, 9], [22.5, 8, 9]]),
            seedExercise("chest-2", "cable_fly_mid", "绳索夹胸（中位）", "胸", "绳索", { icon: "中夹", muscles: "胸大肌中束、前锯肌" },
              [[15, 12, 8], [15, 12, 8], [15, 10, 9]]),
          ],
        }),
        seedSession("legs-1", {
          title: "腿日", training_day: "legs", days: 2, duration_min: 62,
          note: "深蹲先稳定站距，腿举最后一组降到 10 次。",
          exercises: [
            seedExercise("legs-1", "barbell_squat", "杠铃深蹲", "股四头、臀部、腘绳肌", "杠铃", { icon: "深蹲", muscles: "股四头肌、臀大肌、腘绳肌、核心" },
              [[60, 8, 8], [60, 8, 8], [60, 6, 9]]),
            seedExercise("legs-1", "leg_press", "腿举", "腿", "器械", { icon: "腿举", muscles: "股四头肌、臀大肌、腘绳肌" },
              [[100, 12, 8], [100, 12, 8], [100, 10, 9]]),
          ],
        }),
        seedSession("cardio-1", {
          title: "有氧恢复", training_day: "cardio", days: 1, duration_min: 35,
          note: "慢跑把心率压在能说话的强度，收尾做拉伸。",
          exercises: [
            { id: "seed-exercise-cardio-1-treadmill", exercise_id: "treadmill", name: "跑步机", body_part: "心肺", equipment: "有氧", angle: "", icon: "跑步",
              muscles: "心肺、臀腿", tips: "抬头、收紧核心，步频自然。先以能完整说话的强度热身，再逐步提速。",
              planned_sets: 1, sets: [{ duration_min: 30, distance_km: 4.5, pace: "6'40\"", rpe: 7, note: "" }], note: "" },
            { id: "seed-exercise-cardio-1-stretch", exercise_id: "stretch", name: "拉伸与泡沫轴", body_part: "恢复", equipment: "恢复", angle: "", icon: "拉伸",
              muscles: "全身筋膜与关节活动度", tips: "保持舒适牵拉感，不要弹震。每个位置平稳呼吸 20 到 30 秒。",
              planned_sets: 1, sets: [{ duration_min: 5, distance_km: 0, pace: "", rpe: "", note: "" }], note: "" },
          ],
        }),
      ] },
    { key: "money", name: "记账本", icon: "wallet", tint: "#f0e6d0", color: "var(--module-4)", type: "finance", desc: "收入·支出·分类·月度占比",
      categories: ["餐饮", "交通", "购物", "猫物", "居家", "娱乐", "工资", "其他"],
      seed: [{ id: 51, title: "猫粮 5kg", type: "expense", amount: 168, category: "猫物", date: isoToday() },
             { id: 52, title: "午餐", type: "expense", amount: 32, category: "餐饮", date: isoToday() },
             { id: 53, title: "稿费", type: "income", amount: 800, category: "工资", date: isoToday() }] },
    { key: "note", name: "猫咪日记", icon: "pen", tint: "#dfeae2", color: "var(--module-5)", type: "note", desc: "日常记录·灵感·心情",
      moods: ["开心", "平静", "低落", "焦虑", "疲惫"],
      seed: [{ id: 61, title: "今天的小确幸", content: "橘座又趴在键盘上不让我打字了，但这次它把头枕在我手腕上打呼噜，心都化了。", mood: "开心", date: isoToday() }] },
    { key: "hot", name: "今日收藏", icon: "flame", tint: "#f0dccd", color: "var(--danger)", type: "note", desc: "好文收藏·稍后阅读·灵感剪报",
      moods: ["收藏", "稍后读", "已读"],
      seed: [{ id: 71, title: "猫为什么喜欢盒子？", content: "研究表明，盒子给猫提供安全感和封闭空间，能显著降低压力水平。", mood: "收藏", date: isoToday() }] },
  ],
};

export function modOf(key) {
  return CONFIG.modules.find(m => m.key === key);
}
