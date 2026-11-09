<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { getData, subscribe } from "../../lib/store.js";
import { openEditor, confirmDelete } from "../../lib/editor.js";
import RecordMedia from "../../lib/record-media.js";
const revision = ref(0);
const query = ref("");
const limit = ref(30);
const notes = computed(() => {
  revision.value;
  const q = query.value.trim().toLocaleLowerCase();
  return [...(getData().note || [])].filter(x => !q || `${x.title || ''} ${x.content || ''}`.toLocaleLowerCase().includes(q)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
});
let unsubscribe;
onMounted(() => { unsubscribe = subscribe(() => revision.value++); });
onBeforeUnmount(() => unsubscribe?.());
</script>
<template>
  <section class="notes-view">
    <header class="header"><div><h2>随记</h2><p>一张照片，或几句话。</p></div></header>
    <button class="note-capture" @click="openEditor('note', null)"><span>记点什么……</span><span>＋ 文字 / 照片</span></button>
    <input v-model="query" class="shared-field note-search" type="search" placeholder="搜索随记…" aria-label="搜索随记" @input="limit = 30">
    <div class="notes-list">
      <article v-for="item in notes.slice(0, limit)" :key="item.id" class="note-entry">
        <header><time>{{ item.date }}</time><details class="note-menu"><summary aria-label="更多操作">···</summary><div><button @click="openEditor('note', item)">编辑</button><button class="danger" @click="confirmDelete('note', item.id)">删除</button></div></details></header>
        <button v-if="item.image" class="note-image" aria-label="查看原图" @click="RecordMedia.openImageViewer(item.image)"><img :src="item.image" alt="随记照片" loading="lazy"></button>
        <button class="note-text" aria-label="编辑随记" @click="openEditor('note', item)"><strong v-if="item.title && item.title !== '未命名'">{{ item.title }}</strong><span v-if="item.content">{{ item.content }}</span><small v-if="item.mood">{{ item.mood }}</small><span v-if="!item.title && !item.content">添加几句话…</span></button>
      </article>
    </div>
    <p v-if="!notes.length" class="sub">{{ query ? '没有匹配的随记。' : '想留下什么时，随手记在这里。' }}</p>
    <button v-if="notes.length > limit" class="btn ghost" @click="limit += 30">查看更多</button>
  </section>
</template>
<style scoped>
.notes-view { max-width: 760px; margin: 0 auto; }
.note-capture { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 16px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-card); color: var(--text-secondary); text-align: left; font: 14px var(--font-sans); cursor: pointer; }
.note-capture span:last-child { color: var(--accent); white-space: nowrap; }
.note-capture:hover { border-color: var(--accent); }
.note-search { margin: 16px 0; width: 100%; }
.notes-list { display: grid; gap: 16px; }
.note-entry { padding: 16px; background: var(--surface-card); border: 1px solid var(--border); border-radius: var(--radius-card); }
.note-entry > header { display: flex; justify-content: space-between; align-items: center; color: var(--text-secondary); font: 12px var(--font-sans); margin-bottom: 8px; }
.note-image { display: block; width: 100%; border: 0; padding: 0; background: none; cursor: zoom-in; }
.note-image img { display: block; max-width: 100%; max-height: 480px; margin: 0 auto; object-fit: contain; border-radius: var(--radius-tile); }
.note-text { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px 0 0; background: none; border: 0; text-align: left; color: var(--text); font: 14px/1.8 var(--font-sans); white-space: pre-wrap; overflow-wrap: anywhere; cursor: pointer; }
.note-text strong { font-weight: 700; }
.note-text small { color: var(--text-secondary); }
.note-menu { position: relative; }
.note-menu summary { padding: 8px; cursor: pointer; list-style: none; min-width: 36px; text-align: center; }
.note-menu summary::-webkit-details-marker { display: none; }
.note-menu > div { position: absolute; right: 0; z-index: 5; width: 100px; padding: 8px; border: 1px solid var(--border); background: var(--surface-card); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); }
.note-menu button { border: 0; background: none; color: var(--text); width: 100%; padding: 12px; cursor: pointer; }
.note-menu button:hover { background: var(--surface-nested); }
.note-menu .danger { color: var(--danger); }
</style>
