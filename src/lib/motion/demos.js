import { exercises } from '../workout-catalog.js';
import { OUTDOOR_CLIPS } from './outdoor-clips.js';
import { CARDIO_MACHINE_CLIPS } from './cardio-machine-clips.js';
import { FUNCTIONAL_CLIPS } from './functional-clips.js';
import { CORE_ACCESSORY_CLIPS } from './core-accessory-clips.js';
import { BODYWEIGHT_CLIPS } from './bodyweight-clips.js';
import { LOWER_ACCESSORY_CLIPS } from './lower-accessory-clips.js';
import { ARM_ACCESSORY_CLIPS } from './arm-accessory-clips.js';
import { SHOULDER_BACK_CLIPS } from './shoulder-back-clips.js';
import { FLY_CLIPS } from './fly-clips.js';
import { COMPOUND_LEG_CLIPS } from './compound-leg-clips.js';
import { HINGE_CLIPS } from './hinge-clips.js';
import { CHEST_CLIPS } from './chest-clips.js';
import { BACK_CLIPS } from './back-clips.js';
import { SHOULDER_CLIPS } from './shoulder-clips.js';
import { LEG_CLIPS } from './leg-clips.js';
import { ARM_CLIPS } from './arm-clips.js';
import { DEMO_CLIPS } from './demo-clips.js';
import { CANDIDATE_CLIPS } from './candidate-clips.js';
import { createCandidateSkin } from './candidate-skin.js';
import { createDemoSkin } from './demo-skin.js';

export const DEMO_STATUS = Object.freeze({ calibrated: '校准样片 · 待视觉验收', illustrative: '同类示意', unavailable: '暂无示范' });
// Explicit unsupported inventory: adding a catalog entry requires a conscious demo decision.
const unavailableIds = [];
const entry = (status, clip = null, skin = createDemoSkin, metadata = clip) => Object.freeze({ status, label: DEMO_STATUS[status], clip, skin,
  supportType: metadata?.supportType || (status === 'illustrative' ? 'simplified' : clip ? 'exact' : 'unavailable'),
  referenceStatus: metadata?.referenceStatus || (clip?.id === 'stairs' ? 'parent-verified-general-guidance' : metadata?.source ? 'source-listed-scope-in-docs' : 'pending'),
  support: metadata?.support || '', view: metadata?.view || '', movement: metadata?.movement || '', source: metadata?.source || '' });
const unavailable = entry('unavailable');
export const DEMO_REGISTRY = Object.freeze({
  ...Object.fromEntries(unavailableIds.map(id => [id, unavailable])),
  barbell_squat: entry('calibrated', CANDIDATE_CLIPS.squat, createCandidateSkin, {
    ...DEMO_CLIPS.squat, view: '正交三分之四 · 下肢强调',
    support: '双脚固定接地，上背承杠；双手附着同一杠轴。',
    movement: '髋膝屈伸，完整杠轴随上背移动；比例固定，绘图深度不作为训练处方。',
  }),
  pull_up: entry('calibrated', DEMO_CLIPS.pullUp),
  outdoor_run: entry('calibrated', OUTDOOR_CLIPS.run, createCandidateSkin),
  jump_rope: entry('calibrated', OUTDOOR_CLIPS.jump, createCandidateSkin),
  trail_run: entry('illustrative', OUTDOOR_CLIPS.trail, createCandidateSkin),
  badminton: entry('illustrative', OUTDOOR_CLIPS.badminton, createCandidateSkin),
  swimming: entry('illustrative', OUTDOOR_CLIPS.swim, createCandidateSkin),
  stretch: entry('illustrative', OUTDOOR_CLIPS.stretch, createCandidateSkin),
  treadmill: entry('calibrated', CARDIO_MACHINE_CLIPS.treadmill, createCandidateSkin),
  bike: entry('calibrated', CARDIO_MACHINE_CLIPS.bike, createCandidateSkin),
  elliptical: entry('calibrated', CARDIO_MACHINE_CLIPS.elliptical, createCandidateSkin),
  rowing_machine: entry('calibrated', CARDIO_MACHINE_CLIPS.rower, createCandidateSkin),
  stair_climber: entry('calibrated', CARDIO_MACHINE_CLIPS.stairs, createCandidateSkin),
  incline_walk: entry('calibrated', CARDIO_MACHINE_CLIPS.inclineWalk, createCandidateSkin),
  cable_reverse_fly: entry('calibrated', FUNCTIONAL_CLIPS.crossFly, createCandidateSkin),
  arnold_press: entry('calibrated', FUNCTIONAL_CLIPS.arnold, createCandidateSkin),
  single_arm_pushdown: entry('calibrated', FUNCTIONAL_CLIPS.singlePush, createCandidateSkin),
  farmer_carry: entry('calibrated', FUNCTIONAL_CLIPS.farmer, createCandidateSkin),
  pallof_press: entry('calibrated', FUNCTIONAL_CLIPS.pallof, createCandidateSkin),
  battle_rope: entry('calibrated', FUNCTIONAL_CLIPS.battle, createCandidateSkin),
  sit_up: entry('calibrated', CORE_ACCESSORY_CLIPS.sitUp, createCandidateSkin),
  crunch: entry('calibrated', CORE_ACCESSORY_CLIPS.crunch, createCandidateSkin),
  russian_twist: entry('calibrated', CORE_ACCESSORY_CLIPS.twist, createCandidateSkin),
  hanging_leg_raise: entry('calibrated', CORE_ACCESSORY_CLIPS.hangingRaise, createCandidateSkin),
  cable_crunch: entry('calibrated', CORE_ACCESSORY_CLIPS.cableCrunch, createCandidateSkin),
  ab_wheel: entry('calibrated', CORE_ACCESSORY_CLIPS.abWheel, createCandidateSkin),
  push_up: entry('calibrated', BODYWEIGHT_CLIPS.pushUp, createCandidateSkin),
  plank: entry('calibrated', BODYWEIGHT_CLIPS.plank, createCandidateSkin),
  side_plank: entry('calibrated', BODYWEIGHT_CLIPS.sidePlank, createCandidateSkin),
  copenhagen_plank: entry('calibrated', BODYWEIGHT_CLIPS.copenhagen, createCandidateSkin),
  dips: entry('calibrated', BODYWEIGHT_CLIPS.dips, createCandidateSkin),
  inverted_row: entry('calibrated', BODYWEIGHT_CLIPS.invertedRow, createCandidateSkin),
  dead_bug: entry('calibrated', BODYWEIGHT_CLIPS.deadBug, createCandidateSkin),
  bird_dog: entry('calibrated', BODYWEIGHT_CLIPS.birdDog, createCandidateSkin),
  hack_squat: entry('calibrated', LOWER_ACCESSORY_CLIPS.hack, createCandidateSkin),
  hip_thrust: entry('calibrated', LOWER_ACCESSORY_CLIPS.thrust, createCandidateSkin),
  seated_hip_adduction: entry('calibrated', LOWER_ACCESSORY_CLIPS.adduction, createCandidateSkin),
  seated_hip_abduction: entry('calibrated', LOWER_ACCESSORY_CLIPS.abduction, createCandidateSkin),
  nordic_curl: entry('calibrated', LOWER_ACCESSORY_CLIPS.nordic, createCandidateSkin),
  back_extension: entry('calibrated', LOWER_ACCESSORY_CLIPS.backExtension, createCandidateSkin),
  single_leg_calf_raise: entry('calibrated', LOWER_ACCESSORY_CLIPS.singleCalf, createCandidateSkin),
  preacher_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.preacher, createCandidateSkin),
  cable_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.cableCurl, createCandidateSkin),
  incline_dumbbell_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.inclineCurl, createCandidateSkin),
  reverse_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.reverseCurl, createCandidateSkin),
  wrist_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.wrist, createCandidateSkin),
  bar_pushdown: entry('calibrated', ARM_ACCESSORY_CLIPS.barPushdown, createCandidateSkin),
  overhead_extension: entry('calibrated', ARM_ACCESSORY_CLIPS.overhead, createCandidateSkin),
  skull_crusher: entry('calibrated', ARM_ACCESSORY_CLIPS.skull, createCandidateSkin),
  cable_hammer_curl: entry('calibrated', ARM_ACCESSORY_CLIPS.cableHammer, createCandidateSkin),
  machine_row: entry('calibrated', SHOULDER_BACK_CLIPS.machineRow, createCandidateSkin),
  straight_arm_pulldown: entry('calibrated', SHOULDER_BACK_CLIPS.straightPulldown, createCandidateSkin),
  shrug: entry('calibrated', SHOULDER_BACK_CLIPS.shrug, createCandidateSkin),
  machine_shoulder_press: entry('calibrated', SHOULDER_BACK_CLIPS.machineShoulder, createCandidateSkin),
  cable_lateral_raise: entry('calibrated', SHOULDER_BACK_CLIPS.cableLateral, createCandidateSkin),
  reverse_pec_deck: entry('calibrated', SHOULDER_BACK_CLIPS.reversePec, createCandidateSkin),
  face_pull: entry('calibrated', SHOULDER_BACK_CLIPS.facePull, createCandidateSkin),
  bent_over_reverse_fly: entry('calibrated', SHOULDER_BACK_CLIPS.reverseFly, createCandidateSkin),
  machine_chest_press: entry('calibrated', FLY_CLIPS.machineFlat, createCandidateSkin),
  machine_chest_press_incline: entry('calibrated', FLY_CLIPS.machineIncline, createCandidateSkin),
  machine_chest_press_decline: entry('calibrated', FLY_CLIPS.machineDecline, createCandidateSkin),
  dumbbell_fly: entry('calibrated', FLY_CLIPS.dumbbellFly, createCandidateSkin),
  incline_dumbbell_fly: entry('calibrated', FLY_CLIPS.inclineFly, createCandidateSkin),
  pec_deck: entry('calibrated', FLY_CLIPS.pecDeck, createCandidateSkin),
  cable_fly_high: entry('calibrated', FLY_CLIPS.cableHigh, createCandidateSkin),
  cable_fly_mid: entry('calibrated', FLY_CLIPS.cableMid, createCandidateSkin),
  cable_fly_low: entry('calibrated', FLY_CLIPS.cableLow, createCandidateSkin),
  bulgarian_split_squat: entry('calibrated', COMPOUND_LEG_CLIPS.bulgarian, createCandidateSkin),
  walking_lunge: entry('calibrated', COMPOUND_LEG_CLIPS.walkingLunge, createCandidateSkin),
  lateral_lunge: entry('calibrated', COMPOUND_LEG_CLIPS.lateralLunge, createCandidateSkin),
  smith_machine_squat: entry('calibrated', COMPOUND_LEG_CLIPS.smithSquat, createCandidateSkin),
  leg_press: entry('calibrated', COMPOUND_LEG_CLIPS.legPress, createCandidateSkin),
  single_leg_press: entry('calibrated', COMPOUND_LEG_CLIPS.singlePress, createCandidateSkin),
  romanian_deadlift: entry('calibrated', HINGE_CLIPS.rdl, createCandidateSkin),
  conventional_deadlift: entry('calibrated', HINGE_CLIPS.deadlift, createCandidateSkin),
  single_leg_rdl: entry('calibrated', HINGE_CLIPS.singleRdl, createCandidateSkin),
  barbell_row: entry('calibrated', HINGE_CLIPS.barbellRow, createCandidateSkin),
  one_arm_dumbbell_row: entry('calibrated', HINGE_CLIPS.singleRow, createCandidateSkin),
  t_bar_row: entry('calibrated', HINGE_CLIPS.tbarRow, createCandidateSkin),
  dumbbell_bench_press: entry('calibrated', CHEST_CLIPS.dumbbellBench, createCandidateSkin),
  dumbbell_bench_press_incline: entry('calibrated', CHEST_CLIPS.inclineDumbbellBench, createCandidateSkin),
  barbell_bench_press_incline: entry('calibrated', CHEST_CLIPS.inclineBarbellBench, createCandidateSkin),
  close_grip_bench_press: entry('calibrated', CHEST_CLIPS.closeBench, createCandidateSkin),
  smith_machine_bench_press: entry('calibrated', CHEST_CLIPS.smithBench, createCandidateSkin),
  one_arm_dumbbell_bench_press: entry('calibrated', CHEST_CLIPS.singleDumbbellBench, createCandidateSkin),
  lat_pulldown_wide: entry('calibrated', BACK_CLIPS.pulldownWide, createCandidateSkin),
  lat_pulldown_close: entry('calibrated', BACK_CLIPS.pulldownClose, createCandidateSkin),
  lat_pulldown_reverse: entry('calibrated', BACK_CLIPS.pulldownReverse, createCandidateSkin),
  single_arm_cable_pulldown: entry('calibrated', BACK_CLIPS.pulldownSingle, createCandidateSkin),
  seated_cable_row: entry('calibrated', BACK_CLIPS.rowClose, createCandidateSkin),
  seated_cable_row_wide: entry('calibrated', BACK_CLIPS.rowWide, createCandidateSkin),
  strict_press: Object.freeze({ ...entry('calibrated', SHOULDER_CLIPS.strictPress, createCandidateSkin), label: '投影裁线已实施 · 待视觉复查' }),
  dumbbell_shoulder_press: entry('calibrated', SHOULDER_CLIPS.dumbbellShoulderPress, createCandidateSkin),
  dumbbell_lateral_raise: entry('calibrated', SHOULDER_CLIPS.lateralRaise, createCandidateSkin),
  dumbbell_front_raise: entry('calibrated', SHOULDER_CLIPS.frontRaise, createCandidateSkin),
  calf_raise: entry('calibrated', LEG_CLIPS.standingCalf, createCandidateSkin),
  seated_calf_raise: entry('calibrated', LEG_CLIPS.seatedCalf, createCandidateSkin),
  leg_extension: entry('calibrated', LEG_CLIPS.legExtension, createCandidateSkin),
  leg_curl: entry('calibrated', LEG_CLIPS.legCurl, createCandidateSkin),
  dumbbell_curl: entry('calibrated', ARM_CLIPS.dumbbellCurl, createCandidateSkin),
  barbell_curl: entry('calibrated', ARM_CLIPS.barbellCurl, createCandidateSkin),
  hammer_curl: entry('calibrated', ARM_CLIPS.hammerCurl, createCandidateSkin),
  rope_pushdown: entry('calibrated', ARM_CLIPS.ropePushdown, createCandidateSkin),
  barbell_bench_press: entry('calibrated', CANDIDATE_CLIPS.benchPress, createCandidateSkin, {
    ...DEMO_CLIPS.benchPress, view: '正交三分之四 · 上肢强调',
    support: '头背与骨盆保持凳面接触，双脚固定；双手附着完整杠轴。',
    movement: '杠铃下放至胸前再推起，双肘朝身体外侧和脚端屈伸；几何已校验，视觉待验收。',
  }),
});
export function resolveDemo(exercise) {
  // A supplied identity is authoritative, including unknown/custom IDs. No fuzzy name fallback.
  const id = typeof exercise === 'string' ? exercise
    : exercise?.exercise_id || exercise?.id || exercises.find(item => item.name === exercise?.name)?.id;
  return { exerciseId: id || null, ...(DEMO_REGISTRY[id] || unavailable) };
}
