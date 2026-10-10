<script setup>
// 运动健身：复用共享训练控制器 WorkoutUI（workout_session 模型不变）
import { ref, onMounted, onBeforeUnmount } from "vue";
import { CONFIG } from "../../lib/config.js";
import { getData, persist, remove } from "../../lib/store.js";
import WorkoutUI from "../../lib/workout-ui.js";

const MODULE_KEY = "sport"; // 与主站 CONFIG.modules 的 sport 键一致
const rootRef = ref(null);

// 挂载共享训练控制器（复用现有 WorkoutUI，不改运动模型）
// 记录数组直接用仓库里的那一份：WorkoutUI 就地增删改，落盘与同步统一走 store.js
function mountUI() {
  if (!rootRef.value) return;
  rootRef.value.innerHTML = "";
  const data = getData();
  if (!Array.isArray(data.sport)) data.sport = [];
  WorkoutUI.mount(rootRef.value, {
    records: data.sport,
    onSave: record => persist(MODULE_KEY, record),
    onDelete: record => remove(MODULE_KEY, record.id),
  });
}

function onStorage(event) {
  if (event.key === CONFIG.storageKey && event.newValue) mountUI();
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
