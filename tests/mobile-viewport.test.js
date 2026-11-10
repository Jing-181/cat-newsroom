import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function style() {
  const values = new Map();
  return {
    getPropertyValue: name => values.get(name)?.[0] || '',
    getPropertyPriority: name => values.get(name)?.[1] || '',
    setProperty: (name, value, priority = '') => values.set(name, [value, priority]),
    removeProperty: name => values.delete(name),
  };
}
function events(extra = {}) {
  const handlers = new Map();
  return { ...extra, handlers,
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name); },
  };
}

test('nested scroll ownership restores position, inline values and priorities only on final release', async () => {
  const { lockPageScroll, focusWithoutScroll } = await import('../src/lib/mobile-viewport.js');
  const oldWindow = global.window, oldDocument = global.document;
  const body = { style: style() }, root = { style: style() };
  body.style.setProperty('position', 'relative', 'important');
  root.style.setProperty('overflow', 'clip');
  const scrolls = [];
  global.document = { body, documentElement: root };
  global.window = { scrollX: 7, scrollY: 412, scrollTo: (...args) => scrolls.push(args) };
  try {
    const releaseA = lockPageScroll(), releaseB = lockPageScroll();
    assert.equal(body.style.getPropertyValue('top'), '-412px');
    releaseA(); releaseA();
    assert.equal(body.style.getPropertyValue('position'), 'fixed');
    assert.equal(scrolls.length, 0);
    releaseB();
    assert.equal(body.style.getPropertyValue('position'), 'relative');
    assert.equal(body.style.getPropertyPriority('position'), 'important');
    assert.equal(body.style.getPropertyValue('top'), '');
    assert.equal(root.style.getPropertyValue('overflow'), 'clip');
    assert.deepEqual(scrolls, [[7, 412]]);
    let options;
    focusWithoutScroll({ isConnected: true, focus: value => { options = value; } });
    assert.deepEqual(options, { preventScroll: true });
    focusWithoutScroll({ isConnected: false, focus: () => assert.fail('detached focus') });
  } finally { global.window = oldWindow; global.document = oldDocument; }
});

test('visual viewport updates touch geometry, ignores pinch zoom and cleans listeners/properties', async () => {
  const { initMobileViewport } = await import('../src/lib/mobile-viewport.js');
  const oldWindow = global.window, oldDocument = global.document;
  const root = { style: style() };
  const viewport = events({ height: 350, offsetTop: 80, scale: 1 });
  const media = events({ matches: true });
  let pending;
  const win = events({ visualViewport: viewport, innerHeight: 800, matchMedia: () => media,
    requestAnimationFrame: fn => { pending = fn; return 1; }, cancelAnimationFrame: () => { pending = null; } });
  global.window = win; global.document = { documentElement: root };
  try {
    const cleanup = initMobileViewport();
    assert.equal(root.style.getPropertyValue('--mobile-viewport-height'), '350px');
    assert.equal(root.style.getPropertyValue('--mobile-viewport-top'), '80px');
    viewport.height = 250; viewport.scale = 2;
    viewport.handlers.get('resize')(); pending();
    assert.equal(root.style.getPropertyValue('--mobile-viewport-height'), '350px');
    viewport.scale = 1; viewport.handlers.get('scroll')(); pending();
    assert.equal(root.style.getPropertyValue('--mobile-viewport-height'), '250px');
    media.matches = false; media.handlers.get('change')(); pending();
    assert.equal(root.style.getPropertyValue('--mobile-viewport-height'), '');
    cleanup();
    assert.equal(viewport.handlers.size + media.handlers.size + win.handlers.size, 0);
  } finally { global.window = oldWindow; global.document = oldDocument; }
});

test('touch CSS and lifecycle contracts cover landscape, big numbers and single scroll owners', () => {
  const css = read('css/mobile-viewport.css');
  assert.match(css, /@media \(any-pointer: coarse\)/);
  assert.doesNotMatch(css, /max-width:\s*820px/);
  assert.match(css, /:not\(\.focus-value\)/);
  assert.match(css, /\.lib-scroll \{ min-height: 0/);
  assert.match(css, /overflow-y: auto; overflow-x: hidden/);
  assert.match(read('css/workout-ui.css'), /\.focus-value \{[^}]*font-size:40px/);
  assert.doesNotMatch(read('src/responsive.css'), /font-size: 16px !important/);
  assert.match(read('src/styles.css'), /@import "\.\.\/css\/mobile-viewport.css"/);
  const contract = read('src/lib/dialog-contract.js');
  assert.match(contract, /const unlock = lockPageScroll\(\)/);
  assert.match(contract, /unlock\(\);/);
  assert.doesNotMatch(contract, /\.focus\?\.\(\)/);
  const workout = read('src/lib/workout-ui.js');
  assert.match(workout, /removeEventListener\("close", cleanup\)/);
  assert.match(workout, /cleanupDialog\?\.\(\); \/\/ DOM/);
  assert.match(workout, /function destroy\(\) \{\s*cleanupDialog\?\.\(\)/);
  const app = read('src/App.vue');
  assert.match(app, /cleanupMobileViewport = initMobileViewport\(\)/);
  assert.match(app, /cleanupMobileViewport\?\.\(\)/);
});
