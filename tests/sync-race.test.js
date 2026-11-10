import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import SyncCore from '../js/sync-core.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const stamp = n => `2026-11-10T00:00:${String(n).padStart(2, '0')}.000Z`;
function harness() {
  const writes = [], reads = [], storage = new Map();
  const context = vm.createContext({ SyncCore, structuredClone, console, setTimeout, clearTimeout,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) },
    CONFIG: { storageKey: 'local', modules: [{ key: 'todo' }] }, data: { todo: [], __trend: [0] },
    document: { querySelectorAll: () => [] }, window: {} });
  vm.runInContext(fs.readFileSync(new URL('../supabase-sync.js', import.meta.url), 'utf8'), context);
  context.client = { from(table) { return {
    upsert(row) { const d = deferred(); writes.push({ ...d, row, table }); return { select: () => ({ single: () => d.promise }) }; },
    select() { return { eq(column, accountId) { const d = deferred(); reads.push({ ...d, table, accountId }); return { then: (...a) => d.promise.then(...a), maybeSingle: () => d.promise }; } }; }
  }; } };
  vm.runInContext("sb = client; currentUser = { id: 'A' }; syncStatus = 'online';", context);
  const run = code => vm.runInContext(code, context);
  const tick = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
  const ack = (index, n) => writes[index].resolve({ data: { ...writes[index].row, updated_at: stamp(n) }, error: null });
  const echo = (n, values) => { context.event = { table: 'workbench_meta', eventType: 'UPDATE', newRow: { user_id:'A', updated_at:stamp(n), ...values } }; run('applyRealtimeChange(event)'); };
  return { context, run, tick, writes, reads, ack, echo, storage };
}
test('rapid meta 5, old echoes before/after ACK, other fields and newer remote', async () => {
  const h = harness();
  h.run("data.__trend=[1]; syncMetaField('__trend',[1])"); await h.tick();
  h.run("data.__trend=[5]; syncMetaField('__trend',[5])");
  h.echo(1, { trend_data:[1], avatar:'remote' });
  assert.equal(h.run('data.__trend[0]'),5); assert.equal(h.run('data.__avatar'),'remote');
  h.ack(0,2); await h.tick();
  assert.equal(h.run('readOutbox().length'),1); assert.equal(h.writes.length,2);
  h.ack(1,3); await h.tick();
  h.echo(2,{trend_data:[1]}); assert.equal(h.run('data.__trend[0]'),5);
  assert.equal(h.run('raceGuard().protectedOperations().length'),0);
  assert.equal(h.reads.length,0);
  h.echo(4,{trend_data:[7]}); assert.equal(h.run('data.__trend[0]'),7);
});
test('add-delete-undo and delayed tombstones cannot resurrect or erase', async () => {
  const h=harness();
  h.run("data.todo=[{id:'x',title:'new'}]; syncRecord({moduleKey:'todo',record:data.todo[0]})"); await h.tick();
  h.run("data.todo=[]; syncDelete('todo','x')"); h.ack(0,1); await h.tick();
  assert.equal(h.run('data.todo.length'),0);
  h.ack(1,2); await h.tick();
  h.context.event={table:'workbench_records',eventType:'UPDATE',newRow:{...h.writes[0].row,updated_at:stamp(1)}};
  h.run('applyRealtimeChange(event)'); assert.equal(h.run('data.todo.length'),0);
  h.run("data.todo=[{id:'x',title:'undo'}]; syncRecord({moduleKey:'todo',record:data.todo[0]})"); await h.tick(); h.ack(2,3); await h.tick();
  h.context.event.newRow={...h.writes[1].row,updated_at:stamp(2)};
  h.run('applyRealtimeChange(event)'); assert.equal(h.run('data.todo[0].title'),'undo');
});
test('shared full worker preserves add ACKed while fetch is in flight',async()=>{
  const h=harness(); const a=h.run("runFullSync({reason:'manual'})"); const b=h.run("runFullSync({reason:'manual'})");
  assert.equal(a,b); await h.tick(); assert.equal(h.reads.length,1);
  h.run("data.todo=[{id:'x',title:'during fetch'}]; syncRecord({moduleKey:'todo',record:data.todo[0]})"); await h.tick(); h.ack(0,2); await h.tick();
  assert.equal(h.run('readOutbox().length'),0);
  h.reads[0].resolve({data:[],error:null}); await h.tick(); h.reads[1].resolve({data:null,error:null}); await a;
  assert.equal(h.run('data.todo[0].title'),'during fetch');
});
test('account switch does not dispatch A replacement into B',async()=>{
  const h=harness(); h.run("syncMetaField('__trend',[1])"); await h.tick();
  h.run("syncMetaField('__trend',[5]); currentUser={id:'B'}"); h.ack(0,1); await h.tick();
  await h.run('processOutbox()'); assert.equal(h.writes.length,1);
  assert.equal(h.run('readOutbox()[0].accountId'),'A');
});
test('legacy queue binds only known last account; unknown pauses full replace',async()=>{
  const h=harness(); h.run("writeOutbox([{operationId:'old',type:'meta',field:'__trend',value:[5]}]); localStorage.setItem(LAST_ACCOUNT_KEY,'A')");
  const p=h.run('processOutbox()'); await h.tick(); assert.equal(h.writes[0].row.user_id,'A'); h.ack(0,1); await p;
  const x=harness(); x.run("data.todo=[{id:'offline'}]; writeOutbox([{operationId:'old',type:'record',moduleKey:'todo',record:{id:'offline'}}])");
  await x.run("runFullSync({reason:'manual'})"); assert.equal(x.reads.length,0); assert.equal(x.run('data.todo.length'),1);
});
test('unchanged realtime does not notify and remote tombstone version is checked',()=>{
  const h=harness(); h.run('globalThis.notifications=0; onRemoteUpdate=()=>notifications++');
  h.echo(1,{trend_data:[0]}); assert.equal(h.run('notifications'),0);
  const local={todo:[{id:'x',updated_at:stamp(5)}]};
  SyncCore.applyRecord(local,'todo',{id:'x',deleted_at:stamp(1),updated_at:stamp(1)});
  assert.equal(local.todo.length,1);
});
test('record RETURNING timestamp persists without a render bump',async()=>{
  const h=harness(); h.run("globalThis.notifications=0; onRemoteUpdate=()=>notifications++; data.todo=[{id:'x',title:'same',updated_at:'2099-01-01T00:00:00Z'}]; syncRecord({moduleKey:'todo',record:data.todo[0]})");
  await h.tick(); h.ack(0,2); await h.tick();
  assert.equal(h.run('notifications'),0);
  assert.equal(h.run('data.todo[0].updated_at'),stamp(2));
  assert.equal(JSON.parse(h.storage.get('local')).todo[0].updated_at,stamp(2));
});
test('settings wrapper overlays homeOrder changed during fetch',async()=>{
  const h=harness(); const p=h.run('fetchUserSettings()'); await h.tick();
  h.run("data.__homeOrder=['new']; syncMetaField('__homeOrder',['new'])"); await h.tick();
  h.ack(0,3); await h.tick();
  h.reads[0].resolve({data:{home_order:['old'],updated_at:stamp(1)},error:null});
  assert.deepEqual(JSON.parse(JSON.stringify(await p)).home_order,['new']);
});
test('fetch preserves realtime-only insert arriving after snapshot',async()=>{
  const h=harness(); const p=h.run("runFullSync({reason:'manual'})"); await h.tick();
  h.context.event={table:'workbench_records',eventType:'UPDATE',newRow:{id:'r',module_key:'todo',data:{id:'r',title:'remote'},updated_at:stamp(4)}};
  h.run('applyRealtimeChange(event)'); h.reads[0].resolve({data:[],error:null}); await h.tick();
  h.reads[1].resolve({data:null,error:null}); await p;
  assert.equal(h.run('data.todo[0].title'),'remote');
});
test('authoritative missing row releases ACK guard instead of resurrecting',()=>{
  const h=harness();
  h.run("data.todo=[{id:'gone'}]; globalThis.op={type:'record',moduleKey:'todo',record:{id:'gone'},operationId:'gone'}; raceGuard().pending(op); raceGuard().acknowledge(op,{updated_at:'2026-11-10T00:00:02Z'}); reconcileCloud({__rows:[]},'A',raceGuard().snapshot())");
  assert.equal(h.run('data.todo.length'),0); assert.equal(h.run('raceGuard().protectedOperations().length'),0);
});
test('migration refuses foreign owner and ignores account switch during query',async()=>{
  const h=harness(); h.run("localAccountOwner='A'; currentUser={id:'B'}; data.todo=[{id:'private'}]");
  await h.run('queueMissingLocalRecords()'); assert.equal(h.reads.length,0); assert.equal(h.writes.length,0);
  h.run("currentUser={id:'A'}"); const p=h.run('queueMissingLocalRecords()'); await h.tick();
  h.run("currentUser={id:'B'}"); h.reads[0].resolve({data:[],error:null}); await p;
  assert.equal(h.writes.length,0); assert.equal(h.run('readOutbox().length'),0);
});
test('authority snapshot releases missing echo and accepts newer remote',()=>{
  const g=SyncCore.createRaceGuard(); const op={type:'meta',field:'__trend',value:[5],operationId:'x'};
  g.pending(op); g.acknowledge(op,{updated_at:stamp(2)});
  const snap=g.snapshot(); g.beginReadMerge(snap);
  assert.equal(g.accept('meta:__trend',{updated_at:stamp(3)},[7],snap),true);
  assert.equal(g.protectedOperations(snap).length,0);
  assert.equal(g.accept('meta:__trend',{updated_at:stamp(1)},[1]),false);
});
