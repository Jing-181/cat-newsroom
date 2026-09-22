<script setup>
// 个人配置页：每日一卡重新生成（14 条）+ 首页卡片排序（云端同步，与主站逻辑一致）
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { HOME_CARDS, DEFAULT_HOME_ORDER } from "../../lib/home-layout.js";
import { getData, save, subscribe } from "../../lib/store.js";
import { initDailyCopy, generateDailyCopyBatch, getDailyBatchInfo } from "../../lib/daily-copy.js";

const root = ref(null);
const order = ref([]);
const batchInfo = ref({ loading: true });
const syncing = ref(false);

const batchInfoText = computed(() => {
  const info = batchInfo.value;
  if (info.loading) return "正在加载…";
  if (!info.exists) return "还没有生成过每日一卡。";
  if (info.status === "generating") return "正在生成中…";
  if (info.status === "error") return `上次生成失败：${info.error || "未知错误"}`;
  return `当前 ${info.count} 条 · 生成于 ${info.generatedAt ? new Date(info.generatedAt).toLocaleString("zh-CN") : "—"}`;
});

function move(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= order.value.length) return;
  const next = [...order.value];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  order.value = next;
}

function toCards(keys) {
  return keys.map(key => HOME_CARDS.find(c => c.key === key)).filter(Boolean);
}

function resetOrder() {
  order.value = toCards(DEFAULT_HOME_ORDER);
  window.Toast?.show("已恢复默认顺序，记得保存");
}

function saveOrder() {
  const data = getData();
  data.__homeOrder = order.value.map(c => c.key);
  save();
  window.syncMetaField?.({ field: "__homeOrder", value: data.__homeOrder });
  window.dispatchEvent(new CustomEvent("home-order-changed"));
  window.Toast?.show("首页排序已保存");
}

async function loadOrder() {
  let remote = null;
  try {
    const settings = await window.fetchUserSettings?.();
    remote = settings && Array.isArray(settings.home_order) && settings.home_order.length ? settings.home_order : null;
  } catch (_) { /* 忽略 */ }
  const local = Array.isArray(getData().__homeOrder) && getData().__homeOrder.length ? getData().__homeOrder : null;
  order.value = toCards(remote || local || DEFAULT_HOME_ORDER);
}

async function refreshBatch() {
  await initDailyCopy(root.value);
  batchInfo.value = getDailyBatchInfo();
}

async function regenerate() {
  if (syncing.value) return;
  const ok = await window.AppDialog.confirm("重新生成将调用 AI 生成 14 条新文案，消耗一次 AI 额度。确定继续？", { title: "重新生成每日一卡", okText: "生成" });
  if (!ok) return;
  syncing.value = true;
  try {
    await generateDailyCopyBatch(14, root.value);
    batchInfo.value = getDailyBatchInfo();
    window.Toast?.show("已重新生成 14 条文案");
  } catch (_) {
    batchInfo.value = getDailyBatchInfo();
  } finally {
    syncing.value = false;
  }
}

let unsub = null;
onMounted(() => {
  refreshBatch();
  loadOrder();
  unsub = subscribe(() => refreshBatch());
});
onBeforeUnmount(() => { if (unsub) unsub(); });
</script>

<template>
  <div ref="root" class="settings-view">
    <div class="header"><div><h2>个人配置</h2><p>每日一卡与首页布局</p></div><div class="spacer"></div></div>

    <div class="sec-title">每日一卡</div>
    <div class="setting-card">
      <div class="set-row">
        <div class="set-tx">
          <div class="set-name">当前文案批次</div>
          <div class="set-desc">{{ batchInfoText }}</div>
        </div>
        <button class="btn" :disabled="syncing" @click="regenerate">{{ syncing ? "生成中…" : "重新生成 14 条" }}</button>
      </div>
      <div class="set-note">生成后首页每日一卡立即更新，新一批按天顺序循环轮换。</div>
    </div>

    <div class="sec-title">首页模块排序</div>
    <div class="setting-card">
      <div class="set-note">调整首页卡片展示顺序，保存后同步到云端（多设备一致）。</div>
      <div class="order-list">
        <div v-for="(card, i) in order" :key="card.key" class="order-item">
          <span class="order-idx">{{ i + 1 }}</span>
          <span class="order-name">{{ card.label }}</span>
          <div class="order-ctrl">
            <button type="button" title="上移" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button type="button" title="下移" :disabled="i === order.length - 1" @click="move(i, 1)">↓</button>
          </div>
        </div>
      </div>
      <div class="set-actions">
        <button class="btn ghost" @click="resetOrder">恢复默认</button>
        <button class="btn" @click="saveOrder">保存排序</button>
      </div>
    </div>
  </div>
</template>
