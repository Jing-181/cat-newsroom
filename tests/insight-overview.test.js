import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('insight overview hides retired modules only in its local presentation', () => {
  const source = readFileSync('src/modules/insight/InsightView.vue', 'utf8');
  assert.match(source, /CONFIG\.modules\.filter\(m => !\["checkin", "read", "money"\]\.includes\(m\.key\)\)\.map/);
  assert.doesNotMatch(source, /delete getData|CONFIG\.modules\s*=/);
  assert.match(source, /trainingReviewSlotHTML\(\)/);
  assert.match(source, /trendBlockHTML\(\)/);
});
