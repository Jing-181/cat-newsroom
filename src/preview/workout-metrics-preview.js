import '../../css/theme.css';
import '../../css/components.css';
import '../../css/workout-ui.css';
import Workout from '../lib/workout.js';
import { setRowActive } from '../lib/workout-view.js';
import { fillPrevious, parseSetInput } from '../lib/workout-metrics.js';

// 此适配器仅操作合成对象；不挂载会读本地草稿的 WorkoutUI。
const $ = selector => document.querySelector(selector);
let session;
const loadedAt = new Date().toISOString();
const pageInstance = crypto.randomUUID();
let operation = 0;
function diagnose(action) {
  $('#diagnostics').textContent = JSON.stringify({ version: 'metrics-audit-4', loadedAt, pageInstance, scenario: $('#scenario').value, scenarioName: $('#scenario').selectedOptions[0]?.textContent, operation: ++operation, action, exerciseId: current()?.exercise_id || null }, null, 2);
}
const previous = { duration_min: 30, distance_km: 5, floors: 50, steps: 800, machine_level: 8, avg_step_rate_spm: 45, unknown_metric: { source: 'synthetic' } };
const current = () => session.exercises[0];
function inspect() {
  $('#data').textContent = JSON.stringify(session, null, 2);
  $('#summary').textContent = Workout.formatSetText(current().sets[0], current());
}
function render() {
  $('#form').innerHTML = setRowActive(current(), current().sets[0], 0, 0, []);
  $('#form').querySelector('[data-set-more-panel]').hidden = false;
  $('#form').querySelector('[data-set-delete]').hidden = true;
  inspect();
}
function reset() {
  const scenario = $('#scenario').value;
  session = Workout.createSession('cardio');
  Workout.addExercise(session, ({segment:'treadmill',settings:'treadmill',run:'treadmill',swim:'swimming',rope:'jump_rope'})[scenario] || 'stair_climber');
  const fixtures = {
    segment: { duration_min: 10, distance_km: 1, treadmill_speed_kmh: 6, treadmill_incline_pct: -2, pace: '原表盘配速', unknown_metric: { source: 'synthetic treadmill' } },
    settings: { duration_min: '', distance_km: '', treadmill_speed_kmh: 6, treadmill_incline_pct: 0 },
    swim: { duration_min: 12, distance_km: 0.5, unknown_metric: { source: 'synthetic swimming' } },
    rope: { duration_min: '', jump_count: 500, unknown_metric: { source: 'synthetic rope' } },
    run: { duration_min: 30, distance_km: 5, pace: '旧表盘 6:10', note: '' },
    stairs: { duration_min: '', floors: '', steps: '', machine_level: '', avg_step_rate_spm: '' },
    legacy: { distance_km: 2.5, pace: '旧文本不解释', unknown_metric: { source: 'synthetic', value: 7 } },
    zero: { duration_min: 0, floors: 0, steps: '', machine_level: 0, avg_step_rate_spm: '' },
  };
  current().sets = [fixtures[scenario]];
  $('#saved').textContent = ''; $('#message').textContent = '已重置，仅影响内存。';
  render();
  diagnose('reset');
}
$('#form').addEventListener('input', event => {
  const input = event.target;
  if (!input.matches('[data-set-field]')) return;
  const parsed = parseSetInput(input.dataset.setField, input.value, current());
  input.setCustomValidity(parsed.valid ? '' : '请输入有限数；坡度允许负数，计数须为整数');
  if (!parsed.valid) { $('#message').textContent = '无效输入未写入内存'; return; }
  current().sets[0][input.dataset.setField] = parsed.value;
  inspect();
  $('#message').textContent = '已写入内存；未重建表单节点。';
  diagnose('input');
});
$('#previous').onclick = () => { fillPrevious(current().sets[0], current().exercise_id === 'treadmill' ? {duration_min:10,distance_km:1,treadmill_speed_kmh:6,treadmill_incline_pct:2} : current().exercise_id === 'swimming' ? {duration_min:15,distance_km:0.75} : current().exercise_id === 'jump_rope' ? {duration_min:5,jump_count:600} : previous); render(); $('#message').textContent = '只补未填字段；显式零保留。'; diagnose('fill-previous'); };
$('#save').onclick = () => {
  const invalid = $('#form').querySelector('input:invalid');
  if (invalid) { invalid.reportValidity(); return; }
  const saved = Workout.upsertSession([], session);
  session = JSON.parse(JSON.stringify(saved));
  $('#saved').textContent = JSON.stringify(session, null, 2);
  if (session.exercises.length) render();
  else { $('#form').replaceChildren(); $('#data').textContent = JSON.stringify(session, null, 2); $('#summary').textContent = '空组被清理，请重置再测'; }
  $('#previous').disabled = !session.exercises.length;
  $('#message').textContent = '实际 upsertSession 保存，内存 JSON 重读；未写磁盘或浏览器存储。';
  diagnose('save-and-reread');
};
$('#draft').onclick = () => { session = JSON.parse(JSON.stringify(session)); if (current()) render(); $('#message').textContent = '草稿 JSON 往返完成（仅内存）。'; diagnose('draft-roundtrip'); };
$('#reset').onclick = $('#scenario').onchange = () => { $('#previous').disabled = false; reset(); };
reset();
