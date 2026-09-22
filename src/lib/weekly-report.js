// AI 本周生活报：状态机（生成/轮询/错误）、往期历史查看、卡片渲染与导出（与主站逻辑一致）
import { esc } from "./icons.js";

let weeklyReport = null, weeklyReportMeta = null, weeklyReportLoading = false, weeklyReportWaiting = false,
  weeklyReportError = "", weeklyReportPolls = 0, weeklyReportRequestSeq = 0, weeklyReportTimer = null;
let weeklyReportList = [];       // 往期已生成列表
let weeklyReportViewWeek = null; // 正在查看的周（null = 本周）

function historySelectHTML() {
  if (weeklyReportList.length <= 1) return "";
  const options = weeklyReportList.map(r => `<option value="${esc(r.week_start)}">${esc(r.week_start)} ~ ${esc(r.week_end)}</option>`).join("");
  return `<div class="report-history"><label for="report-history">往期生活报</label><select id="report-history"><option value="">选择往期</option>${options}</select></div>`;
}

export function weeklyReportTileHTML() {
  if (weeklyReportLoading || weeklyReportWaiting) return `<div class="report-card"><h3>本周生活报</h3><div class="report-text">正在生成，完成后会自动显示…</div></div>`;
  if (weeklyReportError) return `<div class="report-card"><h3>本周生活报</h3><div class="report-text">${esc(weeklyReportError)}</div><div class="report-actions"><button class="primary" id="report-generate">重新生成</button></div></div>`;
  if (!weeklyReport) {
    const user = window.getCurrentUser?.();
    return `<div class="report-card"><h3>本周生活报</h3><div class="report-text">${user?.is_anonymous || !user ? "登录正式账号后生成本周生活报。" : "准备好了，可以生成本周生活报。"}</div><div class="report-actions">${user?.is_anonymous || !user ? '<button class="primary" id="report-login">登录账号</button>' : '<button class="primary" id="report-generate">生成本周生活报</button>'}</div>${historySelectHTML()}</div>`;
  }
  const days = (weeklyReport.daily || []).map(function (day) { return `<details class="report-day"><summary>${esc(day.date || "本日")} · ${esc(day.title || "生活记录")}</summary><div class="report-text">${esc(day.summary || "")} ${esc(day.quote || "")}</div></details>`; }).join("");
  const review = weeklyReport.review || {};
  const insight = weeklyReport.insight || {};
  const list = items => (items || []).length ? `<ul class="report-text">${(items || []).map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : `<div class="report-text">暂无足够数据。</div>`;
  const metaText = weeklyReportMeta?.generated_at ? `生成于 ${new Date(weeklyReportMeta.generated_at).toLocaleString()}${weeklyReportMeta.model ? " · " + weeklyReportMeta.model : ""}${weeklyReportMeta.provider ? " · " + weeklyReportMeta.provider : ""}` : "AI 主编";
  const isPast = !!weeklyReportViewWeek;
  const viewLabel = isPast ? `往期生活报 · ${esc(weeklyReportViewWeek)} 周` : "本周生活报";
  return `<div class="report-card"><div class="report-head"><h3>${viewLabel}</h3><span class="report-meta">${esc(metaText)}</span></div><div class="report-text">${esc(weeklyReport.editor_note || review.overview || "")}</div>${days}<details class="report-day" open><summary>AI 分析洞察</summary><div class="report-text"><b>行为模式</b></div>${list(insight.patterns)}<div class="report-text"><b>风险提示</b></div>${list(insight.risks)}<div class="report-text"><b>下一步行动</b></div>${list(insight.next_actions)}</details><details class="report-day"><summary>查看本周复盘</summary><div class="report-text">亮点：${esc((review.highlights || []).join("、"))}<br>未完成：${esc((review.unfinished || []).join("、"))}<br>下周建议：${esc((review.suggestions || []).join("、"))}</div></details><div class="report-actions">${isPast ? '<button id="report-current" class="primary">返回本周</button>' : '<button id="report-refresh" class="primary">重新生成</button>'}<button id="report-export-md">导出 Markdown</button><button id="report-export-json">导出 JSON</button></div>${isPast ? "" : historySelectHTML()}</div>`;
}

export function weeklyReportSlotHTML() {
  return `<div id="weekly-report-slot">${weeklyReportTileHTML()}</div>`;
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
    if (value) viewWeeklyReport(value);
  });
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

async function fetchWeeklyReportList() {
  try {
    const result = await window.generateWeeklyReport({ action: "list" });
    weeklyReportList = Array.isArray(result && result.reports) ? result.reports : [];
  } catch (_) {
    weeklyReportList = [];
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

export async function maybeGenerateWeeklyReport(force = false, isPoll = false) {
  const user = window.getCurrentUser?.();
  if (!force && !isPoll) return;
  if (!user || user.is_anonymous || weeklyReportLoading) return;
  if (force) {
    weeklyReportPolls = 0; weeklyReportError = ""; weeklyReportRequestSeq += 1;
    if (weeklyReportTimer) { clearTimeout(weeklyReportTimer); weeklyReportTimer = null; }
  }
  const requestSeq = weeklyReportRequestSeq;
  weeklyReportLoading = true; refreshWeeklyReportSlot();
  try {
    const result = await window.generateWeeklyReport({ force: !!force });
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
      if (weeklyReport) { weeklyReportViewWeek = null; fetchWeeklyReportList(); }
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
