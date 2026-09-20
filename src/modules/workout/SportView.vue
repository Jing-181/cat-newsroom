<script setup>
// 运动健身：复用主站 WorkoutUI 训练控制器（workout_session 模型不变）
import { ref, onMounted, onBeforeUnmount } from "vue";

const STORAGE_KEY = "cat-newsroom-data-v2";
const MODULE_KEY = "sport"; // 与主站 CONFIG.modules 的 sport 键一致
const rootRef = ref(null);

// 从本地数据读取运动记录数组（含旧版运动目标和 workout_session）
function readSport() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return Array.isArray(data.sport) ? data.sport : [];
  } catch (_) { return []; }
}

// 写回本地数据，不改变其他模块内容
function writeSport(list) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data.sport = list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) { }
}

// 挂载共享训练控制器（复用现有 WorkoutUI，不改运动模型）
function mountUI() {
  if (!rootRef.value || !window.WorkoutUI) return;
  rootRef.value.innerHTML = "";
  const records = readSport();
  window.WorkoutUI.mount(rootRef.value, {
    records,
    onSave: record => {
      writeSport(records);
      window.syncRecord?.({ moduleKey: MODULE_KEY, record });
    },
    onDelete: record => {
      writeSport(records);
      window.syncDelete?.({ moduleKey: MODULE_KEY, recordId: record.id });
    },
  });
}

function onStorage(event) {
  if (event.key === STORAGE_KEY && event.newValue) mountUI();
}

onMounted(() => {
  mountUI();
  window.addEventListener("storage", onStorage);
});
onBeforeUnmount(() => window.removeEventListener("storage", onStorage));
</script>

<template>
  <div ref="rootRef" class="workout-mount"></div>
</template>
