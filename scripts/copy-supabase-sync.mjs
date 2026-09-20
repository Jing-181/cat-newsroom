// 构建前把根目录的 supabase-sync.js 拷入 src/public/js/，供 index.html 以普通 script 加载。
// 该文件是顶层声明（非 IIFE/UMD），不能作为 ES module import，必须作为普通 script 进全局。
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "supabase-sync.js"); // 注意：位于项目根，不在 js/ 子目录
const destDir = resolve(root, "src/public/js");
if (existsSync(source)) {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(source, resolve(destDir, "supabase-sync.js"));
  console.log("[copy] supabase-sync.js -> src/public/js/");
} else {
  console.warn("[copy] supabase-sync.js 不存在，跳过");
}
