import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDate, completedThisWeek, pendingTasks, lifeFeed } from '../src/lib/life-feed.js';
import Workout from '../src/lib/workout.js';
import { CONFIG } from '../src/lib/config.js';

// 使用明确日期验证边界，不依赖运行当天的样板内容。
const session = (date, status = 'completed') => ({ ...Workout.createSession('strength'), date, status });
test('日期严格校验，不能把更新时间或 ID 当生活发生日', () => {
  assert.equal(recordDate('2024-02-29'), '2024-02-29');
  for (const value of ['2025-02-29', '2026-13-01', '2026-01-32', '', '2026-11-12T12:00:00Z', null]) assert.equal(recordDate(value), null);
  const records = { note: [{ id: 1, content: '旧记录', updated_at: '2026-11-12' }, { id: 2, date: '2026-11-11', content: '已知日期' }], hot: [{ id: 1, date: '2026-11-12', content: '<script>unsafe</script>' }] };
  const original = structuredClone(records), feed = lifeFeed(records);
  assert.deepEqual(feed.map(x => x.key), ['hot:1', 'note:2', 'note:1']);
  assert.equal(feed.at(-1).date, null);
  assert.deepEqual(records, original);
  assert.equal(lifeFeed(records, { module: 'hot' }).length, 1);
});
test('训练计数排除草稿、删除记录、旧模型和跨周记录', () => {
  const records = [session('2026-11-09'), session('2026-11-15'), session('2026-11-08'), session('2026-11-12', 'draft'), { ...session('2026-11-12'), deleted_at: 'now' }, { id: 'old', date: '2026-11-12', current: 1, target: 1 }];
  assert.equal(completedThisWeek(records, new Date(2026, 10, 12)).length, 2);
  assert.equal(lifeFeed({ sport: records }).length, 3);
});
test('首页事项置顶优先、仅取未完成前五条，不修改源顺序', () => {
  const records = [{ id: 'done', done: true, pinned: true }, ...Array.from({ length: 8 }, (_, id) => ({ id, pinned: id === 6 }))];
  const original = structuredClone(records);
  assert.deepEqual(pendingTasks(records).map(x => x.id), [6, 0, 1, 2, 3]);
  assert.deepEqual(records, original);
});
test('样板默认隔离，用户修改的样板仍可进入时间线', () => {
  const seed = structuredClone(CONFIG.modules.find(x => x.key === 'note').seed[0]);
  assert.equal(lifeFeed({ note: [seed] }).length, 0);
  assert.equal(lifeFeed({ note: [seed] }, { includeDemo: true })[0].demo, true);
  assert.equal(lifeFeed({ note: [{ ...seed, content: '我的新内容' }] }).length, 1);
});
