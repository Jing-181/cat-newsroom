// 仅控制入口与展示，不删除模块、记录或旧排序配置。
export const COLLAPSED_MODULE_KEYS = ["checkin", "read"];
export function isPrimaryModule(key) {
  return key !== "money" && !COLLAPSED_MODULE_KEYS.includes(key);
}

// 首页卡片布局清单：供首页按配置顺序渲染、个人配置页排序共用
export const HOME_GROUPS = {
  rhythm: { en: "TODAY&nbsp;&nbsp;·&nbsp;&nbsp;RHYTHM", zh: "今日节奏" },
  daily: { en: "DAILY&nbsp;&nbsp;·&nbsp;&nbsp;CARD", zh: "每日一卡" },
  habits: { en: "TASKS", zh: "事项" },
  focus: { en: "FOCUS&nbsp;&nbsp;&&nbsp;&nbsp;MOOD", zh: "专注与状态" },
  growth: { en: "TRAINING", zh: "运动" },
  report: { en: "TRAINING&nbsp;&nbsp;REVIEW", zh: "训练复盘" },
};

// key：卡片标识（云端排序存 key 数组）；label：设置页显示名；group：所属分组（组头自动跟随）
export const HOME_CARDS = [
  { key: "clock", label: "时钟问候", group: "rhythm" },
  { key: "focus", label: "今日聚焦", group: "rhythm" },
  { key: "quick", label: "快速记录", group: "rhythm" },
  { key: "overview", label: "今日概览", group: "rhythm" },
  { key: "daily", label: "每日一卡", group: "daily" },
  { key: "todo", label: "事项清单", group: "habits" },
  { key: "pomo", label: "专注番茄钟", group: "focus" },
  { key: "trend", label: "心情趋势", group: "focus" },
  { key: "goals", label: "本周目标", group: "growth" },
  { key: "report", label: "训练周复盘", group: "report" },
];

export const DEFAULT_HOME_ORDER = HOME_CARDS.map(card => card.key);

// 手机首屏先给「今天能做的事」：时钟→快速记录→今日聚焦→事项，
// 概览、每日一卡、趋势这些「看」的往后排。
// 只在用户没有自定义排序时使用；已保存的顺序（含云端拉回来的）一律优先，不覆盖。
export const DEFAULT_HOME_ORDER_MOBILE = [
  "clock", "quick", "focus", "todo",
  "overview", "daily", "pomo", "trend", "goals", "report",
];

// 保留自定义的相对顺序，旧配置中的收起卡片只过滤展示、不回写删除。
export function visibleHomeOrder(order, fallback = DEFAULT_HOME_ORDER) {
  const visible = new Set(DEFAULT_HOME_ORDER);
  const filtered = Array.isArray(order) ? [...new Set(order.filter(key => visible.has(key)))] : [];
  return filtered.length ? filtered : [...fallback];
}

export function groupOf(key) {
  const card = HOME_CARDS.find(c => c.key === key);
  return card ? card.group : null;
}
