<script setup>
// 今日头版：保留旧卡片顺序，收起重复统计；输入组件不随数据刷新重建。
import { ref, computed, onMounted, onUpdated, onBeforeUnmount } from "vue";
import { CONFIG } from "../../lib/config.js";
import { icon, esc } from "../../lib/icons.js";
import { dateStr, weekDates, pad2, today } from "../../lib/utils.js";
import { getData, save, subscribe, bump } from "../../lib/store.js";
import { openEditor } from "../../lib/editor.js";
import { pomo, ensurePomodoroController, pomoUpdate } from "../../lib/pomodoro.js";
import { trainingReviewSlotHTML, initTrainingReview } from "../../lib/training-review.js";
import { dailyCopySlotHTML, initDailyCopy } from "../../lib/daily-copy.js";
import { DEFAULT_HOME_ORDER, visibleHomeOrder } from "../../lib/home-layout.js";
import { readTrend, writeTrendDay } from "../../lib/week-state.js";
import { pendingTasks, completedThisWeek } from "../../lib/life-feed.js";
import Workout from "../../lib/workout.js";
import WorkoutPlan from "../../lib/workout-plan.js";
import WorkoutUI from "../../lib/workout-ui.js";
import { sleepingCat } from "../../lib/critters.js";
import QuickCapture from "../../components/QuickCapture.vue";
import AssistantCrew from "../../components/AssistantCrew.vue";
import Toast from "../../lib/toast.js";

// 静态刊物沿用部署基路径，支持 GitHub Pages 子目录。
const storyUrl = `${import.meta.env.BASE_URL}assets/stories/lights-still-on/01-extra-minute/index.html`;
const emit = defineEmits(["navigate"]);
const root = ref(null), revision = ref(0), currentDay = ref(today());
const order = computed(() => { revision.value; return visibleHomeOrder(getData().__homeOrder, DEFAULT_HOME_ORDER); });
const tasks = computed(() => { revision.value; return pendingTasks(getData().todo); });
const pendingCount = computed(() => { revision.value; return (getData().todo || []).filter(x => !x.done && !x.deleted_at).length; });
const trainingCount = computed(() => { revision.value; currentDay.value; return completedThisWeek(getData().sport).length; });
const mood = computed(() => { revision.value; currentDay.value; return readTrend()[(new Date().getDay() + 6) % 7]; });
const greeting = computed(() => { currentDay.value; const hour = new Date().getHours(); return hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好'; });
const hasDraft = computed(() => { revision.value; return WorkoutUI.hasDraft(); });
function go(key) { emit('navigate', key); }
function data() { return getData(); }
function toggleTask(item) {
  const before = { ...item };
  item.done = !item.done; item.updated_at = new Date().toISOString(); delete item.__seed;
  try { save(); } catch { Object.keys(item).forEach(key => delete item[key]); Object.assign(item, before); Toast.show('未能保存，请重试'); return; }
  try { window.syncRecord?.({ moduleKey: 'todo', record: item }); } catch { Toast.show('本机已保存，同步暂未发出'); }
  bump();
}
function setMood(value) {
  try { writeTrendDay((new Date().getDay() + 6) % 7, value === mood.value ? null : value); revision.value++; }
  catch { Toast.show('状态未能保存，请重试'); }
}
function goalsTileHTML() {
  const wk = weekDates(); const inWeek = new Set(wk);
  const colors = ["var(--module-3)", "var(--module-1)", "var(--module-2)", "var(--module-4)", "var(--module-5)"];
  const sessions = (data().sport || []).filter(x => Workout.isSession(x) && x.status === "completed" && !x.deleted_at && inWeek.has(x.date));
  sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const setCount = sessions.reduce((s, x) => s + (Workout.summary(x).setCount || 0), 0);
  const hasStrength = sessions.some(x => Workout.summary(x).hasStrength);
  const volume = Math.round(sessions.reduce((s, x) => s + (Workout.summary(x).volume || 0), 0));
  // 训练计划进度：生成过计划且有完成记录才显示进度条
  let planRow = "";
  try {
    const plan = WorkoutPlan.load();
    const progress = WorkoutPlan.loadProgress();
    if (plan && progress && WorkoutPlan.isProgressValid(progress, plan.generated_at) && plan.days.length) {
      const done = Object.keys(progress.days || {}).length;
      const pct = Math.min(100, Math.round(done / plan.days.length * 100));
      planRow = `<div class="goals-plan"><span>训练计划</span><div class="bbar"><i style="width:${pct}%"></i></div><b>${done}/${plan.days.length} 天</b></div>`;
    }
  } catch (_) { /* 计划读取失败不影响本周统计 */ }
  const rows = sessions.slice(0, 3).map((x, i) => { const info = Workout.summary(x), col = colors[i % colors.length];
    return `<div class="book-row"><span class="spine" style="background:${col}">${icon("activity", 16)}</span><div class="bmid"><div class="btt">${esc(x.title)}</div><div class="bsub">${info.exerciseCount} 个动作 · ${info.setCount} 组${info.hasStrength ? ` · 力量容量 ${Math.round(info.volume)} kg` : ''}</div></div><span class="bpct" style="color:${col}">${esc(String(x.date || "").slice(5))}</span></div>`; }).join("");
  const body = sessions.length
    ? `<div class="goals-stats"><div class="goals-stat"><b>${sessions.length}</b><span>本周训练</span></div><div class="goals-stat"><b>${setCount}</b><span>总组数</span></div>${hasStrength ? `<div class="goals-stat"><b>${volume}</b><span>力量容量 kg</span></div>` : ''}</div>${planRow}<div class="book-list">${rows}</div>`
    : `<div class="focus-empty">本周还没训练，点「运动健身」开始第一练吧。</div>`;
  return `<div class="tile b4"><div class="tile-h"><span class="tic">${icon("activity", 16)}</span><div class="tt"><span class="en">WEEKLY TRAINING</span><span class="zh">本周训练</span></div><span class="r js-open" data-open="sport">${sessions.length} 次</span></div>${body}</div>`;
}

// 旧 HTML 控制器仅管理自己的容器，Vue 负责表单和列表生命周期。
let reportHost, copyHost, unsubscribe, timer, mounted = false;
function initWidgets() {
  const report = root.value?.querySelector('#training-review-slot');
  if (report && report !== reportHost) { reportHost = report; initTrainingReview(root.value, { compact: true, onMore: () => go('insight') }); }
  const copy = root.value?.querySelector('#daily-copy-slot');
  if (copy && copy !== copyHost) { copyHost = copy; initDailyCopy(root.value); }
  pomoUpdate();
}
const trainingHTML = computed(() => { revision.value; currentDay.value; return goalsTileHTML(); });
const reportHTML = trainingReviewSlotHTML({ compact: true });
const copyHTML = dailyCopySlotHTML();
const refresh = () => { revision.value++; };
async function loadHomeOrder() {
  const owner = window.getCurrentUser?.()?.id, snapshot = JSON.stringify(getData().__homeOrder || []);
  try {
    const settings = await window.fetchUserSettings?.();
    const remote = settings?.home_order;
    if (!mounted || owner !== window.getCurrentUser?.()?.id || snapshot !== JSON.stringify(getData().__homeOrder || [])) return;
    if (Array.isArray(remote) && remote.length && remote.every(key => typeof key === 'string')) {
      const previous = getData().__homeOrder;
      getData().__homeOrder = remote;
      try { save(); } catch { getData().__homeOrder = previous; return; }
      refresh();
    }
  } catch { /* 离线仍使用本地排序。 */ }
}
onMounted(() => {
  mounted = true; ensurePomodoroController(); initWidgets();
  unsubscribe = subscribe(refresh);
  window.addEventListener('home-order-changed', refresh);
  timer = setInterval(() => { currentDay.value = today(); pomoUpdate(); }, 1000);
  loadHomeOrder();
});
onUpdated(initWidgets);
onBeforeUnmount(() => { mounted = false; unsubscribe?.(); clearInterval(timer); window.removeEventListener('home-order-changed', refresh); });
</script>

<template>
  <div ref="root" class="home-edition">
    <div class="home-grid">
      <template v-for="key in order" :key="key">
        <template v-if="key === 'clock'">
          <header class="home-masthead home-wide"><div><p class="life-caption">{{ dateStr() }}</p><h2>{{ greeting }}，{{ CONFIG.owner }}</h2><p>把今天过得轻一点。</p></div><div class="home-cat" aria-hidden="true" v-html="sleepingCat"></div></header>
          <AssistantCrew class="home-wide" @navigate="go" />
        </template>
        <QuickCapture v-else-if="key === 'quick'" class="home-wide" @navigate="go" />
        <section v-else-if="key === 'todo'" class="life-panel home-wide">
          <header class="life-heading"><h3>今天要做</h3><button class="life-link" @click="go('todo')">全部事项 · {{ pendingCount }}</button></header>
          <p v-if="!tasks.length" class="life-caption">眼前没有未完成事项，留点空闲给自己。</p>
          <div v-for="task in tasks" :key="task.id" class="home-task"><input type="checkbox" :checked="task.done" :aria-label="`完成 ${task.title}`" @change="toggleTask(task)"><button @click="openEditor('todo', task)">{{ task.title }}</button><span v-if="task.pinned" class="life-caption">置顶</span></div>
          <p v-if="pendingCount > tasks.length" class="life-caption">先看这 {{ tasks.length }} 件，其余在事项里。</p>
        </section>
        <section v-else-if="key === 'trend'" class="life-panel">
          <header class="life-heading"><h3>今天的状态</h3><button class="life-link" @click="go('insight')">看本周</button></header>
          <div class="home-moods" aria-label="今日状态评分"><button v-for="value in 5" :key="value" :aria-pressed="mood === value" :aria-label="`今日状态 ${value} 分`" @click="setMood(value)">{{ value }}</button></div><p class="life-caption">1 分很低 · 5 分很好 · 再点一次清除</p>
        </section>
        <section v-else-if="key === 'pomo'" class="home-pomo life-panel">
          <header class="life-heading"><h3>专注一会儿</h3><span id="pomo-status">已暂停</span></header><div class="home-pomo-row"><strong id="pomo-time">{{ pad2(Math.floor(pomo.remain / 60)) }}:{{ pad2(pomo.remain % 60) }}</strong><button class="pomo-primary" id="pomo-toggle" @click="ensurePomodoroController()?.toggle()">开始</button><button class="pomo-reset" @click="ensurePomodoroController()?.stop()">重置</button></div>
        </section>
        <section v-else-if="key === 'goals'" class="home-wide home-training">
          <div class="home-training-summary life-panel"><div><h3>本周完成 {{ trainingCount }} 次训练</h3><p class="life-caption">{{ hasDraft ? '有一份未结束的训练，接着来。' : '准备好了，就从一次训练开始。' }}</p></div><button class="btn" @click="go('sport')">{{ hasDraft ? '继续训练' : '开始训练' }}</button></div>
          <details><summary>训练明细与计划进度</summary><div v-html="trainingHTML" @click="event => event.target.closest('[data-open]') && go('sport')"></div></details>
        </section>
        <div v-else-if="key === 'daily'" id="daily-copy-slot" class="tile daily-card home-wide home-daily" v-html="copyHTML"></div>
        <div v-else-if="key === 'report'" class="home-wide home-report" v-html="reportHTML"></div>
      </template>
    </div>
    <section class="story-entry" aria-label="故事会">
      <img src="../../../assets/stories/lights-still-on/01-extra-minute/04.webp" alt="Hanako、源和悠走进纸片组成的旧日街道" loading="lazy">
      <div><p>故事会 · 灯还亮着</p><h2>多出来的一分钟</h2><p>一只每到打烊就慢一分钟的旧钟，藏着谁没说出口的等待。</p><a class="shared-btn" :href="storyUrl">读第一篇 · 12 格 →</a></div>
    </section>
    <div v-if="getData().__homeVersionVisible !== false" class="home-ver">猫咪生活报 · v{{ CONFIG.APP_VERSION }}</div>
  </div>
</template>

<style scoped>
/* 故事入口沿用报刊主题，窄屏保持图文完整。 */
.story-entry { display:grid; grid-template-columns:160px minmax(0,1fr); gap:24px; align-items:center; margin-top:24px; padding:24px; background:var(--surface-card); border:1px solid var(--border); border-radius:var(--radius-card); }
.story-entry img { width:100%; border-radius:var(--radius-tile); }
.story-entry h2 { margin:8px 0; font-size:24px; }
.story-entry p { margin:8px 0 16px; color:var(--text-secondary); font-size:14px; line-height:1.7; }
.story-entry a { text-decoration:none; display:inline-flex; }
.story-entry a:active { transform:scale(.98); }
.story-entry a:focus-visible { outline:2px solid var(--accent); outline-offset:4px; }
@media(max-width:540px) { .story-entry { grid-template-columns:1fr; padding:16px; gap:16px; } .story-entry img { max-height:240px; object-fit:cover; object-position:center; } }
</style>
