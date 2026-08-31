(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SyncCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  const timeOf = value => Date.parse(value || 0) || 0;

  function applyRecord(local, moduleKey, row) {
    const list = Array.isArray(local[moduleKey]) ? local[moduleKey] : (local[moduleKey] = []);
    const index = list.findIndex(item => String(item.id) === String(row.id));
    if (row.deleted_at) {
      if (index >= 0) list.splice(index, 1);
      return local;
    }
    const next = { ...(row.data || {}), id: row.data?.id ?? row.id, updated_at: row.data?.updated_at || row.updated_at };
    const current = index >= 0 ? list[index] : null;
    if (!current || timeOf(next.updated_at) >= timeOf(current.updated_at)) {
      if (index >= 0) list[index] = next;
      else list.unshift(next);
    }
    return local;
  }

  function applyMeta(local, row) {
    if (Object.prototype.hasOwnProperty.call(row, "avatar")) local.__avatar = row.avatar || "";
    if (Object.prototype.hasOwnProperty.call(row, "pomo_stats")) local.__pomo = row.pomo_stats || { count: 0, min: 0 };
    if (Object.prototype.hasOwnProperty.call(row, "trend_data")) local.__trend = row.trend_data || [];
    return local;
  }

  function applyRealtime(local, change) {
    if (change.table === "workbench_records") {
      const row = change.newRow || { ...change.oldRow, deleted_at: new Date().toISOString() };
      const moduleKey = row.module_key;
      if (moduleKey) return applyRecord(local, moduleKey, row);
      Object.keys(local).filter(key => Array.isArray(local[key])).forEach(key => applyRecord(local, key, row));
      return local;
    }
    if (change.table === "workbench_meta" && change.newRow) return applyMeta(local, change.newRow);
    return local;
  }

  function mergeFull(local, cloud, moduleKeys) {
    const next = local;
    moduleKeys.forEach(moduleKey => {
      const remote = Array.isArray(cloud[moduleKey]) ? cloud[moduleKey] : [];
      const merged = new Map((next[moduleKey] || []).map(item => [String(item.id), item]));
      remote.forEach(item => {
        const current = merged.get(String(item.id));
        if (!current || timeOf(item.updated_at) >= timeOf(current.updated_at)) merged.set(String(item.id), item);
      });
      next[moduleKey] = [...merged.values()];
    });
    (cloud.__deleted || []).forEach(tombstone => {
      const list = next[tombstone.module_key] || [];
      next[tombstone.module_key] = list.filter(item => String(item.id) !== String(tombstone.record_id));
    });
    if (Object.prototype.hasOwnProperty.call(cloud, "__avatar")) next.__avatar = cloud.__avatar;
    if (Object.prototype.hasOwnProperty.call(cloud, "__pomo")) next.__pomo = cloud.__pomo;
    if (Object.prototype.hasOwnProperty.call(cloud, "__trend")) next.__trend = cloud.__trend;
    return next;
  }

  function entityKey(operation) {
    if (operation.type === "meta") return `meta:${operation.field}`;
    return `record:${operation.moduleKey}:${operation.recordId || operation.record?.id}`;
  }

  function enqueue(outbox, operation) {
    const key = entityKey(operation);
    const filtered = outbox.filter(item => entityKey(item) !== key);
    filtered.push(operation);
    return filtered;
  }

  return { applyRecord, applyMeta, applyRealtime, mergeFull, entityKey, enqueue };
});
