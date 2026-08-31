(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorkbenchCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  function createId(prefix = "record") {
    const suffix = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function saveLocal(storageKey, data, storage = window.localStorage) {
    storage.setItem(storageKey, JSON.stringify(data));
  }

  function saveRecord(storageKey, data, moduleKey, record) {
    if (!record) return;
    record.updated_at = new Date().toISOString();
    saveLocal(storageKey, data);
    if (typeof syncRecord === "function") syncRecord({ moduleKey, record });
  }

  function saveMeta(storageKey, data, localKey, value) {
    data[localKey] = value;
    saveLocal(storageKey, data);
    if (typeof syncMetaField === "function") syncMetaField({ field: localKey, value });
  }

  return { createId, localDateKey, saveLocal, saveRecord, saveMeta };
});
