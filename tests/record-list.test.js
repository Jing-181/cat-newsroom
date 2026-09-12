const test = require("node:test");
const assert = require("node:assert/strict");
const RecordList = require("../js/record-list.js");

test("records default to newest first", () => {
  const records = [{ id: 1 }, { id: 3 }, { id: 2 }];
  assert.deepEqual(RecordList.sortNewest(records).map(record => record.id), [3, 2, 1]);
});

test("分页返回指定页并将页码限制在有效范围", () => {
  const records = Array.from({ length: 45 }, (_, id) => ({ id: id + 1 }));
  const page = RecordList.paginate(records, 2, 20);
  assert.deepEqual(page.items.map(record => record.id), Array.from({ length: 20 }, (_, id) => id + 21));
  assert.equal(page.totalPages, 3);
  assert.equal(page.hasPrev, true);
  assert.equal(page.hasNext, true);
  assert.equal(RecordList.paginate(records, 99, 20).page, 3);
  assert.equal(RecordList.paginate(records, 0, 20).page, 1);
});

test("a newly created record is placed before an existing manual order", () => {
  const records = [{ id: 1, sort_order: 0 }, { id: 2, sort_order: 1 }];
  const fresh = { id: 3 };
  RecordList.placeNewAtTop(records, fresh);
  assert.deepEqual(RecordList.sortNewest([...records, fresh]).map(record => record.id), [3, 1, 2]);
});

test("drag reordering writes a stable manual order", () => {
  const records = [{ id: 3 }, { id: 2 }, { id: 1 }];
  const reordered = RecordList.reorder(records, 1, 3, false);
  assert.deepEqual(reordered.map(record => record.id), [1, 3, 2]);
  assert.deepEqual(reordered.map(record => record.sort_order), [0, 1, 2]);
});
