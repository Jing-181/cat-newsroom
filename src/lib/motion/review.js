import { exercises } from '../workout-catalog.js';
import { resolveDemo } from './demos.js';
import { createDemoFigure } from './index.js';
export const REVIEW_PAGE_SIZE = 8;
export const REVIEW_PHASES = Object.freeze([0, .25, .5]);
export const REVIEW_PHASE_GROUPS = Object.freeze({ default: REVIEW_PHASES, first: Object.freeze([0,.125,.25,.375]), second: Object.freeze([.5,.625,.75,.875]) });
export function reviewPage(rawPage = 0, requestedGroup = 'default') {
  const phaseGroup = Object.hasOwn(REVIEW_PHASE_GROUPS,requestedGroup) ? requestedGroup : 'default';
  const pageCount = Math.ceil(exercises.length / REVIEW_PAGE_SIZE);
  const parsed = Number(rawPage);
  const page = Math.max(0, Math.min(pageCount - 1, Number.isFinite(parsed) ? Math.floor(parsed) : 0));
  const items = exercises.slice(page * REVIEW_PAGE_SIZE, (page + 1) * REVIEW_PAGE_SIZE).map(exercise => {
    const demo = resolveDemo(exercise);
    return { exercise, demo, frames: REVIEW_PHASE_GROUPS[phaseGroup].map(phase => ({ phase, seconds: demo.clip ? demo.clip.duration * phase : 0, staticHold: Boolean(demo.clip?.staticHold) })) };
  });
  return { page, pageCount, phaseGroup, total: exercises.length, items };
}
// Only one page owns mounts. A flip, remount or teardown always disposes previous skins.
export function createReviewMounts() {
  let cleanups = [];
  const destroy = () => { cleanups.forEach(fn => fn()); cleanups = []; };
  return {
    destroy,
    mount(page, createSvg) {
      destroy();
      try {
        for (const item of page.items) for (const frame of item.frames) {
          cleanups.push(createDemoFigure(createSvg(item, frame), { exercise: item.exercise, reduced: true, staticTime: frame.seconds }));
        }
      } catch (error) { destroy(); throw error; }
    },
  };
}
