import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CANDIDATE_CLIPS, CANDIDATE_PROPORTIONS, bendJoint, v, sub, length, project } from '../src/lib/motion/candidate-clips.js';
import { createCandidateSkin } from '../src/lib/motion/candidate-skin.js';
import { resolveDemo } from '../src/lib/motion/demos.js';
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const distance = (a, b) => length(sub(a, b));

test('candidate proportions are selected before IK and shared resolver uses new demonstrations', () => {
  assert.ok(CANDIDATE_PROPORTIONS.squat.thigh > CANDIDATE_PROPORTIONS.benchPress.thigh);
  assert.ok(CANDIDATE_PROPORTIONS.squat.upperArm < CANDIDATE_PROPORTIONS.benchPress.upperArm);
  assert.equal(resolveDemo('barbell_squat').clip, CANDIDATE_CLIPS.squat);
  assert.equal(resolveDemo('barbell_bench_press').clip, CANDIDATE_CLIPS.benchPress);
  assert.equal(resolveDemo('pull_up').clip.id, 'pullUp');
});

test('3D candidate limbs retain length, supports, full bar and grip contacts through entire cycles', () => {
  for (const clip of Object.values(CANDIDATE_CLIPS)) {
    const initial = clip.sample(0); let previous;
    for (let i = 0; i <= 400; i++) {
      const s = clip.sample(i / 100);
      assert.equal(s.size, initial.size);
      assert.deepEqual(s.supports, initial.supports);
      near(distance(...s.equipment.ends), 84);
      for (let side = 0; side < 2; side++) {
        const arm = s.arms[side], leg = s.legs[side];
        near(distance(arm.shoulder, arm.elbow), s.size.upperArm);
        near(distance(arm.elbow, arm.hand), s.size.forearm);
        near(distance(leg.hip, leg.knee), s.size.thigh);
        near(distance(leg.knee, leg.ankle), s.size.shin);
        assert.deepEqual(arm.hand, s.equipment.grips[side]);
        near(arm.hand.x, s.equipment.center.x); near(arm.hand.z, s.equipment.center.z);
        s.soles[side].forEach(p => near(p.z, 0));
        if (previous) assert.ok(distance(arm.elbow, previous.arms[side].elbow) < 1.5, 'elbow continuity');
      }
      if (s.id === 'squat') {
        assert.deepEqual(s.backAnchor, s.equipment.center);
        near(distance(s.backAnchor, s.shoulderCenter), 8.5);
        near(distance(s.hip, s.shoulderCenter), s.size.torso);
        assert.ok(s.legs[0].ankle.y < 0 && s.legs[1].ankle.y > 0);
        assert.ok(s.equipment.center.x > -4 && s.equipment.center.x < 12, 'bar over foot contact range');
      } else {
        s.arms.forEach((arm, j) => {
          const sign = j ? 1 : -1;
          assert.ok(sign * arm.elbow.y > sign * arm.shoulder.y, 'elbow stays outward');
          assert.ok(arm.elbow.x > arm.shoulder.x, 'elbow stays footward, never headward');
          assert.ok(Math.abs(arm.elbow.y) > 12, 'elbow clears bench width');
        });
        for (const name of ['head', 'back', 'pelvis']) near(s.supports[name].z, s.bench.top[0].z);
      }
      previous = s;
    }
    assert.deepEqual(clip.sample(4), initial);
    const almost = clip.sample(4 - 1e-5);
    almost.arms.forEach((arm, i) => assert.ok(distance(arm.elbow, initial.arms[i].elbow) < 1e-6));
  }
});

test('bench bottom wrists remain above elbows, forearms near upright and arms mirror in body space', () => {
  const s = CANDIDATE_CLIPS.benchPress.sample(2);
  assert.ok(s.equipment.center.z >= s.shoulderCenter.z + 8, 'bar stays above torso surface');
  for (const arm of s.arms) {
    assert.ok(arm.hand.z - arm.elbow.z > 20);
    assert.ok(Math.hypot(arm.hand.x - arm.elbow.x, arm.hand.y - arm.elbow.y) < 6);
  }
  for (const key of ['shoulder', 'elbow', 'hand']) {
    near(s.arms[0][key].x, s.arms[1][key].x); near(s.arms[0][key].z, s.arms[1][key].z);
    near(s.arms[0][key].y, -s.arms[1][key].y);
  }
});

test('IK rejects unreachable and degenerate hints instead of silently stretching bones', () => {
  assert.throws(() => bendJoint(v(0,0,0), v(100,0,0), 10, 10, v(0,1,0)), RangeError);
  assert.throws(() => bendJoint(v(0,0,0), v(10,0,0), 10, 10, v(1,0,0)), RangeError);
});

test('all sampled geometry projects inside candidate framing with head/plate allowance', () => {
  for (const clip of Object.values(CANDIDATE_CLIPS)) for (let i = 0; i <= 100; i++) {
    const s = clip.sample(i / 25);
    const points = [s.head, s.hip, ...s.arms.flatMap(a => [a.shoulder, a.elbow, a.hand]), ...s.legs.flatMap(l => [l.hip,l.knee,l.ankle]), ...s.soles.flat(), ...s.equipment.ends];
    for (const point of points) {
      const p = project(point, s.camera);
      assert.ok(p.x > 30 && p.x < 170 && p.y > 30 && p.y < 165, `${clip.id} ${JSON.stringify(p)}`);
    }
  }
});

test('candidate renderer preallocates DOM and removes its root on teardown', () => {
  let created = 0, removed = 0;
  const node = (tag = 'svg') => ({ tag, attrs: {}, children: [], setAttribute(k, val) { this.attrs[k] = val; }, append(...els) { this.children.push(...els); }, remove() { removed++; } });
  const previous = global.document;
  global.document = { createElementNS(ns, tag) { created++; return node(tag); } };
  try {
    const svg = node(), skin = createCandidateSkin(svg), count = created;
    for (const clip of Object.values(CANDIDATE_CLIPS)) for (let i = 0; i < 30; i++) {
      skin.paint(clip.sample(i / 10));
      const root = svg.children[0];
      assert.equal(root.attrs.fill, 'none');
      assert.equal(root.children.filter(el => el.tag === 'circle').length, 1, 'only head is a circle');
      assert.deepEqual(root.children.map(el => el.attrs['data-part']).sort(), ['bench', 'farLeg', 'farArm', 'torso', 'shoulders', 'nearLeg', 'nearArm', 'neck', 'leftFoot', 'rightFoot', 'bar', 'plates', 'head'].sort(), 'no face, eyes, mouth or volume nodes');
      assert.equal(new Set(root.children.map(el => el.attrs['data-part'])).size, root.children.length, 'one node per semantic part');
      for (const el of root.children) {
        assert.ok(Number(el.attrs['stroke-width']) <= 4, 'single-line figure, not body volumes');
        const bodyStroke = root.children.find(n => n.attrs['data-part'] === 'torso');
        const barStroke = root.children.find(n => n.attrs['data-part'] === 'bar');
        assert.ok(Number(bodyStroke.attrs['stroke-width']) > Number(barStroke.attrs['stroke-width']), 'figure stronger than equipment');
        assert.equal(el.children.length, 0, 'no nested outline/fill pair');
        if (el.tag === 'path') assert.ok(!/[zZ]/.test(el.attrs.d), 'no closed volume or shoe faces');
      }
      for (const name of ['leftFoot', 'rightFoot']) {
        const foot = root.children.find(el => el.attrs['data-part'] === name);
        assert.equal((foot.attrs.d.match(/M/g) || []).length, 2, 'foot has only ankle contact and sole stroke');
        assert.equal((foot.attrs.d.match(/L/g) || []).length, 2);
      }
    }
    assert.equal(created, count); skin.destroy(); assert.equal(removed, 1);
  } finally { global.document = previous; }
});

test('preview query sets theme before any module or figure rendering', () => {
  const html = readFileSync(new URL('../src/preview/motion.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [search, expected] of [['?dark=1&size=96', 'dark'], ['?dark=0', 'light'], ['', 'light']]) {
    const document = { documentElement: { dataset: {} } };
    vm.runInNewContext(script, { document, location: { search }, URLSearchParams });
    assert.equal(document.documentElement.dataset.motionTheme, expected);
  }
});

test('preview has 3 still phases, original comparison, one active group and true 96px size', () => {
  const js = readFileSync(new URL('../src/preview/motion-preview.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/preview/motion.html', import.meta.url), 'utf8');
  assert.ok(js.includes("['起始', '中段', '目标位']"));
  assert.ok(js.includes("exercise:'pull_up', reduced:true"));
  assert.ok(js.includes('playing = !playing'));
  assert.ok(js.includes("window.addEventListener('pagehide', destroy)"));
  assert.ok(html.includes('height: 96px'));
  assert.ok(!js.includes('requestAnimationFrame'));
  assert.ok(js.includes('DEMO_CLIPS.benchPress'));
  assert.ok(js.includes('createDemoFigure(svg, { exercise: selected, speed })'));
});
