// AI 本周生活报：状态机（生成/轮询/错误）、往期历史查看、历史周补生成、卡片渲染与导出（与主站逻辑一致）
import { esc } from "./icons.js";
import { currentWeekStart, todayKey, buildWeekSeries, buildWeekOptions, buildWeekOverview, weekOptionsHTML, weekOptionLabel, buildSnapshotStatText } from "./weekly-report-utils.js";

let weeklyReport = null, weeklyReportMeta = null, weeklyReportLoading = false, weeklyReportWaiting = false,
  weeklyReportError = "", weeklyReportRequestSeq = 0;
let weeklyReportOptions = [];   // 可选周（含未生成/失败/生成中），渲染下拉框
let weeklyReportViewWeek = null; // 正在查看的周（null = 本周）
let weeklyReportTargetWeek = null; // 正在生成的目标周（null = 本周）

function historySelectHTML() {
  if (weeklyReportOptions.length <= 1) return "";
  return weekOptionsHTML(weeklyReportOptions, weeklyReportViewWeek || "");
}

// 未生成时的本周概览：用本地数据统计，让卡片在周中不空着
function weekOverviewHTML() {
  const start = currentWeekStart();
  const overview = buildWeekOverview(window.data || {}, start, todayKey());
  const yuan = value => "¥" + Math.round(value || 0).toLocaleString("zh-CN");
  const items = [];
  if (overview.todoTotal) items.push(`待办 ${overview.todoDone}/${overview.todoTotal}`);
  if (overview.checkinCount) items.push(`打卡 ${overview.checkinCount} 次`);
  if (overview.workoutCount) items.push(`运动 ${overview.workoutCount} 次`);
  if (overview.income || overview.expenses) items.push(`收 ${yuan(overview.income)} · 支 ${yuan(overview.expenses)}`);
  if (overview.noteCount) items.push(`笔记 ${overview.noteCount} 条`);
  if (overview.hotCount) items.push(`收藏 ${overview.hotCount} 条`);
  if (!items.length) return `<div class="report-text">本周（${esc(start)} 起）还没有记录，动动手记录一下生活吧。</div>`;
  return `<div class="report-text"><b>本周数据（${esc(start)} 起）</b><br>${esc(items.join(" · "))}</div>`;
}

export function weeklyReportTileHTML() {
  if (weeklyReportLoading || weeklyReportWaiting) {
    const week = weeklyReportTargetWeek || currentWeekStart();
    return `<div class="tile b12 report-card"><h3>生活报生成中</h3><div class="report-text">正在生成 ${esc(week)} 周的生活报，AI 生成较慢，稍后刷新页面或点击下方按钮查看。</div><div class="report-actions"><button class="primary" id="report-check">检查结果</button></div></div>`;
  }
  if (weeklyReportError) {
    const errWeek = weeklyReportTargetWeek || currentWeekStart();
    return `<div class="tile b12 report-card"><h3>${errWeek === currentWeekStart() ? "本周生活报" : "生活报生成失败"}</h3><div class="report-text">${esc(weeklyReportError)}</div><div class="report-actions"><button class="primary" id="report-generate">重新生成</button></div></div>`;
  }
  if (!weeklyReport) {
    const user = window.getCurrentUser?.();
    const anonymous = user?.is_anonymous || !user;
    const notice = anonymous ? "登录正式账号后生成本周生活报。" : `数据截至 ${esc(todayKey())}，周末生成可得到完整周报。`;
    return `<div class="tile b12 report-card"><h3>本周生活报</h3>${anonymous ? "" : weekOverviewHTML()}<div class="report-text">${notice}</div><div class="report-actions">${anonymous ? '<button class="primary" id="report-login">登录账号</button>' : '<button class="primary" id="report-generate">生成本周生活报</button>'}</div>${historySelectHTML()}</div>`;
  }
  const days = (weeklyReport.daily || []).map(function (day) { return `<details class="report-day"><summary>${esc(day.date || "本日")} · ${esc(day.title || "生活记录")}</summary><div class="report-text">${esc(day.summary || "")} ${esc(day.quote || "")}</div></details>`; }).join("");
  const review = weeklyReport.review || {};
  const insight = weeklyReport.insight || {};
  const list = items => (items || []).length ? `<ul class="report-text">${(items || []).map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : `<div class="report-text">暂无足够数据。</div>`;
  const metaText = weeklyReportMeta?.generated_at ? `生成于 ${new Date(weeklyReportMeta.generated_at).toLocaleString()}${weeklyReportMeta.model ? " · " + weeklyReportMeta.model : ""}${weeklyReportMeta.provider ? " · " + weeklyReportMeta.provider : ""}` : "AI 主编";
  const statText = buildSnapshotStatText(weeklyReportMeta?.source_snapshot?.summary);
  const metaHTML = `${esc(metaText)}${statText ? "<br>" + esc(statText) : ""}`;
  const isPast = !!weeklyReportViewWeek;
  const viewLabel = isPast ? `往期生活报 · ${esc(weeklyReportViewWeek)} 周` : "本周生活报";
  const primaryActions = isPast
    ? '<button id="report-current" class="primary">返回本周</button><button id="report-regenerate">重新生成</button>'
    : '<button id="report-refresh" class="primary">重新生成</button>';
  const exportActions = '<span class="report-export"><button id="report-export-md">导出 Markdown</button><button id="report-export-json">导出 JSON</button></span>';
  return `<div class="tile b12 report-card"><div class="report-head"><h3>${viewLabel}</h3><span class="report-meta">${metaHTML}</span></div><div class="report-text">${esc(weeklyReport.editor_note || review.overview || "")}</div>${days}<details class="report-day" open><summary>AI 分析洞察</summary><div class="report-text"><b>行为模式</b></div>${list(insight.patterns)}<div class="report-text"><b>风险提示</b></div>${list(insight.risks)}<div class="report-text"><b>下一步行动</b></div>${list(insight.next_actions)}</details><details class="report-day"><summary>查看本周复盘</summary><div class="report-text">亮点：${esc((review.highlights || []).join("、"))}<br>未完成：${esc((review.unfinished || []).join("、"))}<br>下周建议：${esc((review.suggestions || []).join("、"))}</div></details><div class="report-actions">${primaryActions}${exportActions}</div>${historySelectHTML()}</div>`;
}

export function weeklyReportSlotHTML() {
  // b12：在首页 12 列 bento 网格中占满整行，避免排序后周报被压缩成窄条（洞察页为块级插入，grid-column 不生效，无副作用）
  return `<div id="weekly-report-slot" class="b12">${weeklyReportTileHTML()}</div>`;
}

export function refreshWeeklyReportSlot(container = document) {
  const slot = container.querySelector("#weekly-report-slot");
  if (!slot) return;
  // 重绘前记录已展开的日报详情，切换周后恢复，避免折叠状态丢失
  const openDetails = new Set();
  slot.querySelectorAll("details.report-day[open]").forEach(detail => {
    const summary = detail.querySelector("summary");
    if (summary) openDetails.add(summary.textContent);
  });
  slot.innerHTML = weeklyReportTileHTML();
  slot.querySelectorAll("details.report-day").forEach(detail => {
    const summary = detail.querySelector("summary");
    if (summary && openDetails.has(summary.textContent)) detail.open = true;
  });
  const reportButton = slot.querySelector("#report-generate, #report-refresh");
  if (reportButton) reportButton.onclick = () => maybeGenerateWeeklyReport(true);
  slot.querySelector("#report-check")?.addEventListener("click", () => checkWeeklyReportResult(weeklyReportTargetWeek || currentWeekStart()));
  slot.querySelector("#report-regenerate")?.addEventListener("click", () => {
    if (weeklyReportViewWeek) maybeGenerateWeeklyReport(true, weeklyReportViewWeek);
  });
  slot.querySelector("#report-login")?.addEventListener("click", () => openAuthModalRef.current?.("login"));
  slot.querySelector("#report-export-md")?.addEventListener("click", () => exportWeeklyReport("md"));
  slot.querySelector("#report-export-json")?.addEventListener("click", () => exportWeeklyReport("json"));
  slot.querySelector("#report-current")?.addEventListener("click", viewCurrentWeek);
  slot.querySelector("#report-history")?.addEventListener("change", event => {
    const value = event.target && event.target.value;
    if (!value) return;
    const option = weeklyReportOptions.find(item => item.weekStart === value);
    if (!option) return;
    if (option.state === "ready") viewWeeklyReport(value);
    else if (option.state === "generating") checkWeeklyReportResult(value);
    else confirmGenerateWeek(option);
  });
}

// 补生成历史周：未生成/失败周先确认再进入生成状态机
async function confirmGenerateWeek(option) {
  const reason = option.report?.error ? `，上次失败原因：${option.report.error}` : "";
  const message = option.state === "error"
    ? `该周生活报之前生成失败${reason}。点击确定重新生成。`
    : `该周尚未生成生活报，点击确定开始生成（数据不足的日期会写成轻量鼓励）。`;
  const ok = await window.AppDialog?.confirm(message, { title: `补生成 ${option.weekStart} 周生活报`, okText: "开始生成" });
  if (ok) maybeGenerateWeeklyReport(true, option.weekStart);
}

// 初始化：拉取当周已存周报 + 往期列表（生成过的周报一直保留，可随时查看）
export async function initWeeklyReport(container = document) {
  await Promise.all([fetchWeeklyReportList(), fetchWeeklyReportCurrent()]);
  refreshWeeklyReportSlot(container);
}

async function fetchWeeklyReportCurrent() {
  weeklyReport = null; weeklyReportMeta = null; weeklyReportViewWeek = null; weeklyReportError = ""; weeklyReportWaiting = false;
  try {
    const result = await window.generateWeeklyReport({ action: "fetch" });
    if (result && result.report) {
      weeklyReport = result.report;
      weeklyReportMeta = result.meta;
    } else if (result?.meta?.status === "generating") {
      weeklyReportWaiting = true;
      weeklyReportTargetWeek = currentWeekStart();
    }
  } catch (error) {
    weeklyReportError = error && error.message ? error.message : "加载生活报失败";
  }
}

// 拉取周列表 + 最早记录周，构建可补生成的下拉选项（未生成/失败周也可点击生成）
async function fetchWeeklyReportList() {
  try {
    const result = await window.generateWeeklyReport({ action: "list" });
    const reports = Array.isArray(result && result.reports) ? result.reports : [];
    const series = buildWeekSeries({ earliestWeekStart: result.earliest_week_start || null, currentWeekStart: currentWeekStart() });
    weeklyReportOptions = buildWeekOptions({
      series,
      readyReports: reports.filter(report => report.status === "ready"),
      errorReports: reports.filter(report => report.status === "error"),
      generatingReports: reports.filter(report => report.status === "generating"),
    });
  } catch (_) {
    weeklyReportOptions = [];
  }
}

export async function viewWeeklyReport(weekStart) {
  if (!weekStart) return;
  try {
    const result = await window.generateWeeklyReport({ action: "fetch", week_start: weekStart });
    if (result && result.report) {
      weeklyReport = result.report;
      weeklyReportMeta = result.meta;
      weeklyReportViewWeek = weekStart;
      weeklyReportWaiting = false;
    } else if (result?.meta?.status === "generating") {
      weeklyReportWaiting = true;
      weeklyReportTargetWeek = weekStart;
    }
  } catch (_) { /* 拉取失败保留当前视图 */ }
  refreshWeeklyReportSlot();
}

// 生成中由用户主动检查结果：重新拉取该周，ready 后展示，仍在生成则保持提示
export async function checkWeeklyReportResult(week) {
  if (!week) return;
  weeklyReportLoading = true; refreshWeeklyReportSlot();
  try {
    const result = await window.generateWeeklyReport({ action: "fetch", week_start: week });
    if (result && result.report) {
      weeklyReport = result.report;
      weeklyReportMeta = result.meta;
      weeklyReportViewWeek = week !== currentWeekStart() ? week : null;
      weeklyReportWaiting = false;
      weeklyReportError = "";
      fetchWeeklyReportList();
    } else if (result?.meta?.status === "generating") {
      weeklyReportWaiting = true;
      weeklyReportTargetWeek = week;
    }
  } catch (_) { /* 保留当前状态 */ }
  weeklyReportLoading = false;
  refreshWeeklyReportSlot();
}

export async function viewCurrentWeek() {
  await fetchWeeklyReportCurrent();
  refreshWeeklyReportSlot();
}

// 延迟绑定 openAuthModal，避免周报模块与登录模块互相依赖
export const openAuthModalRef = { current: null };

// 生成状态机：发出生成请求后不轮询，后端在生成中则提示用户刷新页面或点「检查结果」查看
export async function maybeGenerateWeeklyReport(force = false, targetWeek = null) {
  const user = window.getCurrentUser?.();
  if (!user || user.is_anonymous || weeklyReportLoading) return;
  const nowWeek = currentWeekStart();
  if (force) {
    weeklyReportTargetWeek = targetWeek || weeklyReportTargetWeek || nowWeek;
    weeklyReportError = ""; weeklyReportRequestSeq += 1;
  }
  const week = weeklyReportTargetWeek || nowWeek;
  const requestSeq = weeklyReportRequestSeq;
  weeklyReportLoading = true; refreshWeeklyReportSlot();
  try {
    const result = await window.generateWeeklyReport({ force: !!force, week_start: week });
    if (requestSeq !== weeklyReportRequestSeq) return;
    weeklyReportMeta = result.meta || weeklyReportMeta;
    if (result.status === "generating" && !result.report) {
      weeklyReportWaiting = true;
      weeklyReportTargetWeek = week;
    } else {
      weeklyReportWaiting = false;
      weeklyReportError = "";
      weeklyReport = result.report || null;
      if (weeklyReport) {
        weeklyReportViewWeek = week !== nowWeek ? week : null;
        fetchWeeklyReportList();
      }
    }
  } catch (e) {
    if (requestSeq === weeklyReportRequestSeq) { weeklyReportWaiting = false; weeklyReportError = e.message || "AI 生活报生成失败"; }
    if (force) await window.AppDialog?.alert(weeklyReportError, { title: "周报生成失败" });
  } finally {
    if (requestSeq === weeklyReportRequestSeq) { weeklyReportLoading = false; refreshWeeklyReportSlot(); }
  }
}

export function exportWeeklyReport(format) {
  if (!weeklyReport) return;
  const insight = weeklyReport.insight || {};
  const text = format === "json" ? JSON.stringify(weeklyReport, null, 2)
    : [weeklyReport.editor_note || "", ...(weeklyReport.daily || []).map(d => `## ${d.date || ""} ${d.title || ""}\n${d.summary || ""}\n${d.quote || ""}`),
       `## AI 分析洞察\n行为模式：${(insight.patterns || []).join("、")}\n风险提示：${(insight.risks || []).join("、")}\n下一步行动：${(insight.next_actions || []).join("、")}`,
       `## 本周复盘\n${weeklyReport.review?.overview || ""}`].join("\n\n");
  const blob = new Blob([text], { type: format === "json" ? "application/json" : "text/markdown" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `cat-life-weekly-report.${format === "json" ? "json" : "md"}`; a.click(); URL.revokeObjectURL(a.href);
}
