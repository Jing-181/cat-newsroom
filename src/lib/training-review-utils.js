// 训练周复盘的纯逻辑：周期排序、payload 字段降级、空态判定（不碰 DOM，可单测）
// 数据来自云端只读视图 training_reports_feed；前端只读，不生成、不格式化数字。
// metrics 的 week / prev / delta 都是 Hana 侧格式化好的字符串（含单位），这里只做类型兜底，不改写内容。

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 任意值转成可渲染文本：字符串去首尾空格，数字/布尔转字符串，其余（对象、数组、null）视为缺失
function asText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

// 日期规范化：只接受 YYYY-MM-DD（视图里 date 列就是这种形态），其余视为缺失
function asDateKey(value) {
  if (typeof value === "string" && WEEK_PATTERN.test(value.trim())) return value.trim();
  return "";
}

// 指标对照表：缺字段的单元格留空，由渲染层补占位符
export function normalizeMetrics(metrics) {
  if (!Array.isArray(metrics)) return [];
  return metrics
    .map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = {
        label: asText(item.label),
        week: asText(item.week),
        prev: asText(item.prev),
        delta: asText(item.delta),
      };
      const empty = !row.label && !row.week && !row.prev && !row.delta;
      return empty ? null : row;
    })
    .filter(Boolean);
}

// 分节：条目非字符串或空串时丢掉，没有条目的节也丢掉（只剩标题的节渲染出来只是一行空话）
export function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map(section => {
      if (!section || typeof section !== "object" || Array.isArray(section)) return null;
      const items = Array.isArray(section.items) ? section.items.map(asText).filter(Boolean) : [];
      return items.length ? { title: asText(section.title), items } : null;
    })
    .filter(Boolean);
}

// payload 降级：四个字段全部可能缺失，缺失一律落到空态而不是抛错
export function normalizePayload(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    conclusion: asText(source.conclusion),
    metrics: normalizeMetrics(source.metrics),
    sections: normalizeSections(source.sections),
    suggestions: Array.isArray(source.suggestions) ? source.suggestions.map(asText).filter(Boolean) : [],
  };
}

// 单期降级：没有 week_start 的行无法定位、也无法命名导出文件，直接丢弃
export function normalizeReport(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const weekStart = asDateKey(row.week_start);
  if (!weekStart) return null;
  return {
    weekStart,
    weekEnd: asDateKey(row.week_end),
    generatedAt: asText(row.generated_at),
    markdown: typeof row.markdown === "string" ? row.markdown : "",
    payload: normalizePayload(row.payload),
  };
}

// 周期排序：week_start 倒序（最新在前），同周按生成时间倒序兜底
export function normalizeReports(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeReport)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.weekStart !== b.weekStart) return a.weekStart < b.weekStart ? 1 : -1;
      return String(b.generatedAt).localeCompare(String(a.generatedAt));
    });
}

// 选中周不存在（或没选）时回落到最新一期
export function resolveReport(reports, weekStart = null) {
  if (!Array.isArray(reports) || !reports.length) return null;
  if (weekStart) {
    const hit = reports.find(report => report.weekStart === weekStart);
    if (hit) return hit;
  }
  return reports[0];
}

// 周期文案：任一端缺失就只显示另一端，都缺则空串（渲染层据此隐藏 meta）
export function formatPeriod(weekStart, weekEnd) {
  const start = asDateKey(weekStart);
  const end = asDateKey(weekEnd);
  if (start && end) return `${start} ~ ${end}`;
  return start || end;
}

// 生成时间：按本地时区格式化成 YYYY-MM-DD HH:mm，非法值返回空串
export function formatGeneratedAt(value) {
  const text = asText(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 视图状态：加载中 / 有数据 / 空态。
// error 只影响卡内文案，不参与状态判定：请求失败与视图为空走同一个空态壳，页面不弹窗、不报错。
export function resolveViewState({ loading = false, reports = null } = {}) {
  const hasData = Array.isArray(reports) && reports.length > 0;
  if (hasData) return "ready"; // 已有数据时后台重拉/失败都不清空页面
  if (loading) return "loading";
  return "empty";
}

// 这一期是否有结构化内容：全空时渲染层给一句降级提示，而不是留一张空卡片
export function hasPayloadContent(payload) {
  if (!payload) return false;
  return !!(
    payload.conclusion ||
    (payload.metrics && payload.metrics.length) ||
    (payload.sections && payload.sections.length) ||
    (payload.suggestions && payload.suggestions.length)
  );
}
