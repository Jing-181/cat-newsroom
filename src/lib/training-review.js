// 训练周复盘：读云端只读视图 training_reports_feed，只渲染，不生成、不轮询、不调 Edge Function。
// 生成方是 Hana 的每周一 07:30 定时任务；前端这里只做「取一期、画一张卡、导出一份 md」。
import { esc } from "./icons.js";
import Trace from "./trace.js";
import {
  normalizeReports, resolveReport, formatPeriod, formatGeneratedAt,
  resolveViewState, hasPayloadContent,
} from "./training-review-utils.js";

const FEED_VIEW = "training_reports_feed";
const FEED_SELECT = "week_start,week_end,payload,markdown,generated_at";
// 同一次页面初始化只拉一次：切模块回来（首页 ↔ 洞察）在 5 分钟内复用同一份数据
const CACHE_MS = 5 * 60 * 1000;
// 请求失败不缓存 5 分钟：30 秒后进页面再试一次（render 会反复调 init，靠这个冷却挡风暴）
const RETRY_MS = 30 * 1000;
const EMPTY_HINT = "还没有训练复盘，每周一 07:30 会自动生成。这之前可以先去「运动健身」补记本周训练。";
// 首页摘要态没有可摘要内容时的空态：仍是一张空卡壳，不拼半张卡
const COMPACT_EMPTY_HINT = "这一期还没有可摘要的内容，完整复盘在「洞察复盘」。";
// 摘要态只取指标表前几行（首页信息密度上限，全文看洞察页）
const COMPACT_METRIC_ROWS = 3;

let reports = null;        // null = 从未加载成功；[] = 视图为空
let loadedAt = 0;          // 最近一次成功拉取的时间戳
let loading = false;
let error = "";
let selectedWeek = null;   // 用户在下拉里选的周；两处槽位共用，切换模块后保持同一期
let requestSeq = 0;

// 与经典脚本的契约：只借同一份 Project URL 与 publishable key，不在前端复制第二份配置。
// supabase-sync.js 的 SUPABASE_CONFIG 是顶层 const（不挂 window），所以那边用同名函数交出来。
function supabaseConfig() {
  const config = window.getSupabaseConfig?.();
  return config && config.url && config.anonKey ? config : null;
}

async function fetchReports() {
  const config = supabaseConfig();
  if (!config) throw new Error("同步配置未就绪");
  const query = new URLSearchParams({ select: FEED_SELECT, order: "week_start.desc" });
  const response = await fetch(`${config.url}/rest/v1/${FEED_VIEW}?${query}`, {
    headers: { apikey: config.anonKey, Accept: "application/json" },
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(15000)
      : undefined,
  });
  if (!response.ok) throw new Error(`读取训练复盘失败（HTTP ${response.status}）`);
  return normalizeReports(await response.json());
}

// 拉取：失败不清空已有数据，只记下错误；视图为空是空态，不是错误
async function load(container, options = {}) {
  const seq = ++requestSeq;
  loading = true;
  paint(container, options);
  try {
    const next = await fetchReports();
    if (seq !== requestSeq) return;
    reports = next;
    error = "";
    // 选中的周在新数据里不存在（比如被删）时回落到最新一期
    if (selectedWeek && !next.some(report => report.weekStart === selectedWeek)) selectedWeek = null;
  } catch (e) {
    if (seq !== requestSeq) return;
    error = e && e.message ? e.message : "读取训练复盘失败";
  } finally {
    if (seq === requestSeq) {
      // 失败也打时间戳：视图重新渲染（订阅刷新）时不必再打一次，等冷却后再试
      loadedAt = Date.now();
      loading = false;
      // 拉取期间可能已经切到另一个模块：两个槽位一起重画，别让后者停在“正在读取”
      paintAll();
    }
  }
}

function headHTML(report) {
  const period = report ? formatPeriod(report.weekStart, report.weekEnd) : "";
  const generated = report ? formatGeneratedAt(report.generatedAt) : "";
  const meta = [period, generated ? `生成于 ${generated}` : ""].filter(Boolean).join(" · ");
  return `<div class="report-head"><h3>训练周复盘</h3>${meta ? `<span class="report-meta">${esc(meta)}</span>` : ""}</div>`;
}

// limit > 0 时只渲染前 limit 行（首页摘要态用），表头四列不变
function metricsHTML(metrics, limit = 0) {
  if (!metrics.length) return "";
  const cell = value => esc(value || "—");
  const rows = (limit > 0 ? metrics.slice(0, limit) : metrics).map(row => `<tr><th scope="row">${esc(row.label || "—")}</th><td>${cell(row.week)}</td><td>${cell(row.prev)}</td><td class="delta">${cell(row.delta)}</td></tr>`).join("");
  return `<table class="review-table"><thead><tr><th scope="col">指标</th><th scope="col">本周</th><th scope="col">上周</th><th scope="col">变化</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sectionsHTML(sections) {
  return sections.map(section => {
    const items = `<ul class="report-text">${section.items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>`;
    const title = section.title || "本周小结";
    return `<details class="report-day" open><summary>${esc(title)}</summary>${items}</details>`;
  }).join("");
}

function suggestionsHTML(suggestions) {
  if (!suggestions.length) return "";
  return `<div class="report-day"><div class="report-text"><b>下周提示</b></div><ul class="report-text">${suggestions.map(item => `<li>${esc(item)}</li>`).join("")}</ul></div>`;
}

// 往期选择：按 week_start 倒序（数据层已排好），选中值由 selectedWeek 决定
function historyHTML(list) {
  if (list.length < 2) return "";
  const current = resolveReport(list, selectedWeek);
  const options = list.map(report => {
    const label = formatPeriod(report.weekStart, report.weekEnd) || report.weekStart;
    return `<option value="${esc(report.weekStart)}"${report.weekStart === current.weekStart ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
  return `<div class="report-history"><label for="training-review-history">往期</label><select id="training-review-history">${options}</select></div>`;
}

function actionsHTML(report) {
  if (!report.markdown) return "";
  return `<div class="report-actions"><span class="report-export"><button id="training-review-export" type="button">导出 Markdown</button></span></div>`;
}

// 摘要态入口：跳洞察页看完整复盘，动作由挂载方通过 onMore 注入（这一层不认识路由）
function moreHTML() {
  return `<div class="report-more-row"><button id="training-review-more" class="report-more" type="button">看全文</button></div>`;
}

// compact：首页摘要态（结论 + 前三行指标 + 看全文）；不传即洞察页完整态。
// 两种形态由这一个参数决定，不落模块级状态：同一份数据、两处槽位各自独立
function readyHTML(report, list, compact) {
  const payload = report.payload;
  if (compact) {
    // 没有结论也没有指标：不拼半张卡，走空态壳
    if (!payload.conclusion && !payload.metrics.length) {
      return `${headHTML(report)}<div class="shared-empty">${COMPACT_EMPTY_HINT}</div>`;
    }
    const lead = payload.conclusion
      ? `<div class="report-text review-conclusion">${esc(payload.conclusion)}</div>`
      : "";
    return `${headHTML(report)}${lead}${metricsHTML(payload.metrics, COMPACT_METRIC_ROWS)}${moreHTML()}`;
  }
  const conclusion = payload.conclusion
    ? `<div class="report-text review-conclusion">${esc(payload.conclusion)}</div>`
    : "";
  const body = hasPayloadContent(payload)
    ? conclusion + metricsHTML(payload.metrics) + sectionsHTML(payload.sections) + suggestionsHTML(payload.suggestions)
    : `<div class="report-text">这一期只有归档原文，点下方导出 Markdown 查看完整复盘。</div>`;
  return `${headHTML(report)}${body}${actionsHTML(report)}${historyHTML(list)}`;
}

function cardHTML(compact = false) {
  // 首帧还没发起请求时也算「正在读取」，避免先闪一下空态文案
  const pending = loading || (reports === null && !loadedAt);
  const state = resolveViewState({ loading: pending, reports });
  if (state === "loading") {
    return `<div class="tile b12 report-card">${headHTML(null)}<div class="report-text">正在读取训练复盘…</div></div>`;
  }
  if (state === "empty") {
    // 请求失败也走空态：不弹窗、不显示空卡片，只用一行小字说清原因
    const hint = error
      ? `${EMPTY_HINT}<br><span class="review-note">本次读取失败：${esc(error)}</span>`
      : EMPTY_HINT;
    return `<div class="tile b12 report-card">${headHTML(null)}<div class="shared-empty">${hint}</div></div>`;
  }
  const report = resolveReport(reports, selectedWeek);
  return `<div class="tile b12 report-card">${readyHTML(report, reports, compact)}</div>`;
}

// options.compact：首页摘要态（默认完整态，洞察页不需要传）
export function trainingReviewSlotHTML(options = {}) {
  const compact = options && options.compact === true;
  // b12：首页 12 列 bento 网格里占满整行；洞察页是块级插入，grid-column 不生效，无副作用
  // 摘要与否不进 DOM 属性：形态只由这里的 html 字符串决定，paintOne 按容器记住的 options 重画
  return `<div id="training-review-slot" class="b12">${cardHTML(compact)}</div>`;
}

function exportMarkdown(report) {
  if (!report || !report.markdown) return;
  const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `training-weekly-${report.weekStart}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// 已经绑过事件的插槽：视图 render() 会重建插槽元素，只有同一个元素才需要去重
const wiredSlots = new WeakSet();
// 当前挂着槽位的容器（首页、洞察页）→ 该容器的挂载参数：拉取结束时逐个重画，各自按自己的形态渲染
const mountedContainers = new Map();

function paintOne(container) {
  const slot = container.querySelector("#training-review-slot");
  if (!slot) return;
  const options = mountedContainers.get(container) || {};
  const html = cardHTML(options.compact === true);
  if (slot.innerHTML !== html) {
    slot.innerHTML = html;
    wiredSlots.delete(slot); // 子节点整块换新，旧监听器跟着没了
  }
  if (wiredSlots.has(slot)) return;
  wiredSlots.add(slot);
  slot.querySelector("#training-review-export")?.addEventListener("click", () => {
    exportMarkdown(resolveReport(reports, selectedWeek));
  });
  slot.querySelector("#training-review-history")?.addEventListener("change", event => {
    const value = event.target && event.target.value;
    if (!value) return;
    selectedWeek = value;
    paintAll();
  });
  slot.querySelector("#training-review-more")?.addEventListener("click", () => {
    // 只记「点了看全文」与是哪一期；不量滚动位置（要另挂滚动测量，不值当）
    Trace.track("report_more_click", { week_start: String(resolveReport(reports, selectedWeek)?.weekStart || "") });
    const onMore = mountedContainers.get(container)?.onMore;
    if (typeof onMore === "function") onMore();
  });
}

function paint(container = document, options = {}) {
  mountedContainers.set(container, options);
  paintOne(container);
}

function paintAll() {
  mountedContainers.forEach((options, container) => {
    // 视图卸载后元素会脱离文档，顺手从集合里清掉，避免一直攥着旧 DOM
    if (container.isConnected === false) { mountedContainers.delete(container); return; }
    paintOne(container);
  });
}

// 初始化：两处槽位（首页 report 卡片、洞察页底部）共用这一份模块级状态。
// 5 分钟内不重复请求；数据没变时整块 HTML 相同，paint 不会重排，切模块也就不闪。
// options.compact：首页摘要态；options.onMore：摘要态「看全文」的动作（挂载方给路由，这一层不认识视图）
export async function initTrainingReview(container = document, options = {}) {
  const fresh = Date.now() - loadedAt < (error ? RETRY_MS : CACHE_MS);
  if (!fresh && !loading) {
    await load(container, options);
    return;
  }
  paint(container, options);
}
