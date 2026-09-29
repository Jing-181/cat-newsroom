// 通用工具：日期、连续天数、进度、环图/趋势 SVG、报刊栏目标题（与主站逻辑一致）

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToday() {
  return localDateKey();
}

export function today() {
  return isoToday();
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// 本周（周一起）7 天的 ISO 日期
export function weekDates() {
  const n = new Date();
  const dow = (n.getDay() + 6) % 7;
  const mon = new Date(n);
  mon.setDate(n.getDate() - dow);
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    arr.push(localDateKey(d));
  }
  return arr;
}

export function weekNum() {
  const n = new Date();
  const s = new Date(n.getFullYear(), 0, 1);
  return Math.ceil(((n - s) / 86400000 + s.getDay() + 1) / 7);
}

export function dateStr() {
  const n = new Date();
  const wd = "日一二三四五六"[n.getDay()];
  return `${n.getFullYear()}年${n.getMonth() + 1}月${n.getDate()}日 周${wd}`;
}

// 习惯连续天数：从今天往回数连续打卡
export function streak(log) {
  if (!log) return 0;
  let n = 0;
  const d = new Date();
  for (;;) {
    const k = localDateKey(d);
    if (log[k]) {
      n++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return n;
}

export function avgProgress(list) {
  if (!list || !list.length) return { value: 0, sub: "0" };
  const sessions = typeof Workout !== "undefined" ? list.filter(Workout.isSession) : [];
  if (sessions.length) return { value: 100, sub: `${sessions.length} 次训练` };
  const progress = list.filter(x => x.target != null);
  const v = progress.length
    ? Math.round(progress.reduce((s, x) => s + Math.min(100, (x.current / x.target) * 100 || 0), 0) / progress.length)
    : 0;
  return { value: v, sub: `${progress.length} 项` };
}

// 报刊栏目标题（EN 副标题 + 中文标题 + 分隔线）
export function grp(zh, en) {
  return `<div class="sec-grp"><span class="bar"></span><span class="zh">${zh}</span><span class="en">${en}</span><span class="line"></span></div>`;
}

export function ringSVG(pct, color) {
  const r = 25, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, pct) / 100);
  return `<svg class="gauge" viewBox="0 0 60 60"><circle cx="30" cy="30" r="${r}" fill="none" stroke="var(--border)" stroke-width="5.5"/>
    <circle cx="30" cy="30" r="${r}" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>`;
}

export function trendSVG(series) {
  const w = 560, h = 170, padX = 12, padTop = 16, padBot = 22;
  const nums = series.map(v => typeof v === "number" ? v : null);
  const valid = nums.filter(v => v !== null);
  if (!valid.length) return "";
  const max = Math.max(...valid), min = Math.min(...valid);
  const rng = (max - min) || 1;
  const innerW = w - 2 * padX, innerH = h - padTop - padBot;
  // 未记录的天（null）断线不画点；相邻有效值之间连线，形成连续折线
  let line = "", segmentOpen = false;
  const dots = [];
  nums.forEach((v, i) => {
    const x = padX + innerW * i / (nums.length - 1);
    if (v === null) { segmentOpen = false; return; }
    const y = padTop + innerH * (1 - (v - min) / rng);
    line += (segmentOpen ? " L" : " M") + x.toFixed(1) + " " + y.toFixed(1);
    segmentOpen = true;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="var(--surface-card)" stroke="var(--module-2)" stroke-width="2"/>`);
  });
  const firstPoint = nums.findIndex(v => v !== null);
  const lastPoint = nums.length - 1 - [...nums].reverse().findIndex(v => v !== null);
  const x0 = padX + innerW * firstPoint / (nums.length - 1);
  const x1 = padX + innerW * lastPoint / (nums.length - 1);
  const area = line + ` L ${x1.toFixed(1)} ${h - padBot} L ${x0.toFixed(1)} ${h - padBot} Z`;
  return `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--module-2)" stop-opacity=".22"/><stop offset="1" stop-color="var(--module-2)" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#tg)"/><path d="${line}" fill="none" stroke="var(--module-2)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${dots.join("")}</svg>`;
}
