import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
test('editor segments retain data contract with native keyboard buttons and pressed state', () => {
  const s = read('src/lib/editor.js');
  assert.doesNotMatch(s, /<div class="opt /);
  assert.match(s, /<button type="button" class="opt /);
  assert.match(s, /setAttribute\("aria-pressed", String\(x === o\)\)/);
  assert.match(s, /new Event\("change", \{ bubbles: true \}\)/);
  assert.match(s, /querySelector\(id \+ " \.on"\)/);
});
test('photo status and placeholder have separate size contracts', () => {
  const css = read('css/quick-editor.css'), js = read('src/lib/editor.js');
  assert.match(js, /class="note-image-status" role="status"/);
  assert.match(js, /class="note-image-placeholder"/);
  assert.doesNotMatch(css, /tile > span/);
  assert.match(css, /note-image-status \{ min-height: 0/);
});
test('training guidance and daily plan use dedicated layout contracts', () => {
  const js = read('src/lib/workout-view.js'), css = read('css/workout-ui.css');
  assert.match(js, /class="focus-plan-hint" data-plan-hint/);
  assert.match(js, /class="workout-btn" data-plan-rest="-30"/);
  assert.match(js, /plan-day-grid plan-day-grid-flow/);
  assert.match(css, /plan-day-grid-flow \{ max-height:none; overflow:visible/);
  assert.match(css, /focus-plan-hint \{[^}]*color:var\(--ink-text\)/);
});
test('search, checkbox and touch frames have shared explicit contracts', () => {
  const css = read('css/form-controls.css'), desktop = read('src/desktop.css');
  assert.match(css, /input\[type=search\] \{[^}]*height:44px/);
  assert.match(css, /input\[type=search\] \{ font-size:16px/);
  assert.ok(desktop.includes('input:where(:not([type=checkbox]):not([type=radio])), textarea'));
  assert.match(desktop, /order-ctrl button \{ width:44px; height:44px/);
  assert.match(desktop, /\.switch \{[^}]*min-height:44px/);
});
