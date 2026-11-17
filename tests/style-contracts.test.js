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
test('training screen omits removed guidance and daily choice has accessible compact tabs', () => {
  const js = read('src/lib/workout-view.js'), css = read('css/workout-ui.css');
  assert.doesNotMatch(js, /data-plan-hint|data-plan-rest/);
  assert.match(js, /role="tablist"/);
  assert.match(js, /role="tabpanel"/);
  assert.match(js, /data-daily-cycle/);
  assert.match(css, /daily-preview\[hidden\] \{ display:none/);
  assert.doesNotMatch(css.match(/\.workout-mast \{[^}]+\}/)[0], /border-bottom/);
});
test('search, checkbox and touch frames have shared explicit contracts', () => {
  const css = read('css/form-controls.css'), desktop = read('src/desktop.css');
  assert.match(css, /input\[type=search\] \{[^}]*height:44px/);
  assert.match(css, /input\[type=search\] \{ font-size:16px/);
  assert.ok(desktop.includes('input:where(:not([type=checkbox]):not([type=radio])), textarea'));
  assert.match(desktop, /order-ctrl button \{ width:44px; height:44px/);
  assert.match(desktop, /\.switch \{[^}]*min-height:44px/);
});
