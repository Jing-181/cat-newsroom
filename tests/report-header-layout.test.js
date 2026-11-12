import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mobile report title and dates occupy separate rows without title compression', () => {
  const css = readFileSync('src/responsive.css', 'utf8');
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.report-card \.report-head \{[^}]*flex-direction: column;[^}]*align-items: flex-start;/);
  assert.match(css, /\.report-card \.report-head h3 \{[^}]*flex: none;/);
  assert.match(css, /\.report-card \.report-meta \{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;/);
});
