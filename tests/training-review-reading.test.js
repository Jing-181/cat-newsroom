import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReadingModel, uniqueReviewItems } from '../src/lib/training-review-reading.js';
import { readyHTML } from '../src/lib/training-review.js';
import { normalizeReport } from '../src/lib/training-review-utils.js';
const suggestion = '11-20 若睡眠不足 6 小时，减少一组。';
const report = normalizeReport({ week_start: '2026-11-09', markdown: '# 原文', payload: { conclusion: '容量下降 14.6%，在 ±20% 内按持平算。', metrics: [{label:'总时长',week:'411 分钟',prev:'305 分钟',delta:'+34.8%'}], sections: [{ title: '与前周对比', items: ['次数相同，时长多 106 分钟。', '<script>alert(1)</script>'] }, { title: '下周提示', items: ['1. ' + suggestion, '11-21 若睡眠不足 6 小时，减少一组。'] }], suggestions: [suggestion] } });
test('only identical next-week advice is merged; different dates remain', () => {
 const model = reviewReadingModel(report.payload);
 assert.equal(model.suggestions.length, 2);
 assert.equal(model.sections.length, 1);
 assert.equal(uniqueReviewItems(['**同一项**', '同一项', '同一项。']).length, 2);
});
test('original reading order restored, body open and advice visible once', () => {
 const html = readyHTML(report, [report], false);
 assert.equal((html.match(/class="report-day report-next"/g) || []).length, 1);
 assert.match(html, /<details class="report-day" open>/);
 assert.doesNotMatch(html, /本期重点|review-original|完整原文/);
 assert.ok(html.indexOf('review-conclusion') < html.indexOf('review-table'));
 assert.ok(html.indexOf('review-table') < html.indexOf('与前周对比'));
 assert.match(html, /&lt;script&gt;/);
 assert.doesNotMatch(html, /<script>/);
 assert.match(html, /class="review-key-number">411 分钟/);
});
test('legacy markdown export fallback remains unchanged', () => {
 const old = normalizeReport({ week_start: '2026-10-01', markdown: '旧版完整原文', payload: null });
 const html = readyHTML(old, [old], false);
 assert.match(html, /这一期只有归档原文/);
 assert.match(html, /training-review-export/);
 assert.doesNotMatch(html, /本期重点|<pre/);
});
test('home compact view retains conclusion and metric table, no new summary', () => {
 const html = readyHTML(report, [report], true);
 assert.match(html, /容量下降 14.6%/);
 assert.match(html, /review-table/);
 assert.doesNotMatch(html, /本期重点|与前周对比/);
});
