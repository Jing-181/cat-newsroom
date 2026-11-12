import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { formatSyncDiagnostics, readSyncDiagnostics } from '../src/lib/sync-diagnostics.js';

const source = fs.readFileSync(new URL('../supabase-sync.js', import.meta.url), 'utf8');
function harness() {
  const storage = new Map();
  const calls = [];
  const blocked = name => () => { calls.push(name); throw new Error(name); };
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: blocked('write'), removeItem: blocked('remove') },
    window: { location: { protocol: 'https:', href: 'https://private.invalid/?token=SECRET', search: '?token=SECRET' }, isSecureContext: true },
    navigator: { onLine: false, userAgent: 'PRIVATE-UA' },
    fetch: blocked('fetch'), setTimeout: blocked('timer'), console: { error() {} },
    document: { querySelectorAll: () => [] },
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  for (const name of ['initSupabase', 'getAccessToken', 'accountOutbox', 'processOutbox', 'raceGuard']) context[name] = blocked(name);
  return { context, run, storage, calls, key: run('SYNC_OUTBOX_KEY') };
}

test('snapshot reads queue without auth, network, ownership repair, timers or storage mutation', () => {
  const h = harness();
  const raw = JSON.stringify([
    { type: 'record', record: { title: 'PRIVATE-RECORD' } },
    { type: 'delete', accountId: 'PRIVATE-ACCOUNT', recordId: 'PRIVATE-ID' },
    { type: 'meta', accountId: 'OTHER-ACCOUNT', value: 'PRIVATE-TOKEN' }, null,
  ]);
  h.storage.set(h.key, raw);
  h.run("currentUser = { id: 'PRIVATE-ACCOUNT' }; localAccountOwner = 'PRIVATE-ACCOUNT'; sb = { auth: {} }");
  const first = h.run('getSyncDiagnostics()');
  assert.deepEqual(JSON.parse(JSON.stringify(first.queue)), { storage: 'ok', total: 4, record: 1, delete: 1, meta: 1, other: 1, unowned: 2, currentAccount: 1, otherAccount: 1 });
  first.queue.total = 500;
  const text = readSyncDiagnostics({ getSyncDiagnostics: () => h.run('getSyncDiagnostics()') });
  assert.match(text, /总数=4/);
  assert.match(text, /当前账号=1；其他账号=1；无归属=2/);
  h.run('currentUser = null');
  const loggedOut = h.run('getSyncDiagnostics()');
  assert.equal(loggedOut.queue.currentAccount, 0);
  assert.equal(loggedOut.queue.otherAccount, 2);
  assert.equal(loggedOut.queue.unowned, 2);
  assert.match(text, /网络在线提示=否/);
  assert.doesNotMatch(text, /PRIVATE|OTHER-ACCOUNT|SECRET|invalid|token=/);
  assert.equal(h.storage.get(h.key), raw);
  assert.equal(h.run('accountGuards.size'), 0);
  assert.deepEqual(h.calls, []);
});

test('empty, malformed and unavailable storage never get repaired', () => {
  const h = harness();
  assert.equal(h.run('getSyncDiagnostics().queue.total'), 0);
  for (const raw of ['{}', 'null', '"secret"']) {
    h.storage.set(h.key, raw);
    assert.equal(h.run('getSyncDiagnostics().queue.storage'), 'invalid');
    assert.equal(h.storage.get(h.key), raw);
  }
  h.storage.set(h.key, '{broken');
  assert.equal(h.run('getSyncDiagnostics().queue.storage'), 'unavailable');
  h.context.localStorage.getItem = () => { throw new Error('PRIVATE'); };
  assert.equal(h.run('getSyncDiagnostics().queue.storage'), 'unavailable');
  assert.deepEqual(h.calls, []);
});

test('error memory retains only finite codes/categories and returns independent copies', () => {
  const h = harness();
  h.context.failure = { code: '42501', message: 'PRIVATE-TOKEN https://private/?token=SECRET', details: 'PRIVATE-ACCOUNT' };
  h.run("recordSyncDiagnosticError('outbox', failure)");
  const snapshot = h.run('getSyncDiagnostics()');
  assert.equal(snapshot.error.category, 'permission');
  assert.equal(snapshot.error.code, '42501');
  assert.match(snapshot.error.at, /^\d{4}-/);
  snapshot.error.code = 'PRIVATE';
  assert.equal(h.run('getSyncDiagnostics().error.code'), '42501');
  assert.doesNotMatch(h.run('JSON.stringify(lastDiagnosticError)'), /PRIVATE|SECRET|message|details/);
  h.context.failure = { code: 'PRIVATE-CODE', name: 'PRIVATE-NAME', message: 'PRIVATE' };
  h.run("recordSyncDiagnosticError('PRIVATE-STAGE', failure)");
  assert.equal(h.run('getSyncDiagnostics().error.code'), 'unknown');
  assert.equal(h.run('getSyncDiagnostics().error.stage'), 'unknown');
  assert.equal(harness().run('getSyncDiagnostics().error'), null);
});

test('browser errors without codes classify narrowly and never retain private messages', () => {
  const h = harness();
  const privateText = 'PRIVATE-ACCOUNT PRIVATE-TOKEN https://private.invalid/?token=SECRET';
  for (const [name, message, category] of [
    ['AbortError', `Failed to fetch ${privateText}`, 'timeout'],
    ['TypeError', `Failed to fetch ${privateText}`, 'network'],
    ['TypeError', `Load failed ${privateText}`, 'network'],
    ['Error', `NetworkError when attempting to fetch resource ${privateText}`, 'network'],
    ['Error', `network request failed ${privateText}`, 'network'],
    ['NetworkError', privateText, 'network'],
    ['TypeError', privateText, 'unknown'],
    ['Error', `Unexpected failure ${privateText}`, 'unknown'],
  ]) {
    h.context.failure = { name, message };
    h.run("recordSyncDiagnosticError('outbox', failure)");
    const snapshot = h.run('getSyncDiagnostics()');
    assert.equal(snapshot.error.category, category);
    assert.equal(snapshot.error.code, 'unknown');
    assert.match(formatSyncDiagnostics(snapshot), new RegExp(`类别=${category}`));
    for (const output of [h.run('JSON.stringify(lastDiagnosticError)'), JSON.stringify(snapshot), formatSyncDiagnostics(snapshot)]) {
      assert.doesNotMatch(output, /PRIVATE|SECRET|private.invalid|token=|Failed to fetch|Load failed|NetworkError|network request failed|Unexpected failure/);
      assert.ok(!output.includes(message));
    }
  }
  assert.deepEqual(h.calls, []);
});

test('presentation revalidates every untrusted field rather than serializing a snapshot', () => {
  const secret = 'PRIVATE https://private/?token=SECRET';
  const snapshot = { capturedAt: secret, lastSyncAt: secret, status: secret, session: secret, clientReady: secret,
    environment: { protocol: secret, online: secret, secure: secret },
    queue: Object.fromEntries(['storage', 'total', 'record', 'delete', 'meta', 'other', 'unowned', 'currentAccount', 'otherAccount'].map(k => [k, secret])),
    error: { stage: secret, code: secret, category: secret, at: secret, message: secret }, token: secret };
  assert.doesNotMatch(formatSyncDiagnostics(snapshot), /PRIVATE|SECRET|private/);
  assert.match(readSyncDiagnostics({}), /未就绪/);
  assert.match(readSyncDiagnostics({ getSyncDiagnostics() { throw new Error(secret); } }), /暂不可用/);
});

test('existing settings catch captures metadata without retaining raw errors', async () => {
  const h = harness();
  h.context.raceGuard = () => ({ snapshot: () => ({}), pending() {} });
  h.context.accountOutbox = () => [];
  h.context.client = { from() { return { select() { return { eq() { return { maybeSingle: async () => ({ error: { status: 503, message: 'PRIVATE' } }) }; } }; } }; } };
  h.run("sb = client; currentUser = { id: 'PRIVATE-ID' }");
  assert.equal(await h.run('fetchUserSettings()'), null);
  assert.equal(h.run('getSyncDiagnostics().error.stage'), 'settings');
  assert.equal(h.run('getSyncDiagnostics().error.category'), 'server');
});

test('settings diagnostic handler uses AppDialog and only reads the diagnostic bridge', () => {
  const view = fs.readFileSync(new URL('../src/modules/settings/SettingsView.vue', import.meta.url), 'utf8');
  const handler = view.slice(view.indexOf('async function showSyncDiagnostics'), view.indexOf('const root'));
  assert.match(view, /@click="showSyncDiagnostics"/);
  assert.match(handler, /AppDialog.confirm\(summary/);
  assert.match(handler, /clipboard.writeText\(summary\)/);
  assert.doesNotMatch(handler, /initSupabase|fetchUserSettings|runFullSync|processOutbox|localStorage|error.message/);
});
