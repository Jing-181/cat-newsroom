// 生活时间线只读聚合已有记录；记录日期无效时明确归入未注明日期。
import Workout from './workout.js';
import { isDemoRecord } from './demo-data.js';
import { weekDates } from './utils.js';

export function recordDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function completedThisWeek(records, reference = new Date()) {
  const week = new Set(weekDates(reference));
  return (records || []).filter(x => Workout.isSession(x) && x.status === 'completed' && !x.deleted_at && week.has(x.date));
}

export function pendingTasks(records, limit = 5) {
  return (records || []).filter(x => !x.done && !x.deleted_at)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).slice(0, limit);
}

export function lifeFeed(data, { module = 'all', includeDemo = false } = {}) {
  const labels = { note: '日记', hot: '收藏', sport: '训练' };
  return Object.keys(labels).flatMap(key => {
    if (module !== 'all' && key !== module) return [];
    return (data[key] || []).filter(record => !record.deleted_at && (key !== 'sport' || (Workout.isSession(record) && record.status === 'completed')))
      .flatMap(record => {
        const demo = isDemoRecord(key, record);
        if (demo && !includeDemo) return [];
        const summary = key === 'sport' ? Workout.summary(record) : null;
        return [{ key: `${key}:${record.id}`, module: key, label: labels[key], record, demo,
          date: recordDate(record.date), title: record.title || (key === 'note' ? '生活一记' : labels[key]),
          excerpt: summary ? `${summary.exerciseCount} 个动作 · ${summary.setCount} 组${record.duration_min ? ` · ${record.duration_min} 分钟` : ''}` : String(record.content || '').trim(),
        }];
      });
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.key.localeCompare(b.key, undefined, { numeric: true }));
}
