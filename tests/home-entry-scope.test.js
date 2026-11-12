import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const home = fs.readFileSync(path.join(root, 'src/modules/home/HomeView.vue'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const layout = import(pathToFileURL(path.join(root, 'src/lib/home-layout.js')).href);

test('primary navigation excludes money and collapses only habits and reading', async () => {
  const { isPrimaryModule, COLLAPSED_MODULE_KEYS } = await layout;
  assert.deepEqual(COLLAPSED_MODULE_KEYS, ['checkin', 'read']);
  for (const key of ['checkin', 'read', 'money']) assert.equal(isPrimaryModule(key), false);
  for (const key of ['todo', 'note', 'sport', 'hot']) assert.equal(isPrimaryModule(key), true);
  assert.match(app, /v-for="m in primaryModules"/);
  assert.match(app, /<details>\s*<summary class="navi">更多模块<\/summary>\s*<a v-for="m in collapsedModules"/);
  assert.doesNotMatch(app, /<details[^>]*\bopen\b/);
  assert.doesNotMatch(app, /restoreView\(/, '旧记忆不覆盖显式URL');
});

test('legacy views and full backup module list stay available', () => {
  for (const view of ['CheckinView', 'ReadView', 'MoneyView', 'SportView']) {
    const routes = fs.readFileSync(new URL('../src/lib/app-router.js', import.meta.url), 'utf8');
    assert.ok(routes.includes(`${view}.vue`), '旧模块保持可直达懒加载路由');
  }
  assert.match(app, /moduleKeys: CONFIG\.modules\.map/);
});

test('desktop, mobile and settings card lists omit retired cards, retain training', async () => {
  const { HOME_CARDS, HOME_GROUPS, DEFAULT_HOME_ORDER, DEFAULT_HOME_ORDER_MOBILE } = await layout;
  for (const order of [HOME_CARDS.map(c => c.key), DEFAULT_HOME_ORDER, DEFAULT_HOME_ORDER_MOBILE]) {
    for (const key of ['habit', 'spend', 'books']) assert.ok(!order.includes(key));
    for (const key of ['todo', 'goals', 'report', 'daily', 'trend', 'pomo']) assert.ok(order.includes(key));
  }
  assert.equal(HOME_CARDS.find(c => c.key === 'todo').label, '今天要做');
  assert.doesNotMatch(JSON.stringify(HOME_GROUPS), /习惯|待办|收支|MONEY/);
});

test('legacy local/cloud orders are filtered without mutation and retain relative order', async () => {
  const { visibleHomeOrder, DEFAULT_HOME_ORDER_MOBILE } = await layout;
  const saved = Object.freeze(['books', 'report', 'habit', 'todo', 'spend', 'goals']);
  assert.deepEqual(visibleHomeOrder(saved), ['report', 'todo', 'goals']);
  assert.deepEqual(visibleHomeOrder(['habit', 'spend'], DEFAULT_HOME_ORDER_MOBILE), DEFAULT_HOME_ORDER_MOBILE);
  assert.deepEqual(visibleHomeOrder(['todo', 'unknown', 'todo', 'report']), ['todo', 'report']);
  assert.match(home, /visibleHomeOrder\(getData\(\).__homeOrder/);
  assert.match(home, /getData\(\).__homeOrder = remote/);
});

test('home retires duplicate focus and overview while preserving their saved keys', async () => {
  const { visibleHomeOrder, mergeVisibleHomeOrder } = await layout;
  const saved = Object.freeze(['clock', 'focus', 'quick', 'overview', 'todo']);
  assert.deepEqual(visibleHomeOrder(saved), ['clock', 'quick', 'todo']);
  assert.deepEqual(mergeVisibleHomeOrder(saved, ['todo', 'quick', 'clock']), ['todo', 'focus', 'quick', 'overview', 'clock']);
});
