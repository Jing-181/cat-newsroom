<script setup>
// 通用模块视图引擎：按 CONFIG 类型渲染头部、搜索、记录列表、统计侧栏与分页（与主站逻辑一致）
// 待办/打卡/阅读/记账/日记/收藏 六个业务模块各自包装此引擎并传入自己的 module-key
import { ref, onMounted, onBeforeUnmount } from "vue";
import { modOf } from "../lib/config.js";
import { icon } from "../lib/icons.js";
import { today, dateStr, streak } from "../lib/utils.js";
import { getData, persist, subscribe } from "../lib/store.js";
import { recHTML, sideStats, headHero, recordPagerHTML } from "../lib/record-view.js";
import { openEditor, confirmDelete } from "../lib/editor.js";

const props = defineProps({ moduleKey: { type: String, required: true } });
const root = ref(null);

const RECORD_PAGE_SIZE = 20;
let searchQ = "";
let recordPage = 1;
let composing = false;

function mod() { return modOf(props.moduleKey); }

// 仅刷新受搜索影响的记录列表与计数，不重建搜索框（避免打断中文输入法）
function renderResults() {
  const m = mod();
  const all = window.RecordList.sortNewest(getData()[props.moduleKey] || []);
  const q = searchQ.trim().toLowerCase();
  const it = q ? all.filter(x => (x.title || "").toLowerCase().includes(q) || (x.note || x.content || "").toLowerCase().includes(q)) : all;
  const page = window.RecordList.paginate(it, recordPage, RECORD_PAGE_SIZE);
  recordPage = page.page;
  const body = page.items.length ? page.items.map(x => recHTML(m, x)).join("")
    : `<div class="empty"><span class="e">${icon(m.icon, 28)}</span><div>${q ? "没有匹配的记录" : "还没有记录，点右上角「新建」添加第一条吧"}</div></div>`;
  const grid = root.value.querySelector(".rec-grid"); if (grid) grid.innerHTML = body;
  const cnt = root.value.querySelector("#rec-count"); if (cnt) cnt.textContent = `${it.length} 条`;
  const pager = root.value.querySelector("#record-pager"); if (pager) pager.outerHTML = recordPagerHTML(page);
  wireModule();
}

// 更新模块头部摘要（勾选后即时刷新）
function updateModuleSummary() {
  const module = mod();
  const items = getData()[props.moduleKey] || [];
  const value = module.type === "todo"
    ? items.filter(item => item.done).length
    : items.filter(item => item.log && item.log[today()]).length;
  const total = items.length;
  const percent = total ? Math.round(value / total * 100) : 0;
  const valueEl = root.value.querySelector(".hero-v"); if (valueEl) valueEl.textContent = `${value}/${total}`;
  const bar = root.value.querySelector(".hero-bar i"); if (bar) bar.style.width = `${percent}%`;
}

function wireModule() {
  const m = mod();
  const scope = root.value;
  scope.querySelectorAll(".js-chk").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const x = (getData()[props.moduleKey]).find(i => i.id == el.dataset.id);
    if (m.type === "todo") x.done = !x.done;
    else if (m.type === "checkin") { x.log = x.log || {}; const t = today(); x.log[t] ? delete x.log[t] : x.log[t] = true; }
    persist(props.moduleKey, x, { render: false });
    el.classList.toggle("on", m.type === "todo" ? !!x.done : !!(x.log && x.log[today()]));
    el.closest(".rec")?.querySelector(".rname")?.classList.toggle("done", !!x.done);
    updateModuleSummary();
  });
  scope.querySelectorAll("[data-edit]").forEach(el => el.onclick = () => openEditor(props.moduleKey, (getData()[props.moduleKey]).find(i => i.id == el.dataset.edit)));
  // 点击卡片图片弹出完整原图，不触发展开编辑
  scope.querySelectorAll(".rec .thumb").forEach(img => img.onclick = e => {
    e.stopPropagation();
    window.RecordMedia?.openImageViewer?.(img.getAttribute("src") || img.src);
  });
  scope.querySelectorAll(".js-del").forEach(el => el.onclick = e => { e.stopPropagation(); confirmDelete(props.moduleKey, el.dataset.id); });
  scope.querySelectorAll(".js-pin").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const x = (getData()[props.moduleKey]).find(i => i.id == el.dataset.id);
    x.pinned = !x.pinned; persist(props.moduleKey, x);
  });
  window.RecordList.wireDrag(scope.querySelector(".rec-grid") || scope, (movingId, targetId, after) => {
    const data = getData();
    data[props.moduleKey] = window.RecordList.reorder(data[props.moduleKey] || [], movingId, targetId, after);
    window.store.save();
    data[props.moduleKey].forEach(record => window.syncRecord?.({ moduleKey: props.moduleKey, record }));
    render();
  });
  scope.querySelectorAll("#record-pager [data-record-page]").forEach(button => button.addEventListener("click", () => {
    if (button.disabled) return;
    recordPage = Number(button.dataset.recordPage) || 1;
    renderResults();
  }));
}

function render() {
  const m = mod();
  const all = window.RecordList.sortNewest(getData()[props.moduleKey] || []);
  let it = all;
  const t = today();
  const q = searchQ.trim().toLowerCase();
  if (q) it = all.filter(x => (x.title || "").toLowerCase().includes(q) || (x.note || x.content || "").toLowerCase().includes(q));

  let head = "";
  if (m.type === "finance") {
    const inc = all.filter(x => x.type === "income").reduce((a, x) => a + +x.amount, 0);
    const exp = all.filter(x => x.type === "expense").reduce((a, x) => a + +x.amount, 0);
    head = `<div class="mod-summary">
      <div class="mini"><div class="l">收入</div><div class="v" style="color:var(--module-1)">¥${inc}</div></div>
      <div class="mini"><div class="l">支出</div><div class="v" style="color:var(--danger)">¥${exp}</div></div>
      <div class="mini"><div class="l">结余</div><div class="v">¥${inc - exp}</div></div>
      <div class="mini"><div class="l">笔数</div><div class="v">${all.length}</div></div></div>`;
  } else if (m.type === "todo") {
    const done = all.filter(x => x.done).length;
    head = headHero(m, `${done}/${all.length}`, "已完成");
  } else if (m.type === "checkin") {
    const done = all.filter(x => x.log && x.log[t]).length;
    head = headHero(m, `${done}/${all.length}`, "今日已打卡");
  } else if (m.type === "progress") {
    const p = avgProgressOf(all);
    head = headHero(m, `${p.value}%`, `平均进度 · ${all.length} 项`);
  } else if (m.type === "note") {
    const todayN = all.filter(x => x.date === t).length;
    head = headHero(m, `${all.length}`, `条记录 · 今日 ${todayN} 条`, null);
  }

  const page = window.RecordList.paginate(it, recordPage, RECORD_PAGE_SIZE);
  recordPage = page.page;
  const body = page.items.length ? page.items.map(x => recHTML(m, x)).join("")
    : `<div class="empty"><span class="e">${icon(m.icon, 28)}</span><div>${q ? "没有匹配的记录" : "还没有记录，点右上角「新建」添加第一条吧"}</div></div>`;

  root.value.innerHTML = `<div class="header"><div><h2>${m.name}</h2><p>${m.desc}</p></div><div class="spacer"></div><span class="date-chip">${icon("calendar", 14)} ${dateStr()}</span></div>
    <div class="toolbar">
      <div class="search-box">${icon("search", 15, 2.2)}<input id="search" placeholder="搜索…" value="${attr(searchQ)}"/></div>
      <div class="spacer"></div><button class="btn" id="btn-new">${icon("plus", 16, 2.2)}新建</button></div>
    ${head}
    <div class="mod-layout">
      <div class="mod-main">
        <div class="sec-title">全部记录 <span id="rec-count" style="margin-left:auto;font-weight:500;color:var(--text-secondary);font-size:12px">${it.length} 条</span></div>
        <div class="rec-grid">${body}</div>${recordPagerHTML(page)}
      </div>
      <aside class="mod-side">${sideStats(m, all)}</aside>
    </div>`;
  const s = root.value.querySelector("#search");
  const refresh = () => { searchQ = s.value; renderResults(); };
  s.addEventListener("compositionstart", () => { composing = true; });
  s.addEventListener("compositionend", () => { composing = false; refresh(); });
  s.addEventListener("input", () => { if (!composing) refresh(); });
  root.value.querySelector("#btn-new").onclick = () => openEditor(props.moduleKey, null);
  wireModule();
}

function avgProgressOf(list) {
  if (!list || !list.length) return { value: 0, sub: "0" };
  const progress = list.filter(x => x.target != null);
  const v = progress.length ? Math.round(progress.reduce((s, x) => s + Math.min(100, (x.current / x.target) * 100 || 0), 0) / progress.length) : 0;
  return { value: v, sub: `${progress.length} 项` };
}

function attr(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

let unsub = null;
onMounted(() => {
  render();
  unsub = subscribe(render);
});
onBeforeUnmount(() => { if (unsub) unsub(); });
</script>

<template>
  <div ref="root" class="module-view"></div>
</template>
