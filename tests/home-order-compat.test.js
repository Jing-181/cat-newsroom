import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleHomeOrder, mergeVisibleHomeOrder, DEFAULT_HOME_ORDER } from '../src/lib/home-layout.js';
test('首页隐藏旧卡片但保存可见排序保留旧项', () => {
  const original = ['report', 'habit', 'todo', 'books', 'spend', 'goals'];
  assert.deepEqual(visibleHomeOrder(original), ['report', 'todo', 'goals']);
  assert.deepEqual(mergeVisibleHomeOrder(original, ['goals', 'report', 'todo']), ['goals', 'habit', 'report', 'books', 'spend', 'todo']);
  assert.deepEqual(original, ['report', 'habit', 'todo', 'books', 'spend', 'goals']);
});
test('全隐藏或未知排序安全回退并去重', () => {
  assert.deepEqual(visibleHomeOrder(['habit', 'unknown']), DEFAULT_HOME_ORDER);
  assert.deepEqual(visibleHomeOrder(['todo', 'todo', 'daily']), ['todo', 'daily']);
  assert.deepEqual(mergeVisibleHomeOrder(['habit', 'unknown'], ['todo', 'daily', 'todo']), ['habit', 'unknown', 'todo', 'daily']);
});
