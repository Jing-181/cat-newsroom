// 预构建：只把运行期真的会按 URL 取的东西放进 src/public。
// 应用自己的 js/ 与 css/ 由 Vite 直接从源码树取（main.js 副作用 import、styles.css @import），
// 不再整目录拷副本 —— 之前副本与源文件并行存在，出现过"改了根文件、页面读的却是旧副本"。
// 留在 public 的只有三类：src/index.html 以普通 script 加载的两个同步脚本、
// 旧书签地址与设备切换器指向的跳转壳、App.vue 默认头像走的 /assets/。
import { mkdirSync, copyFileSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "src/public");

// [源, 目标（相对 public）]：文件逐字拷贝，目录递归拷贝
const entries = [
  ["supabase-sync.js", "js/supabase-sync.js"],
  ["js/sync-hooks.js", "js/sync-hooks.js"],
  ["workbench-desktop.html", "workbench-desktop.html"],
  ["workbench-mobile.html", "workbench-mobile.html"],
  ["assets", "assets"],
];

mkdirSync(publicDir, { recursive: true });
for (const [src, dest] of entries) {
  const from = resolve(root, src);
  const to = resolve(publicDir, dest);
  if (!existsSync(from)) { console.error(`跳过：${src} 不存在`); continue; }
  if (src.endsWith(".html") || src.endsWith(".js")) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  } else {
    cpSync(from, to, { recursive: true });
  }
  console.log(`已拷贝：${dest}`);
}
