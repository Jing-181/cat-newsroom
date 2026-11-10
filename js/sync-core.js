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
      if (index >= 0 && (row.__accepted || timeOf(row.updated_at || row.deleted_at) >= timeOf(list[index].updated_at))) list.splice(index, 1);
      return local;
    }
    const next = { ...(row.data || {}), id: row.data?.id ?? row.id, updated_at: row.updated_at || row.data?.updated_at };
    const current = index >= 0 ? list[index] : null;
    if (row.__accepted || !current || timeOf(next.updated_at) >= timeOf(current.updated_at)) {
      if (index >= 0) list[index] = next;
      else list.unshift(next);
    }
    return local;
  }

  function applyMeta(local, row) {
    if (Object.prototype.hasOwnProperty.call(row, "avatar")) local.__avatar = row.avatar || "";
    if (Object.prototype.hasOwnProperty.call(row, "pomo_stats")) local.__pomo = row.pomo_stats || { count: 0, min: 0 };
    if (Object.prototype.hasOwnProperty.call(row, "trend_data")) local.__trend = row.trend_data || [];
    if (Object.prototype.hasOwnProperty.call(row, "home_order")) local.__homeOrder = row.home_order;
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
      next[tombstone.module_key] = list.filter(item => String(item.id) !== String(tombstone.record_id) || timeOf(item.updated_at) > timeOf(tombstone.updated_at || tombstone.deleted_at));
    });
    if (Object.prototype.hasOwnProperty.call(cloud, "__avatar")) next.__avatar = cloud.__avatar;
    if (Object.prototype.hasOwnProperty.call(cloud, "__pomo")) next.__pomo = cloud.__pomo;
    if (Object.prototype.hasOwnProperty.call(cloud, "__trend")) next.__trend = cloud.__trend;
    return next;
  }

  function applyPending(local, outbox) {
    (outbox || []).forEach(operation => {
      if (operation.type === "record" && operation.moduleKey && operation.record) {
        const list = Array.isArray(local[operation.moduleKey]) ? local[operation.moduleKey] : (local[operation.moduleKey] = []);
        const index = list.findIndex(item => String(item.id) === String(operation.record.id));
        if (index >= 0) list[index] = operation.record;
        else list.unshift(operation.record);
      }
      if (operation.type === "delete" && operation.moduleKey) {
        const list = Array.isArray(local[operation.moduleKey]) ? local[operation.moduleKey] : [];
        local[operation.moduleKey] = list.filter(item => String(item.id) !== String(operation.recordId));
      }
      if (operation.type === "meta") {
        const fieldMap = { __avatar: "__avatar", __pomo: "__pomo", __trend: "__trend", __homeOrder: "__homeOrder" };
        const field = fieldMap[operation.field];
        if (field) local[field] = operation.value;
      }
    });
    return local;
  }

  function entityKey(operation) {
    if (operation.type === "meta") return `meta:${operation.field}`;
    return `record:${operation.moduleKey}:${operation.recordId || operation.record?.id}`;
  }

  function enqueue(outbox, operation) {
    const key = entityKey(operation);
    const filtered = outbox.filter(item => entityKey(item) !== key || item.accountId !== operation.accountId);
    filtered.push(operation);
    return filtered;
  }

  // Only server timestamps enter watermarks. Local timestamps are payload, never clocks.
  function createRaceGuard() {
    let revision = 0;
    const entries = new Map();
    const watermarks = new Map();
    const remoteRevisions = new Map();
    const absent = new Set();
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function pending(operation) {
      const key = entityKey(operation);
      const existing = entries.get(key);
      if (existing?.operation.operationId === operation.operationId) return;
      entries.set(key, { operation, revision: ++revision, ack: false, released: false });
    }
    function acknowledge(operation, row) {
      const entry = entries.get(entityKey(operation));
      if (entry?.operation.operationId !== operation.operationId) return;
      entry.ack = true;
      entry.version = timeOf(row?.updated_at);
    }
    function snapshot() {
      return { revision, remoteRevisions: new Map(remoteRevisions), watermarks: new Map(watermarks), pending: new Set([...entries].filter(([, e]) => !e.released).map(([, e]) => e.operation.operationId)), acknowledged: new Set([...entries].filter(([, e]) => e.ack).map(([, e]) => e.operation.operationId)) };
    }
    function accept(key, row, value, snapshot) {
      const version = timeOf(row?.updated_at);
      const entry = entries.get(key);
      if (snapshot && preserve(key, snapshot)) return false;
      if (entry && !entry.released) {
        const op = entry.operation;
        const matches = op.type === 'meta' ? equal(op.value, value)
          : op.type === 'delete' ? !!row?.deleted_at
          : !row?.deleted_at && equal(op.record, row?.data);
        // An echo is useful only after ACK and at/above that ACK's server version.
        const confirmed = entry.ack && version && (!entry.version || version >= entry.version)
          && (snapshot ? snapshot.acknowledged.has(op.operationId) : matches);
        if (!confirmed) return false;
        entry.released = true;
      }
      if (snapshot && entry?.revision > snapshot.revision) return false;
      if (version < (watermarks.get(key) || 0) || (absent.has(key) && version <= (watermarks.get(key) || 0))) return false;
      absent.delete(key);
      if (version) watermarks.set(key, version);
      remoteRevisions.set(key, (remoteRevisions.get(key) || 0) + 1);
      return true;
    }
    function preserve(key, snapshot) {
      const entry = entries.get(key);
      return !!snapshot && (((snapshot.arrivalRevisions || remoteRevisions).get(key) || 0) > (snapshot.remoteRevisions.get(key) || 0) || ((snapshot.arrivalWatermarks || watermarks).get(key) || 0) > (snapshot.watermarks.get(key) || 0)
        || (entry && (entry.revision > snapshot.revision
          || (snapshot.pending.has(entry.operation.operationId) && !snapshot.acknowledged.has(entry.operation.operationId)))));
    }
    function protectedOperations(snapshot) {
      return [...entries].filter(([, e]) => !e.released || (snapshot && (e.revision > snapshot.revision || (snapshot.pending.has(e.operation.operationId) && !snapshot.acknowledged.has(e.operation.operationId))))).map(([, e]) => e.operation);
    }
    return { pending, acknowledge, snapshot, accept, protectedOperations, preserve,
      beginReadMerge(snapshot) { if (snapshot) { snapshot.arrivalWatermarks = new Map(watermarks); snapshot.arrivalRevisions = new Map(remoteRevisions); } },
      confirmMissing(key, snapshot) {
        const entry = entries.get(key);
        if (!snapshot || preserve(key, snapshot)) return false;
        if (entry && !entry.released && !snapshot.acknowledged.has(entry.operation.operationId)) return false;
        if (entry) { entry.released = true; if (entry.version) watermarks.set(key, Math.max(watermarks.get(key) || 0, entry.version)); }
        absent.add(key);
        return true;
      },
      recordKeys() { return [...new Set([...entries.keys(), ...watermarks.keys()])].filter(key => key.startsWith('record:')); } };
  }

  return { applyRecord, applyMeta, applyRealtime, mergeFull, applyPending, entityKey, enqueue, createRaceGuard };
});
