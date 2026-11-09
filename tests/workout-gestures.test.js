import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFocusGestures } from '../src/lib/workout-gestures.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.window;
  globalThis.window = new EventTarget();
  const root = new EventTarget();
  const calls = [];
  const dispose = bindFocusGestures(root, { step: d => calls.push(d), openGroup: () => calls.push('menu') });
  t.after(() => { dispose(); globalThis.window = original; });
  const emit = (type, x = 0, y = 0, kind = '') => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      target: { value: { closest: selector => selector === '[data-focus-group-menu]' ? (kind === 'group' ? {} : null) : selector === 'dialog' ? null : kind === 'input' ? {} : null } },
      touches: { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] },
    });
    root.dispatchEvent(event);
    return event;
  };
  return { calls, emit, dispose };
}

test('横向滑动只切一次；纵向/输入/取消不切组', t => {
  const { calls, emit } = setup(t);
  emit('touchstart', 300, 0); assert.equal(emit('touchmove', 100, 0).defaultPrevented, true); emit('touchend');
  assert.deepEqual(calls, [1]);
  emit('touchstart', 300, 0); assert.equal(emit('touchmove', 280, 100).defaultPrevented, false); emit('touchmove', 0, 100); emit('touchend');
  emit('touchstart', 300, 0, 'input'); emit('touchmove', 100, 0); emit('touchend');
  emit('touchstart', 300, 0); emit('touchmove', 100, 0); emit('touchcancel'); emit('touchend');
  assert.deepEqual(calls, [1]);
});

test('长按只开菜单；移动/抬手/取消/滚动/卸载取消待触发菜单', t => {
  const { calls, emit, dispose } = setup(t);
  emit('touchstart', 300, 0, 'group'); t.mock.timers.tick(550); emit('touchmove', 100, 0); emit('touchend');
  assert.deepEqual(calls, ['menu']);
  for (const kind of ['move','end','cancel','scroll','dispose']) {
    emit('touchstart', 300, 0, 'group');
    if(kind==='move') emit('touchmove', 300, 20);
    if(kind==='end') emit('touchend');
    if(kind==='cancel') emit('touchcancel');
    if(kind==='scroll') window.dispatchEvent(new Event('scroll'));
    if(kind==='dispose') dispose();
    t.mock.timers.tick(600);
  }
  assert.deepEqual(calls, ['menu']);
});
