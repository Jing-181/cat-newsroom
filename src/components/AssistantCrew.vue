<script setup>
// 首页三人合席，导航栏只留一枚角标；角色卡使用原生 dialog 管理焦点。
import { computed, ref, nextTick, onBeforeUnmount, useId } from 'vue';
import AssistantPortrait from './AssistantPortrait.vue';
import { ASSISTANTS, assistantForModule } from '../lib/assistants.js';
const props = defineProps({ module: { type: String, default: 'home' }, compact: Boolean, toolbar: Boolean });
const emit = defineEmits(['navigate']);
// 顶栏、侧栏与首页共存时，角色卡标题仍保持唯一。
const titleId = useId();
const current = computed(() => assistantForModule(props.module));
const selected = ref(ASSISTANTS[0]), dialog = ref(null), opened = ref(false), replay = ref(0);
async function open(person) {
  selected.value = person; opened.value = true;
  // 等待卡片内容挂载后再打开，让原生 autofocus 落到关闭按钮。
  await nextTick();
  if (opened.value) dialog.value?.showModal();
}
function close() { dialog.value?.close(); opened.value = false; }
function navigate(route) { close(); emit('navigate', route); }
function backdrop(event) { if (event.target === dialog.value) { const r = dialog.value.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }
onBeforeUnmount(close);
</script>

<template>
  <section class="assistant-crew" :class="{ 'assistant-crew--compact': compact, 'assistant-crew--toolbar': toolbar }" aria-label="助手编辑部">
    <template v-if="!compact">
      <div class="assistant-byline"><span>今日编辑部</span><small>三位老朋友，陪你过日常</small></div>
      <div class="assistant-roster">
        <button v-for="person in ASSISTANTS" :key="person.id" type="button" class="assistant-member" :aria-label="`认识${person.name}`" @click="open(person)">
          <AssistantPortrait :person="person.id" /><span><strong>{{ person.name }}</strong><small>{{ person.short }}</small></span><span class="assistant-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
    </template>
    <button v-else type="button" class="assistant-badge" :aria-label="`认识${current.name}，打开助手编辑部`" @click="open(current)"><AssistantPortrait :key="current.id" :person="current.id" /><span v-if="!toolbar">{{ current.name }}<small>{{ current.short }}</small></span><span v-if="!toolbar" aria-hidden="true">↗</span></button>
    <dialog ref="dialog" class="assistant-dialog" :aria-labelledby="titleId" @click="backdrop" @close="opened = false">
      <template v-if="opened">
        <header><span class="life-caption">猫咪生活报 · 助手编辑部</span><button type="button" class="assistant-close" aria-label="关闭角色介绍" autofocus @click="close">×</button></header>
        <div class="assistant-tabs" aria-label="选择助手"><button v-for="person in ASSISTANTS" :key="person.id" type="button" :aria-pressed="selected.id === person.id" @click="selected = person">{{ person.name }}</button></div>
        <div class="assistant-profile"><AssistantPortrait :key="selected.id" :person="selected.id" :replay="replay" /><div><p class="life-caption">{{ selected.role }}</p><h2 :id="titleId">{{ selected.name }}</h2><button class="life-link assistant-replay" type="button" @click="replay++">再看一次表情 ↻</button></div></div>
        <blockquote>“{{ selected.quote }}”</blockquote><p class="assistant-description">{{ selected.description }}</p>
        <div class="assistant-links"><button v-for="link in selected.links" :key="link.route" class="shared-btn" type="button" @click="navigate(link.route)">{{ link.label }} <span aria-hidden="true">↗</span></button></div>
      </template>
    </dialog>
  </section>
</template>
