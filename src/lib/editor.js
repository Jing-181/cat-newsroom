// 记录编辑弹窗：按模块类型生成表单、图片配图（预设/上传/外链）、删除确认（与主站逻辑一致）
import { modOf } from "./config.js";
import { icon, esc, attr } from "./icons.js";
import { isoToday } from "./utils.js";
import { getData, persist, save, bump } from "./store.js";
import AppDialog from "./app-dialog.js";
import RecordList from "./record-list.js";
import RecordMedia from "./record-media.js";
import { bindLayer } from "./dialog-contract.js";
import Toast from "./toast.js";
import Trace from "./trace.js";

function mediaFieldHTML(key, d) {
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
        <button type="button" class="media-toggle" id="f-media-toggle">收起</button>
      </div>
      <div class="media-advanced" id="f-media-advanced">
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
  if (!preview) return;
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
    } catch (e) { await AppDialog.alert(e.message || "图片上传失败", { title: "图片上传失败" }); }
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
  item.image_preset = RecordMedia.defaultPresetId(m.key, item.layout || "default");
  return item;
}

/* Quick entry stays separate so hot and the other module contracts remain unchanged. */
export function quickEditorOwner() {
  try {
    const id = window.getCurrentUser?.()?.id;
    return typeof id === "string" && id ? id : null;
  } catch (_) { return null; }
}

export function quickDraftKey(key, owner) {
  return owner && (key === "note" || key === "todo")
    ? `cat-newsroom-quick-draft-v1:${encodeURIComponent(owner)}:${key}` : null;
}

export function readQuickDraft(key, owner) {
  const storageKey = quickDraftKey(key, owner);
  if (!storageKey) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey));
    return draft?.version === 1 && draft.owner === owner && draft.record &&
      typeof draft.record === "object" && !Array.isArray(draft.record) ? draft.record : null;
  } catch (_) { return null; }
}

export function writeQuickDraft(key, owner, record) {
  const storageKey = quickDraftKey(key, owner);
  if (!storageKey) return false;
  localStorage.setItem(storageKey, JSON.stringify({ version: 1, owner, record }));
  return true;
}

export function quickRecord(key, base, values) {
  const record = { ...base, image: (values.image || "").trim() };
  if (key === "note") {
    record.content = (values.content || "").trim();
    record.date = base.date || isoToday();
    // Legacy title/mood/layout/preset are deliberately retained, never manufactured.
    if (!record.content && !record.image) throw new Error("写点内容或添加一张照片再保存");
  } else {
    record.title = (values.title || "").trim();
    if (!record.title) throw new Error("先写下要做的任务");
    record.group = (values.group || "").trim().slice(0, 80);
    record.note = (values.note || "").trim();
    record.priority = values.priority || base.priority || "P1";
  }
  return record;
}

let activeQuickEditor = null;
function openQuickEditor(key, item) {
  // Do not create competing editors/draft writers while an upload is in flight.
  if (activeQuickEditor) {
    if (activeQuickEditor.busy()) { Toast.show("照片正在上传，请稍候再切换编辑器"); return; }
    const previous = activeQuickEditor;
    previous.close();
    if (previous.isOpen()) return;
  }
  const m = modOf(key), editing = !!item, owner = quickEditorOwner();
  const restored = !editing && readQuickDraft(key, owner);
  const d = { ...(item || restored || (key === "note"
    ? { id: Date.now(), content: "", date: isoToday() }
    : { id: Date.now(), title: "", group: "", note: "", priority: "P1", done: false })) };
  const groups = [...new Set((getData().todo || []).map(r => String(r.group || "").trim()).filter(Boolean))];
  const media = `<div class="field quick-photo"><label for="q-image">照片（可选）</label>
    <img id="q-preview" alt="照片预览" hidden>
    <div class="quick-photo-actions"><button type="button" class="btn ghost" id="q-upload">${icon("camera", 14)} 添加照片</button>
    <button type="button" class="btn ghost" id="q-remove">移除照片</button><input id="q-file" type="file" accept="image/*" hidden></div>
    <details><summary>使用图片地址</summary><input id="q-image" value="${attr(d.image || "")}" placeholder="https://…" aria-label="图片地址"></details>
    <p class="sub">可上传照片，也可在编辑器中直接粘贴图片。</p><p id="q-upload-status" role="status" aria-live="polite"></p></div>`;
  const fields = key === "note"
    ? `<div class="field"><label for="q-content">内容</label><textarea id="q-content" placeholder="此刻想记下什么？">${esc(d.content || "")}</textarea></div>${media}`
    : `<div class="field"><label for="q-title">任务</label><input id="q-title" value="${attr(d.title || "")}" placeholder="要做什么？"></div>
       <div class="field"><label for="q-group">版本 / 分组（可选）</label><input id="q-group" list="q-groups" value="${attr(d.group || "")}" placeholder="输入或选择已有分组"><datalist id="q-groups">${groups.map(g => `<option value="${attr(g)}"></option>`).join("")}</datalist></div>
       <details class="modal-fold"><summary>备注、照片与更多选项</summary><div class="field"><label for="q-note">备注（可选）</label><textarea id="q-note">${esc(d.note || "")}</textarea></div>${media}
       <div class="field"><label for="q-priority">优先级</label><select id="q-priority">${(m.priorities || []).map(p => `<option value="${attr(p.key)}" ${p.key === d.priority ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div></details>`;
  const overlay = document.createElement("div");
  overlay.className = `overlay editor-overlay quick-editor quick-editor-${key}`;
  overlay.innerHTML = `<div class="modal editor-modal"><div class="modal-head"><h3>${editing ? "编辑" : "新建"} · ${key === "note" ? "随记" : "事项"}</h3></div>
    <div class="modal-body">${fields}<p id="q-draft-status" class="sub" role="status"></p><p id="q-error" class="quick-error" role="alert"></p></div>
    <div class="modal-actions">${editing ? '<button class="link-danger" id="q-delete">删除</button>' : ""}<div class="spacer"></div><button class="btn ghost" id="q-close">${editing ? "取消" : "暂存关闭"}</button><button class="btn" id="q-save">保存</button></div></div>`;
  document.body.appendChild(overlay);
  const el = id => overlay.querySelector(`#q-${id}`);
  const values = () => Object.fromEntries(["title", "group", "note", "priority", "content", "image"].map(k => [k, el(k)?.value]));
  let dirty = false, saved = false, uploading = false, pendingFile = null, draftSafe = false;
  const identityOK = () => quickEditorOwner() === owner;
  const draft = () => {
    if (editing || saved) return;
    try {
      // Owner is captured at open; never reassign an old draft to a new login.
      const record = { ...d };
      for (const [k, v] of Object.entries(values())) if (v !== undefined) record[k] = v;
      draftSafe = writeQuickDraft(key, owner, record);
      el("draft-status").textContent = draftSafe ? "草稿已保存在此账号的本机空间" : "身份尚未就绪，无法安全保存草稿，请勿刷新或关闭页面";
    } catch (_) {
      draftSafe = false;
      el("draft-status").textContent = "本机草稿保存失败，请保留窗口并重试保存";
    }
  };
  const preview = () => {
    const url = el("image").value.trim();
    el("preview").hidden = !url;
    if (url) el("preview").src = url; else el("preview").removeAttribute("src");
    el("remove").hidden = !url && !pendingFile;
  };
  const layer = bindLayer({ element: overlay, confirmDiscard: true,
    isDirty: () => uploading || (dirty && (editing || !draftSafe)),
    initialFocus: key === "note" ? "#q-content" : "#q-title",
    onClose: () => { draft(); if (activeQuickEditor?.element === overlay && !uploading) activeQuickEditor = null; },
  });
  activeQuickEditor = { element: overlay, busy: () => uploading, isOpen: () => layer.isOpen(), close: () => layer.requestClose() };
  overlay.addEventListener("input", () => { dirty = true; preview(); draft(); });
  overlay.addEventListener("change", () => { dirty = true; draft(); });
  el("close").onclick = () => layer.requestClose();
  const upload = async picked => {
    if (uploading) return;
    if (!identityOK()) { el("error").textContent = "账号已变化，请关闭后在当前账号重新打开"; return; }
    pendingFile = picked; uploading = true; dirty = true;
    el("save").disabled = true; el("upload").disabled = true; el("remove").disabled = true;
    el("image").disabled = true;
    el("upload-status").textContent = "照片上传中…";
    try {
      if (typeof window.uploadCardImage !== "function") throw new Error("上传服务尚未就绪，请稍后重试");
      const result = await window.uploadCardImage(picked, { moduleKey: key, recordId: d.id });
      if (!result?.url) throw new Error("上传未返回图片地址，请重试");
      // Even after closing or switching accounts, write only the original owner's draft.
      el("image").value = result.url; pendingFile = null;
      el("upload-status").textContent = "照片已上传";
      draft();
    } catch (error) {
      el("upload-status").textContent = `${error.message || "图片上传失败"}。内容已保留，点击重试上传；关闭后需重新选择未上传的照片。`;
    } finally {
      uploading = false; el("save").disabled = false; el("upload").disabled = false;
      el("remove").disabled = false; el("image").disabled = false;
      el("upload").textContent = pendingFile ? "重试上传" : "添加 / 更换照片";
      el("file").value = ""; preview();
      if (!layer.isOpen() && activeQuickEditor?.element === overlay) activeQuickEditor = null;
    }
  };
  el("upload").onclick = () => pendingFile ? upload(pendingFile) : el("file").click();
  el("file").onchange = () => { const file = el("file").files?.[0]; if (file) upload(file); };
  overlay.addEventListener("paste", event => {
    const image = [...(event.clipboardData?.items || [])].find(x => x.type.startsWith("image/"))?.getAsFile();
    if (image && !uploading) { event.preventDefault(); upload(image); }
  });
  el("remove").onclick = () => {
    pendingFile = null; el("image").value = ""; dirty = true;
    el("upload-status").textContent = ""; el("upload").textContent = "添加照片";
    preview(); draft();
  };
  if (editing) el("delete").onclick = async () => {
    if (uploading || !identityOK()) { el("error").textContent = "请等待上传完成，并确认仍在原账号"; return; }
    if (await confirmDelete(key, d.id)) { saved = true; layer.forceClose(); }
  };
  el("save").onclick = async () => {
    if (uploading) return;
    el("save").disabled = true; el("error").textContent = "";
    let records, previous;
    try {
      if (!identityOK()) throw new Error("账号已变化，草稿仍属于原账号；请切回原账号后重新打开");
      if (pendingFile) throw new Error("照片尚未上传成功，请重试上传或移除照片后保存");
      const record = quickRecord(key, d, values());
      records = getData()[key] = getData()[key] || [];
      previous = records.slice();
      if (editing) {
        const index = records.findIndex(r => r.id === d.id);
        if (index < 0) throw new Error("原记录已不存在，请保留内容并重新新建");
        records[index] = record;
      } else {
        RecordList.placeNewAtTop(records, record); records.unshift(record);
      }
      persist(key, record);
      saved = true; dirty = false;
      if (!editing && owner) {
        try { localStorage.removeItem(quickDraftKey(key, owner)); }
        catch (_) { Toast.show("记录已保存，但旧草稿清理失败"); }
      }
      layer.forceClose();
      Trace.track("record_saved", { module: key, mode: editing ? "edit" : "create", field_count: 0 });
    } catch (error) {
      if (records && previous && !saved) records.splice(0, records.length, ...previous);
      el("error").textContent = error.message || "保存失败，内容已保留，请重试";
      draft();
    } finally { el("save").disabled = false; }
  };
  preview();
  if (!editing) {
    el("draft-status").textContent = restored ? "已恢复此账号上次未保存的草稿" : owner ? "输入后会自动保存本机草稿" : "身份尚未就绪，无法安全保存草稿，请勿刷新或关闭页面";
  }
  return overlay;
}

/* ---------- EDITOR MODAL (per type) ---------- */
export function openEditor(key, item) {
  if (key === "note" || key === "todo") return openQuickEditor(key, item);
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
  // layout variant selector（默认折叠进「外观与图片」，新建/编辑时不再占首屏）
  const layoutOpts = [{ v: "default", l: "标准" }, { v: "feature", l: "大图" }, { v: "quote", l: "引文" }];
  const layoutField = `<div class="field"><label>卡片样式</label><div class="seg" id="f-layout">${layoutOpts.map(o => `<div class="opt ${o.v === (d.layout || "default") ? "on" : ""}" data-v="${o.v}">${o.l}</div>`).join("")}</div></div>`;
  // custom fields (from m.fields config) — rendered after type-specific fields
  (m.fields || []).forEach(f => {
    const v = d[f.key] || "";
    if (f.type === "select") fields += `<div class="field"><label>${esc(f.label)}</label><div class="seg" id="f-cf-${f.key}">${(f.options || []).map(o => `<div class="opt ${o === v ? "on" : ""}" data-v="${attr(o)}" style="flex:0 0 auto;min-width:auto">${esc(o)}</div>`).join("")}</div></div>`;
    else if (f.type === "textarea") fields += `<div class="field"><label>${esc(f.label)}</label><textarea id="f-cf-${f.key}" placeholder="${attr(f.placeholder || "")}">${esc(v)}</textarea></div>`;
    else if (f.type === "number") fields += `<div class="field"><label>${esc(f.label)}</label><input id="f-cf-${f.key}" type="number" value="${attr(v)}" placeholder="${attr(f.placeholder || "")}"/></div>`;
    else fields += `<div class="field"><label>${esc(f.label)}</label><input id="f-cf-${f.key}" value="${attr(v)}" placeholder="${attr(f.placeholder || "")}"/></div>`;
  });
  // 外观与图片统一折叠：需要时才展开，减轻弹窗首屏重量
  fields = `<div class="form-essential">${fields}</div>`;
  fields += `<details class="modal-fold form-advanced"><summary>外观与图片</summary><div>${layoutField}${mediaFieldHTML(key, d)}</div></details>`;
  const overlay = document.createElement("div"); overlay.className = "overlay editor-overlay";
  overlay.innerHTML = `<div class="modal editor-modal"><div class="modal-head"><h3>${editing ? "编辑" : "新建"} · ${m.name}</h3><div class="sub">${m.desc}</div></div>
    <div class="modal-body">${fields}</div>
    <div class="modal-actions">${editing ? '<button class="link-danger" id="m-del">删除</button>' : ""}<div class="spacer"></div>
      <button class="btn ghost" id="m-cancel">取消</button><button class="btn" id="m-save">保存</button></div></div>`;
  document.body.appendChild(overlay);
  let dirty = false;
  overlay.addEventListener("input", () => { dirty = true; });
  overlay.addEventListener("change", () => { dirty = true; });
  const layer = bindLayer({
    element: overlay,
    confirmDiscard: true,
    isDirty: () => dirty,
    initialFocus: "#f-title",
    onClose: () => { dirty = false; },
  });
  const close = () => layer.requestClose();
  // 保存成功后的关闭不该再问「放弃未保存的修改」：捕获阶段先清标记
  overlay.querySelector("#m-save")?.addEventListener("click", () => { dirty = false; }, true);
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
    d.image_preset = selectedImagePreset(overlay) || d.image_preset || RecordMedia.defaultPresetId(key, d.layout);
    if (!editing) { const records = getData()[key] = getData()[key] || []; RecordList.placeNewAtTop(records, d); records.unshift(d); }
    persist(key, d); close();
    // 记一次保存：只记模块、新建/编辑、填了几个字段，不记标题备注等内容
    Trace.track("record_saved", {
      module: key,
      mode: editing ? "edit" : "create",
      field_count: (m.fields || []).length,
    });
  };
}

/* ---------- delete with undo ---------- */
// 直接删除并弹出「已删除 · 撤销」轻提示，不再弹确认框；撤销恢复本地并重新推送同步
export async function confirmDelete(key, id) {
  const owner = quickEditorOwner();
  const ok = key === "todo" || key === "note" || await AppDialog.confirm("删除后 5 秒内可撤销。", {
    title: "删除这条记录？", danger: true, okText: "删除", cancelText: "保留",
  });
  if (!ok) return;
  const all = getData()[key] || [];
  const index = all.findIndex(i => i.id == id);
  if (index < 0) return;
  const [removed] = all.splice(index, 1);
  try { save(); }
  catch (_) {
    all.splice(index, 0, removed);
    bump();
    Toast.show("删除失败，记录已保留，请重试");
    return false;
  }
  bump();
  // Local persistence is the commit point. A sync failure must not undo it.
  const syncAfterSave = (operation, message) => {
    try { Promise.resolve(operation()).catch(() => Toast.show(message)); }
    catch (_) { Toast.show(message); }
  };
  if (typeof window.markRecordDeleted === "function") {
    syncAfterSave(() => window.markRecordDeleted(key, id), "本机已删除，云端同步失败，请稍后重试同步");
  }
  const title = (removed.title || "这条记录").slice(0, 14);
  let undone = false;
  const undo = () => {
    if (undone) return;
    if ((key === "todo" || key === "note") && quickEditorOwner() !== owner) {
      Toast.show("账号已变化，请切回原账号后恢复记录");
      return;
    }
    const hadList = Object.prototype.hasOwnProperty.call(getData(), key);
    const previousList = getData()[key];
    const list = getData()[key] = previousList || [];
    const position = Math.min(index, list.length);
    const hadTimestamp = Object.prototype.hasOwnProperty.call(removed, "updated_at");
    const timestamp = removed.updated_at;
    removed.updated_at = new Date().toISOString();
    list.splice(position, 0, removed);
    try { save(); }
    catch (_) {
      list.splice(position, 1);
      if (hadTimestamp) removed.updated_at = timestamp;
      else delete removed.updated_at;
      if (hadList) getData()[key] = previousList;
      else delete getData()[key];
      bump();
      Toast.show("撤销保存失败，请重试恢复", { action: { label: "重试恢复", onClick: undo }, duration: 10000 });
      return false;
    }
    undone = true;
    bump();
    // record 型操作 upsert 时 deleted_at 置 null，可覆盖之前的删除标记
    if (typeof window.syncRecord === "function") {
      syncAfterSave(() => window.syncRecord({ moduleKey: key, record: removed }), "记录已恢复到本机，云端同步失败，请稍后重试同步");
    }
    return true;
  };
  Toast.show(`已删除「${title}」`, { action: { label: "撤销", onClick: undo }, duration: 5000 });
  return true;
}
