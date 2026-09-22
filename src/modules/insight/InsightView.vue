<script setup>
// 洞察复盘：各模块进展一览 + 本周生活报（与主站逻辑一致）
import { ref, onMounted, onBeforeUnmount } from "vue";
import { CONFIG } from "../../lib/config.js";
import { icon } from "../../lib/icons.js";
import { today, dateStr, avgProgress } from "../../lib/utils.js";
import { getData, subscribe } from "../../lib/store.js";
import { weeklyReportSlotHTML, initWeeklyReport, exportWeeklyReport } from "../../lib/weekly-report.js";

const emit = defineEmits(["navigate"]);
const root = ref(null);

function render() {
  const cards = CONFIG.modules.map(m => {
    const it = getData()[m.key] || []; let main = "", pct = 0;
    if (m.type === "todo") { main = `${it.filter(x => x.done).length}/${it.length} 已完成`; pct = it.length ? Math.round(it.filter(x => x.done).length / it.length * 100) : 0; }
    else if (m.type === "checkin") { const t = today(); main = `今日 ${it.filter(x => x.log && x.log[t]).length}/${it.length} 打卡`; pct = it.length ? Math.round(it.filter(x => x.log && x.log[t]).length / it.length * 100) : 0; }
    else if (m.type === "progress") { pct = avgProgress(it).value; main = `平均进度 ${pct}%`; }
    else if (m.type === "finance") { const e = it.filter(x => x.type === "expense").reduce((a, x) => a + +x.amount, 0); const inc = it.filter(x => x.type === "income").reduce((a, x) => a + +x.amount, 0); main = `收 ¥${inc} · 支 ¥${e}`; }
    else main = `${it.length} 条记录`;
    return `<div class="pin" data-open="${m.key}" style="cursor:pointer">
      <span class="pin-ic" style="color:${m.color};background:${m.tint};border-color:transparent">${icon(m.icon, 19)}</span>
      <div class="pin-b"><div class="pin-t">${m.name}</div><div class="pin-m">${main}</div>
      ${["progress", "todo", "checkin"].includes(m.type) ? `<div class="hero-bar" style="margin-top:9px"><i style="width:${pct}%;background:${m.color}"></i></div>` : ""}</div>
      <span class="arw" style="color:var(--text-tertiary)">${icon("chevron", 16, 2)}</span></div>`;
  }).join("");
  root.value.innerHTML = `<div class="header"><div><h2>洞察</h2><p>各模块进展一览 · 记录—执行—统计—反馈</p></div><div class="spacer"></div><span class="date-chip">${icon("calendar", 14)} ${dateStr()}</span></div>
    <div class="sec-title">模块概况</div><div class="pin-list pin-list-3">${cards}</div>`;
  root.value.querySelectorAll("[data-open]").forEach(el => el.onclick = () => emit("navigate", el.dataset.open));
  root.value.insertAdjacentHTML("beforeend", weeklyReportSlotHTML());
  initWeeklyReport(root.value);
}

let unsub = null;
onMounted(() => { render(); unsub = subscribe(render); });
onBeforeUnmount(() => { if (unsub) unsub(); });
</script>

<template>
  <div ref="root"></div>
</template>
