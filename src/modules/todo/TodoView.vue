<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { getData, persist, subscribe, save, bump } from "../../lib/store.js";
import { openEditor, confirmDelete } from "../../lib/editor.js";
import { taskGroups, createTask, matchesTask, groupName, readTaskGroupOrder, saveTaskGroupOrder, moveTaskGroup } from "../../lib/task-groups.js";
import { createTaskGroupDrag } from "../../lib/task-group-drag.js";
import Toast from "../../lib/toast.js";
import AppDialog from "../../lib/app-dialog.js";

const revision = ref(0);
const root = ref(null);
const dragging = ref(null);
const orderMessage = ref("");
let drag;
const query = ref("");
const drafts = ref(Object.create(null));
const currentOwner = () => window.getCurrentUser?.()?.id || null;
let draftOwner = currentOwner();
const savedOrder = ref(readTaskGroupOrder(localStorage, draftOwner));
function checkOwner() {
  if (currentOwner() === draftOwner) return true;
  savedOrder.value = readTaskGroupOrder(localStorage, currentOwner());
  // 首次身份恢复不丢弃刚输入的本机草稿；已知账号切换仍清空。
  if (draftOwner === null && currentOwner()) { draftOwner = currentOwner(); return true; }
  draftOwner = currentOwner();
  drafts.value = Object.create(null); extras.value = []; newGroup.value = ""; folded.value = new Set();
  return false;
}
const newGroup = ref("");
const extras = ref([]);
const folded = ref(new Set());
const composing = ref(false);
// store 数组非响应式；返回新快照，避免 Vue 以同一引用跳过分组重算。
const records = computed(() => { revision.value; return [...(getData().todo || [])]; });
const groups = computed(() => taskGroups(records.value, extras.value, savedOrder.value).map(g => ({ ...g, items: g.items.filter(x => matchesTask(x, query.value)) })).filter(g => !query.value.trim() || g.items.length));
let unsubscribe;
onMounted(() => {
  drag = createTaskGroupDrag({ host: window,
    getTargets: () => [...root.value.querySelectorAll('[data-task-group]')].map(el => ({ name: el.dataset.taskGroup, rect: el.getBoundingClientRect() })),
    onChange: value => { dragging.value = value; }, onDrop: reorder,
  });
  unsubscribe = subscribe(() => { drag.cancel(); checkOwner(); revision.value++; });
});
onBeforeUnmount(() => { unsubscribe?.(); drag?.destroy(); });
function reorder(name, target) {
  if (!checkOwner() || query.value.trim()) return;
  const names = taskGroups(records.value, extras.value, savedOrder.value).map(g => g.name);
  const next = moveTaskGroup(names, name, target);
  if (next.every((value, index) => value === names[index])) return;
  try { saveTaskGroupOrder(localStorage, currentOwner(), next); }
  catch { Toast.show('排序未保存，请重试'); return; }
  savedOrder.value = next;
  orderMessage.value = `${name || '零散事项'}已移到第 ${next.indexOf(name) + 1} 组`;
  revision.value++;
}
function orderKey(event, name) {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  drag?.cancel();
  const names = groups.value.map(g => g.name), index = names.indexOf(name);
  const target = names[index + (event.key === 'ArrowUp' ? -1 : 1)];
  if (target !== undefined) reorder(name, target);
}
function changed(item) { persist("todo", item); }
function add(group) {
  if (!checkOwner()) { Toast.show("账号已切换，请在当前账号重新输入"); return; }
  if (composing.value) return;
  const item = createTask(drafts.value[group], group);
  if (!item) return;
  const list = getData().todo ||= [];
  list.unshift(item);
  try { changed(item); drafts.value[group] = ""; query.value = ""; }
  catch { list.splice(list.indexOf(item), 1); Toast.show("保存失败，内容已保留，请重试"); }
}
function addGroup() {
  if (!checkOwner()) return;
  const name = groupName(newGroup.value);
  if (!name) return;
  if (!extras.value.includes(name)) extras.value.push(name);
  folded.value.delete(name);
  newGroup.value = "";
}
async function deleteGroup(name) {
  const owner = window.getCurrentUser?.()?.id || null;
  const items = (getData().todo || []).filter(x => groupName(x.group) === name);
  if (!await AppDialog.confirm(`删除「${name || '零散事项'}」中的全部 ${items.length} 条事项？`, { title: "删除整组事项", danger: true, okText: "删除整组", cancelText: "保留" })) return;
  if ((window.getCurrentUser?.()?.id || null) !== owner) { Toast.show("账号已变化，请重新操作"); return; }
  const data = getData(), previous = data.todo;
  data.todo = previous.filter(x => !items.some(item => item.id === x.id));
  try { save(); } catch { data.todo = previous; Toast.show("删除未保存，原事项已保留"); return; }
  let syncFailed = false;
  items.forEach(x => { try { window.syncDelete?.({ moduleKey: "todo", recordId: x.id }); } catch { syncFailed = true; } });
  if (syncFailed) Toast.show("本机已删除，部分同步未发出，请稍后检查同步状态");
  extras.value = extras.value.filter(x => x !== name);
  bump();
  Toast.show("整组事项已删除", { duration: 5000, action: { label: "撤销", onClick: () => {
    if ((window.getCurrentUser?.()?.id || null) !== owner) { Toast.show("账号已变化，无法撤销原账号的操作"); return; }
    restoreGroup(items, owner);
  } } });
}
function restoreGroup(items, owner) {
  if (currentOwner() !== owner) { Toast.show("账号已变化，请切回原账号"); return; }
  const data = getData(), previous = data.todo || [];
  const restored = items.filter(item => !previous.some(x => x.id === item.id));
  data.todo = [...previous, ...restored];
  try { save(); } catch { data.todo = previous; Toast.show("恢复未保存，请重试", { duration: 5000, action: { label: "重试恢复", onClick: () => restoreGroup(items, owner) } }); return; }
  let syncFailed = false;
  restored.forEach(record => { try { window.syncRecord?.({ moduleKey: "todo", record }); } catch { syncFailed = true; } });
  if (syncFailed) Toast.show("本机已恢复，部分同步未发出，请稍后检查同步状态");
  bump();
}
function toggleGroup(name) {
  const next = new Set(folded.value);
  next.has(name) ? next.delete(name) : next.add(name);
  folded.value = next;
}
function toggle(item) {
  const owner = window.getCurrentUser?.()?.id || null;
  const before = item.done;
  item.done = !item.done;
  try { changed(item); } catch { item.done = before; revision.value++; Toast.show("状态未保存，请重试"); return; }
  if (item.done) Toast.show("已完成", { duration: 5000, action: { label: "撤销", onClick: () => {
    if ((window.getCurrentUser?.()?.id || null) !== owner) { Toast.show("账号已变化，无法撤销原账号的操作"); return; }
    const current = getData().todo?.find(x => x.id === item.id);
    if (current) { current.done = false; try { changed(current); } catch { current.done = true; revision.value++; Toast.show("恢复未保存，请再次取消勾选"); } }
  } } });
}
</script>

<template>
  <section ref="root" class="tasks-view">
    <header class="header"><div><h2>事项</h2><p>按版本安排，随手记下要做的事。</p></div></header>
    <div class="tasks-tools">
      <input v-model="query" class="shared-field" type="search" placeholder="搜索事项或版本…" aria-label="搜索事项或版本">
      <form class="task-add" @submit.prevent="addGroup">
        <input v-model="newGroup" class="shared-field" maxlength="80" placeholder="版本或分组名称" aria-label="新分组名称">
        <button class="btn ghost" :disabled="!newGroup.trim()">新建分组</button>
      </form>
    </div>
    <p v-if="extras.some(name => !records.some(item => groupName(item.group) === name))" class="sub">新分组添加第一条事项后保存。</p>
    <p id="task-group-sort-help" class="task-sort-help">拖动手柄排序；键盘聚焦手柄后按上下方向键。顺序仅保存在当前设备的当前账号，不跨设备同步；搜索时暂停排序。</p>
    <span class="task-sort-status" role="status" aria-live="polite">{{ orderMessage }}</span>
    <section v-for="group in groups" :key="group.name" class="task-group" :data-task-group="group.name" :class="{ 'is-dragging': dragging?.name === group.name, 'is-drop-target': dragging?.target === group.name && dragging?.name !== group.name }">
      <header class="task-group-head">
        <button type="button" class="task-drag-handle" :disabled="!!query.trim() || groups.length < 2" :aria-label="`排序 ${group.name || '零散事项'}`" aria-describedby="task-group-sort-help" @pointerdown="drag?.start($event, group.name)" @lostpointercapture="drag?.cancel()" @keydown="orderKey($event, group.name)"><span aria-hidden="true">⠿</span></button>
        <button class="task-group-toggle" :aria-expanded="!folded.has(group.name)" @click="toggleGroup(group.name)">
          <span aria-hidden="true">{{ folded.has(group.name) ? '▸' : '▾' }}</span>
          {{ group.name || '零散事项' }}
          <small>{{ group.items.filter(x => !x.done).length }} 项未完成</small>
        </button>
        <details v-if="group.items.length" class="task-menu"><summary aria-label="分组操作">···</summary><div><button @click="toggleGroup(group.name)">{{ folded.has(group.name) ? '展开整组' : '收起整组' }}</button><button class="danger" @click="deleteGroup(group.name)">删除整组</button></div></details>
      </header>
      <div v-show="!folded.has(group.name)">
        <div v-for="item in group.items.filter(x => !x.done)" :key="item.id" class="task-line">
          <label class="task-check"><input type="checkbox" :checked="item.done" :aria-label="`完成 ${item.title}`" @change="toggle(item)"><span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3.2 3.2L15 6.5" /></svg></span></label>
          <button class="task-body" @click="openEditor('todo', item)"><span>{{ item.title }}</span><small v-if="item.note">{{ item.note }}</small><small v-if="item.image">含图片</small></button>
          <details class="task-menu"><summary aria-label="更多操作">···</summary><div><button @click="openEditor('todo', item)">编辑 / 移到分组</button><button class="danger" @click="confirmDelete('todo', item.id)">删除</button></div></details>
        </div>
        <form class="task-add task-inline-add" @submit.prevent="add(group.name)">
          <input v-model="drafts[group.name]" class="shared-field" placeholder="添加事项…" :aria-label="`添加到${group.name || '零散事项'}`" enterkeyhint="done" @compositionstart="composing = true" @compositionend="composing = false">
          <button class="btn ghost" :disabled="!drafts[group.name]?.trim()">添加</button>
        </form>
        <details v-if="group.items.some(x => x.done)" class="task-done">
          <summary>已完成 {{ group.items.filter(x => x.done).length }} 项</summary>
          <div v-for="item in group.items.filter(x => x.done)" :key="item.id" class="task-line">
            <label class="task-check"><input type="checkbox" checked :aria-label="`恢复 ${item.title}`" @change="toggle(item)"><span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3.2 3.2L15 6.5" /></svg></span></label>
            <button class="task-body" @click="openEditor('todo', item)">{{ item.title }}</button>
            <details class="task-menu"><summary aria-label="更多操作">···</summary><div><button @click="openEditor('todo', item)">编辑 / 移到分组</button><button class="danger" @click="confirmDelete('todo', item.id)">删除</button></div></details>
          </div>
        </details>
      </div>
    </section>
    <p v-if="!groups.length" class="sub">没有匹配的事项，试试其他关键词。</p>
  </section>
</template>

<style scoped>
.tasks-view { max-width: 960px; margin: 0 auto; }
.task-sort-help { color: var(--text-secondary); font: 12px/1.5 var(--font-sans); }
.task-sort-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.task-drag-handle { flex: 0 0 44px; width: 44px; height: 44px; border: 0; border-radius: var(--radius-control); background: none; color: var(--text-secondary); font-size: 24px; cursor: grab; touch-action: none; user-select: none; }
.task-drag-handle:hover { background: var(--surface-nested); }
.task-drag-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.task-drag-handle:disabled { opacity: .4; cursor: default; touch-action: auto; }
.task-group.is-dragging { opacity: .65; }
.task-group.is-dragging .task-drag-handle { cursor: grabbing; }
.task-group.is-drop-target { outline: 2px solid var(--accent); outline-offset: 2px; }
.tasks-tools { display: flex; gap: 16px; margin-bottom: 24px; align-items: center; }
.tasks-tools > input { flex: 1; min-width: 0; }
.task-add { display: flex; gap: 8px; }
.task-add input { flex: 1; min-width: 0; }
.task-add button { flex-shrink: 0; }
.task-group { border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-card); margin-bottom: 16px; }
.task-group-head { padding: 16px; display: flex; align-items: center; gap: 8px; }
.task-group-toggle { display: flex; align-items: center; gap: 8px; border: 0; background: none; color: var(--text); font: 700 14px var(--font-sans); cursor: pointer; width: 100%; min-width: 0; text-align: left; overflow-wrap: anywhere; }
.task-group-toggle small { margin-left: auto; color: var(--text-secondary); font: 12px var(--font-sans); white-space: nowrap; }
.task-line { display: flex; gap: 12px; padding: 12px 16px; align-items: center; border-top: 1px solid var(--border); }
.task-check { position: relative; display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; cursor: pointer; }
.task-check input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.task-check > span { display: grid; place-items: center; width: 20px; height: 20px; border: 1.5px solid var(--border-input); border-radius: 6px; background: var(--surface-card); transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out); pointer-events: none; }
.task-check svg { width: 18px; height: 18px; fill: none; stroke: var(--surface-card); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
.task-check input:checked + span { background: var(--module-1); border-color: var(--module-1); }
.task-check input:checked + span svg { opacity: 1; }
.task-check:hover > span { border-color: var(--module-1); }
.task-check input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 3px; }
.tasks-view :is(input, button, summary) { font-family: var(--font-sans); }
.tasks-view input.shared-field { font-size: 14px; font-weight: 400; }
.tasks-view input::placeholder { font-weight: 400; color: var(--text-tertiary); }
.tasks-view .btn { font-size: 13px; font-weight: 500; }
.tasks-view .header h2 { font-family: var(--font); }
.task-body { flex: 1; min-width: 0; border: 0; padding: 4px 0; background: none; color: var(--text); text-align: left; font: 14px/1.6 var(--font-sans); overflow-wrap: anywhere; cursor: pointer; }
.task-body small { display: block; color: var(--text-secondary); white-space: pre-wrap; max-height: 3.2em; overflow: hidden; }
.task-inline-add { padding: 12px 16px; }
.task-done { padding: 8px 16px 16px; color: var(--text-secondary); font: 13px var(--font-sans); }
.task-done > summary { cursor: pointer; padding: 8px 0; }
.task-done .task-line { padding-left: 0; padding-right: 0; }
.task-done .task-body { color: var(--text-secondary); text-decoration: line-through; }
.task-menu { position: relative; flex-shrink: 0; font: 14px var(--font-sans); }
.task-menu summary { list-style: none; cursor: pointer; padding: 8px; min-width: 36px; text-align: center; }
.task-menu summary::-webkit-details-marker { display: none; }
.task-menu > div { position: absolute; right: 0; top: 100%; z-index: 5; width: 160px; padding: 8px; background: var(--surface-card); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); }
.task-menu button { display: block; padding: 12px 8px; width: 100%; text-align: left; border: 0; color: var(--text); background: none; cursor: pointer; }
.task-menu button:hover { background: var(--surface-nested); }
.task-menu .danger { color: var(--danger); }
@media (max-width: 820px) { .tasks-tools { flex-direction: column; align-items: stretch; gap: 12px; } .task-group-toggle { flex-wrap: wrap; } }
</style>
