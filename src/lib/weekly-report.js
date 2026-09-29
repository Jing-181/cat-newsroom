// AI 本周生活报：状态机（生成/轮询/错误）、往期历史查看、历史周补生成、卡片渲染与导出（与主站逻辑一致）
import { esc } from "./icons.js";
import { currentWeekStart, todayKey, buildWeekSeries, buildWeekOptions, buildWeekOverview, weekOptionsHTML, weekOptionLabel } from "./weekly-report-utils.js";

let weeklyReport = null, weeklyReportMeta = null, weeklyReportLoading = false, weeklyReportWaiting = false,
  weeklyReportError = "", weeklyReportPolls = 0, weeklyReportRequestSeq = 0, weeklyReportTimer = null;
let weeklyReportOptions = [];   // 可选周（含未生成/失败），渲染下拉框
let weeklyReportViewWeek = null; // 正在查看的周（null = 本周）
let weeklyReportTargetWeek = null; // 正在生成的目标周（null = 本周）

function historySelectHTML() {
  if (weeklyReportOptions.length <= 1) return "";
  return weekOptionsHTML(weeklyReportOptions, weeklyReportViewWeek || "");
}

// 未生成时的本周概览：用本地数据统计，让卡片在周中不空着
function weekOverviewHTML() {
  const overview = buildWeekOverview(window.data || {}, currentWeekStart(), todayKey());
  const yuan = value => "¥" + Math.round(value || 0).toLocaleString("zh-CN");
  const items = [];
  if (overview.todoTotal) items.push(`待办 ${overview.todoDone}/${overview.todoTotal}`);
  if (overview.checkinCount) items.push(`打卡 ${overview.checkinCount} 次`);
  if (overview.workoutCount) items.push(`运动 ${overview.workoutCount} 次`);
  if (overview.income || overview.expenses) items.push(`收 ${yuan(overview.income)} · 支 ${yuan(overview.expenses)}`);
  if (overview.noteCount) items.push(`笔记 ${overview.noteCount} 条`);
  if (overview.hotCount) items.push(`收藏 ${overview.hotCount} 条`);
  if (!items.length) return `<div class="report-text">本周还没有记录，动动手记录一下生活吧。</div>`;
  return `<div class="report-text">${esc(items.join(" · "))}</div>`;
}

export function weeklyReportTileHTML() {
  if (weeklyReportLoading || weeklyReportWaiting) {
    const week = weeklyReportTargetWeek || currentWeekStart();
    return `<div class="tile b12 report-card"><h3>生活报生成中</h3><div class="report-text">正在生成 ${esc(week)} 周的生活报，完成后会自动显示…</div></div>`;
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
  const isPast = !!weeklyReportViewWeek;
  const viewLabel = isPast ? `往期生活报 · ${esc(weeklyReportViewWeek)} 周` : "本周生活报";
  return `<div class="tile b12 report-card"><div class="report-head"><h3>${viewLabel}</h3><span class="report-meta">${esc(metaText)}</span></div><div class="report-text">${esc(weeklyReport.editor_note || review.overview || "")}</div>${days}<details class="report-day" open><summary>AI 分析洞察</summary><div class="report-text"><b>行为模式</b></div>${list(insight.patterns)}<div class="report-text"><b>风险提示</b></div>${list(insight.risks)}<div class="report-text"><b>下一步行动</b></div>${list(insight.next_actions)}</details><details class="report-day"><summary>查看本周复盘</summary><div class="report-text">亮点：${esc((review.highlights || []).join("、"))}<br>未完成：${esc((review.unfinished || []).join("、"))}<br>下周建议：${esc((review.suggestions || []).join("、"))}</div></details><div class="report-actions">${isPast ? '<button id="report-current" class="primary">返回本周</button>' : '<button id="report-refresh" class="primary">重新生成</button>'}<button id="report-export-md">导出 Markdown</button><button id="report-export-json">导出 JSON</button></div>${isPast ? "" : historySelectHTML()}</div>`;
}

export function weeklyReportSlotHTML() {
  // b12：在首页 12 列 bento 网格中占满整行，避免排序后周报被压缩成窄条（洞察页为块级插入，grid-column 不生效，无副作用）
  return `<div id="weekly-report-slot" class="b12">${weeklyReportTileHTML()}</div>`;
}

export function refreshWeeklyReportSlot(container = document) {
  const slot = container.querySelector("#weekly-report-slot");
  if (!slot) return;
  slot.innerHTML = weeklyReportTileHTML();
  const reportButton = slot.querySelector("#report-generate, #report-refresh");
  if (reportButton) reportButton.onclick = () => maybeGenerateWeeklyReport(true);
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
  if (ok) maybeGenerateWeeklyReport(true, false, option.weekStart);
}

// 初始化：拉取当周已存周报 + 往期列表（生成过的周报一直保留，可随时查看）
export async function initWeeklyReport(container = document) {
  await Promise.all([fetchWeeklyReportList(), fetchWeeklyReportCurrent()]);
  refreshWeeklyReportSlot(container);
}

async function fetchWeeklyReportCurrent() {
  weeklyReport = null; weeklyReportMeta = null; weeklyReportViewWeek = null; weeklyReportError = "";
  try {
    const result = await window.generateWeeklyReport({ action: "fetch" });
    if (result && result.report) {
      weeklyReport = result.report;
      weeklyReportMeta = result.meta;
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
    }
  } catch (_) { /* 拉取失败保留当前视图 */ }
  refreshWeeklyReportSlot();
}

export async function viewCurrentWeek() {
  await fetchWeeklyReportCurrent();
  refreshWeeklyReportSlot();
}

// 延迟绑定 openAuthModal，避免周报模块与登录模块互相依赖
export const openAuthModalRef = { current: null };

export async function maybeGenerateWeeklyReport(force = false, isPoll = false, targetWeek = null) {
  const user = window.getCurrentUser?.();
  if (!force && !isPoll) return;
  if (!user || user.is_anonymous || weeklyReportLoading) return;
  const nowWeek = currentWeekStart();
  if (force) {
    weeklyReportTargetWeek = targetWeek || weeklyReportTargetWeek || nowWeek;
    weeklyReportPolls = 0; weeklyReportError = ""; weeklyReportRequestSeq += 1;
    if (weeklyReportTimer) { clearTimeout(weeklyReportTimer); weeklyReportTimer = null; }
  }
  const week = weeklyReportTargetWeek || nowWeek;
  const requestSeq = weeklyReportRequestSeq;
  weeklyReportLoading = true; refreshWeeklyReportSlot();
  try {
    const result = await window.generateWeeklyReport({ force: !!force, week_start: week });
    if (requestSeq !== weeklyReportRequestSeq) return;
    weeklyReportMeta = result.meta || weeklyReportMeta;
    weeklyReportWaiting = result.status === "generating" && !result.report;
    if (weeklyReportWaiting && weeklyReportPolls < 4) {
      weeklyReportPolls += 1;
      weeklyReportTimer = setTimeout(() => { weeklyReportTimer = null; maybeGenerateWeeklyReport(false, true); }, Math.min(10000, 3000 + weeklyReportPolls * 750));
    } else if (weeklyReportWaiting) {
      weeklyReportWaiting = false; weeklyReportError = "生成时间较长，请稍后手动重试。";
    } else {
      weeklyReportPolls = 0; weeklyReportError = ""; weeklyReport = result.report || null;
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
