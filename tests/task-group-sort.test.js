import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('group sorting preserves records, empty group and unsorted groups', async () => {
  const { taskGroups, moveTaskGroup } = await import('../src/lib/task-groups.js');
  const records = [{ id: 1, group: 'B' }, { id: 2, group: 'A' }];
  const before = JSON.stringify(records);
  assert.deepEqual(taskGroups(records, ['C'], ['A', '', 'B']).map(g => g.name), ['A', '', 'B', 'C']);
  assert.deepEqual(moveTaskGroup(['A', '', 'B'], 'B', ''), ['A', 'B', '']);
  assert.deepEqual(moveTaskGroup(['A', 'B'], 'missing', 'B'), ['A', 'B']);
  assert.deepEqual(taskGroups(records, [], {}).map(g => g.name), ['', 'B', 'A']);
  assert.equal(JSON.stringify(records), before);
});

test('local order is account isolated, preserves UI fields, leaves home metadata untouched and handles storage failure', async () => {
  const { readTaskGroupOrder, saveTaskGroupOrder } = await import('../src/lib/task-groups.js');
  const values = new Map([['cat-newsroom-data-v2', JSON.stringify({ __homeOrder: ['todo', 'daily'] })]]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const home = values.get('cat-newsroom-data-v2');
  assert.deepEqual(readTaskGroupOrder(storage, 'A'), []);
  values.set('cat-newsroom-task-groups-v1:user:A', JSON.stringify({ extras: ['legacy'], order: ['A', 'A', 1] }));
  assert.deepEqual(readTaskGroupOrder(storage, 'A'), ['A']);
  saveTaskGroupOrder(storage, 'A', ['B', 'A']);
  saveTaskGroupOrder(storage, 'B', ['A', 'B']);
  saveTaskGroupOrder(storage, null, ['', 'guest']);
  assert.deepEqual(readTaskGroupOrder(storage, 'A'), ['B', 'A']);
  assert.deepEqual(readTaskGroupOrder(storage, 'B'), ['A', 'B']);
  assert.deepEqual(readTaskGroupOrder(storage, null), ['', 'guest']);
  assert.deepEqual(JSON.parse(values.get('cat-newsroom-task-groups-v1:user:A')).extras, ['legacy']);
  assert.equal(values.get('cat-newsroom-data-v2'), home);
  values.set('cat-newsroom-task-groups-v1:user:C', 'broken');
  assert.deepEqual(readTaskGroupOrder(storage, 'C'), []);
  assert.throws(() => saveTaskGroupOrder({ ...storage, setItem() { throw Error('quota'); } }, 'A', []), /quota/);
  assert.deepEqual(readTaskGroupOrder(storage, 'A'), ['B', 'A']);
});

async function setup() {
  const { createTaskGroupDrag } = await import('../src/lib/task-group-drag.js');
  const listeners = new Map(), drops = [], changes = [];
  const host = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  let captured = false;
  const handle = { setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured, releasePointerCapture: () => { captured = false; } };
  const event = (overrides = {}) => ({ pointerId: 1, button: 0, clientX: 10, clientY: 10, currentTarget: handle, preventDefault() { this.prevented = true; }, ...overrides });
  const drag = createTaskGroupDrag({ host, getTargets: () => [{ name: 'B', rect: { left: 0, right: 100, top: 50, bottom: 100 } }], onChange: value => changes.push(value), onDrop: (...args) => drops.push(args) });
  return { drag, listeners, drops, changes, event };
}

test('mouse and touch pointer drag commit once; click and sub-threshold motion do nothing', async () => {
  for (const pointerType of ['mouse', 'touch']) {
    const { drag, listeners, drops, event } = await setup();
    drag.start(event({ pointerType }), 'A');
    listeners.get('pointermove')(event({ clientY: 12 }));
    listeners.get('pointerup')(event());
    assert.deepEqual(drops, []);
    drag.start(event({ pointerType }), 'A');
    listeners.get('pointermove')(event({ clientY: 70 }));
    listeners.get('pointerup')(event({ clientY: 70 }));
    listeners.get('pointerup')(event({ clientY: 70 }));
    assert.deepEqual(drops, [['A', 'B']]);
    drag.destroy(); assert.equal(listeners.size, 0);
  }
});

test('cancel, Escape, pointercancel, blur, scroll, outside drop and unrelated pointers never save', async () => {
  for (const reason of ['cancel', 'keydown', 'pointercancel', 'blur', 'scroll', 'outside', 'other-pointer']) {
    const { drag, listeners, drops, event } = await setup();
    drag.start(event(), 'A');
    listeners.get('pointermove')(event({ clientY: 70, pointerId: reason === 'other-pointer' ? 2 : 1 }));
    if (reason === 'cancel') drag.cancel();
    else if (reason === 'outside') listeners.get('pointermove')(event({ clientY: 200 }));
    else if (reason !== 'other-pointer') listeners.get(reason)(event({ key: 'Escape' }));
    listeners.get('pointerup')(event());
    assert.deepEqual(drops, [], reason);
    drag.destroy();
  }
});

test('view uses handle-only touch reservation, keyboard alternative and no homepage/meta writes', () => {
  const view = fs.readFileSync(new URL('../src/modules/todo/TodoView.vue', import.meta.url), 'utf8');
  assert.match(view, /saveTaskGroupOrder\(localStorage, currentOwner\(\), next\)/);
  assert.doesNotMatch(view, /__homeOrder|saveMetaField|syncMetaField/);
  assert.match(view, /\['ArrowUp', 'ArrowDown'\]/);
  assert.match(view, /@lostpointercapture="drag\?\.cancel\(\)"/);
  assert.match(view, /\.task-drag-handle \{[^}]*touch-action: none/);
  assert.doesNotMatch(view, /draggable="true"/);
});
