<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { WORLD_URL, FALLBACK_CHARACTERS, loadCharacterFeed } from '../lib/character-world.js';
const characters = ref(FALLBACK_CHARACTERS), state = ref('loading'), broken = ref({});
const controller = new AbortController();
let timer;
// 超时、离线和卸载都终止请求，不阻塞首页其他内容。
onMounted(async () => {
  timer = setTimeout(() => controller.abort(), 6000);
  try { characters.value = await loadCharacterFeed(controller.signal); state.value = 'ready'; }
  catch { state.value = 'fallback'; }
  finally { clearTimeout(timer); }
});
onBeforeUnmount(() => { clearTimeout(timer); controller.abort(); });
</script>
<template>
  <section class="character-world" aria-label="三人小世界">
    <header><div><p>工作台之外 / 三人小世界</p><h2>灯还亮着，去坐一会儿。</h2></div><a :href="WORLD_URL" class="shared-btn">逛逛角色站 ↗</a></header>
    <div class="character-world-grid">
      <a v-for="person in characters" :key="person.id" :href="person.url" class="character-world-person">
        <img v-if="person.avatar && !broken[person.id]" :src="person.avatar" :alt="`${person.name}头像`" loading="lazy" width="96" height="96" @error="broken[person.id] = true">
        <span v-else class="character-world-placeholder" aria-hidden="true">{{ person.name.slice(0, 1) }}</span>
        <div><h3>{{ person.name }} <span>↗</span></h3><p>{{ person.role }}</p><p v-if="person.summary" class="character-world-summary">{{ person.summary }}</p><small v-if="person.candidate">新写真 · 候选展示</small></div>
      </a>
    </div>
    <p class="character-world-status" role="status">{{ state === 'loading' ? '正在取来他们的近况…' : state === 'fallback' ? '暂时没取到新图片，仍可直接去角色站看看。' : '角色资料与图片由角色站更新，这里会跟着变化。' }}</p>
  </section>
</template>
<style scoped>
/* 使用生活报主题，远程图片失败时保持卡片尺寸。 */
.character-world{margin-top:24px;padding:24px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius-card)}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}header p{color:var(--text-secondary);font-size:12px;margin:0 0 8px}h2{font-size:24px;margin:0}.character-world-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.character-world-person{display:flex;gap:16px;align-items:flex-start;padding:16px;color:var(--text);text-decoration:none;border:1px solid var(--border);border-radius:var(--radius-tile);transition:background var(--dur-fast) var(--ease-out)}.character-world-person:hover{background:var(--surface-nested)}.character-world-person:active{transform:scale(.98)}.character-world-person:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.character-world-person img,.character-world-placeholder{width:72px;height:72px;flex-shrink:0;border-radius:var(--radius-pill);object-fit:cover}.character-world-placeholder{display:grid;place-items:center;background:var(--surface-nested);font-size:24px}h3{margin:0 0 8px;font-size:18px}h3 span{font-size:12px}p{font-size:14px;line-height:1.7;margin:0}.character-world-person>div{min-width:0}.character-world-summary{margin-top:12px}.character-world-status,small{color:var(--text-secondary);font-size:12px}.character-world-status{margin-top:16px}small{display:block;margin-top:8px}@media(max-width:1200px){.character-world-person{flex-direction:column}}@media(max-width:650px){.character-world{padding:16px}header{align-items:flex-start;flex-direction:column}.character-world-grid{grid-template-columns:1fr}.character-world-person{flex-direction:row}}
</style>
