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

test("全量覆盖后保留尚未上传的本地记录和删除", () => {
  const local = { todo: [{ id: "1", title: "云端旧值" }, { id: "2", title: "待删除" }] };
  sync.applyPending(local, [
    { type: "record", moduleKey: "todo", record: { id: "1", title: "本地新值" } },
    { type: "delete", moduleKey: "todo", recordId: "2" },
    { type: "record", moduleKey: "todo", record: { id: "3", title: "本地新增" } },
  ]);
  assert.deepEqual(local.todo.map(item => item.id).sort(), ["1", "3"]);
  assert.equal(local.todo.find(item => item.id === "1").title, "本地新值");
  assert.equal(local.todo.find(item => item.id === "3").title, "本地新增");
});

test("全量覆盖后保留尚未上传的元数据", () => {
  const local = { __avatar: "旧头像", __pomo: { count: 1, min: 25 } };
  sync.applyPending(local, [
    { type: "meta", field: "__avatar", value: "本地头像" },
    { type: "meta", field: "__pomo", value: { count: 2, min: 50 } },
  ]);
  assert.equal(local.__avatar, "本地头像");
  assert.deepEqual(local.__pomo, { count: 2, min: 50 });
});
