// 动作图解库（src/lib/sprite/library.js）的回归测试。
//
// 重点守三件事：
//   1. 56 个框和 frames.js 一一对应，换素材漏了一个动作会立刻挂；
//   2. 按名字取图不会错配（宽握不能落到窄握那张图上）；
//   3. CSS 取格的缩放/位移算得对，否则页面显示的是隔壁的小人。
import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE, GROUPS, CELLS, ALIASES, GROUP_KEYS,
  figureFor, figureById, cellsInGroup, cssFor, cssTextFor, mountFigure,
} from "../src/lib/sprite/library.js";
import { FRAMES } from "../src/lib/sprite/frames.js";

const EXPECT_GROUPS = { chest: 19, back: 19, legs: 13, cardio: 5 };

test("图集是 56 个动作，四组数量与图上标注一致", () => {
  assert.equal(CELLS.length, 56);
  assert.equal(Object.keys(FRAMES).length, 56);
  assert.deepEqual(Object.fromEntries(GROUP_KEYS.map(k => [k, cellsInGroup(k).length])), EXPECT_GROUPS);
  assert.equal(GROUP_KEYS.length, 4);
  assert.deepEqual(GROUPS.map(g => g.label), ["胸/推", "背/拉", "腿", "有氧/其他"]);
});

test("CELLS 与 FRAMES 一一对应，不多不少", () => {
  const names = CELLS.map(c => c.name);
  assert.deepEqual(names.slice().sort(), Object.keys(FRAMES).slice().sort());
  assert.equal(new Set(names).size, names.length, "动作名不能重复");
  assert.equal(new Set(CELLS.map(c => c.id)).size, CELLS.length, "id 不能重复");
});

test("每个裁剪框都在原图范围内，且宽高可用", () => {
  assert.deepEqual([IMAGE.width, IMAGE.height], [1536, 1024]);
  for (const cell of CELLS) {
    const [x, y, w, h] = cell.frame;
    assert.ok(Array.isArray(cell.frame) && cell.frame.length === 4, `${cell.name} 的框格式不对`);
    assert.ok(w >= 20 && h >= 20, `${cell.name} 的框太小：${w}×${h}`);
    assert.ok(x >= 0 && y >= 0, `${cell.name} 的框起点越界`);
    assert.ok(x + w <= IMAGE.width && y + h <= IMAGE.height, `${cell.name} 的框超出原图`);
  }
});

test("figureFor：精确名、别名、变体回落都能命中", () => {
  assert.equal(figureFor("杠铃卧推")?.name, "杠铃卧推");
  assert.equal(figureFor("  杠铃卧推  ")?.name, "杠铃卧推");
  // 别名表里登记过的等价叫法
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    assert.equal(figureFor(alias)?.name, canonical, `别名 ${alias} 没落到 ${canonical}`);
  }
  // 去括号变体：图上只有不带修饰的「绳索夹胸」，允许高位/中位/低位共用
  assert.equal(figureFor("绳索夹胸（高位）")?.name, "绳索夹胸");
  assert.equal(figureFor("户外跑（越野）")?.name, "户外跑");
});

test("figureFor：认不出的动作返回 null，不硬配一张图", () => {
  assert.equal(figureFor(""), null);
  assert.equal(figureFor(null), null);
  assert.equal(figureFor(undefined), null);
  assert.equal(figureFor("不存在的动作"), null);
  // 关键错配守门：宽握和窄握是两个动作，图里只画了窄握，不能拿窄握的图糊弄
  assert.equal(figureFor("坐姿绳索划船（宽握）"), null);
  assert.equal(figureFor("高位下拉（反握）"), null);
  // 带括号修饰的规范名自己能精确命中
  assert.equal(figureFor("高位下拉（宽握）")?.name, "高位下拉（宽握）");
  assert.equal(figureFor("坐姿绳索划船（窄握）")?.name, "坐姿绳索划船（窄握）");
});

test("figureById 与 id 命名稳定", () => {
  for (const cell of CELLS) {
    assert.equal(figureById(cell.id), cell);
    assert.match(cell.id, new RegExp(`^${cell.group}-\\d+$`));
  }
  assert.equal(figureById("nope"), null);
});

test("cssFor：等比缩放，位置取负，尺寸不拉变形", () => {
  const cell = figureFor("杠铃卧推");
  const [x, y, w, h] = cell.frame;
  const s = cssFor(cell, 120);
  assert.equal(s.width, "120px");
  assert.equal(s.height, `${Math.round(h * (120 / w))}px`);
  assert.equal(s.backgroundSize, `${Math.round(IMAGE.width * 120 / w)}px ${Math.round(IMAGE.height * 120 / w)}px`);
  assert.equal(s.backgroundPosition, `-${Math.round(x * 120 / w)}px -${Math.round(y * 120 / w)}px`);
  assert.equal(s.backgroundRepeat, "no-repeat");
  assert.match(s.backgroundImage, /motion-library\.png/);
  // 双倍宽度时所有像素量同步翻倍。cssFor 对每个量各自 Math.round，
  // 取整会带来 1px 误差，所以用容差而不是精确除等。
  const s2 = cssFor(cell, 240);
  const nearDouble = (a, b) => Math.abs(a - b * 2) <= 1;
  assert.ok(nearDouble(parseInt(s2.height), parseInt(s.height)), "高度没跟着翻倍");
  assert.ok(nearDouble(parseInt(s2.backgroundSize), parseInt(s.backgroundSize)), "background-size 没跟着翻倍");
});

test("cssFor：可覆盖图片路径；找不到图返回 null", () => {
  assert.match(cssFor(figureFor("深蹲"), 100, "./custom.png").backgroundImage, /custom\.png/);
  assert.equal(cssFor(null, 100), null);
});

test("cssTextFor 生成可复制的 CSS 声明", () => {
  const text = cssTextFor(figureFor("平板支撑"), 120);
  for (const prop of ["width", "height", "background-image", "background-size", "background-position", "background-repeat"]) {
    assert.match(text, new RegExp(`^${prop}:`, "m"), `缺 ${prop}`);
  }
  assert.equal(cssTextFor(null), "");
});

test("mountFigure 在无 DOM 的 node 环境里安全返回 null", () => {
  assert.equal(mountFigure(null, "深蹲"), null);
  assert.equal(mountFigure({}, "深蹲"), null);
});
