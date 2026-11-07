import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("模块切换走原生 View Transitions，DOM 换页与滚动复位挂在它的 promise 上", () => {
  const app = read("src/App.vue");
  assert.match(app, /document\.startViewTransition\(/);
  assert.match(app, /await nextTick\(\)/, "回调里要等 Vue 写完新 DOM");
  assert.match(app, /transition\.ready\.then\(/, "伪元素树就绪后才挂动画");
  assert.match(app, /transition\.finished\.finally\(/, "滚动复位放在动画之后");
  assert.match(app, /pseudoElement: "::view-transition-new\(root\)"/);
  assert.match(app, /clipPath: \[/, "用 WAAPI 在 new 快照上做圆形揭示");
  assert.match(app, /Math\.hypot\(/, "半径按最远角算，任意落点都能盖满");
  assert.match(app, /prefers-reduced-motion/, "减少动态效果时直接换页");
  assert.match(app, /view\.value = pendingKey/, "连点时读最新 key，最终状态落在最后一次点击");
  assert.match(app, /DeviceMode\.saveView\(pendingKey\)/);
  assert.match(app, /@navigate="onNavigate"/, "业务页导航入口不能断");
  assert.match(app, /unmountLeafShade\?\.\(\)/, "树影 teardown 仍要有销毁路径");
});

test("关掉默认交叉淡出，旧帧不透明垫底，避免两层半透明叠出纸底发白", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /::view-transition-image-pair\(root\) \{ isolation: auto; \}/);
  assert.match(styles, /::view-transition-group\(root\) \{ animation: none; \}/, "别留 UA 那段 250ms 时长不一致的动画");
  assert.match(styles, /::view-transition-old\(root\),\s*::view-transition-new\(root\) \{[^}]*animation: none;[^}]*mix-blend-mode: normal;[^}]*display: block;/s);
  assert.match(styles, /@supports \(view-transition-name: root\)/, "视图自身的入场淡入仍要关掉");
  assert.doesNotMatch(styles, /animation-duration: 190ms/, "别再改默认 cross-fade 的时长当修法");
});

test("自研 WebGPU 转场那一套已整体撤掉，不留死代码", () => {
  assert.equal(fs.existsSync(path.join(root, "src/gpu")), false, "src/gpu/ 不应残留");
  assert.equal(fs.existsSync(path.join(root, "src/lib/module-transition.js")), false);
  const app = read("src/App.vue");
  assert.doesNotMatch(app, /moduleTransition|createModuleTransition/);
  assert.doesNotMatch(app, /navigator\.gpu|inkTier|inkReason/);
  const styles = read("src/styles.css");
  assert.doesNotMatch(styles, /\.ink-pass|\.ink-veil|ink-veil-open/);
  for (const file of ["src/App.vue", "src/styles.css", "src/index.html", "src/main.js"]) {
    assert.doesNotMatch(read(file), /module-transition\.js|src\/gpu\//, `${file} 还在引用已删模块`);
  }
});

test("没有为了转场引入任何运行时依赖", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["vue"]);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ["@vitejs/plugin-vue", "vite"]);
});

test("文档写清了原生 VT 的分工，且树影三档说明仍在", () => {
  const doc = read("docs/motion-system.md");
  assert.match(doc, /View Transitions API/);
  assert.match(doc, /::view-transition-new\(root\)/);
  assert.match(doc, /updateCallbackDone|ready|finished/);
  assert.match(doc, /Vue 的 `<Transition>`/);
  assert.doesNotMatch(doc, /src\/gpu\/|module-transition\.js/);
  assert.match(doc, /leaf-shade-webgpu\.js/, "树影那部分说明不能一起删掉");
});
