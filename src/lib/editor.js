// 记录编辑弹窗：按模块类型生成表单、图片配图（预设/上传/外链）、删除确认（与主站逻辑一致）
import { modOf } from "./config.js";
import { icon, esc, attr } from "./icons.js";
import { isoToday } from "./utils.js";
import { getData, persist, save, bump } from "./store.js";

function mediaFieldHTML(key, d) {
  if (typeof RecordMedia === "undefined") return `<div class="field"><label>图片 URL（可选）</label><input id="f-image" value="${attr(d.image || "")}" placeholder="https://..."/></div>`;
  const layout = d.layout || "default";
  const preset = d.image_preset || RecordMedia.defaultPresetId(key, layout);
  const preview = d.image || (RecordMedia.getPreset(preset)?.src || "");
  return `<div class="field media-field"><label>图片</label>
    <div class="media-compact">
      <div class="media-summary">
        <span class="media-chip">${icon("camera", 12)} ${d.image ? "已填图" : "默认图"}</span>
        <div class="media-desc">一行就够：先看预览，再决定粘贴地址、上传或换默认图。</div>
      </div>
      <div class="media-preview"><img id="f-image-preview" src="${attr(preview)}" alt=""></div>
      <div class="media-row"><input id="f-image" value="${attr(d.image || "")}" placeholder="粘贴图片地址"/>
        <button type="button" class="btn ghost" id="f-image-upload">${icon("camera", 14)}上传</button>
        <input id="f-image-file" type="file" accept="image/*" hidden></div>
      <div class="media-actions">
        <button type="button" class="btn ghost" id="f-image-clear">清空</button>
        <button type="button" class="media-toggle" id="f-media-toggle">更多配图</button>
      </div>
      <div class="media-advanced" id="f-media-advanced" hidden>
        <div class="media-preset-head"><strong>默认配图</strong><span class="media-fallback">不上传也能直接选</span></div>
        <div class="preset-grid" id="f-image-preset">${mediaPresetChoicesHTML(key, layout, preset)}</div>
        <div class="upload-note">不上传时会使用选中的默认配图；上传后会自动填入图片 URL。</div>
      </div>
    </div></div>`;
}

function mediaPresetChoicesHTML(key, layout, preset) {
  return RecordMedia.getChoices(key, layout).map(p => `<button type="button" class="preset-card ${p.id === preset ? "on" : ""}" data-v="${attr(p.id)}" title="${attr(p.description)}"><img src="${attr(p.src)}" alt=""><span>${esc(p.label)}</span></button>`).join("");
}

function selectedImagePreset(overlay) {
  return overlay.querySelector("#f-image-preset .preset-card.on")?.dataset.v || "";
}

function updateImagePreview(overlay) {
  const preview = overlay.querySelector("#f-image-preview");
  if (!preview || typeof RecordMedia === "undefined") return;
  const url = (overlay.querySelector("#f-image")?.value || "").trim();
  const preset = RecordMedia.getPreset(selectedImagePreset(overlay));
  preview.src = url || preset?.src || "";
}

function wirePresetCards(overlay) {
  overlay.querySelectorAll("#f-image-preset .preset-card").forEach(card => card.onclick = () => {
    overlay.querySelectorAll("#f-image-preset .preset-card").forEach(x => x.classList.remove("on"));
    card.classList.add("on"); updateImagePreview(overlay);
  });
}

function refreshMediaPresets(overlay, key) {
  if (typeof RecordMedia === "undefined") return;
  const grid = overlay.querySelector("#f-image-preset");
  const layout = overlay.querySelector("#f-layout .on")?.dataset.v || "default";
  if (!grid) return;
  const preset = RecordMedia.defaultPresetId(key, layout);
  grid.innerHTML = mediaPresetChoicesHTML(key, layout, preset);
  wirePresetCards(overlay);
  updateImagePreview(overlay);
}

function wireMediaEditor(overlay, key, d) {
  const input = overlay.querySelector("#f-image");
  const upload = overlay.querySelector("#f-image-upload");
  const file = overlay.querySelector("#f-image-file");
  const clear = overlay.querySelector("#f-image-clear");
  const toggle = overlay.querySelector("#f-media-toggle");
  const advanced = overlay.querySelector("#f-media-advanced");
  input?.addEventListener("input", () => updateImagePreview(overlay));
  clear?.addEventListener("click", () => { input.value = ""; updateImagePreview(overlay); });
  wirePresetCards(overlay);
  toggle?.addEventListener("click", () => {
    if (!advanced) return;
    const closed = advanced.hasAttribute("hidden");
    if (closed) advanced.removeAttribute("hidden");
    else advanced.setAttribute("hidden", "");
    toggle.textContent = closed ? "收起" : "更多配图";
  });
  upload?.addEventListener("click", () => file?.click());
  file?.addEventListener("change", async () => {
    const picked = file.files && file.files[0]; if (!picked) return;
    const old = upload.innerHTML; upload.disabled = true; upload.textContent = "上传中…";
    try {
      const result = await window.uploadCardImage(picked, { moduleKey: key, recordId: d.id });
      input.value = result.url; updateImagePreview(overlay);
    } catch (e) { await window.AppDialog.alert(e.message || "图片上传失败", { title: "图片上传失败" }); }
    finally { upload.disabled = false; upload.innerHTML = old; file.value = ""; }
  });
}

function newItem(m) {
  const base = { id: Date.now() }; let item;
  if (m.type === "todo") item = { ...base, title: "", priority: (m.priorities && m.priorities[1] ? m.priorities[1].key : "P1"), done: false, note: "" };
  else if (m.type === "checkin") item = { ...base, title: "", log: {} };
  else if (m.type === "progress") item = { ...base, title: "", current: 0, target: (m.unit === "页" ? 100 : 20), unit: m.unit || "", note: "" };
  else if (m.type === "finance") item = { ...base, title: "", type: "expense", amount: "", category: (m.categories && m.categories[0]) || "其他", date: isoToday() };
  else item = { ...base, title: "", content: "", mood: (m.moods && m.moods[0]) || "", date: isoToday() };
  // initialize custom fields
  (m.fields || []).forEach(f => { if (!(f.key in item)) item[f.key] = f.type === "select" ? (f.options && f.options[0] || "") : ""; });
  if (typeof RecordMedia !== "undefined") item.image_preset = RecordMedia.defaultPresetId(m.key, item.layout || "default");
  return item;
}

/* ---------- EDITOR MODAL (per type) ---------- */
export function openEditor(key, item) {
  const m = modOf(key); const editing = !!item; const d = item || newItem(m);
  let fields = "";
  if (m.type === "todo") {
    fields = `<div class="field"><label>任务</label><input id="f-title" value="${attr(d.title)}" placeholder="要做什么？"/></div>
      <div class="field"><label>优先级</label><div class="seg" id="f-prio">${(m.priorities || []).map(p => `<div class="opt ${p.key === d.priority ? "on" : ""}" data-v="${p.key}">${p.label}</div>`).join("")}</div></div>
      <div class="field"><label>备注</label><textarea id="f-note" placeholder="补充说明">${esc(d.note || "")}</textarea></div>`;
  } else if (m.type === "checkin") {
    fields = `<div class="field"><label>打卡项</label><input id="f-title" value="${attr(d.title)}" placeholder="例如：喝够 8 杯水"/></div>
      <p class="sub" style="margin:0">保存后可在卡片点击左侧方块打卡；连续天数自动统计，每天从零开始。</p>`;
  } else if (m.type === "progress") {
    fields = `<div class="field"><label>名称</label><input id="f-title" value="${attr(d.title)}" placeholder="书名 / 目标"/></div>
      <div class="frow"><div class="field"><label>当前</label><input id="f-cur" type="number" value="${d.current ?? 0}"/></div>
      <div class="field"><label>目标</label><input id="f-tgt" type="number" value="${d.target ?? 1}"/></div>
      <div class="field"><label>单位</label><input id="f-unit" value="${attr(d.unit || m.unit || "")}"/></div></div>
      <div class="field"><label>摘录 / 想法</label><textarea id="f-note" placeholder="随手记">${esc(d.note || "")}</textarea></div>`;
  } else if (m.type === "finance") {
    fields = `<div class="field"><label>类型</label><div class="seg" id="f-ftype">
        <div class="opt ${d.type !== "income" ? "on" : ""}" data-v="expense">支出</div><div class="opt ${d.type === "income" ? "on" : ""}" data-v="income">收入</div></div></div>
      <div class="frow"><div class="field"><label>项目</label><input id="f-title" value="${attr(d.title)}" placeholder="午餐 / 稿费"/></div>
      <div class="field"><label>金额 ¥</label><input id="f-amt" type="number" value="${d.amount ?? ""}" placeholder="0"/></div></div>
      <div class="field"><label>分类</label><div class="seg" id="f-cat">${(m.categories || []).map(c => `<div class="opt ${c === d.category ? "on" : ""}" data-v="${attr(c)}" style="flex:0 0 auto;min-width:auto">${esc(c)}</div>`).join("")}</div></div>
      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date || isoToday()}"/></div>`;
  } else {
    fields = `<div class="field"><label>标题</label><input id="f-title" value="${attr(d.title)}" placeholder="给这条起个名"/></div>
      ${(m.moods && m.moods.length) ? `<div class="field"><label>标签 / 心情</label><div class="seg" id="f-mood">${m.moods.map(md => `<div class="opt ${md === d.mood ? "on" : ""}" data-v="${attr(md)}" style="flex:0 0 auto;min-width:auto">${md}</div>`).join("")}</div></div>` : ""}
      <div class="field"><label>内容</label><textarea id="f-content" placeholder="写点什么…">${esc(d.content || "")}</textarea></div>
      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date || isoToday()}"/></div>`;
  }
  // layout variant selector
  const layoutOpts = [{ v: "default", l: "标准" }, { v: "feature", l: "大图" }, { v: "quote", l: "引文" }];
  fields = `<div class="field"><label>卡片样式</label><div class="seg" id="f-layout">${layoutOpts.map(o => `<div class="opt ${o.v === (d.layout || "default") ? "on" : ""}" data-v="${o.v}">${o.l}</div>`).join("")}</div></div>` + fields;
  // custom fields (from m.fields config) — rendered after type-specific fields
  (m.fields || []).forEach(f => {
    const v = d[f.key] || "";
    if (f.type === "select") fields += `<div class="field"><label>${esc(f.label)}</label><div class="seg" id="f-cf-${f.key}">${(f.options || []).map(o => `<div class="opt ${o === v ? "on" : ""}" data-v="${attr(o)}" style="flex:0 0 auto;min-width:auto">${esc(o)}</div>`).join("")}</div></div>`;
    else if (f.type === "textarea") fields += `<div class="field"><label>${esc(f.label)}</label><textarea id="f-cf-${f.key}" placeholder="${attr(f.placeholder || "")}">${esc(v)}</textarea></div>`;
    else if (f.type === "number") fields += `<div class="field"><label>${esc(f.label)}</label><input id="f-cf-${f.key}" type="number" value="${attr(v)}" placeholder="${attr(f.placeholder || "")}"/></div>`;
    else fields += `<div class="field"><label>${esc(f.label)}</label><input id="f-cf-${f.key}" value="${attr(v)}" placeholder="${attr(f.placeholder || "")}"/></div>`;
  });
  // 图片支持云端上传、外链和项目风格预设。
  fields += mediaFieldHTML(key, d);
  const overlay = document.createElement("div"); overlay.className = "overlay";
  overlay.innerHTML = `<div class="modal"><h3>${editing ? "编辑" : "新建"} · ${m.name}</h3><div class="sub">${m.desc}</div>${fields}
    <div class="modal-actions">${editing ? '<button class="link-danger" id="m-del">删除</button>' : ""}<div class="spacer"></div>
      <button class="btn ghost" id="m-cancel">取消</button><button class="btn" id="m-save">保存</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector("#m-cancel").onclick = close;
  overlay.querySelectorAll(".seg").forEach(seg => seg.querySelectorAll(".opt").forEach(o => o.onclick = () => {
    seg.querySelectorAll(".opt").forEach(x => x.classList.remove("on")); o.classList.add("on");
    // 卡片样式变化时同步刷新默认配图候选。
    if (seg.id === "f-layout") refreshMediaPresets(overlay, key);
  }));
  if (editing) overlay.querySelector("#m-del").onclick = () => { close(); confirmDelete(key, d.id); };
  wireMediaEditor(overlay, key, d);
  overlay.querySelector("#m-save").onclick = async () => {
    const saveBtn = overlay.querySelector("#m-save"); saveBtn.disabled = true;
    const val = id => { const el = overlay.querySelector(id); return el ? el.value : undefined; };
    const seg = id => { const el = overlay.querySelector(id + " .on"); return el ? el.dataset.v : undefined; };
    d.title = (val("#f-title") || "").trim() || "未命名";
    d.layout = seg("#f-layout") || "default";
    if (m.type === "todo") { d.priority = seg("#f-prio") || d.priority; d.note = (val("#f-note") || "").trim(); }
    else if (m.type === "progress") { d.current = Math.max(0, +val("#f-cur") || 0); d.target = Math.max(1, +val("#f-tgt") || 1); d.unit = (val("#f-unit") || "").trim(); d.note = (val("#f-note") || "").trim(); }
    else if (m.type === "finance") { d.type = seg("#f-ftype") || "expense"; d.amount = Math.max(0, +val("#f-amt") || 0); d.category = seg("#f-cat") || (m.categories && m.categories[0]) || "其他"; d.date = val("#f-date"); }
    else if (m.type === "note") { d.mood = seg("#f-mood") || d.mood || ""; d.content = (val("#f-content") || "").trim(); d.date = val("#f-date"); }
    // save custom fields
    (m.fields || []).forEach(f => {
      if (f.type === "select") d[f.key] = seg("#f-cf-" + f.key) || d[f.key] || "";
      else if (f.type === "number") d[f.key] = Math.max(0, +val("#f-cf-" + f.key) || 0);
      else d[f.key] = (val("#f-cf-" + f.key) || "").trim();
    });
    // 保存图片 URL 和默认配图选择。
    d.image = (val("#f-image") || "").trim();
    d.image_preset = selectedImagePreset(overlay) || d.image_preset || (typeof RecordMedia !== "undefined" ? RecordMedia.defaultPresetId(key, d.layout) : "");
    if (!editing) { const records = getData()[key] = getData()[key] || []; window.RecordList.placeNewAtTop(records, d); records.unshift(d); }
    persist(key, d); close();
  };
}

/* ---------- delete confirm ---------- */
export function confirmDelete(key, id) {
  const item = (getData()[key] || []).find(i => i.id == id); if (!item) return;
  const overlay = document.createElement("div"); overlay.className = "overlay";
  overlay.innerHTML = `<div class="modal" style="width:400px"><h3>删除记录</h3><div class="sub">确定删除「${esc(item.title || "这条记录")}」？此操作不可撤销。</div>
    <div class="modal-actions"><div class="spacer"></div><button class="btn ghost" id="c-cancel">取消</button><button class="btn danger" id="c-ok">删除</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector("#c-cancel").onclick = close;
  overlay.querySelector("#c-ok").onclick = () => {
    if (typeof window.markRecordDeleted === "function") window.markRecordDeleted(key, id);
    getData()[key] = getData()[key].filter(i => i.id != id);
    save(); bump(); close();
  };
}
