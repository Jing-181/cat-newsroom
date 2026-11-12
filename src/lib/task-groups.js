// 分组直接随事项保存，旧事项自然归入零散，不迁移记录或同步协议。
export function groupName(value) { return String(value || "").trim().slice(0, 80); }
const groupStateKey = owner => `cat-newsroom-task-groups-v1:${owner ? 'user:' + encodeURIComponent(owner) : 'guest'}`;
export function readTaskGroupOrder(storage, owner) {
  try {
    const state = JSON.parse(storage.getItem(groupStateKey(owner)) || '{}');
    return Array.isArray(state?.order) ? [...new Set(state.order.filter(name => typeof name === 'string').map(groupName))] : [];
  } catch { return []; }
}
export function saveTaskGroupOrder(storage, owner, order) {
  let state;
  try { state = JSON.parse(storage.getItem(groupStateKey(owner)) || '{}'); } catch { state = {}; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  storage.setItem(groupStateKey(owner), JSON.stringify({ ...state, order }));
}
export function moveTaskGroup(names, name, target) {
  const next = [...names], from = next.indexOf(name), to = next.indexOf(target);
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(from, 1); next.splice(to, 0, name);
  return next;
}
export function taskGroups(records, extra = [], savedOrder = []) {
  const names = [...new Set(["", ...records.map(x => groupName(x.group)), ...extra.map(groupName)])];
  const order = Array.isArray(savedOrder) ? savedOrder : [];
  names.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
  return names.map(name => ({ name, items: records.filter(x => groupName(x.group) === name) }));
}
export function createTask(title, group = "") {
  const text = String(title || "").trim();
  if (!text) return null;
  return { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: text, group: groupName(group), done: false, note: "", priority: "P1", created_at: new Date().toISOString() };
}
export function matchesTask(item, query) {
  const q = query.trim().toLocaleLowerCase();
  return !q || [item.title, item.note, item.group].some(value => String(value || "").toLocaleLowerCase().includes(q));
}
