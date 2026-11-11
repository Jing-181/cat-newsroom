<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { exercises } from '../../lib/workout-catalog.js';
import { resolveDemo, DEMO_STATUS } from '../../lib/motion/demos.js';
import { createDemoFigure } from '../../lib/motion/index.js';
const query = ref(''), equipment = ref(''), status = ref('');
const selected = ref(null), playing = ref(false), figure = ref(null);
const rows = exercises.map(exercise => ({ ...exercise, demo: resolveDemo(exercise) }));
const equipmentOptions = [...new Set(exercises.map(e => e.equipment))];
const statusLabels = { ...DEMO_STATUS, calibrated: '已接入示范 · 待视觉验收' };
const demoLabel = demo => demo.label === DEMO_STATUS.calibrated ? statusLabels.calibrated : demo.label;
const filtered = computed(() => rows.filter(e =>
  (!equipment.value || e.equipment === equipment.value) &&
  (!status.value || e.demo.status === status.value) &&
  `${e.name} ${e.muscles} ${e.bodyPart} ${e.equipment}`.toLowerCase().includes(query.value.trim().toLowerCase())));
let cleanup = () => {};
watch([selected, playing, figure], () => {
  cleanup(); cleanup = () => {};
  if (selected.value?.demo.clip?.staticHold) playing.value = false;
  if (selected.value && figure.value) cleanup = createDemoFigure(figure.value, { exercise: selected.value, reduced: playing.value ? undefined : true });
}, { flush: 'post' });
watch(filtered, list => {
  if (selected.value && !list.some(e => e.id === selected.value.id)) { selected.value = null; playing.value = false; }
});
function select(exercise) { playing.value = false; selected.value = exercise; }
const thumbnails = new Map();
onBeforeUnmount(() => { cleanup(); thumbnails.forEach(stop => stop()); thumbnails.clear(); });
function staticFigure(svg, exercise) {
  thumbnails.get(exercise.id)?.();
  thumbnails.delete(exercise.id);
  if (svg) thumbnails.set(exercise.id, createDemoFigure(svg, { exercise, reduced: true }));
}
</script>

<template>
  <section class="exercise-atlas newsroom-components">
    <header><h1>运动总览</h1><p>104 个动作的只读图鉴 · 动作知识沿用训练动作库</p></header>
    <div class="atlas-filters">
      <label class="shared-field">搜索动作或肌群<input v-model="query" type="search" placeholder="名称、肌群、器械"></label>
      <label class="shared-field">器械<select v-model="equipment"><option value="">全部器械</option><option v-for="item in equipmentOptions" :key="item">{{ item }}</option></select></label>
      <label class="shared-field">示范状态<select v-model="status"><option value="">全部状态</option><option v-for="(label, key) in statusLabels" :value="key" :key="key">{{ label }}</option></select></label>
    </div>
    <p class="atlas-note" aria-live="polite">{{ filtered.length }} 个动作 · {{ rows.filter(e => e.demo.status === 'calibrated').length }} 个已接入示范，{{ rows.filter(e => !e.demo.clip).length }} 个暂无示范。示范仅做接触与运动关系展示，仍待视觉验收。</p>
    <article v-if="selected" class="shared-card atlas-detail">
      <header><h2>{{ selected.name }}</h2><button class="shared-btn" @click="selected = null; playing = false">关闭详情</button></header>
      <div class="atlas-detail-body">
        <div><svg ref="figure" class="atlas-player"></svg><p v-if="selected.demo.clip?.staticHold" class="atlas-note">静态保持示范</p><button v-else-if="selected.demo.clip" class="shared-btn" :aria-pressed="playing" @click="playing = !playing">{{ playing ? '停止播放' : '播放示范' }}</button></div>
        <div><p>{{ demoLabel(selected.demo) }}</p><p><b>肌群：</b>{{ selected.muscles || selected.bodyPart }}</p><p><b>器械：</b>{{ selected.equipment }}<template v-if="selected.angle"> · {{ selected.angle }}</template></p><p>{{ selected.tips }}</p>
          <template v-if="selected.demo.clip"><p><b>观察：</b>{{ selected.demo.view }}</p><p><b>支撑：</b>{{ selected.demo.support }}</p><p><b>器械与运动：</b>{{ selected.demo.movement }}</p><a :href="selected.demo.source" target="_blank" rel="noopener noreferrer">动作参考</a><p class="atlas-note">绘图数值未经过生物力学验证，不作为个体训练处方。系统减少动态效果开启时保持静帧。</p></template>
          <p v-else class="atlas-note">当前没有对应示范，不使用其他动作代演。可先阅读动作库要点。</p>
        </div>
      </div>
    </article>
    <div class="atlas-grid">
      <button v-for="exercise in filtered" :key="exercise.id" class="shared-card atlas-item" :aria-pressed="selected?.id === exercise.id" @click="select(exercise)">
        <svg v-if="exercise.demo.clip" :ref="el => staticFigure(el, exercise)" class="atlas-thumb" aria-hidden="true"></svg>
        <span v-else class="atlas-placeholder">暂无示范</span>
        <span class="atlas-item-copy"><strong>{{ exercise.name }}</strong><span>{{ exercise.bodyPart }} · {{ exercise.equipment }}</span><small>{{ demoLabel(exercise.demo) }}</small></span>
      </button>
    </div>
    <p v-if="!filtered.length" class="shared-empty">没有匹配动作，试试清空搜索或筛选条件。</p>
  </section>
</template>

<style>
.exercise-atlas { padding: 24px; color: var(--text); }
.exercise-atlas h1 { margin: 0; font-size: 28px; }
.exercise-atlas p { line-height: 1.7; }
.atlas-note, .exercise-atlas > header p { color: var(--text-secondary); font: 14px/1.7 var(--font-sans); }
.atlas-filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; margin-top: 24px; }
.atlas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.atlas-item { display: flex; gap: 12px; align-items: center; padding: 16px; text-align: left; cursor: pointer; color: var(--text); min-width: 0; font-family: var(--font-sans); }
.atlas-item:hover, .atlas-item[aria-pressed="true"] { border-color: var(--accent); background: var(--surface-nested); }
.atlas-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.atlas-thumb, .atlas-placeholder { width: 72px; height: 88px; flex: 0 0 72px; }
.atlas-placeholder { display: grid; place-items: center; font-size: 12px; color: var(--text-secondary); background: var(--surface-nested); border-radius: var(--radius-tile); }
.atlas-item-copy { display: grid; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.atlas-item-copy strong { font-size: 14px; }
.atlas-item-copy span, .atlas-item-copy small { color: var(--text-secondary); font-size: 12px; }
.atlas-detail { padding: 24px; margin-bottom: 24px; }
.atlas-detail header { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
.atlas-detail h2 { margin: 0; font-size: 20px; }
.atlas-detail-body { display: grid; grid-template-columns: minmax(160px, 240px) 1fr; gap: 24px; font: 14px/1.7 var(--font-sans); }
.atlas-player { display: block; width: 100%; height: 240px; margin: 16px 0; }
.atlas-detail a { color: var(--accent); }
@media (max-width: 820px) {
  .exercise-atlas { padding: 16px; }
  .atlas-filters, .atlas-detail-body { grid-template-columns: 1fr; }
  .atlas-detail { padding: 16px; }
  .atlas-player { height: 200px; }
}
</style>
