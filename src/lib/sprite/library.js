// 动作图解库：把「人画好的造型」接成可按名字查询的资产层。
//
// 和 src/lib/sprite/player.js 的分工（别混）：
//   - player.js 播的是「一个动作的多帧动画 sheet」，按时间切帧；
//   - 这里存的是「56 个动作各一张的静态图解」，按名字取格。
//   文档 docs/motion-keep.md 把 SVG 线条小人叫停时写的原因就是「风格该由人定」，
//   所以这份图不重画、不加工，只登记裁剪窗口。
//
// 裁剪框来自同目录的 frames.js（由 scripts/motion-frames.py 量出）。
// 换素材重跑脚本即可；想手调某一个框，改 frames.js 里那一行。
//
// 纯数据 + 纯函数，不碰 DOM，tests/ 可以直接 import。
// 唯一的 DOM 函数是 mountFigure，带 typeof document 守卫。

import { FRAMES } from "./frames.js";

/** 原图元信息。src 走 /assets/，与 App.vue 的默认头像同一路径约定。 */
export const IMAGE = Object.freeze({
  src: "/assets/motion-library.png",
  width: 1536,
  height: 1024,
});

/** 分组只管「读图顺序、分组名、每组有哪些动作」，裁剪框不在这里算。 */
export const GROUPS = Object.freeze([
  { key: "chest", label: "胸/推", names: [
    "杠铃卧推", "哑铃卧推", "史密斯机卧推", "推胸机（水平）", "推胸机（上斜）",
    "推胸机（下斜）", "上斜推举机", "哑铃上斜卧推", "水平推举机", "胸部推举机",
    "蝴蝶机夹胸", "绳索夹胸", "哑铃飞鸟", "双杠臂屈伸", "实力推",
    "哑铃侧平举", "绳索下压", "仰卧起坐", "卷腹",
  ] },
  { key: "back", label: "背/拉", names: [
    "引体向上", "助力引体向上", "高位下拉（宽握）", "高位下拉（窄握）", "坐姿绳索划船（窄握）",
    "坐姿器械划船", "低拉划船", "水平划船", "杠铃俯身划船", "史密斯俯身划船",
    "T 杠划船", "单臂哑铃划船", "哑铃俯身飞鸟", "蝴蝶机反向飞鸟", "绳索反向飞鸟",
    "哑铃弯举", "站姿/坐姿哑铃弯举", "杠铃弯举", "单杠悬挂",
  ] },
  { key: "legs", label: "腿", names: [
    "杠铃深蹲", "史密斯深蹲", "高脚杯深蹲", "保加利亚分腿蹲", "倒蹬机/腿举", "腿屈伸",
    "腿弯举", "坐姿腿内收", "坐姿腿外展", "罗马尼亚硬拉", "单腿罗马尼亚硬拉", "悬挂举腿", "平板支撑",
  ] },
  { key: "cardio", label: "有氧/其他", names: [
    "跑步机爬坡", "户外跑", "跑步机跑", "爬楼机", "骑行",
  ] },
]);

/**
 * 明确的等价别名：键是别名，值是图集里的规范名。
 * 只收「同一个动作换个叫法」，不收「看起来像就归过去」——配错图比没图更糟，
 * 和 clips.js 里 kindForName「认不出的回 idle，宁可不动也不要演错」同一条规矩。
 * 想补映射就往这里加一行，别写正则。
 */
export const ALIASES = Object.freeze({
  "杠铃划船": "杠铃俯身划船",
  "俯身杠铃划船": "杠铃俯身划船",
  "哑铃卧推（上斜）": "哑铃上斜卧推",
  "上斜哑铃卧推": "哑铃上斜卧推",
  "反向蝴蝶机": "蝴蝶机反向飞鸟",
  "反向飞鸟": "绳索反向飞鸟",
  "侧平举": "哑铃侧平举",
  "三头下压": "绳索下压",
  "坐姿划船": "坐姿器械划船",
  "深蹲": "杠铃深蹲",
  "腿举": "倒蹬机/腿举",
  "倒蹬机": "倒蹬机/腿举",
  "腿蹬": "倒蹬机/腿举",
  "保加利亚蹲": "保加利亚分腿蹲",
  "悬垂举腿": "悬挂举腿",
  "助力引体": "助力引体向上",
  "坡走": "跑步机爬坡",
  "爬坡走": "跑步机爬坡",
  "越野跑": "户外跑",
  "单车": "骑行",
  "爬楼": "爬楼机",
  "跑步": "跑步机跑",
  "平板": "平板支撑",
});

function buildCells() {
  const cells = [];
  for (const group of GROUPS) {
    group.names.forEach((name, index) => {
      const frame = FRAMES[name];
      if (!frame) throw new Error(`动作图解缺裁剪框：${name}（重跑 scripts/motion-frames.py）`);
      cells.push(Object.freeze({
        id: `${group.key}-${index + 1}`,
        name,
        group: group.key,
        groupLabel: group.label,
        index,
        frame: Object.freeze(frame),
      }));
    });
  }
  return Object.freeze(cells);
}

/** 56 张图解，顺序即图集里的读图顺序（分组 → 从上到下、从左到右）。 */
export const CELLS = buildCells();

const BY_NAME = new Map(CELLS.map(cell => [cell.name, cell]));
const BY_ID = new Map(CELLS.map(cell => [cell.id, cell]));

/**
 * 去掉括号修饰、斜杠、空格，只用于「同一动作的变体」回落匹配。
 * 关键约束：只有图集里那个名字**本身不带括号修饰**时才参与回落。
 * 否则「高位下拉（宽握）」会被归一化成「高位下拉」，
 * 而图里根本没有不带修饰的这一张，就不该硬配；
 * 「坐姿绳索划船（宽握）」更不能落到「（窄握）」那张图上——宽窄握是两个动作。
 */
const normalize = name => String(name || "")
  .replace(/[（(][^）)]*[）)]/g, "")
  .replace(/[\s/·、]/g, "")
  .trim();

const NORMALIZED = new Map();
for (const cell of CELLS) {
  if (/[（(]/.test(cell.name)) continue; // 带修饰的规范名不参与回落
  const key = normalize(cell.name);
  if (!key) continue;
  // 归一化后撞车就置 null：不猜，交回人补 ALIASES。
  NORMALIZED.set(key, NORMALIZED.has(key) ? null : cell);
}

/**
 * 按动作名找图解。三级：精确 → 别名 → 去括号变体（且候选唯一）。
 * 找不到返回 null，调用方应回退到原来的文字 badge，不要随便配一张图。
 */
export function figureFor(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  const aliased = ALIASES[raw];
  if (aliased) return BY_NAME.get(aliased) || null;
  return NORMALIZED.get(normalize(raw)) || null;
}

export function figureById(id) {
  return BY_ID.get(id) || null;
}

export const GROUP_KEYS = Object.freeze(GROUPS.map(g => g.key));

export function cellsInGroup(key) {
  return CELLS.filter(cell => cell.group === key);
}

/**
 * CSS 取格参数。把整张图放大 scale 倍，再把窗口左上角平移到容器原点。
 * displayWidth 是要显示的宽度（px），高度按窗口宽高比算，不会拉变形。
 * 返回 style 对象，Object.assign(el.style, cssFor(...)) 直接用。
 */
export function cssFor(cell, displayWidth = 120, src = IMAGE.src) {
  if (!cell) return null;
  const [x, y, w, h] = cell.frame;
  const scale = displayWidth / w;
  return {
    width: `${displayWidth}px`,
    height: `${Math.round(h * scale)}px`,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${Math.round(IMAGE.width * scale)}px ${Math.round(IMAGE.height * scale)}px`,
    backgroundPosition: `-${Math.round(x * scale)}px -${Math.round(y * scale)}px`,
    backgroundRepeat: "no-repeat",
  };
}

/** 给一段 CSS 取格参数生成可复制的声明文本，预览页调试用。 */
export function cssTextFor(cell, displayWidth = 120, src = IMAGE.src) {
  const style = cssFor(cell, displayWidth, src);
  if (!style) return "";
  const kebab = key => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  return Object.entries(style).map(([k, v]) => `${kebab(k)}: ${v};`).join("\n");
}

/** 便利函数：把某个动作的图解挂到一个元素上。node 环境里 import 不会因此报错。 */
export function mountFigure(el, name, options = {}) {
  if (!el || typeof document === "undefined") return null;
  const cell = typeof name === "object" ? name : figureFor(name);
  if (!cell) {
    el.style.backgroundImage = "none";
    return null;
  }
  Object.assign(el.style, cssFor(cell, options.width, options.src));
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${cell.name} 动作图解`);
  return cell;
}

export default {
  IMAGE, GROUPS, CELLS, ALIASES, GROUP_KEYS,
  figureFor, figureById, cellsInGroup, cssFor, cssTextFor, mountFigure,
};
