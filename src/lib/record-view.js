// 通用记录视图渲染：记录卡片、模块统计侧栏、模块头部、分页控件（与主站逻辑一致）
import { icon, esc, attr } from "./icons.js";
import { today, avgProgress, streak, ringSVG } from "./utils.js";
import { getData } from "./store.js";

/* per-module hero header: icon + big number + label */
export function headHero(m, big, label) {
  const inner = `<div class="hero-ic" style="background:${m.tint};color:${m.color}">${icon(m.icon, 24)}</div>
    <div class="hero-tx"><div class="hero-row"><span class="hero-v">${big}</span><span class="hero-l">${label}</span></div></div>`;
  if (m.cover) return `<div class="hero has-cover"><div class="hero-bg" style="background-image:url('${attr(m.cover)}')"></div><div class="hero-inner">${inner}</div></div>`;
  return `<div class="hero">${inner}</div>`;
}

export function recHTML(m, x) {
  const pin = `<button class="pin-btn js-pin ${x.pinned ? "on" : ""}" data-id="${x.id}" title="置顶">${icon("star", 15)}</button>`;
  const del = `<button class="del js-del" data-id="${x.id}" title="删除">${icon("trash", 15)}</button>`;
  const drag = `<button class="drag-handle" type="button" draggable="true" aria-label="拖动排序" title="拖动排序">⠿</button>`;
  const acts = `<div class="acts">${drag}${pin}${del}</div>`;
  const chkMark = icon("check", 13, 2.4);
  const customMeta = (m.fields || []).filter(f => x[f.key]).map(f => `<span class="meta-tag">${esc(x[f.key])}</span>`).join("");
  const customBlock = customMeta ? `<div class="meta-line">${customMeta}</div>` : "";
  const layout = x.layout || "default";
  const layoutCls = `rec-layout-${layout}`;
  // 没有上传图时也按模块/样式补一张默认配图。
  const imageSrc = x.image || (typeof RecordMedia !== "undefined" ? RecordMedia.resolveRecordImage(x, m.key, layout) : "");
  const thumb = imageSrc ? `<img class="thumb" src="${attr(imageSrc)}" alt="查看图片">` : "";

  // feature layout: 大图在上 + 标题 + 正文在下 (适合有图记录)
  if (layout === "feature" && imageSrc) {
    const body = (x.content || x.note || "").trim();
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top" data-edit="${x.id}">
      ${thumb}
      <div class="feat-title">${esc(x.title || "无标题")}</div>
      ${body ? `<div class="feat-body">${esc(body)}</div>` : ""}
      ${customBlock ? `<div style="padding:0 16px 14px">${customBlock}</div>` : ""}</div></div>`;
  }
  // quote layout: 大字居中 (适合短文本/灵感/金句)
  if (layout === "quote") {
    const text = (x.content || x.title || "").trim();
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top" data-edit="${x.id}" style="flex-direction:column;align-items:center;text-align:center">
      <div class="quote-text">${esc(text)}</div>
      ${x.mood ? `<div class="quote-meta">${esc(x.mood)}${x.date ? ` · ${esc(x.date)}` : ""}</div>` : (x.date ? `<div class="quote-meta">${esc(x.date)}</div>` : "")}
      ${customBlock ? `<div style="margin-top:8px">${customBlock}</div>` : ""}</div></div>`;
  }

  // default layout
  if (m.type === "todo") {
    const p = (m.priorities || []).find(p => p.key === x.priority);
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top"><div class="chk js-chk ${x.done ? "on" : ""}" data-id="${x.id}">${chkMark}</div>
      ${thumb}
      <div class="body" data-edit="${x.id}"><span class="rname ${x.done ? "done" : ""}">${esc(x.title)}</span>
      ${p ? `<span class="badge" style="background:${p.color};color:${p.text}"><span class="dot"></span>${p.label}</span>` : ""}
      ${x.note ? `<span class="rdate" style="margin-left:0;color:var(--text-tertiary)">${esc(x.note).slice(0, 40)}</span>` : ""}${customBlock}</div></div></div>`; }
  if (m.type === "checkin") {
    const on = !!(x.log && x.log[today()]); const st = streak(x.log);
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top"><div class="chk js-chk ${on ? "on" : ""}" data-id="${x.id}">${chkMark}</div>
      ${thumb}
      <div class="body" data-edit="${x.id}"><span class="rname">${esc(x.title)}</span>
      <span class="streak">${icon("flame", 13)} 连续 ${st} 天</span>${on ? '<span class="badge" style="background:var(--accent-muted);color:var(--accent)">今日已打卡</span>' : ""}${customBlock}</div></div></div>`; }
  if (m.type === "progress") {
    const pct = Math.min(100, Math.round((x.current / x.target) * 100 || 0));
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top">${thumb}<div class="body" data-edit="${x.id}">
      <span class="rname">${esc(x.title)}</span>
      <div class="pbar"><i style="width:${pct}%;background:${m.color}"></i></div>
      <span class="rdate" style="margin-left:0;color:var(--text-secondary)">${x.current}/${x.target} ${x.unit || m.unit || ""} · ${pct}%</span>
      ${x.note ? `<div class="rnote">${esc(x.note)}</div>` : ""}${customBlock}</div></div></div>`; }
  if (m.type === "finance") {
    const inc = x.type === "income";
    return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top">${thumb}<div class="body" data-edit="${x.id}">
      <span class="rname">${esc(x.title)}</span>
      <span class="badge" style="background:var(--surface-nested);color:var(--text-secondary)">${esc(x.category || "其他")}</span>
      <span class="rdate">${x.date || ""}</span>${customBlock}</div>
      <div class="amt ${inc ? "inc" : "exp"}">${inc ? "+" : "-"}¥${x.amount}</div></div></div>`; }
  // note
  return `<div class="rec ${layoutCls}" data-record-id="${x.id}">${acts}<div class="top">${thumb}<div class="body" data-edit="${x.id}">
    <span class="rname">${esc(x.title || "无标题")}</span>
    ${x.mood ? `<span class="badge" style="background:var(--accent-muted);color:var(--accent)">${esc(x.mood)}</span>` : ""}
    ${x.content ? `<span class="rdate" style="margin-left:0;color:var(--text-tertiary)">${esc(x.content).slice(0, 40)}</span>` : ""}
    <span class="rdate">${x.date || ""}</span>${customBlock}</div></div></div>`;
}

// 生成分页控件
export function recordPagerHTML(page) {
  if (page.totalPages <= 1) return "";
  const pages = Array.from({ length: page.totalPages }, (_, index) => index + 1).map(number =>
    `<button type="button" class="${number === page.page ? "on" : ""}" data-record-page="${number}" aria-label="第 ${number} 页">${number}</button>`
  ).join("");
  return `<div class="record-pager" id="record-pager"><button type="button" class="prev" data-record-page="${page.page - 1}" aria-label="上一页" ${page.hasPrev ? "" : "disabled"}>${icon("chevron", 14)}</button>${pages}<span class="record-page-status">${page.page} / ${page.totalPages}</span><button type="button" class="next" data-record-page="${page.page + 1}" aria-label="下一页" ${page.hasNext ? "" : "disabled"}>${icon("chevron", 14)}</button></div>`;
}

/* 模块统计侧栏：按 type 生成多维数据，填满右侧空间 */
export function sideStats(m, all) {
  const t = today();
  const palette = ["var(--accent)", "var(--module-1)", "var(--module-2)", "var(--module-3)", "var(--module-4)", "var(--module-5)", "var(--danger)"];
  const row = (k, v, dot) => `<div class="stat-row"><span class="k">${dot ? `<span class="kd" style="background:${dot}"></span>` : ""}${k}</span><span class="val">${v}</span></div>`;

  if (m.type === "finance") {
    const inc = all.filter(x => x.type === "income").reduce((a, x) => a + +x.amount, 0);
    const exp = all.filter(x => x.type === "expense").reduce((a, x) => a + +x.amount, 0);
    // 支出按分类聚合
    const byCat = {}; all.filter(x => x.type === "expense").forEach(x => { const c = x.category || "其他"; byCat[c] = (byCat[c] || 0) + +x.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const maxC = cats.length ? cats[0][1] : 1;
    const catBars = cats.length ? cats.map((c, i) => `<div class="cbrow"><span class="cbn">${esc(c[0])}</span><span class="cbt"><i style="width:${Math.round(c[1] / maxC * 100)}%;background:${palette[i % palette.length]}"></i></span><span class="cbv">¥${c[1]}</span></div>`).join("")
      : `<div style="color:var(--text-tertiary);font-size:12.5px;padding:6px 0">暂无支出记录</div>`;
    const todayExp = all.filter(x => x.type === "expense" && x.date === t).reduce((a, x) => a + +x.amount, 0);
    return `<div class="side-card"><div class="sh">${icon("wallet", 15)} 收支概况</div>
        ${row("总收入", `<span style="color:var(--module-1)">¥${inc}</span>`)}
        ${row("总支出", `<span style="color:var(--danger)">¥${exp}</span>`)}
        ${row("净结余", `¥${inc - exp}`)}
        ${row("今日支出", `¥${todayExp}`)}
        ${row("总笔数", `${all.length} 笔`)}</div>
      <div class="side-card"><div class="sh">${icon("chart", 15)} 支出分类占比</div><div class="catbar">${catBars}</div></div>`;
  }

  if (m.type === "progress") {
    const p = avgProgress(all);
    const doneN = all.filter(x => ((x.current / x.target) * 100 || 0) >= 100).length;
    const totalCur = all.reduce((a, x) => a + (+x.current || 0), 0);
    const totalTgt = all.reduce((a, x) => a + (+x.target || 0), 0);
    return `<div class="side-card"><div class="sh">${icon("target", 15)} 总体进度</div>
        <div class="side-ring"><div class="dial">${ringSVG(p.value, m.color)}<span class="mid"><span class="big" style="color:${m.color}">${p.value}%</span><span class="cap">平均进度</span></span></div></div></div>
      <div class="side-card"><div class="sh">${icon("list", 15)} 数据统计</div>
        ${row("进行项目", `${all.length} 项`)}
        ${row("已达成", `${doneN} 项`)}
        ${row("累计完成", `${totalCur} ${all[0]?.unit || m.unit || ""}`)}
        ${row("总目标量", `${totalTgt} ${all[0]?.unit || m.unit || ""}`)}</div>`;
  }

  if (m.type === "checkin") {
    const done = all.filter(x => x.log && x.log[t]).length; const pct = all.length ? Math.round(done / all.length * 100) : 0;
    const streaks = all.map(x => ({ title: x.title, s: streak(x.log) })).sort((a, b) => b.s - a.s);
    const best = streaks[0] ? streaks[0].s : 0;
    const list = streaks.slice(0, 6).map(x => `<div class="stat-row"><span class="k">${esc(x.title)}</span><span class="val" style="color:var(--module-3)">${x.s} 天</span></div>`).join("");
    return `<div class="side-card"><div class="sh">${icon("leaf", 15)} 今日打卡</div>
        <div class="side-ring"><div class="dial">${ringSVG(pct, m.color)}<span class="mid"><span class="big" style="color:${m.color}">${done}/${all.length}</span><span class="cap">已完成</span></span></div></div></div>
      <div class="side-card"><div class="sh">${icon("flame", 15)} 连续天数</div>
        ${row("最长连续", `<span style="color:var(--module-3)">${best} 天</span>`)}
        ${row("习惯总数", `${all.length} 个`)}
        <div style="margin-top:6px">${list}</div></div>`;
  }

  if (m.type === "todo") {
    const done = all.filter(x => x.done).length; const pct = all.length ? Math.round(done / all.length * 100) : 0;
    const byP = {}; (m.priorities || []).forEach(p => byP[p.key] = 0); all.forEach(x => { if (byP[x.priority] != null) byP[x.priority]++; });
    const pRows = (m.priorities || []).map(p => `<div class="stat-row"><span class="k"><span class="kd" style="background:${p.text}"></span>${p.label}</span><span class="val">${byP[p.key] || 0} 项</span></div>`).join("");
    return `<div class="side-card"><div class="sh">${icon("list", 15)} 完成情况</div>
        <div class="side-ring"><div class="dial">${ringSVG(pct, m.color)}<span class="mid"><span class="big" style="color:${m.color}">${pct}%</span><span class="cap">${done}/${all.length} 完成</span></span></div></div></div>
      <div class="side-card"><div class="sh">${icon("chart", 15)} 优先级分布</div>
        ${pRows}
        ${row("剩余待办", `${all.length - done} 项`)}</div>`;
  }

  // note
  const todayN = all.filter(x => x.date === t).length;
  const byMood = {}; all.forEach(x => { const md = x.mood || "未分类"; byMood[md] = (byMood[md] || 0) + 1; });
  const moods = Object.entries(byMood).sort((a, b) => b[1] - a[1]);
  const maxM = moods.length ? moods[0][1] : 1;
  const moodBars = moods.length ? moods.map((c, i) => `<div class="cbrow"><span class="cbn">${esc(c[0])}</span><span class="cbt"><i style="width:${Math.round(c[1] / maxM * 100)}%;background:${palette[i % palette.length]}"></i></span><span class="cbv">${c[1]} 条</span></div>`).join("")
    : `<div style="color:var(--text-tertiary);font-size:12.5px;padding:6px 0">暂无记录</div>`;
  return `<div class="side-card"><div class="sh">${icon("pen", 15)} 记录统计</div>
      ${row("累计记录", `${all.length} 条`)}
      ${row("今日新增", `${todayN} 条`)}
      ${row("标签种类", `${moods.length} 种`)}</div>
    <div class="side-card"><div class="sh">${icon("chart", 15)} 标签分布</div><div class="catbar">${moodBars}</div></div>`;
}

// 仅供引用：模块统计侧栏需要实时数据（跨标签/同步后由组件自行重渲染）
export function dataOf() {
  return getData();
}
