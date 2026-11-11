import { createRouter, createWebHashHistory } from 'vue-router';
import { exercises } from './workout-catalog.js';
export const moduleRoutes = [
  ['home','/home','首页',()=>import('../modules/home/HomeView.vue')],
  ['insight','/insight','洞察复盘',()=>import('../modules/insight/InsightView.vue')],
  ['todo','/todo','待办',()=>import('../modules/todo/TodoView.vue')],
  ['checkin','/checkin','习惯打卡',()=>import('../modules/checkin/CheckinView.vue')],
  ['read','/read','阅读进度',()=>import('../modules/read/ReadView.vue')],
  ['sport','/sport','运动健身',()=>import('../modules/workout/SportView.vue')],
  ['money','/money','记账',()=>import('../modules/money/MoneyView.vue')],
  ['note','/note','日记',()=>import('../modules/note/NoteView.vue')],
  ['hot','/hot','今日收藏',()=>import('../modules/hot/HotView.vue')],
  ['settings','/settings','个人配置',()=>import('../modules/settings/SettingsView.vue')],
  ['exerciseAtlas','/exercises/:exerciseId?','运动总览',()=>import('../modules/workout/ExerciseAtlasView.vue')],
];
export function routerBase(base, location) {
  // Vite currently emits './'; resolve against the document rather than creating /./# links.
  return new URL(base || './', location.href).pathname;
}
export function createAppRouter({ history, componentFor } = {}) {
  const router = createRouter({
    history: history || createWebHashHistory(routerBase(import.meta.env.BASE_URL, window.location)),
    routes: [
      { path:'/', redirect:{name:'home'} },
      ...moduleRoutes.map(([name,path,title,component])=>({name,path,component:componentFor?.(name)||component,meta:{module:name,title}})),
      { path:'/exercise-atlas', redirect:{name:'exerciseAtlas'} },
      { path:'/:pathMatch(.*)*', name:'notFound', component:componentFor?.('notFound')||(()=>import('../modules/navigation/NotFoundView.vue')),meta:{title:'页面不存在',module:'notFound'} },
    ],
    scrollBehavior(to,from,saved) { return saved || (to.name===from.name ? false : {left:0,top:0}); },
  });
  router.beforeEach(to=>{
    // Keep invalid IDs on an honest in-view not-found state; never substitute another exercise.
    const exercise=to.name==='exerciseAtlas'&&exercises.find(e=>e.id===to.params.exerciseId);
    to.meta.title=to.name==='exerciseAtlas' && to.params.exerciseId && !exercise ? '动作不存在' : exercise?`${exercise.name} · 运动总览`:moduleRoutes.find(([name])=>name===to.name)?.[2]||'页面不存在';
  });
  router.afterEach((to,from,failure)=>{if(!failure&&typeof document!=='undefined')document.title=`${to.meta.title} · 猫咪生活报`;});
  return router;
}
