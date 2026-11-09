import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('旧事项归入零散，按版本分组且不修改源记录', async () => {
  const { taskGroups } = await import('../src/lib/task-groups.js');
  const input = [{ id: 1 }, { id: 2, group: ' v1 ' }, { id: 3, group: 'v1' }];
  const before = JSON.stringify(input);
  const groups = taskGroups(input, ['v2', 'v1']);
  assert.deepEqual(groups.map(x => [x.name, x.items.length]), [['', 1], ['v1', 2], ['v2', 0]]);
  assert.equal(JSON.stringify(input), before);
});
test('快捷新增忽略空白，ID唯一且保持todo数据结构', async () => {
  const { createTask } = await import('../src/lib/task-groups.js');
  assert.equal(createTask('  '), null);
  const a = createTask('  修复设置  ', ' v1 ');
  const b = createTask('修复设置');
  assert.equal(a.title, '修复设置'); assert.equal(a.group, 'v1');
  assert.equal(a.done, false); assert.notEqual(a.id, b.id);
});
test('搜索覆盖标题、备注、版本名', async () => {
  const { matchesTask } = await import('../src/lib/task-groups.js');
  const a = { title: '设置', note: '截图', group: 'VNext' };
  for (const q of ['', '设置', '截图', 'vnext']) assert.equal(matchesTask(a, q), true);
  assert.equal(matchesTask(a, '找不到'), false);
});
test('事项新增不重建页面并防止中文输入确认误提交', () => {
  const source = read('src/modules/todo/TodoView.vue');
  assert.match(source, /@submit.prevent="add\(group.name\)"/);
  assert.match(source, /if \(composing.value\) return/);
  assert.match(source, /if \(!checkOwner\(\)\)/);
  assert.match(source, /drafts.value\[group\] = ""/);
  assert.doesNotMatch(source, /innerHTML|ModuleView|resolveRecordImage/);
  assert.match(source, /subscribe\(/);
  assert.match(source, /return \[\.\.\.\(getData\(\).todo \|\| \[\]\)\]/, 'store 原地修改后必须用新快照触发分组重算');
});
test('行内草稿隔离账号和原型属性，整组操作先一次性落盘', () => {
  const source = read('src/modules/todo/TodoView.vue');
  assert.match(source, /ref\(Object.create\(null\)\)/);
  assert.match(source, /currentOwner\(\) === draftOwner/);
  assert.match(source, /checkOwner\(\); revision.value\+\+/);
  assert.match(source, /groupName\(x.group\) === name/);
  assert.match(source, /try \{ save\(\); \} catch \{ data.todo = previous/);
});
test('随记仅展示真实照片，保留旧标题与正文', () => {
  const source = read('src/modules/note/NoteView.vue');
  assert.match(source, /v-if="item.image"/);
  assert.match(source, /item.title !== '未命名'/);
  assert.match(source, /item.content/);
  assert.doesNotMatch(source, /ModuleView|resolveRecordImage/);
});
