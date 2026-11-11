import test from 'node:test';
import assert from 'node:assert/strict';
import { exercises } from '../src/lib/workout-catalog.js';
import { DEMO_REGISTRY, resolveDemo } from '../src/lib/motion/demos.js';
import { DEMO_CLIPS } from '../src/lib/motion/demo-clips.js';
import { OUTDOOR_CLIPS } from '../src/lib/motion/outdoor-clips.js';
import { CARDIO_MACHINE_CLIPS } from '../src/lib/motion/cardio-machine-clips.js';
import { FUNCTIONAL_CLIPS } from '../src/lib/motion/functional-clips.js';
import { CORE_ACCESSORY_CLIPS } from '../src/lib/motion/core-accessory-clips.js';
import { BODYWEIGHT_CLIPS } from '../src/lib/motion/bodyweight-clips.js';
import { LOWER_ACCESSORY_CLIPS } from '../src/lib/motion/lower-accessory-clips.js';
import { ARM_ACCESSORY_CLIPS } from '../src/lib/motion/arm-accessory-clips.js';
import { SHOULDER_BACK_CLIPS } from '../src/lib/motion/shoulder-back-clips.js';
import { FLY_CLIPS } from '../src/lib/motion/fly-clips.js';
import { COMPOUND_LEG_CLIPS } from '../src/lib/motion/compound-leg-clips.js';
import { HINGE_CLIPS } from '../src/lib/motion/hinge-clips.js';
import { CHEST_CLIPS } from '../src/lib/motion/chest-clips.js';
import { BACK_CLIPS } from '../src/lib/motion/back-clips.js';
import { SHOULDER_CLIPS } from '../src/lib/motion/shoulder-clips.js';
import { LEG_CLIPS } from '../src/lib/motion/leg-clips.js';
import { ARM_CLIPS } from '../src/lib/motion/arm-clips.js';
import { CANDIDATE_CLIPS } from '../src/lib/motion/candidate-clips.js';
import { createCandidateSkin } from '../src/lib/motion/candidate-skin.js';
import { createDemoSkin } from '../src/lib/motion/demo-skin.js';
import { createFigure, createDemoFigure } from '../src/lib/motion/index.js';
import { createPlayer } from '../src/lib/motion/player.js';
import { readFileSync } from 'node:fs';

test('all 104 catalog identities resolve explicitly, all104 registered samples enabled', () => {
  assert.equal(exercises.length, 104);
  assert.deepEqual(Object.keys(DEMO_REGISTRY).sort(), exercises.map(e => e.id).sort());
  let supported = 0;
  for (const exercise of exercises) {
    const demo = resolveDemo(exercise);
    assert.equal(demo.exerciseId, exercise.id);
    assert.equal(resolveDemo({ exercise_id: exercise.id, name: 'wrong name' }).clip, demo.clip);
    if (demo.clip) {
      supported++;
      const isPullUp = exercise.id === 'pull_up';
      assert.equal(demo.clip, isPullUp ? DEMO_CLIPS.pullUp : (CANDIDATE_CLIPS[demo.clip.id] || ARM_CLIPS[demo.clip.id] || LEG_CLIPS[demo.clip.id] || SHOULDER_CLIPS[demo.clip.id] || BACK_CLIPS[demo.clip.id] || CHEST_CLIPS[demo.clip.id] || HINGE_CLIPS[demo.clip.id] || COMPOUND_LEG_CLIPS[demo.clip.id] || FLY_CLIPS[demo.clip.id] || SHOULDER_BACK_CLIPS[demo.clip.id] || ARM_ACCESSORY_CLIPS[demo.clip.id] || LOWER_ACCESSORY_CLIPS[demo.clip.id] || BODYWEIGHT_CLIPS[demo.clip.id] || CORE_ACCESSORY_CLIPS[demo.clip.id] || FUNCTIONAL_CLIPS[demo.clip.id] || CARDIO_MACHINE_CLIPS[demo.clip.id] || OUTDOOR_CLIPS[demo.clip.id]));
      assert.equal(demo.skin, isPullUp ? createDemoSkin : createCandidateSkin);
      assert.ok(demo.clip.sample(demo.clip.stillAt).supports);
      assert.ok(demo.support && demo.view && demo.movement);
    } else assert.equal(demo.status, 'unavailable');
  }
  assert.equal(supported, 104);
  for (const id of ['unknown']) assert.equal(resolveDemo(id).clip, null);
  assert.equal(resolveDemo({ exercise_id: 'custom_x', name: '杠铃深蹲' }).clip, null);
});

test('fixed supports, continuous grip/equipment, body geometry and per-action framing', () => {
  for (const clip of Object.values(DEMO_CLIPS)) {
    const initial = clip.sample(0);
    const [x, y, w, h] = clip.viewBox.split(' ').map(Number);
    for (let i = 0; i <= 240; i++) {
      const scene = clip.sample(i / 240 * clip.duration);
      assert.deepEqual(scene.supports, initial.supports, clip.id);
      const points = [...Object.values(scene.joints), scene.head, ...scene.fixtures.flat(), ...scene.body.flat()];
      for (const point of points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert.ok(point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h, `${clip.id} framing`);
      }
      if (clip.id === 'pullUp') {
        assert.deepEqual(scene.equipment, initial.equipment);
        assert.deepEqual(scene.equipment.grips, [scene.joints.leftGrip, scene.joints.rightGrip]);
        for (const side of ['left', 'right']) {
          const j = scene.joints;
          for (const point of [j[`${side}Shoulder`], j[`${side}Grip`]]) assert.ok(Math.abs(Math.hypot(point.x - j[`${side}Elbow`].x, point.y - j[`${side}Elbow`].y) - 22) < 1e-8);
        }
      } else {
        assert.deepEqual(scene.equipment.center, scene.joints.grip);
        assert.equal(scene.equipment.angle, 0);
      }
      if (clip.id === 'benchPress') {
        assert.equal(scene.joints.shoulder.y, scene.joints.hip.y);
        assert.equal(scene.joints.shoulder.y + 4, scene.fixtures[0][0].y);
      }
    }
    assert.deepEqual(clip.sample(clip.duration), initial);
    assert.notDeepEqual(clip.sample(clip.stillAt).joints, initial.joints);
  }
});

function clock() {
  let time = 0, next = 0;
  const callbacks = new Map();
  return {
    now: () => time,
    raf: fn => { callbacks.set(++next, fn); return next; },
    cancel: id => callbacks.delete(id),
    advance(ms) { time += ms; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn()); },
    get count() { return callbacks.size; },
  };
}
test('slow playback wraps after scaled duration, pause/resume and cleanup retain no frames', () => {
  const c = clock(), frames = [];
  const player = createPlayer({ duration: 4, speed: .5, onFrame: t => frames.push(t), ...c, watchVisibility: false });
  player.play(); c.advance(4000); assert.equal(frames.at(-1), 2);
  c.advance(3990); assert.equal(frames.at(-1), 3.995);
  c.advance(10); assert.equal(frames.at(-1), 0);
  player.pause(); assert.equal(c.count, 0);
  c.advance(5000); player.play(); c.advance(1000); assert.equal(frames.at(-1), .5);
  player.destroy(); player.destroy(); player.play(); player.seek(1);
  assert.equal(c.count, 0);
});

test('non-loop playback honors speed and visibility listener is removed', () => {
  const previous = global.document, listeners = new Map(), c = clock(), frames = [];
  global.document = { hidden: false, addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k) };
  try {
    const player = createPlayer({ ...c, duration: 2, speed: .5, loop: false, onFrame: t => frames.push(t) });
    player.play(); c.advance(1000);
    document.hidden = true; listeners.get('visibilitychange')(); assert.equal(c.count, 0);
    c.advance(4000); document.hidden = false; listeners.get('visibilitychange')();
    c.advance(3000); assert.equal(frames.at(-1), 2); assert.equal(c.count, 0);
    player.destroy(); assert.equal(listeners.size, 0);
  } finally { global.document = previous; }
});

test('figure destroys skin exactly once in reduced and animated modes', () => {
  const previous = global.document; global.document = {};
  try {
    for (const reduced of [true, false]) {
      let skins = 0, players = 0, paints = 0, options;
      const cleanup = createFigure({ style: { setProperty() {} } }, {
        clip: DEMO_CLIPS.squat, reduced, speed: .5,
        skin: () => ({ resize() {}, paint() { paints++; }, destroy() { skins++; } }),
        player: opts => { options = opts; return { play() {}, destroy() { players++; } }; },
      });
      assert.ok(paints); if (!reduced) assert.equal(options.speed, .5);
      cleanup(); cleanup(); assert.equal(skins, 1); assert.equal(players, reduced ? 0 : 1);
    }
  } finally { global.document = previous; }
});

test('unavailable demonstration is static and disposable without any player', () => {
  const previous = global.document; let removed = 0, created = 0;
  global.document = { createElementNS: () => ({ setAttribute() {}, remove() { removed++; } }) };
  try {
    const cleanup = createDemoFigure({ setAttribute() {}, append() {} }, { exercise: 'unknown', player: () => { created++; } });
    assert.equal(created, 0); cleanup(); assert.equal(removed, 1);
  } finally { global.document = previous; }
});

test('integrated 3D demonstrations create correct SVG and clean both static and animated mounts', () => {
  const previous = global.document;
  let removed = 0;
  const node = () => ({ attrs: {}, children: [], setAttribute(k, value) { this.attrs[k] = value; }, append(...els) { this.children.push(...els); }, remove() { removed++; } });
  global.document = { createElementNS: node };
  try {
    for (const exercise_id of ['barbell_squat', 'barbell_bench_press']) {
      for (const reduced of [true, false]) {
        const svg = node(); let playerCreated = 0, playerDestroyed = 0;
        const before = removed;
        const stop = createDemoFigure(svg, { exercise: { exercise_id }, reduced, player: options => {
          playerCreated++;
          return { play() { options.onFrame(0); options.onFrame(1); options.onFrame(2); }, destroy() { playerDestroyed++; } };
        } });
        assert.equal(svg.attrs.viewBox, CANDIDATE_CLIPS[resolveDemo(exercise_id).clip.id].viewBox);
        assert.ok(svg.attrs['aria-label'].includes('待视觉验收'));
        assert.ok(svg.children[0].children.some(n => n.attrs['data-part'] === 'neck'), 'connected flat stick skin selected by resolver');
        assert.equal(svg.children[0].attrs.fill, 'none');
        stop(); stop();
        assert.equal(removed - before, 1);
        assert.equal(playerCreated, reduced ? 0 : 1);
        assert.equal(playerDestroyed, reduced ? 0 : 1);
      }
    }
  } finally { global.document = previous; }
});

test('product surfaces share resolver, atlas remains read-only with lifecycle teardown', () => {
  const ui = readFileSync(new URL('../src/lib/workout-ui.js', import.meta.url), 'utf8');
  const atlas = readFileSync(new URL('../src/modules/workout/ExerciseAtlasView.vue', import.meta.url), 'utf8');
  assert.ok(ui.includes('createDemoFigure(svg, { exercise })'));
  assert.ok(!ui.includes('kindForName'));
  assert.ok(atlas.includes('resolveDemo(exercise)') && atlas.includes('onBeforeUnmount'));
  assert.ok(!/localStorage|persist\(|requestAnimationFrame/.test(atlas));
});
