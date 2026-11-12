<script setup>
// 草稿按账号保存在当前标签页，切换路由或同步刷新不会吞掉输入。
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { getData, insertRecord, subscribe } from '../lib/store.js';
import { isoToday } from '../lib/utils.js';
import { placeNewAtTop } from '../lib/record-list.js';
import Trace from '../lib/trace.js';
import { openEditor } from '../lib/editor.js';
const emit = defineEmits(['navigate']);
const owner = () => window.getCurrentUser?.()?.id || 'local';
let draftOwner = owner(), unsubscribe;
const kind = ref('note'), text = ref(''), composing = ref(false), message = ref('');
const draftKey = id => `cat-newsroom-capture-v1:${encodeURIComponent(id)}`;
function restore() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey(draftOwner)) || '{}');
    kind.value = draft.kind === 'todo' ? 'todo' : 'note';
    text.value = typeof draft.text === 'string' ? draft.text : '';
  } catch { text.value = ''; }
}
function stash() {
  try { sessionStorage.setItem(draftKey(draftOwner), JSON.stringify({ kind: kind.value, text: text.value })); }
  catch { /* 存储不可用时仍保留当前输入。 */ }
}
function checkOwner() {
  if (owner() === draftOwner) return true;
  stash(); draftOwner = owner(); restore(); message.value = '账号已变化，已切换到该账号的草稿。';
  return false;
}
restore();
watch([kind, text], stash, { flush: 'sync' });
function submit() {
  if (composing.value || !checkOwner() || !text.value.trim()) return;
  const content = text.value.trim();
  // 局域网 HTTP 不提供 randomUUID，仍允许手机保存生活记录。
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = { id, ...(kind.value === 'note'
    ? { content, date: isoToday() }
    : { title: content, group: '', note: '', priority: 'P1', done: false }) };
  placeNewAtTop(getData()[kind.value] || [], record);
  try {
    Trace.track('quick_add_click', { module: kind.value });
    const { syncPending } = insertRecord(kind.value, record);
    text.value = '';
    message.value = syncPending ? '已保存到本机，同步暂未发出，请稍后检查同步状态。' : `已存入${kind.value === 'note' ? '日记' : '事项'}。`;
  } catch { message.value = '保存失败，输入已保留，请重试。'; }
}
function shortcut(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit(); }
}
onMounted(() => { unsubscribe = subscribe(checkOwner); });
onBeforeUnmount(() => { stash(); unsubscribe?.(); });
</script>

<template>
  <section class="home-capture life-panel" aria-labelledby="capture-heading">
    <header class="life-heading"><h3 id="capture-heading">随手记</h3><div class="life-switch" aria-label="记录类型">
      <button type="button" :aria-pressed="kind === 'note'" @click="kind = 'note'">记一笔</button>
      <button type="button" :aria-pressed="kind === 'todo'" @click="kind = 'todo'">加事项</button>
    </div></header>
    <form @submit.prevent="submit">
      <textarea v-model="text" class="shared-field" rows="2" :aria-label="kind === 'note' ? '随手记内容' : '事项内容'" :placeholder="kind === 'note' ? '今天有什么值得记下的小事？' : '记下一件要做的事…'" @compositionstart="composing = true" @compositionend="composing = false" @keydown="shortcut" />
      <div class="capture-actions"><span class="capture-hint">⌘ / Ctrl + Enter 保存</span><button class="btn" type="submit" :disabled="!text.trim() || composing">{{ kind === 'note' ? '存入日记' : '加入事项' }}</button></div>
    </form>
    <div class="capture-links"><button type="button" @click="openEditor('note', null)">写图文日记</button><button type="button" @click="emit('navigate', 'sport')">记录运动</button><button type="button" @click="openEditor('hot', null)">添加收藏</button><button type="button" @click="emit('navigate', 'timeline')">生活时间线 →</button></div>
    <p v-if="message" class="capture-message" role="status">{{ message }}</p>
  </section>
</template>
