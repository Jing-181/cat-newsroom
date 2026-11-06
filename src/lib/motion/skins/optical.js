// 光学尺寸：同一副骨架，在不同出场尺寸下要用不同的画法。
//
// 这不是“大图的缩小版”。96px 下把肌肉线按比例缩过去，只会得到一层灰雾：
// 线宽只剩 0.8px，描边和填色糊在一起，细节反而变成噪点。
// 字体排印管这个叫 optical sizing，插画里是同一条道理：
// 小尺寸要减细节、加对比；大尺寸才铺得开层次。
//
// 所以每个皮肤都要回答两件事：
//   1) 这个尺寸下，哪些细节该丢掉？（tier）
//   2) 线宽要以 px 为准，还是跟着 viewBox 缩放？（strokeUnits）

// 尺寸档：
//   compact  ≤ 128px   真实出场尺寸（训练页的教练小人）。只留剪影和 2–3 处结构线
//   regular  ≤ 220px   审阅页、比较大的展示位。层次齐全
//   full     > 220px   大图、海报。细节全部铺满
export const TIERS = Object.freeze({ compact: "compact", regular: "regular", full: "full" });

export function sizeTier(px) {
  if (!Number.isFinite(px) || px <= 0) return TIERS.full;   // 量不到就当大图处理，别丢细节
  if (px <= 128) return TIERS.compact;
  if (px <= 220) return TIERS.regular;
  return TIERS.full;
}

// 线宽的光学缩放。
//
// 输入是“在参考尺寸下好看的线宽（身体单位）”，输出是当前尺寸下该用的线宽。
// 按 1/size^0.65 缩：如果按 1/size 缩，大图会细成发丝；完全不缩，小图会糊成一团。
// 0.65 是经验值：96px → 250px 这四倍差距下，线在小图上显得粗、大图上显得细，
// 但两端都还立得住。
//
// 注意：这里返回的仍然是身体单位，因为皮肤最终要写进 SVG 属性里。
export function strokeUnits(px, baseUnits, refPx = 96, exponent = 0.65) {
  if (!Number.isFinite(px) || px <= 0) return baseUnits;
  return baseUnits * Math.pow(refPx / px, exponent);
}

// 量一个 svg 当前实际渲染高度。量不到时返回 0，调用方按 full 处理。
export function measureHeight(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return 0;
  const rect = el.getBoundingClientRect();
  return rect && rect.height > 0 ? rect.height : 0;
}

// viewBox 字符串 → 高度（身体单位）。用来把 px 换算成身体单位。
export function viewBoxHeight(viewBox, fallback = 122) {
  if (typeof viewBox !== "string") return fallback;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && Number.isFinite(parts[3]) && parts[3] > 0 ? parts[3] : fallback;
}

export default { TIERS, sizeTier, strokeUnits, measureHeight, viewBoxHeight };
