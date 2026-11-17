import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchingOptions } from '../src/lib/form-controls.js';
test('共享选项过滤保留值、支持大小写与空结果、排除禁用项', () => {
  const options = [{ value:'1', label:'Version A' }, { value:'2', label:'分组甲' }, { value:'3', label:'分组乙', disabled:true }];
  assert.deepEqual(matchingOptions(options, 'version'), [options[0]]);
  assert.deepEqual(matchingOptions(options, '分组'), [options[1]]);
  assert.equal(matchingOptions(options).length, 2);
  assert.deepEqual(matchingOptions(options, '没有'), []);
});
test('共享入口不重写数据、日期及文件，保留原生节点和事件', () => {
  const js = readFileSync(new URL('../src/lib/form-controls.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|syncRecord|innerHTML/);
  for (const contract of ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'listbox', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'isComposing', 'visualViewport']) assert.ok(js.includes(contract));
  assert.match(js, /new Event\('change', \{ bubbles: true \}\)/);
  const editor = readFileSync(new URL('../src/lib/editor.js', import.meta.url), 'utf8');
  assert.match(editor, /备注、照片与更多选项<\/summary><div class="form-fold-body">/);
});
