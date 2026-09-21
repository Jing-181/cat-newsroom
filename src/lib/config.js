// 全局配置：与主站 workbench-desktop.html 的 CONFIG 完全一致（数据键、模块定义、快速记录、概览环、每日一句）
import { isoToday, today, avgProgress } from "./utils.js";

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
    { key: "sport", name: "运动健身", icon: "activity", tint: "#f5ead0", color: "var(--module-3)", type: "progress", unit: "分钟", desc: "跑步·力量训练·拉伸",
      seed: [{ id: 41, title: "力量训练", current: 12, target: 20, unit: "分钟", note: "核心 + 上肢，组间休息 60 秒" }, { id: 42, title: "跑步", current: 30, target: 40, unit: "分钟", note: "慢跑热身，配速 6 分半保持心率" }] },
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
