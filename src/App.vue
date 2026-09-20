<script setup>
import WorkoutSample from "./modules/workout/WorkoutSample.vue";
</script>

<template>
  <div class="newsroom-shell">
    <aside class="app-sidebar">
      <div class="brand-mark">猫咪生活报</div>
      <p class="brand-sub">Vue 组件迁移样板 · 运动记录</p>
      <nav aria-label="样板模块">
        <a class="active" href="#workout">运动记录</a>
      </nav>
    </aside>
    <main class="app-main">
      <WorkoutSample />
    </main>
  </div>
</template>

<style scoped>
.newsroom-shell { display: flex; min-height: 100vh; }
.app-sidebar { width: 220px; flex-shrink: 0; padding: 24px 18px; background: var(--drawer-bg); color: var(--drawer-text); }
.brand-mark { font-size: 19px; font-weight: 800; letter-spacing: .02em; }
.brand-sub { margin-top: 6px; font-size: 12px; color: var(--drawer-text-mute); }
.app-sidebar nav { margin-top: 28px; display: grid; gap: 6px; }
.app-sidebar nav a { display: block; padding: 9px 12px; border-radius: var(--radius-tile); color: var(--drawer-text-mute); text-decoration: none; font: 600 14px/1.4 var(--font-sans); }
.app-sidebar nav a.active { color: var(--drawer-text); background: var(--drawer-active); }
.app-main { flex: 1; min-width: 0; padding: 28px 32px; }
@media (max-width: 820px) {
  .newsroom-shell { flex-direction: column; }
  .app-sidebar { width: 100%; padding: 14px 16px; }
  .app-main { padding: 16px; }
}
</style>
