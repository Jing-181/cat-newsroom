<script setup>
import { computed } from "vue";

const moduleCount = computed(() => {
  try {
    const raw = localStorage.getItem("cat-newsroom-data-v2");
    const data = raw ? JSON.parse(raw) : {};
    return Object.keys(data).filter(key => Array.isArray(data[key])).length;
  } catch (_) {
    return 0;
  }
});
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand-mark">猫咪生活报</div>
      <p>Vue 组件迁移入口</p>
      <nav aria-label="主要模块">
        <a class="active" href="#today">今日头版</a>
        <a href="#workout">运动</a>
        <a href="#review">回顾</a>
      </nav>
      <small>{{ moduleCount }} 个本地模块可读取</small>
    </aside>
    <main class="app-main"><slot /></main>
  </div>
</template>
