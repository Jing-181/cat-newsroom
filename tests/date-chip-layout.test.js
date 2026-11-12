import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('page date stays whole and wraps as a unit when the header is narrow', () => {
  const css = readFileSync('src/desktop.css', 'utf8');
  assert.match(css, /\.header \{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.date-chip \{[^}]*flex-shrink:0;[^}]*white-space:nowrap;/);
});
