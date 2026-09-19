const test = require("node:test");
const assert = require("node:assert/strict");
const backup = require("../js/data-backup.js");

const keys = ["todo", "sport"];

test("备份快照包含版本、时间和本地数据", () => {
  const snapshot = backup.createSnapshot({ todo: [{ id: 1, title: "任务" }], __pomo: { count: 2 } }, "cat-newsroom-data-v2", "2026-09-19T00:00:00Z");
  assert.equal(snapshot.kind, "cat_newsroom_backup");
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.storage_key, "cat-newsroom-data-v2");
  assert.equal(backup.validate(snapshot, keys), true);
});

test("备份导入会校验格式并只恢复业务模块和元数据", () => {
  const snapshot = backup.createSnapshot({ todo: [{ id: 1 }], sport: [], unknown: "忽略", __avatar: "data:image/png;base64,x" }, "cat-newsroom-data-v2", "2026-09-19T00:00:00Z");
  const parsed = backup.parse(JSON.stringify(snapshot), keys);
  assert.deepEqual(backup.dataForRestore(parsed, keys), { todo: [{ id: 1 }], sport: [], __avatar: "data:image/png;base64,x" });
  assert.throws(() => backup.parse("{}", keys), /格式或版本/);
});

test("备份导入拒绝模块字段的错误类型", () => {
  const snapshot = backup.createSnapshot({ todo: "不是数组" }, "cat-newsroom-data-v2", "2026-09-19T00:00:00Z");
  assert.equal(backup.validate(snapshot, keys), false);
});
