import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {AUTH_CALLBACK_KEYS,hasAuthCallback,settleAuthCallback,cleanAuthCallbackUrl} from '../src/lib/route-auth.js';
const source=readFileSync('supabase-sync.js','utf8');
const start=source.indexOf('let authInitGeneration = 0;'),end=source.indexOf('\nasync function fetchAllCloudData',start);
function harness({delayed=false}={}){
 let finish;const listeners=[],writes=[],channels=[];const location={href:'https://example.test/app/?access_token=synthetic&refresh_token=synthetic&provider_token=synthetic&provider_refresh_token=synthetic&token_type=bearer&expires_in=3600&lang=zh#type=signup',search:'?access_token=synthetic&refresh_token=synthetic&provider_token=synthetic&provider_refresh_token=synthetic&token_type=bearer&expires_in=3600&lang=zh',hash:'#type=signup'};
 const session={user:{id:'test-user',is_anonymous:false}};
 const client={auth:{initialize:()=>delayed?new Promise(r=>{finish=()=>r({error:null});}):Promise.resolve({error:null}),getSession:async()=>({data:{session},error:null}),onAuthStateChange:cb=>{listeners.push(cb);return{data:{subscription:{unsubscribe(){}}}};},stopAutoRefresh(){},signInAnonymously(){throw Error('unexpected anonymous login');}},removeChannel(){},channel(){const callbacks=[];return {on(event,filter,cb){callbacks.push(cb);return this;},subscribe(){channels.push(()=>callbacks.forEach(cb=>cb({eventType:'UPDATE',old:{},new:{user_id:'test-user'}})));return this;}};}};
 const context={URLSearchParams,console:{error(){throw Error('callback error must not log');}},SUPABASE_CONFIG:{url:'https://example.test',anonKey:'public'},SUPABASE_PROJECT_REF:'test',LAST_ACCOUNT_KEY:'last',sb:null,currentUser:null,syncStatus:'offline',syncChannel:null,authStateUnsubscribe:null,explicitSignOut:false,window:{supabase:{},location},supabase:{createClient:()=>client},normalizeHeaderValue:v=>v,updateSyncIndicator(){},markRealAccount:id=>writes.push(['owner',id]),applyRealtimeChange(){writes.push(['business-record','remote']);},notifyLoginRequired(){},localStorage:{getItem:()=>null,length:0,removeItem(){writes.push(['remove']);}}};
 const realtimeStart=source.indexOf('function setupRealtime()'),realtimeEnd=source.indexOf('\nfunction usernameToEmail',realtimeStart);
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\n'+source.slice(realtimeStart,realtimeEnd)+'\nthis.initialize=initSupabase;',context);
 const clean=()=>{const url=new URL(cleanAuthCallbackUrl(location),'https://example.test');location.href=url.href;location.search=url.search;location.hash=url.hash;};
 return{context,location,writes,channels,listeners,clean,finish:()=>finish(),emit:()=>listeners.forEach(cb=>cb('SIGNED_IN',session))};
}
test('all callback query secrets/metadata scrubbed after implicit success, ordinary query retained',async()=>{
 const h=harness();const result=await settleAuthCallback({location:h.location,initialize:o=>h.context.initialize({authCallback:true,...o}),beforeActivate:h.clean});assert.equal(result.ready,true);assert.equal(h.location.search,'?lang=zh');assert.equal(h.location.hash,'#/');for(const key of AUTH_CALLBACK_KEYS)assert.equal(new URL(h.location.href).searchParams.has(key),false);assert.ok(h.channels.length>0);h.channels[0]();assert.ok(h.writes.some(([key])=>key==='business-record'));
 const full=new URL('https://example.test/app/?lang=zh&campaign=local');for(const key of AUTH_CALLBACK_KEYS)full.searchParams.set(key,'synthetic');full.hash='access_token=synthetic&provider_token=synthetic';const cleaned=new URL(cleanAuthCallbackUrl({href:full.href}),'https://example.test');assert.equal(cleaned.search,'?lang=zh&campaign=local');assert.equal(cleaned.hash,'#/');
 for(const key of ['code','access_token','refresh_token','provider_token','provider_refresh_token'])assert.ok(hasAuthCallback({search:`?${key}=synthetic`,hash:''}));
});
test('ordinary metadata and application error queries remain offline deep links without auth or cleanup',async()=>{
 for(const suffix of ['?type=report','?expires_at=123','?expires_in=60','?token_type=report','?error=report_failed','?error_code=local','?error_description=local','?type=report&expires_at=123&expires_in=60&token_type=report','?error=access_denied']){
  const url=new URL(`https://example.test/app/${suffix}#/sport`),location={href:url.href,search:url.search,hash:url.hash},before={...location};let called=0,cleaned=0;
  assert.equal(hasAuthCallback(location),false);
  const result=await settleAuthCallback({location,initialize:()=>{called++;throw Error('must stay offline');},beforeActivate:()=>{cleaned++;}});
  assert.deepEqual(result,{callback:false,ready:true});assert.equal(called,0);assert.equal(cleaned,0);assert.deepEqual(location,before);
 }
 assert.equal(hasAuthCallback({search:'',hash:'#/sport?error=access_denied&error_description=local'}),false);
 assert.equal(hasAuthCallback({search:'?error=access_denied&error_description=denied',hash:''}),true);
 assert.equal(hasAuthCallback({search:'',hash:'#error=access_denied&error_description=denied'}),true);
});
test('timeout followed by late SDK success/auth events cannot activate business listeners or realtime writes',async()=>{
 const h=harness({delayed:true});let initialization;
 const result=await settleAuthCallback({location:h.location,timeoutMs:5,initialize:o=>(initialization=h.context.initialize({authCallback:true,...o})),beforeActivate:h.clean});assert.equal(result.ready,false);h.emit();assert.equal(h.listeners.length,0);h.finish();assert.equal(await initialization,false);h.emit();assert.deepEqual(h.writes,[]);assert.equal(h.channels.length,0);assert.ok(h.location.search.includes('access_token'));
});
test('prepared callback cannot activate until scrubbed or after cancellation, normal session startup still activates',async()=>{
 const h=harness(),controller=new AbortController();const prepared=await h.context.initialize({authCallback:true,signal:controller.signal,callbackKeys:AUTH_CALLBACK_KEYS});assert.equal(h.channels.length,0);assert.equal(prepared.activate(),false);h.clean();controller.abort();assert.equal(prepared.activate(),false);assert.deepEqual(h.writes,[]);
 const normal=harness();normal.clean();assert.equal(await normal.context.initialize(),true);assert.equal(normal.listeners.length,1);assert.ok(normal.channels.length>0);normal.emit();assert.ok(normal.writes.some(([key])=>key==='owner'));
});
