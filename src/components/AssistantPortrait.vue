<script setup>
// 图片精灵复用 motion 时间层；离屏、后台和减少动态时停止播放。
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { createPlayer } from '../lib/motion/player.js';
import { expressionFrame } from '../lib/assistants.js';
import hanako from '../assets/assistants/hanako-expressions.webp';
import yuan from '../assets/assistants/yuan-expressions.webp';
import yuu from '../assets/assistants/yuu-expressions.webp';
const props = defineProps({ person: { type: String, required: true }, replay: { type: Number, default: 0 } });
const sources = { hanako, yuan, yuu };
const root = ref(null), frame = ref(2);
let player, observer, media, visible = false, finished = false;
function play() {
  player?.stop(); finished = false;
  frame.value = media?.matches ? 2 : 0;
  if (visible && !document.hidden && !media?.matches) player?.play();
}
function motionChanged() {
  if (media.matches) { player.stop(); frame.value = 2; finished = true; }
}
watch(() => [props.person, props.replay], play);
onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  frame.value = media.matches ? 2 : 0;
  media.addEventListener('change', motionChanged);
  player = createPlayer({ duration: 2.4, loop: false, fps: 8, watchVisibility: false, onFrame(time, state) { frame.value = expressionFrame(time); if (state?.done) finished = true; } });
  observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateVisibility(); });
  observer.observe(root.value);
  document.addEventListener('visibilitychange', updateVisibility);
});
function updateVisibility() {
  if (visible && !document.hidden && !media.matches && !finished) player.play();
  else player.pause();
}
onBeforeUnmount(() => { observer?.disconnect(); player?.destroy(); media?.removeEventListener('change', motionChanged); document.removeEventListener('visibilitychange', updateVisibility); });
</script>

<template>
  <span ref="root" class="assistant-portrait" aria-hidden="true" :data-frame="frame" :style="{ backgroundImage: `url(${sources[person]})`, backgroundPosition: `${frame * 50}% 50%` }"></span>
</template>
