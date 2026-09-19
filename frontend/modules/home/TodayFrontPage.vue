<script setup>
const cards = [
  { title: "运动状态", text: "迁移后这里显示真实训练草稿和最近完成状态。", action: "开始或继续训练" },
  { title: "今日待办", text: "只显示今天需要处理的真实事项。", action: "查看待办" },
  { title: "专注与回顾", text: "专注计时和周报作为辅助入口。", action: "查看回顾" },
];
</script>

<template>
<section id="today" class="today-page" aria-labelledby="today-title">
  <p class="eyebrow">CAT LIFE DAILY · VUE MIGRATION</p>
  <h1 id="today-title">今日头版</h1>
  <p class="lede">先看今天真正要做的事，再进入记录和回顾。</p>
  <div class="today-grid">
    <article v-for="card in cards" :key="card.title" class="today-card">
      <h2>{{ card.title }}</h2>
      <p>{{ card.text }}</p>
      <button type="button">{{ card.action }}</button>
    </article>
  </div>
  <p class="migration-note">这是并行迁移壳层，当前不写入个人数据。完成运动模块迁移后再接入真实服务。</p>
</section>
</template>
