const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/sync-hooks.js"), "utf8");

// 复现 supabase-sync.js 的顶层钩子声明（经典脚本的全局词法作用域）
function createContext({ withHooks = true } = {}) {
  const errors = [];
  const sandbox = { console: { error: (...args) => errors.push(args) } };
  sandbox.window = sandbox; // 浏览器里 window 即全局对象
  const context = vm.createContext(sandbox);
  if (withHooks) vm.runInContext("let onSyncReady = null; let onRemoteUpdate = null;", context);
  return { context, sandbox, errors };
}

test("桥接脚本把两个钩子转发到 Vue 入口挂在 window 上的处理函数", () => {
  const { context, sandbox } = createContext();
  vm.runInContext(source, context);
  // Vue 入口是 ES module，执行时机晚于经典脚本：先加载桥接、后挂处理函数
  vm.runInContext(`
    window.__seen = [];
    window.__onSyncReady = data => { window.__seen.push("sync:" + JSON.stringify(data)); };
    window.__onRemoteUpdate = change => { window.__seen.push("remote:" + JSON.stringify(change)); };
    onSyncReady({ todo: [{ id: "1" }] });
    onRemoteUpdate({ newRow: { module_key: "todo", data: { id: "2" } } });
  `, context);
  assert.deepEqual(Array.from(sandbox.__seen), [
    'sync:{"todo":[{"id":"1"}]}',
    'remote:{"newRow":{"module_key":"todo","data":{"id":"2"}}}',
  ]);
});

test("处理函数先挂载也能收到回调，桥接不依赖加载顺序", () => {
  const { context, sandbox } = createContext();
  vm.runInContext(`
    window.__seen = [];
    window.__onSyncReady = data => { window.__seen.push(JSON.stringify(data)); };
  `, context);
  vm.runInContext(source, context);
  vm.runInContext('onSyncReady({ checked: true });', context);
  assert.deepEqual(Array.from(sandbox.__seen), ['{"checked":true}']);
});

test("supabase-sync.js 缺失时静默跳过，不抛错也不定义全局", () => {
  const { context, sandbox } = createContext({ withHooks: false });
  assert.doesNotThrow(() => vm.runInContext(source, context));
  assert.equal(vm.runInContext("typeof onSyncReady", context), "undefined");
  assert.equal(sandbox.onSyncReady, undefined);
});

test("处理函数缺失或渲染抛错时不打断同步流程", () => {
  const { context, errors } = createContext();
  vm.runInContext(source, context);
  // 未挂处理函数：直接调用应静默返回
  assert.doesNotThrow(() => vm.runInContext("onSyncReady({}); onRemoteUpdate({});", context));
  assert.equal(errors.length, 0);
  // 渲染层异常被包装层吞掉并记录，不让 supabase-sync 误判为同步失败
  vm.runInContext('window.__onSyncReady = () => { throw new Error("渲染失败"); };', context);
  assert.doesNotThrow(() => vm.runInContext("onSyncReady({});", context));
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /onSyncReady 处理失败/);
});
