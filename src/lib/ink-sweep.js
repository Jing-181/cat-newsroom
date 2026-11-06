// 开练过场：一滴墨从按下的位置铺开，盖满屏幕的瞬间换页，再把墨退下去。
//
// 为什么不直接跳：点「开始」是这一页里最重的一次状态切换（从看记录变成记组），
// 硬切会让人怀疑自己点没点中。一道 400ms 的墨障既解释了"发生了什么"，
// 也趁机把今天的训练日报一遍——盖住的那零点几秒里，屏幕上只剩一句话。
//
// 实现上用 clip-path 的圆做扩散，不是缩放一个实心圆：圆按视口对角线算半径，
// 从按钮位置出发也能完整盖住，且不产生任何布局。

const ENCOURAGE = [
  "先把第一组写完",
  "开头最难，做完这组就顺了",
  "今天不用练得漂亮，练到就行",
  "重量会记住你来的次数",
  "状态是练出来的，不是等出来的",
];

export function playInkSweep({ from, kicker = "", title = "", note = "", onCover, reduced = false } = {}) {
  const cover = () => { if (typeof onCover === "function") onCover(); };

  const still = reduced || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (still) {
    cover();
    return null;
  }

  // 起点：按下的那颗按钮的中心；拿不到就退到屏幕下方中央（拇指区）
  const rect = from?.getBoundingClientRect?.();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.78;

  const node = document.createElement("div");
  node.className = "ink-sweep";
  node.style.setProperty("--ink-x", `${Math.round(x)}px`);
  node.style.setProperty("--ink-y", `${Math.round(y)}px`);
  node.innerHTML = `<div class="ink-sweep-veil"></div>
    <div class="ink-sweep-copy">${kicker ? `<span>${kicker}</span>` : ""}<strong>${title}</strong>${note ? `<em>${note}</em>` : ""}</div>`;
  document.body.append(node);

  let swapped = false;
  const swap = () => {
    if (swapped) return;
    swapped = true;
    cover();
  };

  // 墨铺满时换页，然后停一会儿再退；换页落在墨底下，看不到闪。
  // 停留是故意的：盖住的那半秒里只有一句话，早了来不及读，晚了又拖。
  const tCover = window.setTimeout(swap, 600);
  const tOut = window.setTimeout(() => node.classList.add("is-out"), 1150);
  const tDone = window.setTimeout(() => {
    node.remove();
  }, 1580);

  return () => {
    [tCover, tOut, tDone].forEach(id => window.clearTimeout(id));
    swap();
    node.remove();
  };
}

// 训练日开场的鼓励语：按下标取，同一个训练日每次看到的是同一句，不随机跳。
export function encourageFor(index = 0) {
  return ENCOURAGE[Math.abs(index) % ENCOURAGE.length];
}

export default { playInkSweep, encourageFor };
