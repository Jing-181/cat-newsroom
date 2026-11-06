// 线条稿皮肤。当前默认画法。
//
// 真正的实现在 skins/line/line-skin.js。这个文件保留原来的路径，
// 是因为 motion/index.js 和测试都还按这里 import；不想为了搬目录改一堆引用。
// 新代码请直接 import "./skins/line/line-skin.js"。

export { createSvgSkin, createSvgSkin as createSkin, default } from "./skins/line/line-skin.js";
