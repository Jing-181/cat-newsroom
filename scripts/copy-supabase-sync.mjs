// 预构建：把根目录的全局脚本与旧版静态站（桌面/移动页 + assets/css/js）拷贝进 src/public，
// 由 Vite 原样输出到 dist，保证设备切换器与旧书签地址不失效
import { mkdirSync, copyFileSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "src/public");

// [源, 目标（相对 public）]：文件逐字拷贝，目录递归拷贝
const entries = [
  ["supabase-sync.js", "js/supabase-sync.js"],
  ["workbench-desktop.html", "workbench-desktop.html"],
  ["workbench-mobile.html", "workbench-mobile.html"],
  ["assets", "assets"],
  ["css", "css"],
  ["js", "js"],
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
