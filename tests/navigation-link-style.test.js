import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('navigation links suppress decoration in all link states but retain keyboard outline',()=>{
 const css=readFileSync('src/styles.css','utf8');
 for(const selector of ['.sidebar a.navi','.m-tabs a','.main a.shared-btn']){
  assert.ok(css.includes(`${selector}:is(:link, :visited, :hover, :active)`));
  assert.ok(css.includes(`${selector}:focus-visible`));
 }
 assert.match(css,/\.main a\.shared-btn:is\(:link, :visited, :hover, :active\) \{ text-decoration: none; \}/);
 assert.match(css,/outline: 2px solid var\(--accent\); outline-offset: 2px/);
 const block=css.slice(css.indexOf('/* 路由导航'),css.indexOf('/* 全图查看器'));
 assert.ok(!block.includes('.atlas-detail a'));
 assert.ok(!/(?:^|\n)a(?:\s|:|,)/.test(block),'no unscoped all-anchor reset');
});
