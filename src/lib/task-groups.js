// 分组直接随事项保存，旧事项自然归入零散，不迁移记录或同步协议。
export function groupName(value) { return String(value || "").trim().slice(0, 80); }
export function taskGroups(records, extra = []) {
  const names = [...new Set(["", ...records.map(x => groupName(x.group)), ...extra.map(groupName)])];
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
