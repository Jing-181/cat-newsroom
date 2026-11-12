import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryHistory} from 'vue-router';
import {createAppRouter,moduleRoutes,routerBase} from '../src/lib/app-router.js';
import {hasAuthCallback,settleAuthCallback,cleanAuthCallbackUrl} from '../src/lib/route-auth.js';
import {readFileSync} from 'node:fs';
const make=()=>createAppRouter({history:createMemoryHistory(),componentFor:()=>({render(){return null;}})});
test('all12 named module routes, home redirect, unknown routes and real exercise titles',async()=>{
 const router=make();assert.equal(moduleRoutes.length,12);
 await router.push('/');assert.equal(router.currentRoute.value.name,'home');
 for(const[name,path]of moduleRoutes){await router.push({name});assert.equal(router.currentRoute.value.meta.module,name);}
 await router.push('/exercises/pull_up?q=引体');assert.equal(router.currentRoute.value.params.exerciseId,'pull_up');assert.equal(router.currentRoute.value.query.q,'引体');assert.match(router.currentRoute.value.meta.title,/引体向上/);
 await router.push('/exercises/not-a-real-id');assert.equal(router.currentRoute.value.params.exerciseId,'not-a-real-id');
 await router.push('/missing/path');assert.equal(router.currentRoute.value.name,'notFound');
 await router.push('/exercise-atlas');assert.equal(router.currentRoute.value.name,'exerciseAtlas');
});
test('browser history semantics and filter query preserved across detail/list and back',async()=>{
 const router=make();await router.push('/exercises?q=肩&equipment=哑铃');await router.push({name:'exerciseAtlas',params:{exerciseId:'dumbbell_shoulder_press'},query:router.currentRoute.value.query});
 const wait=()=>new Promise(resolve=>{const off=router.afterEach(()=>{off();resolve();});});
 let done=wait();router.back();await done;assert.equal(router.currentRoute.value.params.exerciseId,'');assert.equal(router.currentRoute.value.query.q,'肩');
 done=wait();router.forward();await done;assert.equal(router.currentRoute.value.params.exerciseId,'dumbbell_shoulder_press');
});
test('relative Vite base resolves GitHub Pages and dev hash locations safely',()=>{
 assert.equal(routerBase('./',{href:'https://jing-181.github.io/cat-newsroom/index.html#/sport'}),'/cat-newsroom/');
 assert.equal(routerBase('./',{href:'http://localhost:5176/#/sport'}),'/');
});
test('normal offline startup never initializes auth before router; callbacks await consumption only',async()=>{
 let called=0;const normal=await settleAuthCallback({location:{hash:'#/sport',search:''},initialize:()=>{called++;throw Error();}});assert.deepEqual(normal,{callback:false,ready:true});assert.equal(called,0);
 for(const location of[{hash:'#access_token=synthetic&refresh_token=synthetic',search:''},{hash:'',search:'?code=synthetic'},{hash:'#error=access_denied',search:''}]){
 assert.ok(hasAuthCallback(location));assert.deepEqual(await settleAuthCallback({location,initialize:async()=>true}),{callback:true,ready:true});
 assert.deepEqual(await settleAuthCallback({location,initialize:async()=>false}),{callback:true,ready:false});
 }
 const loc={hash:'#access_token=synthetic',search:''};assert.deepEqual(await settleAuthCallback({location:loc,initialize:()=>new Promise(()=>{}),timeoutMs:2}),{callback:true,ready:false});assert.equal(loc.hash,'#access_token=synthetic');
 assert.equal(cleanAuthCallbackUrl({href:'https://example.com/cat-newsroom/?code=synthetic&lang=zh#access_token=synthetic'}),'/cat-newsroom/?lang=zh#/');
});
test('auth bridge fails closed, preserved legacy callback links and route-based atlas cleanup',()=>{
 const sync=readFileSync('supabase-sync.js','utf8'),main=readFileSync('src/main.js','utf8'),atlas=readFileSync('src/modules/workout/ExerciseAtlasView.vue','utf8');
 assert.ok(sync.includes('await client.auth.initialize()'));assert.ok(sync.includes("query.has('code')"));assert.ok(sync.includes('if (!authCallback) console.error'));
 assert.ok(main.indexOf('await settleAuthCallback')<main.indexOf('app.use(router)'));
 for(const file of['workbench-desktop.html','workbench-mobile.html','index.html'])assert.ok(readFileSync(file,'utf8').includes('location.search + location.hash'));
 assert.ok(atlas.includes('route.params.exerciseId'));assert.ok(atlas.includes('onBeforeUnmount'));assert.ok(atlas.includes('invalidId'));
});
