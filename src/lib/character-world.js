// 只接收角色站公开契约；远程异常时保留稳定入口。
export const WORLD_URL = 'https://jing-181.github.io/image-gen/';
export const FALLBACK_CHARACTERS = [
  { id: 'hanako', name: 'Hanako', role: '陪伴 · 统筹 · 判断' },
  { id: 'yuan', name: '源', role: '实现 · 调试 · 工程判断' },
  { id: 'yuu', name: '悠', role: '试玩 · 观察 · 产品视角' },
].map(p => ({ ...p, url: `${WORLD_URL}#character/${p.id}`, avatar: '', summary: '' }));
function publicURL(value) {
  try { const url = new URL(value); return url.origin === 'https://jing-181.github.io' && url.pathname.startsWith('/image-gen/') && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function parseCharacterFeed(feed) {
  if (feed?.schemaVersion !== 1 || !Array.isArray(feed.characters)) throw new Error('Unsupported character feed');
  return FALLBACK_CHARACTERS.map(base => {
    const row = feed.characters.find(p => p?.id === base.id);
    if (!row || typeof row.name !== 'string' || typeof row.role !== 'string' || !publicURL(row.url)) throw new Error('Incomplete character feed');
    return { ...base, name: row.name.slice(0, 30), role: row.role.slice(0, 80), summary: typeof row.summary === 'string' ? row.summary.slice(0, 200) : '', url: publicURL(row.url), avatar: publicURL(row.avatar), candidate: row.portraitStatus === 'candidate' };
  });
}
export async function loadCharacterFeed(signal) {
  const response = await fetch(`${WORLD_URL}feed.json`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Character feed unavailable');
  return parseCharacterFeed(await response.json());
}
