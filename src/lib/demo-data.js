// 演示数据守卫：首次进页面看到的样板记录全部带 __seed 标识，同步层据此判断「这条不是用户的」。
//
// 判定不只看标识，而是拿记录内容与样板模板逐字段比对（忽略 __seed、updated_at）：
//   - 没被动过的样板：内容与模板一致 → 不上云，登录账号也不会混进用户数据；
//   - 用户改过的样板：内容已经不同 → 算用户的记录，照常同步；
//   - 用户新加的记录：id 不在模板里 → 照常同步。
// 这样既能兜住修复之前就已经落到 localStorage / outbox 里的老样板数据（它们没标识），
// 也不会把用户真正编辑过的记录误判成演示数据。
import { CONFIG } from "./config.js";

export const SEED_FLAG = "__seed";

// 比对时忽略的字段：标识本身，以及同步层会反复改写的 updated_at
const IGNORED_KEYS = new Set([SEED_FLAG, "updated_at"]);

// 键顺序无关的稳定序列化：云端回来的行会带上 id/updated_at，字段顺序与本地样板不同
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter(key => !IGNORED_KEYS.has(key)).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function isPlainRecord(record) {
  return !!record && typeof record === "object" && !Array.isArray(record);
}

// 给样板记录打标识（load() 造种子数据时用，只标顶层记录，不动嵌套的动作实例）
export function markSeedRecords(list = []) {
  return list.map(record => (isPlainRecord(record) ? { ...record, [SEED_FLAG]: true } : record));
}

// 按 id 找样板模板；找不到说明这条不是样板 id
export function seedTemplateFor(moduleKey, id) {
  if (id == null) return null;
  const module = CONFIG.modules.find(item => item.key === moduleKey);
  const seed = module?.seed || [];
  return seed.find(record => String(record.id) === String(id)) || null;
}

// 演示数据：id 命中样板，且内容与样板一致
export function isDemoRecord(moduleKey, record) {
  if (!isPlainRecord(record)) return false;
  const template = seedTemplateFor(moduleKey, record.id);
  return !!template && canonical(record) === canonical(template);
}

// 上云前去掉标识，云端不留演示标记
export function stripSeedFlag(record) {
  if (!isPlainRecord(record) || !Object.prototype.hasOwnProperty.call(record, SEED_FLAG)) return record;
  const { [SEED_FLAG]: _flag, ...rest } = record;
  return rest;
}

const DemoData = { SEED_FLAG, markSeedRecords, seedTemplateFor, isDemoRecord, stripSeedFlag };

// 经典脚本（supabase-sync.js）没有模块系统，走这个桥读取守卫；其余调用方直接 import
if (typeof window !== "undefined") window.DemoData = DemoData;

export default DemoData;
