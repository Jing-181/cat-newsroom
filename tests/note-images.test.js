import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { noteImages, createNoteImageQueue } from '../src/lib/note-images.js';

// Reuse the quick editor's light DOM harness for note-specific integration checks.
const editorSource = fs.readFileSync(new URL('../src/lib/editor.js', import.meta.url), 'utf8');
const helpers = fs.readFileSync(new URL('./quick-editor.test.js', import.meta.url), 'utf8');
const harnessSource = helpers.slice(helpers.indexOf('function harness()'), helpers.indexOf("test('note accepts"));
const harness = new Function('source', 'vm', 'noteImages', 'createNoteImageQueue', `${harnessSource}; return harness;`)(editorSource, vm, noteImages, createNoteImageQueue);
const image = name => new File(['image'], name, { type: 'image/png' });
const field = (overlay, name) => overlay.querySelector(`#q-${name}`);
const type = (overlay, name, value) => { field(overlay, name).value = value; overlay.emit('input'); };

test('drop filters files without uploading, leaves text drag alone, and releases previews on remove/close', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let calls = 0, prevented = 0;
  h.api.window.uploadCardImage = async () => { calls++; return { url: 'uploaded' }; };
  const drag = (types, files = []) => ({ dataTransfer: { types, files }, preventDefault() { prevented++; } });
  overlay.emit('dragover', drag(['text/plain'])); overlay.emit('drop', drag(['text/plain'], [image('ignored')]));
  assert.equal(prevented, 0); assert.equal(h.created.length, 0);
  overlay.emit('dragover', drag(['Files']));
  overlay.emit('drop', drag(['Files'], [image('a'), { name: 'fake.png', type: 'text/plain' }, image('b')]));
  assert.equal(prevented, 2); assert.equal(calls, 0); assert.equal(h.created.length, 2);
  assert.match(field(overlay, 'error').textContent, /仅接受图片/);
  assert.deepEqual(Array.from(h.api.readQuickDraft('note', 'account-a').images), []);
  field(overlay, 'images').onclick({ target: { closest: selector => selector === '[data-photo-remove]' ? { dataset: { photoRemove: '0' } } : null } });
  assert.deepEqual(h.revoked, ['blob:test-0']);
  field(overlay, 'close').click(); assert.equal(h.layers[0].isOpen(), true);
  h.layers[0].forceClose();
  assert.deepEqual(h.revoked, ['blob:test-0', 'blob:test-1']);
  await field(overlay, 'save').click(); assert.equal(calls, 0); assert.equal(h.data.note.length, 0);
});

test('close while save awaits upload preserves owner draft but never persists or uploads next file', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let done, calls = 0;
  h.api.window.uploadCardImage = () => { calls++; return new Promise(resolve => { done = resolve; }); };
  field(overlay, 'file').files = [image('a'), image('b')]; field(overlay, 'file').onchange();
  const saving = field(overlay, 'save').click();
  assert.equal(field(overlay, 'save').disabled, true); assert.equal(field(overlay, 'upload').disabled, true);
  await field(overlay, 'save').click(); assert.equal(calls, 1);
  type(overlay, 'content', 'latest text');
  h.layers[0].forceClose(); assert.equal(h.revoked.length, 2);
  done({ url: 'uploaded-a' }); await saving;
  assert.equal(calls, 1); assert.equal(h.data.note.length, 0);
  assert.equal(h.api.readQuickDraft('note', 'account-a').content, 'latest text');
  assert.deepEqual(Array.from(h.api.readQuickDraft('note', 'account-a').images), ['uploaded-a']);
  assert.equal(h.revoked.length, 2);
});

test('upload blocks additions/removals and persist uses latest text; successful preview is revoked', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let done;
  h.api.window.uploadCardImage = () => new Promise(resolve => { done = resolve; });
  field(overlay, 'file').files = [image('a')]; field(overlay, 'file').onchange();
  const saving = field(overlay, 'save').click();
  overlay.emit('drop', { dataTransfer: { types: ['Files'], files: [image('b')] }, preventDefault() {} });
  field(overlay, 'images').onclick({ target: { closest: selector => selector === '[data-photo-remove]' ? { dataset: { photoRemove: '0' } } : null } });
  assert.equal(h.created.length, 1); assert.equal(h.revoked.length, 0);
  type(overlay, 'content', 'changed during upload'); done({ url: 'uploaded-a' }); await saving;
  assert.equal(h.data.note[0].content, 'changed during upload'); assert.equal(h.data.note[0].image, 'uploaded-a');
  assert.deepEqual(h.revoked, ['blob:test-0']);
});

test('invalid selection creates no previews, while todo selection still uploads immediately', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let calls = 0;
  h.api.window.uploadCardImage = async () => { calls++; return { url: 'uploaded' }; };
  field(overlay, 'file').files = [{ name: 'a.png', type: '' }, { type: 'application/pdf' }]; field(overlay, 'file').onchange();
  assert.equal(h.created.length, 0); assert.equal(calls, 0);
  h.layers[0].forceClose();
  const todo = h.api.openEditor('todo'); field(todo, 'file').files = [image('task')]; field(todo, 'file').onchange();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1); assert.equal(field(todo, 'image').value, 'uploaded');
});

test('typing note text does not rebuild image previews', () => {
  assert.match(editorSource, /addEventListener\("input", \(\) => \{ dirty = true; if \(!photos\) preview\(\); draft\(\); \}\)/);
});

test('legacy image fallback, explicit empty array, sanitization and nine-image limit', () => {
  assert.deepEqual(noteImages({ image: ' old ' }), ['old']);
  assert.deepEqual(noteImages({ image: 'old', images: [] }), []);
  assert.deepEqual(noteImages({ images: [null, ' a ', '', {}, 4] }), ['a']);
  assert.equal(noteImages({ images: Array(12).fill('a') }).length, 9);
});

test('queue stops on failure; successes and untouched files survive; retry skips successes', async () => {
  const q = createNoteImageQueue({ image: 'legacy' });
  assert.equal(q.add(['a', 'b', 'c'].map(image)), 3);
  const calls = [];
  await q.upload(async file => { calls.push(file.name); if (file.name === 'b') throw Error('offline'); return { url: file.name }; }, () => true);
  assert.deepEqual(calls, ['a', 'b']); assert.deepEqual(q.urls(), ['legacy', 'a']);
  assert.equal(q.entries[2].file.name, 'b'); assert.equal(q.entries[3].file.name, 'c');
  await q.upload(async file => { calls.push(file.name); return { url: file.name }; }, () => true);
  assert.deepEqual(calls, ['a', 'b', 'b', 'c']); assert.equal(q.pending, false);
  assert.deepEqual(q.urls(), ['legacy', 'a', 'b', 'c']);
});

test('queue capacity includes pending files; account changes stop subsequent uploads', async () => {
  const q = createNoteImageQueue(); assert.equal(q.add(Array.from({ length: 12 }, (_, i) => image(String(i)))), 9); q.dispose();
  let owner = true, calls = 0;
  // Use truthy File-like objects, as the browser does.
  const queue = createNoteImageQueue(); queue.add([image('a'), image('b')]);
  await queue.upload(async () => { calls++; owner = false; return { url: 'first' }; }, () => owner);
  assert.equal(calls, 1); assert.equal(queue.pending, true); assert.deepEqual(queue.urls(), ['first']);
  assert.match(queue.entries[1].error, /账号/); queue.dispose();
});

test('note editor persists arrays and legacy cover, preserves todo single-image contract', async () => {
  const h = harness(), overlay = h.api.openEditor('note');
  type(overlay, 'content', 'photos');
  for (const url of ['https://a.test/1', 'https://a.test/2']) { type(overlay, 'image', url); field(overlay, 'add-url').click(); }
  await field(overlay, 'save').click();
  assert.deepEqual(Array.from(h.data.note[0].images), ['https://a.test/1', 'https://a.test/2']);
  assert.equal(h.data.note[0].image, 'https://a.test/1');
  const todo = h.api.quickRecord('todo', {}, { title: 'task', image: 'one' });
  assert.equal(todo.image, 'one'); assert.equal(todo.images, undefined);
});

test('partial batch saves only successful URLs to owner draft and blocks save/unguarded close', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let calls = 0;
  type(overlay, 'content', 'keep');
  h.api.window.uploadCardImage = async () => { if (++calls === 2) throw Error('offline'); return { url: `https://a.test/${calls}` }; };
  field(overlay, 'file').files = ['a', 'b', 'c'].map(image);
  await field(overlay, 'file').onchange();
  assert.equal(calls, 0);
  await field(overlay, 'save').click();
  assert.equal(calls, 2); assert.equal(h.layers[0].config.isDirty(), true);
  const draft = h.api.readQuickDraft('note', 'account-a');
  assert.deepEqual(Array.from(draft.images), ['https://a.test/1']); assert.equal(draft.image, draft.images[0]);
  assert.equal(h.data.note.length, 0);
  await field(overlay, 'save').click(); assert.equal(calls, 4);
  assert.equal(h.data.note[0].images.length, 3);
});

test('batch capacity rejects excess files and removal frees a slot', () => {
  const q = createNoteImageQueue({ images: Array(8).fill('existing') });
  assert.equal(q.add([image('last'), image('excess')]), 1);
  assert.equal(q.entries.length, 9); assert.equal(q.addURL('extra'), false);
  q.remove(8); assert.equal(q.pending, false); assert.equal(q.addURL('replacement'), true);
});

test('note save retains legacy metadata while images become authoritative', () => {
  const h = harness();
  const base = { id: 1, image: 'old', title: 'title', mood: 'sun', layout: 'quote', date: '2020-01-01', other: 7 };
  const result = h.api.quickRecord('note', base, { content: 'text', images: [] });
  assert.equal(result.image, ''); assert.deepEqual(Array.from(result.images), []);
  for (const key of ['title', 'mood', 'layout', 'date', 'other']) assert.equal(result[key], base[key]);
  assert.equal(base.image, 'old');
});

test('array drafts restore by owner and upload completion never flows to a new owner', async () => {
  const h = harness(); h.api.writeQuickDraft('note', 'account-a', { id: 5, images: ['existing'], content: 'keep' });
  const overlay = h.api.openEditor('note'); let resolve;
  h.api.window.uploadCardImage = () => new Promise(done => { resolve = done; });
  field(overlay, 'file').files = [image('a'), image('b')];
  field(overlay, 'file').onchange();
  const upload = field(overlay, 'save').click(); h.setUser({ id: 'account-b' }); resolve({ url: 'new' }); await upload;
  assert.deepEqual(Array.from(h.api.readQuickDraft('note', 'account-a').images), ['existing', 'new']);
  assert.equal(h.api.readQuickDraft('note', 'account-b'), null);
  await field(overlay, 'save').click(); assert.equal(h.data.note.length, 0);
});
