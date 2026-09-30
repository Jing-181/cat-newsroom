<script setup>
// 首页 Bento 仪表盘：今日概览/习惯追踪/待办/番茄钟/趋势/开销/在读/周报（与主站逻辑一致）
import { ref, onMounted, onBeforeUnmount } from "vue";
import { CONFIG, modOf } from "../../lib/config.js";
import { icon, esc } from "../../lib/icons.js";
import { today, dateStr, weekDates, weekNum, streak, grp, ringSVG, trendSVG, pad2 } from "../../lib/utils.js";
import { getData, persist, save, subscribe } from "../../lib/store.js";
import { openEditor } from "../../lib/editor.js";
import { pomo, ensurePomodoroController, pomoUpdate } from "../../lib/pomodoro.js";
import { weeklyReportSlotHTML, initWeeklyReport } from "../../lib/weekly-report.js";
import { dailyCopySlotHTML, initDailyCopy } from "../../lib/daily-copy.js";
import { HOME_GROUPS, HOME_CARDS, DEFAULT_HOME_ORDER, groupOf } from "../../lib/home-layout.js";
import { trendCellsHTML, wireTrendCells } from "../../lib/week-state.js";

const emit = defineEmits(["navigate"]);
const root = ref(null);
let clockTimer = null;
let homeOrderConfig = null; // 云端排序配置；null = 使用默认顺序

function go(key) { emit("navigate", key); }
function data() { return getData(); }

/* 今日聚焦：跨模块置顶任务（就地交互，不跳转） */
function focusTileHTML() {
  const pins = [];
  CONFIG.modules.forEach(m => (data()[m.key] || []).forEach(x => { if (x.pinned) pins.push({ m, x }); }));
  const chk = icon("check", 13, 2.6);
  const sub = (m, x) => {
    if (m.type === "checkin") return `${m.name} · 连续 ${streak(x.log)} 天`;
    if (m.type === "progress") { const p = Math.min(100, Math.round((x.current / x.target) * 100 || 0)); return `${m.name} · ${x.current}/${x.target} ${x.unit || m.unit || ""} · ${p}%`; }
    return m.name;
  };
  const ctl = (m, x) => {
    if (m.type === "checkin") { const on = !!(x.log && x.log[today()]); return `<div class="pin-chk js-pin-chk ${on ? "on" : ""}" data-mkey="${m.key}" data-id="${x.id}">${chk}</div>`; }
    if (m.type === "todo") { return `<div class="pin-chk js-pin-chk ${x.done ? "on" : ""}" data-mkey="${m.key}" data-id="${x.id}">${chk}</div>`; }
    if (m.type === "progress") { return `<div class="pin-step"><button class="js-pin-dec" data-mkey="${m.key}" data-id="${x.id}">−</button><button class="js-pin-inc" data-mkey="${m.key}" data-id="${x.id}">+</button></div>`; }
    return `<span style="color:var(--text-tertiary)">${icon("chevron", 16, 2)}</span>`;
  };
  const rows = pins.length ? pins.map(({ m, x }) => `<div class="focus-row">
      <span class="fic" style="color:${m.color}">${icon(m.icon, 16)}</span>
      <div class="ft js-pin-open" data-mkey="${m.key}" data-id="${x.id}"><div class="fn ${(m.type === "todo" && x.done) ? "done" : ""}">${esc(x.title)}</div><div class="fm">${sub(m, x)}</div></div>
      ${ctl(m, x)}</div>`).join("")
    : `<div class="focus-empty">在任意模块点击 <span style="display:inline-flex;color:var(--module-3);vertical-align:-2px">${icon("star", 13)}</span> 即可把要事置顶到这里。</div>`;
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("star", 16)}</span><div class="tt"><span class="en">TODAY'S FOCUS</span><span class="zh">今日聚焦</span></div><span class="r">${pins.length} 项</span></div>
    <div class="focus-list">${rows}</div></div>`;
}

/* 快速记录 */
function quickTileHTML() {
  const quick = CONFIG.quickAdd.map(q => `<button class="qbtn" data-quick="${q.module}"><span class="e" style="background:${q.tint};color:${q.color}">${icon(q.icon, 20)}<i class="qplus">${icon("plus", 10, 3)}</i></span><span class="l">${q.label}</span></button>`).join("");
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("plus", 16, 2.2)}</span><div class="tt"><span class="en">QUICK ADD</span><span class="zh">快速记录</span></div></div>
    <div class="quick-grid" style="flex:1;align-content:start">${quick}</div></div>`;
}

/* 今日概览（环形 + 深色统计侧栏） */
function overviewTileHTML() {
  const rings = CONFIG.overview.map(o => { const r = o.calc(data());
    return `<div class="ring" data-open="${o.key}"><div class="dial">${ringSVG(r.value, o.color)}<span class="mid" style="color:${o.color}">${icon(o.icon, 26)}</span></div>
      <div class="pct">${r.value}%</div><div class="lbl">${o.label}</div><div class="sub">${r.sub}</div></div>`; }).join("");
  const recCount = CONFIG.modules.reduce((s, m) => s + ((data()[m.key] || []).length), 0);
  const pinCount = CONFIG.modules.reduce((s, m) => s + ((data()[m.key] || []).filter(x => x.pinned).length), 0);
  const money = data().money || [];
  const inc = money.filter(x => x.type === "income").reduce((a, x) => a + +x.amount, 0);
  const exp = money.filter(x => x.type === "expense").reduce((a, x) => a + +x.amount, 0);
  const bal = inc - exp, balCol = bal >= 0 ? "var(--module-1)" : "var(--danger)";
  return `<div class="tile b12"><div class="tile-h"><span class="tic">${icon("target", 16)}</span><div class="tt"><span class="en">DAILY VITALS</span><span class="zh">今日概览</span></div><span class="r">${dateStr()}</span></div>
    <div class="ov2-body">
      <div class="rings">${rings}</div>
      <div class="ov2-side">
        <div class="ov2-stat" data-open="note"><span class="s-ic" style="color:var(--module-2)">${icon("chart", 17)}</span><div class="s-tx"><div class="s-v">${recCount}</div><div class="s-l">累计记录条数</div></div></div>
        <div class="ov2-stat"><span class="s-ic" style="color:var(--module-3)">${icon("star", 17)}</span><div class="s-tx"><div class="s-v">${pinCount}</div><div class="s-l">置顶要事</div></div></div>
        <div class="ov2-stat" data-open="money"><span class="s-ic" style="color:${balCol}">${icon("wallet", 17)}</span><div class="s-tx"><div class="s-v" style="color:${balCol}">¥${bal}</div><div class="s-l">本月结余 · 收¥${inc} 支¥${exp}</div></div></div>
      </div>
    </div></div>`;
}

/* 本周习惯追踪表：checkin.log × 本周 7 天 */
function habitTileHTML() {
  const items = data().checkin || []; const wk = weekDates(); const t = today(); const tIdx = wk.indexOf(t);
  const dnames = ["一", "二", "三", "四", "五", "六", "日"];
  const palette = ["var(--module-1)", "var(--module-2)", "var(--module-3)", "var(--module-4)", "var(--module-5)", "var(--accent)"];
  const chk = icon("check", 13, 2.8);
  const ths = dnames.map((d, i) => `<th class="${i === tIdx ? "tdcol" : ""}">${d}</th>`).join("");
  const rows = items.length ? items.map((x, ri) => {
    let cnt = 0;
    const cells = wk.map((day, i) => { const on = !!(x.log && x.log[day]); if (on) cnt++;
      return `<td class="${i === tIdx ? "tdcol" : ""}"><span class="hcell js-habit ${on ? "on" : "off"}" data-id="${x.id}" data-day="${day}">${chk}</span></td>`; }).join("");
    const rate = Math.round(cnt / 7 * 100);
    return `<tr><td class="hn"><span class="hdot" style="background:${palette[ri % palette.length]}"></span>${esc(x.title)}</td>${cells}<td class="hrate" style="color:${palette[ri % palette.length]}">${rate}%</td></tr>`;
  }).join("") : `<tr><td colspan="9" style="text-align:center;color:var(--text-tertiary);font-size:12.5px;padding:18px 0">还没有习惯，去「习惯打卡」添加吧</td></tr>`;
  return `<div class="tile b7"><div class="tile-h"><span class="tic">${icon("leaf", 16)}</span><div class="tt"><span class="en">HABIT TRACKER</span><span class="zh">本周习惯追踪表</span></div><span class="r js-open" data-open="checkin">本周 · 周${dnames[((new Date().getDay()) + 6) % 7]}</span></div>
    <table class="habit-tb"><thead><tr><th class="hh">习惯</th>${ths}<th class="hr">完成率</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* 待办清单（仪表盘式，就地勾选） */
function todoTileHTML() {
  const it = data().todo || []; const done = it.filter(x => x.done).length; const pct = it.length ? Math.round(done / it.length * 100) : 0;
  const chk = icon("check", 12, 2.8);
  const list = it.length ? it.map(x => { const m = modOf("todo"); const p = (m.priorities || []).find(p => p.key === x.priority);
    return `<div class="tk-row"><div class="tk-chk js-pin-chk ${x.done ? "on" : ""}" data-mkey="todo" data-id="${x.id}">${chk}</div>
      <span class="tk-name ${x.done ? "done" : ""} js-pin-open" data-mkey="todo" data-id="${x.id}">${esc(x.title)}</span>
      ${p ? `<span class="badge" style="background:${p.color};color:${p.text}"><span class="dot"></span>${p.label}</span>` : ""}</div>`; }).join("")
    : `<div class="focus-empty">还没有待办，去「待办事项」添加吧</div>`;
  return `<div class="tile b5"><div class="tile-h"><span class="tic">${icon("list", 16)}</span><div class="tt"><span class="en">TODO LIST</span><span class="zh">待办清单</span></div><span class="r js-open" data-open="todo">查看全部</span></div>
    <div class="tk-head"><span class="pct">${done}<span style="color:var(--text-secondary)">/${it.length}</span></span><span class="cnt">完成 ${pct}%</span><span class="bar"><i style="width:${pct}%"></i></span></div>
    <div class="tk-list">${list}</div></div>`;
}

/* 专注番茄钟（暗色卡 · 实时倒计时） */
function pomoTileHTML() {
  const p = data().__pomo || { count: 0, min: 0 };
  const r = 64, c = 2 * Math.PI * r, off = c * (1 - pomo.remain / pomo.total);
  return `<div class="pomo b4"><div><div class="pen">POMODORO · 25 / 5</div><div class="pzh">专注番茄钟</div></div>
    <div class="ring-wrap"><svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(240,232,213,.14)" stroke-width="7"/>
      <circle id="pomo-fg" cx="75" cy="75" r="${r}" fill="none" stroke="#e6b877" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>
      <div class="ptime"><span class="t" id="pomo-time">${pad2(Math.floor(pomo.remain / 60))}:${pad2(pomo.remain % 60)}</span><span class="s" id="pomo-status">${pomo.running ? "专注中" : "保持专注"}</span></div></div>
    <div class="pctl"><button class="primary" id="pomo-toggle">${pomo.running ? "暂停" : "开始"}</button><button id="pomo-reset">重置</button></div>
    <div class="pstats"><div class="ps"><div class="pv" id="pomo-count">${p.count}</div><div class="pl">今日番茄</div></div>
      <div class="ps"><div class="pv" id="pomo-min">${p.min}</div><div class="pl">专注分钟</div></div>
      <div class="ps"><div class="pv">${p.count + (pomo.running ? 1 : 0)}</div><div class="pl">轮次</div></div></div></div>`;
}

/* 心情趋势折线（复用 trend）：支持未记录的天（null）断点；下方是紧凑状态录入条，与洞察页共用数据 */
function trendTileHTML() {
  const raw = CONFIG.trend.series(data());
  const series = Array.isArray(raw) && raw.length === 7 ? raw : [];
  const vals = series.filter(v => typeof v === "number");
  const has = vals.length > 0;
  const avg = has ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const body = has ? trendSVG(series) : `<div class="trend-empty">${icon("chart", 26)}<span>本周还没记录状态，点下面格子记一下</span></div>`;
  const cells = `<div class="ws-grid ws-inline">${trendCellsHTML({ compact: true })}</div>`;
  return `<div class="tile b8"><div class="tile-h"><span class="tic">${icon("chart", 16)}</span><div class="tt"><span class="en">MOOD TREND · 近 7 天</span><span class="zh">${CONFIG.trend.title}</span></div>${has ? `<span class="r">均 ${avg}${CONFIG.trend.unit}</span>` : ""}</div>
    ${body}${has ? `<div class="trend-x"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>` : ""}${cells}</div>`;
}

/* 月度开销：finance 支出按分类占比 */
function spendTileHTML() {
  const all = data().money || []; const exp = all.filter(x => x.type === "expense").reduce((a, x) => a + +x.amount, 0);
  const palette = ["var(--module-4)", "var(--module-3)", "var(--module-1)", "var(--module-2)", "var(--module-5)", "var(--accent)", "var(--danger)"];
  const byCat = {}; all.filter(x => x.type === "expense").forEach(x => { const c = x.category || "其他"; byCat[c] = (byCat[c] || 0) + +x.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const rows = cats.length ? cats.map((c, i) => { const pc = exp ? Math.round(c[1] / exp * 100) : 0; const col = palette[i % palette.length];
    return `<div class="book-row js-open" data-open="money"><span class="spine" style="background:${col}">${icon("wallet", 16)}</span>
      <div class="bmid"><div class="btt">${esc(c[0])}</div><div class="bsub">¥${c[1]}</div>
        <div class="bbar"><i style="width:${pc}%;background:${col}"></i></div></div><span class="bpct" style="color:${col}">${pc}%</span></div>`; }).join("")
    : `<div class="focus-empty">暂无支出记录</div>`;
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("wallet", 16)}</span><div class="tt"><span class="en">MONTHLY SPENDING</span><span class="zh">月度开销</span></div><span class="r js-open" data-open="money">明细</span></div>
    <div class="spend-sum"><span class="spend-total">¥${exp}</span><span class="spend-cap">本月支出 · 共 ${all.filter(x => x.type === "expense").length} 笔</span></div>
    <div class="book-list">${rows}</div></div>`;
}

/* 在读好书：read (progress) 各书进度 */
function booksTileHTML() {
  const all = data().read || []; const colors = ["var(--module-2)", "var(--module-1)", "var(--module-3)", "var(--module-4)", "var(--module-5)"];
  const rows = all.length ? all.map((x, i) => { const pct = Math.min(100, Math.round((x.current / x.target) * 100 || 0)); const col = colors[i % colors.length];
    return `<div class="book-row js-open" data-open="read"><span class="spine" style="background:${col}">${icon("book", 16)}</span>
      <div class="bmid"><div class="btt">${esc(x.title)}</div><div class="bsub">${x.note ? esc(x.note) : `${x.current}/${x.target} ${x.unit || "页"}`}</div>
        <div class="bbar"><i style="width:${pct}%;background:${col}"></i></div></div><span class="bpct" style="color:${col}">${pct}%</span></div>`; }).join("")
    : `<div class="focus-empty">还没有在读书籍，去「阅读打卡」添加吧</div>`;
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("book", 16)}</span><div class="tt"><span class="en">CURRENTLY READING</span><span class="zh">在读好书</span></div><span class="r">${all.length} 本</span></div>
    <div class="book-list">${rows}</div></div>`;
}

/* 本周训练：只统计本周（周一~周日）完成的训练，顶部周统计 + 计划进度条，不再混入旧版进度记录 */
function goalsTileHTML() {
  const wk = weekDates(); const inWeek = new Set(wk);
  const colors = ["var(--module-3)", "var(--module-1)", "var(--module-2)", "var(--module-4)", "var(--module-5)"];
  const sessions = (data().sport || []).filter(x => typeof Workout !== "undefined" && Workout.isSession(x) && x.status === "completed" && inWeek.has(x.date));
  sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const setCount = sessions.reduce((s, x) => s + (Workout.summary(x).setCount || 0), 0);
  const volume = Math.round(sessions.reduce((s, x) => s + (Workout.summary(x).volume || 0), 0));
  // 训练计划进度：生成过计划且有完成记录才显示进度条
  let planRow = "";
  try {
    const plan = window.WorkoutPlan?.load?.();
    const progress = window.WorkoutPlan?.loadProgress?.();
    if (plan && progress && window.WorkoutPlan?.isProgressValid?.(progress, plan.generated_at) && plan.days.length) {
      const done = Object.keys(progress.days || {}).length;
      const pct = Math.min(100, Math.round(done / plan.days.length * 100));
      planRow = `<div class="goals-plan"><span>训练计划</span><div class="bbar"><i style="width:${pct}%"></i></div><b>${done}/${plan.days.length} 天</b></div>`;
    }
  } catch (_) { /* 计划读取失败不影响本周统计 */ }
  const rows = sessions.slice(0, 3).map((x, i) => { const info = Workout.summary(x), col = colors[i % colors.length];
    return `<div class="book-row"><span class="spine" style="background:${col}">${icon("activity", 16)}</span><div class="bmid"><div class="btt">${esc(x.title)}</div><div class="bsub">${info.exerciseCount} 个动作 · ${info.setCount} 组 · ${Math.round(info.volume)} kg</div></div><span class="bpct" style="color:${col}">${esc(String(x.date || "").slice(5))}</span></div>`; }).join("");
  const body = sessions.length
    ? `<div class="goals-stats"><div class="goals-stat"><b>${sessions.length}</b><span>本周训练</span></div><div class="goals-stat"><b>${setCount}</b><span>总组数</span></div><div class="goals-stat"><b>${volume}</b><span>容量 kg</span></div></div>${planRow}<div class="book-list">${rows}</div>`
    : `<div class="focus-empty">本周还没训练，点「运动健身」开始第一练吧。</div>`;
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("activity", 16)}</span><div class="tt"><span class="en">WEEKLY TRAINING</span><span class="zh">本周训练</span></div><span class="r js-open" data-open="sport">${sessions.length} 次</span></div>${body}</div>`;
}

function clockCardHTML() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const q = CONFIG.quotes[dow % CONFIG.quotes.length];
  const hour = now.getHours();
  const hi = hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 13 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  return `<div class="clock-card b4">
    <div><div class="hi">${hi}，${esc(CONFIG.owner)}</div><div class="sub">${esc(q)}</div></div>
    <div><div class="clk" id="clk">${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}</div>
      <div class="cmeta"><span>${dateStr()}</span><span class="dot"></span><span>第 ${weekNum()} 周</span></div></div></div>`;
}

// key → 渲染函数（与 home-layout.js 的 HOME_CARDS 对应）
const RENDER_MAP = {
  clock: clockCardHTML, focus: focusTileHTML, quick: quickTileHTML, overview: overviewTileHTML,
  daily: () => `<div class="tile b12 daily-card" id="daily-copy-slot">${dailyCopySlotHTML()}</div>`,
  habit: habitTileHTML, todo: todoTileHTML,
  pomo: pomoTileHTML, trend: trendTileHTML, spend: spendTileHTML, books: booksTileHTML, goals: goalsTileHTML,
  report: weeklyReportSlotHTML,
};

function render() {
  const order = (Array.isArray(homeOrderConfig) && homeOrderConfig.length ? homeOrderConfig : DEFAULT_HOME_ORDER)
    .filter(key => RENDER_MAP[key]);
  // 按组分段：同组卡片包进一个 bento 网格并排，组头自动跟随
  const sections = [];
  order.forEach(key => {
    const group = groupOf(key);
    const last = sections[sections.length - 1];
    if (!last || last.group !== group) sections.push({ group, cards: [key] });
    else last.cards.push(key);
  });
  let html = "";
  sections.forEach(section => {
    const g = HOME_GROUPS[section.group];
    if (g) html += grp(g.zh, g.en);
    html += `<div class="bento">${section.cards.map(key => RENDER_MAP[key]()).join("")}</div>`;
  });
  // 首页版本信息：个人配置页可控制显示与否（默认显示）
  if (getData().__homeVersionVisible !== false) {
    html += `<div class="home-ver">猫咪生活报 · v${CONFIG.APP_VERSION || ""}</div>`;
  }
  root.value.innerHTML = html;
  wireHome();
  initWeeklyReport(root.value);
  initDailyCopy(root.value);
  startClock();
}

// 本地已保存的排序（含云端拉取后回写），无需等接口即可渲染
function readLocalOrder() {
  const local = Array.isArray(getData().__homeOrder) && getData().__homeOrder.length ? getData().__homeOrder : null;
  return local && local.every(key => RENDER_MAP[key]) ? local : null;
}

// 同步应用本地缓存顺序（进入页面第一帧就用缓存，避免闪默认顺序）
function applyCachedOrder() {
  const cached = readLocalOrder();
  if (cached) homeOrderConfig = cached;
}

// 拉取云端排序配置：先本地立即渲染，再后台拉云端；顺序变化才重渲染；成功回写本地缓存
async function loadHomeOrder() {
  applyCachedOrder();
  try {
    const settings = await window.fetchUserSettings?.();
    const remote = settings && Array.isArray(settings.home_order) && settings.home_order.length ? settings.home_order : null;
    if (remote && remote.every(key => RENDER_MAP[key])) {
      // 回写本地缓存，下次进页面免等待接口
      const data = getData();
      if ((data.__homeOrder || []).join(",") !== remote.join(",")) {
        data.__homeOrder = remote;
        save();
      }
      if ((homeOrderConfig || []).join(",") !== remote.join(",")) {
        homeOrderConfig = remote;
        render();
      }
    }
  } catch (_) { /* 拉取失败保持当前顺序 */ }
}

function updateHabitCell(cell, item, day) {
  cell.classList.toggle("on", !!(item.log && item.log[day]));
  cell.classList.toggle("off", !(item.log && item.log[day]));
  const row = cell.closest("tr"); const rate = row?.querySelector(".hrate");
  if (rate) { const done = row.querySelectorAll(".js-habit.on").length; rate.textContent = `${Math.round(done / 7 * 100)}%`; }
}

function wireHome() {
  const scope = root.value;
  scope.querySelectorAll("[data-open]").forEach(el => el.onclick = () => go(el.dataset.open));
  scope.querySelectorAll("[data-quick]").forEach(el => el.onclick = () => { go(el.dataset.quick); if (el.dataset.quick !== "sport") openEditor(el.dataset.quick, null); });
  const find = el => (data()[el.dataset.mkey] || []).find(i => i.id == el.dataset.id);
  // 就地打卡 / 完成
  scope.querySelectorAll(".js-pin-chk").forEach(el => el.onclick = e => {
    e.stopPropagation(); const m = modOf(el.dataset.mkey), x = find(el); if (!x) return;
    if (m.type === "todo") { x.done = !x.done; }
    else if (m.type === "checkin") { x.log = x.log || {}; const t = today(); x.log[t] ? delete x.log[t] : x.log[t] = true; }
    persist(el.dataset.mkey, x, { render: false });
    el.classList.toggle("on", m.type === "todo" ? !!x.done : !!(x.log && x.log[today()]));
    el.closest(".focus-row")?.querySelector(".fn")?.classList.toggle("done", !!x.done);
  });
  scope.querySelectorAll(".js-pin-inc").forEach(el => el.onclick = e => { e.stopPropagation(); const x = find(el); if (!x) return; x.current = (+x.current || 0) + 1; persist(el.dataset.mkey, x); });
  scope.querySelectorAll(".js-pin-dec").forEach(el => el.onclick = e => { e.stopPropagation(); const x = find(el); if (!x) return; x.current = Math.max(0, (+x.current || 0) - 1); persist(el.dataset.mkey, x); });
  scope.querySelectorAll(".js-pin-open").forEach(el => el.onclick = e => { e.stopPropagation(); openEditor(el.dataset.mkey, find(el)); });
  // 习惯追踪表：点方框直接给对应日期打卡 / 取消
  scope.querySelectorAll(".js-habit").forEach(el => el.onclick = e => {
    e.stopPropagation(); const x = (data().checkin || []).find(i => i.id == el.dataset.id); if (!x) return;
    const d = el.dataset.day; x.log = x.log || {}; x.log[d] ? delete x.log[d] : x.log[d] = true;
    persist("checkin", x, { render: false });
    updateHabitCell(el, x, d);
  });
  // 番茄钟控制
  const tg = scope.querySelector("#pomo-toggle"); if (tg) tg.onclick = () => ensurePomodoroController()?.toggle();
  const rs = scope.querySelector("#pomo-reset"); if (rs) rs.onclick = () => ensurePomodoroController()?.stop();
  // 本周状态录入（趋势卡下方紧凑条）
  wireTrendCells(scope);
}

function startClock() {
  if (clockTimer) return;
  clockTimer = setInterval(() => {
    const el = root.value.querySelector("#clk");
    if (el) { const n = new Date(); el.textContent = `${pad2(n.getHours())}:${pad2(n.getMinutes())}:${pad2(n.getSeconds())}`; }
    pomoUpdate();
  }, 1000);
  pomoUpdate();
}

let unsub = null;
// 个人配置页保存排序后触发，重新拉取云端配置并重渲染
const onOrderChanged = () => loadHomeOrder();
onMounted(() => {
  applyCachedOrder();       // 缓存顺序先行，不等待接口
  render();
  ensurePomodoroController();
  unsub = subscribe(render);
  window.addEventListener("home-order-changed", onOrderChanged);
  loadHomeOrder();          // 后台拉云端并刷新
});
onBeforeUnmount(() => {
  if (unsub) unsub();
  window.removeEventListener("home-order-changed", onOrderChanged);
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
});
</script>

<template>
  <div ref="root"></div>
</template>
