import { test } from 'node:test';
import assert from 'node:assert/strict';
// 验证跨站数据失效和不安全地址都不会进入模板。
test('character feed validates version, completeness and URL scope', async () => {
  const { parseCharacterFeed, FALLBACK_CHARACTERS } = await import('../src/lib/character-world.js');
  const feed = { schemaVersion: 1, characters: FALLBACK_CHARACTERS.map(p => ({ ...p, avatar: 'javascript:alert(1)' })) };
  assert.equal(parseCharacterFeed(feed)[0].avatar, '');
  assert.throws(() => parseCharacterFeed({ ...feed, schemaVersion: 2 }));
  assert.throws(() => parseCharacterFeed({ ...feed, characters: [] }));
  feed.characters[0].url = 'https://example.com/image-gen/';
  assert.throws(() => parseCharacterFeed(feed));
});
