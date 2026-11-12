// Note-only image contract. An explicit [] means removed; legacy image is fallback only.
export const MAX_NOTE_IMAGES = 9;
export function noteImages(record = {}) {
  const values = Array.isArray(record.images) ? record.images : [record.image];
  return values.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, MAX_NOTE_IMAGES);
}

// Files stay in this editor's memory; only successful URLs enter records/drafts.
export function createNoteImageQueue(record = {}, objectURL = URL) {
  const entries = noteImages(record).map(url => ({ url }));
  let running = false, disposed = false;
  const release = entry => { if (entry.preview) { objectURL.revokeObjectURL(entry.preview); delete entry.preview; } };
  return {
    entries,
    get pending() { return entries.some(entry => entry.file); },
    get busy() { return running; },
    urls() { return entries.filter(entry => entry.url).map(entry => entry.url); },
    add(files) {
      if (running || disposed) return 0;
      const accepted = Array.from(files).filter(file => file?.type?.startsWith('image/')).slice(0, Math.max(0, MAX_NOTE_IMAGES - entries.length));
      for (const file of accepted) entries.push({ file, preview: objectURL.createObjectURL(file), error: '' });
      return accepted.length;
    },
    addURL(url) {
      if (running || entries.length >= MAX_NOTE_IMAGES || !url.trim()) return false;
      entries.push({ url: url.trim() }); return true;
    },
    remove(index) { if (!running) entries.splice(index, 1).forEach(release); },
    dispose() { disposed = true; entries.forEach(release); },
    async upload(uploadOne, identityOK, changed = () => {}) {
      if (running) return;
      running = true;
      try {
        for (const entry of entries) {
          if (!entry.file) continue;
          try {
            if (disposed) throw new Error('编辑器已关闭，请重新打开');
            if (!identityOK()) throw new Error('账号已变化，请切回原账号后重试');
            const result = await uploadOne(entry.file);
            if (!result?.url) throw new Error('上传未返回图片地址');
            entry.url = result.url; delete entry.file; entry.error = ''; release(entry);
            changed();
          } catch (error) {
            entry.error = error.message || '图片上传失败'; changed();
            break; // Keep successes, failed file and all unattempted files in order.
          }
        }
      } finally { running = false; }
    },
  };
}
