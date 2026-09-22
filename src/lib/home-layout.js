// 首页卡片布局清单：供首页按配置顺序渲染、个人配置页排序共用（与主站逻辑一致）
export const HOME_GROUPS = {
  rhythm: { en: "TODAY&nbsp;&nbsp;·&nbsp;&nbsp;RHYTHM", zh: "今日节奏" },
  daily: { en: "DAILY&nbsp;&nbsp;·&nbsp;&nbsp;CARD", zh: "每日一卡" },
  habits: { en: "HABITS&nbsp;&nbsp;&&nbsp;&nbsp;TASKS", zh: "习惯与待办" },
  focus: { en: "FOCUS&nbsp;&nbsp;&&nbsp;&nbsp;MOOD", zh: "专注与状态" },
  growth: { en: "MONEY&nbsp;&nbsp;&&nbsp;&nbsp;GROWTH", zh: "收支与成长" },
  report: { en: "WEEKLY&nbsp;&nbsp;REPORT", zh: "本周生活报" },
};

// key：卡片标识（云端排序存 key 数组）；label：设置页显示名；group：所属分组（组头自动跟随）
export const HOME_CARDS = [
  { key: "clock", label: "时钟问候", group: "rhythm" },
  { key: "focus", label: "今日聚焦", group: "rhythm" },
  { key: "quick", label: "快速记录", group: "rhythm" },
  { key: "overview", label: "今日概览", group: "rhythm" },
  { key: "daily", label: "每日一卡", group: "daily" },
  { key: "habit", label: "本周习惯表", group: "habits" },
  { key: "todo", label: "待办清单", group: "habits" },
  { key: "pomo", label: "专注番茄钟", group: "focus" },
  { key: "trend", label: "心情趋势", group: "focus" },
  { key: "spend", label: "月度开销", group: "growth" },
  { key: "books", label: "在读好书", group: "growth" },
  { key: "goals", label: "本周目标", group: "growth" },
  { key: "report", label: "本周生活报", group: "report" },
];

export const DEFAULT_HOME_ORDER = HOME_CARDS.map(card => card.key);

export function groupOf(key) {
  const card = HOME_CARDS.find(c => c.key === key);
  return card ? card.group : null;
}
