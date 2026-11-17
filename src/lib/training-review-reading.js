// Read-only presentation model. Never rewrite archived Markdown or synthesize claims.
const key = text => String(text).trim().replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/, '').replace(/\*\*/g, '').replace(/\s+/g, ' ');
const nextTitle = title => /^(?:[一二三四五六七八九十\d]+[、.．]\s*)?下周(?:提示|建议|行动|计划)$/.test(key(title));
export function uniqueReviewItems(items) {
  const seen = new Set();
  return items.filter(item => { const k = key(item); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
export function reviewReadingModel(payload = {}) {
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const suggestions = uniqueReviewItems([...(payload.suggestions || []), ...sections.filter(s => nextTitle(s.title)).flatMap(s => s.items)]);
  const suggestionKeys = new Set(suggestions.map(key));
  const body = sections.filter(s => !nextTitle(s.title)).map(s => ({ ...s, items: uniqueReviewItems(s.items).filter(i => !suggestionKeys.has(key(i))) })).filter(s => s.items.length);
  return { sections: body, suggestions, metrics: payload.metrics || [] };
}
