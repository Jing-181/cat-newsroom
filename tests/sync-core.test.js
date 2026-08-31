const test = require("node:test");
const assert = require("node:assert/strict");
const sync = require("../js/sync-core.js");

test("Realtime 只更新事件对应记录", () => {
  const local = { todo: [{ id: "1", title: "旧", updated_at: "2026-01-01T00:00:00Z" }], note: [{ id: "2", title: "保留" }] };
  sync.applyRealtime(local, { table: "workbench_records", newRow: { id: "1", module_key: "todo", data: { id: "1", title: "新" }, updated_at: "2026-01-02T00:00:00Z" } });
  assert.equal(local.todo[0].title, "新");
  assert.equal(local.note[0].title, "保留");
});

test("远端 tombstone 删除本地记录", () => {
  const local = { todo: [{ id: "1" }] };
  sync.applyRecord(local, "todo", { id: "1", deleted_at: "2026-01-02T00:00:00Z" });
  assert.equal(local.todo.length, 0);
});

test("outbox 对同一实体保留最后一次原子操作", () => {
  let outbox = sync.enqueue([], { type: "record", moduleKey: "todo", record: { id: "1", title: "a" } });
  outbox = sync.enqueue(outbox, { type: "record", moduleKey: "todo", record: { id: "1", title: "b" } });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].record.title, "b");
});
