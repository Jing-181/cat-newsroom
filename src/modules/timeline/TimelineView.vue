<script setup>
// 时间线不创建副本；原记录仍由各模块管理。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { getData, subscribe } from '../../lib/store.js';
import { lifeFeed } from '../../lib/life-feed.js';
const emit = defineEmits(['navigate']);
const revision = ref(0), filter = ref('all'), includeDemo = ref(false), limit = ref(30);
const tabs = [{ key: 'all', label: '全部' }, { key: 'note', label: '日记' }, { key: 'hot', label: '收藏' }, { key: 'sport', label: '训练' }];
const entries = computed(() => { revision.value; return lifeFeed(getData(), { module: filter.value, includeDemo: includeDemo.value }); });
const groups = computed(() => {
  const result = [];
  for (const item of entries.value.slice(0, limit.value)) {
    let group = result.at(-1);
    if (!group || group.date !== item.date) { group = { date: item.date, items: [] }; result.push(group); }
    group.items.push(item);
  }
  return result;
});
watch([filter, includeDemo], () => { limit.value = 30; });
let unsubscribe;
onMounted(() => { unsubscribe = subscribe(() => { revision.value++; }); });
onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
  <section class="life-timeline">
    <header class="header"><div><h2>生活时间线</h2><p>把记下的小事、收藏和完成的训练，串成日子。</p></div></header>
    <div class="timeline-tools"><div class="life-switch" aria-label="时间线类型"><button v-for="tab in tabs" :key="tab.key" :aria-pressed="filter === tab.key" @click="filter = tab.key">{{ tab.label }}</button></div><label><input v-model="includeDemo" type="checkbox"> 显示样板记录</label></div>
    <p class="life-caption">按记录日期排列 · {{ entries.length }} 条。没有日期的旧记录列在末尾。</p>
    <div v-if="!entries.length" class="life-panel timeline-empty"><h3>日子，慢慢记就好。</h3><p>{{ filter === 'all' ? '从一段日记、一条收藏，或一次完成的训练开始。' : '这个分类还没有记录。' }}</p><button class="btn" @click="emit('navigate', 'home')">去随手记一笔</button></div>
    <section v-for="group in groups" :key="group.date || 'undated'" class="timeline-day">
      <h3><time v-if="group.date" :datetime="group.date">{{ group.date }}</time><span v-else>未注明日期</span></h3>
      <article v-for="item in group.items" :key="item.key" class="timeline-entry life-panel">
        <div class="timeline-meta"><span>{{ item.label }}</span><span v-if="item.demo">样板</span><span v-if="item.record.mood">{{ item.record.mood }}</span></div>
        <h4>{{ item.title }}</h4><p v-if="item.excerpt" class="timeline-excerpt">{{ item.excerpt }}</p><p v-else class="life-caption">{{ item.record.images?.length || item.record.image ? '图片记录，请到日记查看。' : '没有文字内容。' }}</p>
        <button class="life-link" @click="emit('navigate', item.module)">前往{{ item.label }} →</button>
      </article>
    </section>
    <button v-if="entries.length > limit" class="btn timeline-more" @click="limit += 30">再看 30 条（还有 {{ entries.length - limit }} 条）</button>
  </section>
</template>
