<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { DEFAULT_LOCATION, fetchWeather, localDateKey, selectedWeatherCharacter, nextWeatherCharacter, WEATHER_CHARACTER_KEY, MOCK_SCENES, parseWeatherMock, weatherPreview, coarseLocation, reverseLocation } from '../lib/weather.js';
import candidates from '../assets/weather-pilot/candidates.json';
const mock = ref(import.meta.env.DEV ? parseWeatherMock(new URLSearchParams(window.location.search)) : null);
const mockMessage = ref('');
const dev = import.meta.env.DEV;
const debugOpen = ref(!!mock.value);
function enterMock() {
  if (!import.meta.env.DEV) return;
  debugOpen.value = true;
  const current = freshWeather.value;
  request++; locationEpoch++; controller?.abort(); addressController?.abort();
  busy.value = false; locating.value = false; notice.value = '';
  mock.value = { character: character.value, scene: current?.scene || 'cloudy', temperature: current?.temperature ?? 24, place: location.value.label };
  updateMock();
}
function chooseMock(key, value) { mock.value[key] = value; updateMock(); }
function updateMock() {
  const url = new URL(window.location.href);
  url.searchParams.set('mock', 'weather');
  if (mock.value.art === 'b-candidate') url.searchParams.set('art', 'b-candidate'); else url.searchParams.delete('art');
  for (const [key, value] of Object.entries({ character: mock.value.character, scene: mock.value.scene, temp: mock.value.temperature, place: mock.value.place })) url.searchParams.set(key, value);
  mock.value = parseWeatherMock(url.searchParams);
  for (const [key, value] of Object.entries({ character: mock.value.character, scene: mock.value.scene, temp: mock.value.temperature, place: mock.value.place })) url.searchParams.set(key, value);
  history.replaceState(history.state, '', url); imageFailed.value = false;
}
async function copyMockLink() {
  updateMock();
  try { await navigator.clipboard.writeText(window.location.href); mockMessage.value = '链接已复制'; }
  catch { mockMessage.value = '复制不可用，请复制浏览器地址'; }
}
function exitMock() {
  const url = new URL(window.location.href);
  for (const key of ['mock', 'character', 'scene', 'temp', 'place', 'art', 'weatherPreview', 'weatherSet']) url.searchParams.delete(key);
  window.location.assign(url.href);
}
const props = defineProps({ compactDesktop: Boolean });
const images = import.meta.glob('../assets/weather/*.webp', { eager: true, query: '?url', import: 'default' });
const pilotImages = import.meta.glob('../assets/weather-pilot/*.webp', { eager: true, query: '?url', import: 'default' });
const pilot = import.meta.env.DEV && new URLSearchParams(window.location.search).get('weatherSet') === 'halfbody-pilot';
const location = ref({ ...DEFAULT_LOCATION }), weather = ref(null), now = ref(new Date());
const busy = ref(false), locating = ref(false), notice = ref(''), imageFailed = ref(false);
const timezone = computed(() => weather.value?.timezone || location.value.timezone);
const dateKey = computed(() => localDateKey(now.value, timezone.value));
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, month: 'long', day: 'numeric', weekday: 'long' }).format(now.value));
const freshWeather = computed(() => mock.value ? { scene: mock.value.scene, text: MOCK_SCENES[mock.value.scene], temperature: mock.value.temperature, wind: 0, time: now.value.getTime() } : weather.value && Math.abs(now.value.getTime() - weather.value.time) <= 90 * 60 * 1000 ? weather.value : null);
const requestedPreview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('weatherPreview') : '';
const preview = ref(weatherPreview(requestedPreview));
const selection = ref(null);
try { if (!mock.value) selection.value = JSON.parse(localStorage.getItem(WEATHER_CHARACTER_KEY)); } catch { /* Private mode still allows an in-memory choice. */ }
const character = computed(() => selectedWeatherCharacter(selection.value, dateKey.value));
const pilotCharacter = ref((requestedPreview || '').match(/^(hanako|yuan|yuu)-/)?.[1] || character.value);
const scene = computed(() => mock.value ? `${mock.value.character}-${mock.value.scene}` : pilot ? `${pilotCharacter.value}-cloudy` : preview.value || `${character.value}-${freshWeather.value?.scene || 'cloudy'}`);
function changeIllustration() {
  if (mock.value) { mock.value.character = nextWeatherCharacter(mock.value.character); updateMock(); return; }
  if (pilot) {
    pilotCharacter.value = nextWeatherCharacter(pilotCharacter.value);
    const url = new URL(window.location.href);
    url.searchParams.set('weatherPreview', `${pilotCharacter.value}-cloudy`);
    history.replaceState(history.state, '', url);
    imageFailed.value = false;
    return;
  }
  now.value = new Date();
  const previous = preview.value ? preview.value.split('-')[0] : character.value;
  preview.value = '';
  const url = new URL(window.location.href);
  if (url.searchParams.has('weatherPreview')) { url.searchParams.delete('weatherPreview'); history.replaceState(history.state, '', url); }
  selection.value = { date: dateKey.value, character: nextWeatherCharacter(previous) };
  try { localStorage.setItem(WEATHER_CHARACTER_KEY, JSON.stringify(selection.value)); } catch { /* Keep the selection until this page closes. */ }
  imageFailed.value = false;
}
const interactive = target => target?.closest?.('button,a,input,select,textarea,summary,details,[role="button"],[role="link"],[contenteditable],[tabindex]');
let lastSwitch = 0, lastTap = null, touchStart = null;
function switchFromBackground(event) {
  if (interactive(event.target) || Date.now() - lastSwitch < 450) return;
  lastSwitch = Date.now(); changeIllustration();
}
function startTouch(event) {
  touchStart = event.touches.length === 1 && !interactive(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() } : null;
  if (!touchStart) lastTap = null;
}
function endTouch(event) {
  const point = event.changedTouches[0], start = touchStart; touchStart = null;
  if (!start || event.touches.length || interactive(event.target) || Date.now() - start.time > 300 || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 12) { lastTap = null; return; }
  const tap = { x: point.clientX, y: point.clientY, time: Date.now() };
  if (lastTap && tap.time - lastTap.time < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 24) { switchFromBackground(event); lastTap = null; }
  else lastTap = tap;
}
const useHalfbody = computed(() => mock.value?.art === 'b-candidate' || (!mock.value && pilot) || scene.value.endsWith('-cloudy'));
const candidateStatus = computed(() => candidates[scene.value]);
function sceneImage(variant) {
  return useHalfbody.value ? pilotImages[`../assets/weather-pilot/${scene.value}-${variant}.webp`] : images[`../assets/weather/${scene.value}-${variant}.webp`];
}
const image = computed(() => sceneImage(props.compactDesktop ? 'mobile' : 'wide'));
const mobileImage = computed(() => sceneImage('mobile'));
const updated = computed(() => freshWeather.value ? new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.value, hour: '2-digit', minute: '2-digit', hour12: false }).format(freshWeather.value.time) : '');
let controller, addressController, refreshTimer, clockTimer, disposed = false, request = 0, lastLocate = 0, locationEpoch = 0;
async function refresh() {
  if (mock.value) return;
  const id = ++request;
  controller?.abort(); controller = new AbortController();
  const currentController = controller;
  const timeout = setTimeout(() => currentController.abort(), 10000);
  busy.value = true;
  try {
    const result = await fetchWeather(location.value, controller.signal);
    if (!disposed && id === request) { weather.value = result; now.value = new Date(); imageFailed.value = false; }
  } catch {
    if (!disposed && id === request) weather.value = null;
  } finally { clearTimeout(timeout); if (!disposed && id === request) busy.value = false; }
}
function locate() {
  if (mock.value) return;
  if (locating.value || Date.now() - lastLocate < 10000) return;
  lastLocate = Date.now();
  if (!navigator.geolocation) { notice.value = '当前浏览器不支持定位，保留默认城市。'; return; }
  const epoch = ++locationEpoch;
  locating.value = true; notice.value = '';
  navigator.geolocation.getCurrentPosition(async position => {
    if (disposed || mock.value || epoch !== locationEpoch) return;
    const coords = coarseLocation(position.coords);
    location.value = { ...coords, label: '当前位置 · 地址解析中', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    weather.value = null; refresh();
    addressController?.abort(); addressController = new AbortController();
    const timeout = setTimeout(() => addressController?.abort(), 8000);
    try {
      const label = await reverseLocation(coords, addressController.signal);
      if (!disposed && !mock.value && epoch === locationEpoch) location.value.label = label;
    } catch {
      if (!disposed && !mock.value && epoch === locationEpoch) { location.value.label = '当前位置 · 地址未解析'; notice.value = '天气使用定位结果；地址暂不可用，点击地址重试。'; }
    } finally { clearTimeout(timeout); if (!disposed && !mock.value && epoch === locationEpoch) locating.value = false; }
  }, () => {
    if (disposed || mock.value || epoch !== locationEpoch) return;
    locating.value = false; notice.value = '定位未成功，保留原地点。';
  }, { timeout: 10000, maximumAge: 0, enableHighAccuracy: false });
}
function resume() { if (document.visibilityState === 'visible') { now.value = new Date(); refresh(); } }
onMounted(() => {
  refresh(); clockTimer = setInterval(() => { now.value = new Date(); }, 30000);
  refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', resume);
});
onBeforeUnmount(() => { disposed = true; controller?.abort(); addressController?.abort(); clearInterval(refreshTimer); clearInterval(clockTimer); document.removeEventListener('visibilitychange', resume); });
</script>

<template>
  <header class="weather-masthead home-wide" :class="{ 'weather-masthead--compact': compactDesktop }" aria-label="今日天气刊头" @dblclick="switchFromBackground" @touchstart.passive="startTouch" @touchend.passive="endTouch" @touchcancel="touchStart = null; lastTap = null">
    <picture v-if="!imageFailed" class="weather-background" aria-hidden="true"><source media="(max-width: 820px)" :srcset="mobileImage"><img :src="image" alt="" draggable="false" fetchpriority="high" @error="imageFailed = true"></picture>
    <div class="weather-wash" aria-hidden="true"></div>
    <div class="weather-copy">
      <p class="weather-date"><time :datetime="dateKey">{{ dateLabel }}</time><small v-if="mock || pilot || preview" class="weather-preview">{{ mock ? '模拟模式' : pilot ? 'B 半身试装' : '插画试装' }}</small></p>
      <h2><button class="weather-address" type="button" :disabled="locating || !!mock" :aria-busy="locating" :aria-label="`${locating ? '正在定位' : location.label + '，点击刷新定位'}。授权后将约公里级位置发送给天气和地址服务。`" title="点击刷新定位；仅发送约公里级位置" @click="locate">{{ mock ? mock.place : locating ? '正在定位…' : location.label }} <small>⌖</small></button></h2>
      <div class="weather-reading" role="status" aria-live="polite">
        <template v-if="freshWeather"><strong>{{ freshWeather.temperature }}<small>°C</small></strong><span>{{ freshWeather.text }}</span></template>
        <span v-else class="weather-unavailable">{{ busy ? '正在看天气…' : '天气暂不可用' }}<small>插画陪伴，天气以实际为准</small></span>
      </div>
      <button v-if="!freshWeather && !busy" class="weather-retry" type="button" @click="refresh">重试天气</button>
      <p v-if="notice" class="weather-note" role="status">{{ notice }}</p>
      <p class="weather-updated" v-if="freshWeather && !mock">风 {{ freshWeather.wind }} km/h <span>· {{ updated }} 更新</span></p>
    </div>
    <div v-if="!mock" class="weather-source"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" aria-label="天气来源 Open-Meteo">Open-Meteo</a><details><summary aria-label="天气和地址来源、许可与位置隐私">ⓘ</summary><div>天气：Open-Meteo，<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>；温度、风速取整，天气代码翻译为中文。地址：<a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener noreferrer">BigDataCloud</a>。点击地址授权后，仅发送约公里级位置；地址服务会处理请求 IP 与位置，不存入个人记录。<p>双击背景更换角色，天气不变；选择仅保留当天。</p><button type="button" class="weather-retry" @click="changeIllustration">更换插画</button></div></details></div>
  </header>
  <button v-if="dev" class="weather-debug-entry" type="button" :aria-expanded="debugOpen" @click="mock ? debugOpen = !debugOpen : enterMock()">{{ debugOpen ? '收起天气调试' : '调试天气' }}</button>
  <details v-if="dev && mock && debugOpen" class="weather-mock home-wide" open>
    <summary>天气模拟 · {{ mock.art === 'b-candidate' ? 'B 半身候选集' : '当前采用素材' }}</summary>
    <p v-if="mock.art === 'b-candidate'">{{ candidateStatus?.status }}：{{ candidateStatus?.review }}。候选集仅供模拟审图，未替换正常首页。</p>
    <div class="weather-mock-group" role="group" aria-label="素材集"><button type="button" :aria-pressed="!mock.art" @click="chooseMock('art', undefined)">当前采用</button><button type="button" :aria-pressed="mock.art === 'b-candidate'" @click="chooseMock('art', 'b-candidate')">B 半身候选</button></div>
    <div class="weather-mock-group" role="group" aria-label="角色"><button v-for="(name, key) in {hanako: 'Hanako', yuan: '源', yuu: '悠'}" :key="key" type="button" :aria-pressed="mock.character === key" @click="chooseMock('character', key)">{{ name }}</button></div>
    <div class="weather-mock-group" role="group" aria-label="天气"><button v-for="(text, key) in MOCK_SCENES" :key="key" type="button" :aria-pressed="mock.scene === key" @click="chooseMock('scene', key)">{{ text }}</button></div>
    <details><summary>更多设置</summary><div class="weather-mock-fields"><label>温度 °C<input type="number" min="-60" max="60" step="1" v-model="mock.temperature" @change="updateMock"></label><label>地点<input type="text" maxlength="40" v-model="mock.place" @change="updateMock"></label><button type="button" class="btn ghost" @click="copyMockLink">复制当前链接</button></div></details>
    <button type="button" class="btn ghost weather-mock-exit" @click="exitMock">退出模拟，恢复真实天气</button><p role="status">{{ mockMessage || '不请求天气或定位，不保存正式角色偏好；双击插画只更新模拟链接。' }}</p>
  </details>
</template>

<style scoped>
.weather-debug-entry { position: fixed; z-index: 1100; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); border: 0; background: var(--surface-card); color: var(--text-secondary); font: 11px var(--font-sans); padding: 4px 8px; border-radius: var(--radius-control); cursor: pointer; }
.weather-mock-group { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.weather-mock-group button { min-height: 40px; padding: 8px 12px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-control); color: var(--text); cursor: pointer; }
.weather-mock-group button[aria-pressed=true] { background: var(--accent-muted); border-color: var(--accent); color: var(--accent); }
.weather-mock-exit { margin-top: 12px; }
.weather-mock { position: fixed; z-index: 1099; right: 16px; bottom: calc(116px + env(safe-area-inset-bottom)); width: min(420px, calc(100vw - 32px)); max-height: min(65dvh, 600px); overflow: auto; box-sizing: border-box; box-shadow: var(--shadow-overlay); padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-card); font: 12px/1.6 var(--font-sans); }
.weather-mock summary { cursor: pointer; }
.weather-mock-fields { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; padding-top: 12px; }
.weather-mock label { display: grid; gap: 4px; flex: 1 1 120px; }
.weather-mock input, .weather-mock select { min-width: 0; width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface-card); color: var(--text); font: inherit; }
@media(max-width:820px) { .weather-mock input, .weather-mock select { font-size: 16px; } }

.weather-masthead { cursor: pointer; position: relative; isolation: isolate; height: 234px; background: var(--surface-card); border-block: 1px solid var(--border); min-width: 0; }
.weather-masthead, .weather-masthead * { user-select: none; -webkit-user-select: none; }
.weather-background img { -webkit-user-drag: none; }
@media (min-width: 1180px) {
  .weather-masthead--compact .weather-background { background: var(--surface-card); }
  .weather-masthead--compact .weather-background img { position: absolute; right: 0; top: 0; width: auto; height: 100%; object-fit: contain; object-position: right center; mask-image: linear-gradient(90deg, transparent, #000 38%); -webkit-mask-image: linear-gradient(90deg, transparent, #000 38%); }
}
.weather-background, .weather-wash { position: absolute; inset: 0; pointer-events: none; z-index: -1; }
.weather-background img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: right bottom; }
.weather-wash { background: linear-gradient(90deg, var(--surface-card) 0%, color-mix(in srgb, var(--surface-card) 85%, transparent) 26%, color-mix(in srgb, var(--surface-card) 35%, transparent) 52%, transparent 72%); }
.weather-copy { position: absolute; left: 32px; top: 24px; width: 54%; min-width: 0; }
.weather-masthead .weather-address, .weather-masthead .weather-address:focus, .weather-masthead .weather-address:active { border: 0; padding: 0; min-height: 44px; max-width: 100%; text-align: left; background: transparent; background-image: none; box-shadow: none; color: var(--text); font: inherit; cursor: pointer; transform: none; }
@media (hover: hover) { .weather-masthead .weather-address:hover { background: transparent; color: var(--accent); } }
.weather-masthead .weather-address:focus-visible { outline: 1px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
.weather-masthead .weather-address:disabled { opacity: .65; cursor: wait; }
.weather-address small { font: 16px var(--font-sans); color: var(--text-secondary); }
.weather-retry { border: 0; color: var(--accent); background: transparent; cursor: pointer; min-height: 32px; }
.weather-copy .weather-updated { margin-top: 10px; font: 11px/1.6 var(--font-sans); color: var(--text-secondary); }
.weather-source { position: absolute; left: 32px; bottom: 8px; display: flex; align-items: center; gap: 8px; }
.weather-source summary { cursor: pointer; list-style: none; padding: 4px; }
.weather-source details > div { position: absolute; bottom: 28px; left: 0; width: min(300px, 80vw); padding: 12px; background: var(--surface-card); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-card); z-index: 3; }
.weather-copy p { margin: 0; }
.weather-kicker { font: 700 13px/1.5 var(--font); letter-spacing: .12em; }
.weather-kicker span { color: var(--text-secondary); font-weight: 400; }
.weather-date { color: var(--text-secondary); font: 12px/1.6 var(--font-sans); }
.weather-copy h2 { font: 700 20px/1.3 var(--font); margin: 6px 0 6px; }
.weather-reading { display: flex; align-items: center; gap: 20px; min-height: 48px; }
.weather-reading strong { font: 800 48px/1.1 var(--font-sans); letter-spacing: -.04em; }
.weather-reading strong small { font-size: 22px; font-weight: 400; }
.weather-reading span { font: 700 18px/1.5 var(--font); }
.weather-reading span small { display: block; color: var(--text-secondary); font: 12px/1.6 var(--font-sans); }
.weather-reading .weather-unavailable { font-size: 18px; }
.weather-actions { display: flex; gap: 12px; margin-top: 0; }
.weather-actions button { border: 0; border-radius: var(--radius-control); padding: 8px 0; min-height: 44px; color: var(--accent); background: transparent; font: 12px var(--font-sans); cursor: pointer; }
.weather-source, .weather-note { color: var(--text-secondary); font: 11px/1.6 var(--font-sans); }
.weather-source a { color: inherit; text-underline-offset: 3px; }
.weather-preview { margin-left: 8px; color: var(--accent); font: 10px var(--font-sans); letter-spacing: 0; }
@media (max-width: 820px) {
  .weather-masthead { height: 190px; }
  .weather-copy { left: 16px; top: 16px; width: 57%; }
  .weather-wash { background: linear-gradient(90deg, color-mix(in srgb, var(--surface-card) 96%, transparent), color-mix(in srgb, var(--surface-card) 76%, transparent) 38%, transparent 78%); }
  .weather-source { left: 16px; bottom: 3px; }
  .weather-address { font-size: 15px; line-height: 1.3; }
  .weather-kicker { font-size: 12px; letter-spacing: 0; }
  .weather-kicker span { display: none; }
  .weather-date { font-size: 11px; }
  .weather-copy .weather-updated { margin-top: 8px; font-size: 10px; }
  .weather-copy h2 { font-size: 18px; margin: 2px 0 4px; }
  .weather-reading { min-height: 40px; gap: 8px; flex-wrap: wrap; }
  .weather-reading strong { font-size: 36px; }
  .weather-reading strong small { font-size: 16px; }
  .weather-reading span, .weather-reading .weather-unavailable { font-size: 14px; }
  .weather-reading span small { font-size: 10px; }
  .weather-actions { margin-top: 0; gap: 8px; }
  .weather-source { font-size: 10px; }
}
</style>
