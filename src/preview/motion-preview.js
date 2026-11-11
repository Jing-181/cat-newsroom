import { exercises } from '../lib/workout-catalog.js';
import { resolveDemo } from '../lib/motion/demos.js';
import { DEMO_CLIPS } from '../lib/motion/demo-clips.js';
import { createFigure, createDemoFigure } from '../lib/motion/index.js';
import { createDemoSkin } from '../lib/motion/demo-skin.js';
import { startReview } from './motion-review.js';
if (new URLSearchParams(location.search).get('review') === '1') startReview();
else startSinglePreview();

function startSinglePreview() {
const grid = document.querySelector('#grid'), preview = document.querySelector('#preview');
const params = new URLSearchParams(location.search);
const supported = exercises.filter(e => resolveDemo(e).clip);
let selected = supported.find(e => e.id === params.get('exercise')) || supported[0];
let playing = false, speed = 1, cleanups = [], phase = 0;
document.documentElement.dataset.motionTheme = params.get('dark') === '1' ? 'dark' : 'light';
preview.classList.toggle('compact', params.get('size') === '96');
const controls = document.createElement('div'); controls.className = 'controls';
const search = document.createElement('input'); search.type = 'search'; search.placeholder = '筛选已配图动作'; search.setAttribute('aria-label', '筛选已配图动作');
const select = document.createElement('select'); select.setAttribute('aria-label', '选择检查动作');
const play = document.createElement('button'); play.className = 'shared-btn';
const slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 1000; slider.step = 1; slider.value = 0; slider.setAttribute('aria-label', '逐相位检查');
const output = document.createElement('output');
controls.append(search, select, play, slider, output); grid.before(controls);
function options() {
  const list = supported.filter(e => `${e.name} ${e.equipment}`.includes(search.value.trim()));
  select.replaceChildren(...list.map(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.name; return o; }));
  if (!list.some(e => e.id === selected?.id)) selected = list[0] || null;
  if (selected) select.value = selected.id;
}
function card(parent, label, mount) {
  const article = document.createElement('article'); article.className = 'shared-card';
  const heading = document.createElement('h3'); heading.textContent = label;
  const stage = document.createElement('div'); stage.className = 'stage';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('role','img'); svg.setAttribute('aria-label',label);
  stage.append(svg); article.append(heading,stage); parent.append(article); cleanups.push(mount(svg));
}
function destroy() { cleanups.forEach(fn => fn()); cleanups = []; }
function render() {
  destroy(); grid.replaceChildren(); play.textContent = playing ? '停止播放' : '播放选中动作'; play.setAttribute('aria-pressed', String(playing));
  output.textContent = `${(phase * 100).toFixed(1)}%`; play.disabled = !selected;
  if (!selected) { grid.textContent = '没有匹配的已配图动作'; return; }
  const demo = resolveDemo(selected), clip = demo.clip;
  if (clip.staticHold) { playing = false; play.disabled = true; play.textContent = '静态保持'; play.setAttribute('aria-pressed','false'); }
  const title = document.createElement('h2'); title.textContent = selected.name; grid.append(title);
  const note = document.createElement('p'); note.textContent = `${demo.label} · 支持：${demo.supportType === 'exact' ? '对应动作' : '限定变式／简化'} · 参考：${demo.referenceStatus === 'pending' ? '待补正文' : demo.referenceStatus === 'mechanical-source-human-reference-pending' ? '机械来源已列／人体技术待补' : '来源已列，适用范围见说明'} · ${demo.movement}`; grid.append(note);
  const stills = document.createElement('div'); stills.className = 'grid'; grid.append(stills);
  const times = clip.duration === 5 ? [0, .8, 1.8] : [0, 1, 2];
  ['起始', '中段', '目标位'].forEach((label, i) => card(stills, label, svg => createFigure(svg, { clip: {...clip, stillAt: times[i]}, skin: demo.skin, reduced:true })));
  const live = document.createElement('div'); live.className = 'grid reference'; grid.append(live);
  card(live, playing ? '播放中' : '逐相位检查', svg => playing
    ? createDemoFigure(svg, { exercise: selected, speed })
    : createFigure(svg, { clip: {...clip, stillAt: clip.duration * phase}, skin:demo.skin, reduced:true }));
  const old = selected.id === 'barbell_squat' ? DEMO_CLIPS.squat : selected.id === 'barbell_bench_press' ? DEMO_CLIPS.benchPress : null;
  if (old) card(live, '旧版对照 · 同相位静帧', svg => createFigure(svg, { clip:{...old, stillAt:old.duration * phase}, skin:createDemoSkin, reduced:true }));
  if (selected.id !== 'pull_up') card(live, '引体 · 冻结线条参照', svg => createDemoFigure(svg, { exercise:'pull_up', reduced:true }));
}
search.oninput = () => { playing = false; options(); render(); };
select.onchange = () => { selected = supported.find(e => e.id === select.value); playing = false; phase = 0; slider.value = 0; render(); };
play.onclick = () => { playing = !playing; render(); };
slider.oninput = () => { playing = false; phase = Number(slider.value) / 1000; render(); };
function updateControls() {
  const compact = preview.classList.contains('compact');
  document.querySelector('#size').textContent = compact ? '切换大图 240px' : '切换真实 96px';
  document.querySelector('#size').setAttribute('aria-pressed',String(compact));
  document.querySelector('#dark').setAttribute('aria-pressed',String(document.documentElement.dataset.motionTheme === 'dark'));
  document.querySelector('#size-note').textContent = `${supported.length} 个已配图动作 · 当前 ${compact ? '96' : '240'} CSS px 高 · 最多一个播放器；滑动相位条自动停止播放。`;
}
document.querySelector('#size').onclick = () => { preview.classList.toggle('compact'); updateControls(); };
document.querySelector('#speed').onclick = () => { speed = speed === 1 ? .35 : 1; document.querySelector('#speed').textContent = speed === 1 ? '慢放 0.35×' : '恢复常速'; render(); };
document.querySelector('#dark').onclick = () => { document.documentElement.dataset.motionTheme = document.documentElement.dataset.motionTheme === 'dark' ? 'light' : 'dark'; updateControls(); };
window.addEventListener('pagehide', destroy);
window.addEventListener('pageshow', event => { if(event.persisted) { playing=false; render(); } });
options(); render(); updateControls();
}
