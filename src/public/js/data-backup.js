(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DataBackup = api;
})(typeof window !== "undefined" ? window : null, function () {
  const SCHEMA_VERSION = 1;
  const META_KEYS = ["__avatar", "__pomo", "__trend"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createSnapshot(data, storageKey, exportedAt = new Date().toISOString()) {
    return {
      schema_version: SCHEMA_VERSION,
      kind: "cat_newsroom_backup",
      exported_at: exportedAt,
      storage_key: storageKey || "",
      data: clone(data || {}),
    };
  }

  function validate(snapshot, moduleKeys = []) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
    if (snapshot.schema_version !== SCHEMA_VERSION || snapshot.kind !== "cat_newsroom_backup") return false;
    if (!snapshot.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)) return false;
    if (!snapshot.exported_at || Number.isNaN(Date.parse(snapshot.exported_at))) return false;
    return moduleKeys.every(key => snapshot.data[key] === undefined || Array.isArray(snapshot.data[key]));
  }

  function parse(text, moduleKeys = []) {
    let snapshot;
    try { snapshot = JSON.parse(text); } catch (_) { throw new Error("备份文件不是有效的 JSON"); }
    if (!validate(snapshot, moduleKeys)) throw new Error("备份文件格式或版本不受支持");
    return clone(snapshot);
  }

  function dataForRestore(snapshot, moduleKeys = []) {
    const next = {};
    moduleKeys.forEach(key => { next[key] = Array.isArray(snapshot.data[key]) ? clone(snapshot.data[key]) : []; });
    META_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(snapshot.data, key)) next[key] = clone(snapshot.data[key]);
    });
    return next;
  }

  function download(snapshot, filename = "cat-newsroom-backup.json") {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function mount({ exportButton, importButton, input, getData, setData, storageKey, moduleKeys, confirm }) {
    if (!exportButton || !importButton || !input) return;
    const keys = moduleKeys || [];
    exportButton.addEventListener("click", () => {
      const date = new Date().toISOString().slice(0, 10);
      download(createSnapshot(getData(), storageKey), `cat-newsroom-backup-${date}.json`);
    });
    importButton.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      try {
        const snapshot = parse(await file.text(), keys);
        if (confirm && !(await confirm("导入备份会覆盖当前浏览器中的本地记录，云端数据不会自动修改。是否继续？"))) return;
        setData(dataForRestore(snapshot, keys), snapshot);
      } catch (error) {
        if (root.AppDialog?.alert) root.AppDialog.alert(error.message || "备份导入失败", { title: "导入失败" });
      }
    });
  }

  return { SCHEMA_VERSION, createSnapshot, validate, parse, dataForRestore, download, mount };
});
