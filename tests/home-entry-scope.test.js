import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const home = fs.readFileSync(path.join(root, 'src/modules/home/HomeView.vue'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const layout = import(pathToFileURL(path.join(root, 'src/lib/home-layout.js')).href);

// 执行实际 HTML 生成函数，用隔离数据验证隐藏模块不会从聚焦/概览/快捷入口漏出。
function callHome(name, bindings) {
  const start = home.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = home.indexOf('\n}', start) + 2;
  return new Function(...Object.keys(bindings), `${home.slice(start, end)}; return ${name}();`)(...Object.values(bindings));
}

async function fixtures() {
  const { isPrimaryModule } = await layout;
  const keys = ['todo', 'checkin', 'read', 'sport', 'money', 'note', 'hot'];
  const records = Object.fromEntries(keys.map(key => [key, [{ id: key, title: `record-${key}`, pinned: true }]]));
  return {
    CONFIG: {
      modules: keys.map(key => ({ key, name: key, type: 'fixture', icon: key })),
      quickAdd: keys.map(module => ({ module, label: module, icon: module })),
      overview: keys.map(key => ({ key, label: key, icon: key, calc: () => ({ value: 50, sub: key }) })),
    },
    data: () => records,
    isPrimaryModule,
    icon: () => '', esc: value => value, dateStr: () => '2026-11-09', ringSVG: () => '',
  };
}

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
  assert.equal(HOME_CARDS.find(c => c.key === 'todo').label, '事项清单');
  assert.doesNotMatch(JSON.stringify(HOME_GROUPS), /习惯|待办|收支|MONEY/);
});

test('legacy local/cloud orders are filtered without mutation and retain relative order', async () => {
  const { visibleHomeOrder, DEFAULT_HOME_ORDER_MOBILE } = await layout;
  const saved = Object.freeze(['books', 'report', 'habit', 'todo', 'spend', 'goals']);
  assert.deepEqual(visibleHomeOrder(saved), ['report', 'todo', 'goals']);
  assert.deepEqual(visibleHomeOrder(['habit', 'spend'], DEFAULT_HOME_ORDER_MOBILE), DEFAULT_HOME_ORDER_MOBILE);
  assert.deepEqual(visibleHomeOrder(['todo', 'unknown', 'todo', 'report']), ['todo', 'report']);
  assert.match(home, /const order = visibleHomeOrder\(homeOrderConfig, fallback\)/);
  // 旧 key 仍可被本地/云端配置读取；展示过滤不得改变存储协议。
  assert.match(home, /habit: habitTileHTML/);
  assert.match(home, /spend: spendTileHTML, books: booksTileHTML/);
  assert.match(home, /data\.__homeOrder = remote/);
});

test('pinned records from hidden modules do not appear on home', async () => {
  const html = callHome('focusTileHTML', await fixtures());
  for (const key of ['checkin', 'read', 'money']) assert.ok(!html.includes(`record-${key}`));
  for (const key of ['todo', 'sport', 'note', 'hot']) assert.ok(html.includes(`record-${key}`));
  assert.match(html, /4 项/);
});

test('quick add excludes all three hidden modules while keeping sport and notes', async () => {
  const html = callHome('quickTileHTML', await fixtures());
  for (const key of ['checkin', 'read', 'money']) assert.ok(!html.includes(`data-quick="${key}"`));
  for (const key of ['sport', 'note']) assert.ok(html.includes(`data-quick="${key}"`));
});

test('overview excludes hidden rings, money balance and their record/pin counts', async () => {
  const html = callHome('overviewTileHTML', await fixtures());
  for (const key of ['checkin', 'read', 'money']) assert.ok(!html.includes(`data-open="${key}"`));
  assert.match(html, /data-open="sport"/);
  assert.doesNotMatch(html, /本月结余|¥/);
  assert.equal((html.match(/class="s-v">4<\/div>/g) || []).length, 2);
});

test('home todo copy uses 事项 without changing todo data keys', () => {
  const html = callHome('todoTileHTML', { data: () => ({ todo: [] }), icon: () => '' });
  assert.match(html, /事项清单/);
  assert.match(html, /去「事项」添加/);
  assert.match(html, /data-open="todo"/);
  assert.doesNotMatch(html, /待办/);
});
