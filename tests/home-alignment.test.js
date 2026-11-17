import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('desktop home life cards stretch as rows without sizing controls or weather widgets', () => {
 const css=readFileSync('css/life-home.css','utf8');
 const block=css.match(/@media \(min-width: 821px\) \{([\s\S]*?)\n\}/)?.[1];
 assert.ok(block);
 assert.match(block,/\.home-grid > section\.life-panel \{ align-self: stretch; display: flex; flex-direction: column; padding: 24px;/);
 assert.match(block,/life-heading \{ min-height: 44px; margin-bottom: 16px;/);
 assert.match(block,/capture-more \{ margin-top: auto; padding-top: 8px;/);
 assert.doesNotMatch(block, /(?:^|[;{]\s*)height:|textarea|button|weather-masthead/);
 assert.match(css, /@media \(max-width: 820px\)/);
});
