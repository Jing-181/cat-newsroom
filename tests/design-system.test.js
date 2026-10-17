import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("旧版 workbench 页面已退役，仅保留跳转到最新版", () => {
  for (const file of ["workbench-desktop.html", "workbench-mobile.html"]) {
    const html = read(file);
    assert.match(html, /url=\.\/index\.html/);
    assert.match(html, /location\.replace\("\.\/index\.html"\)/);
    assert.doesNotMatch(html, /css\/theme\.css/, `${file} 不应再携带应用样式`);
  }
});

test("设计演示页只使用共享样式和相对资源", () => {
  const html = read("docs/design-demo.html");
  assert.match(html, /href="\.\.\/css\/theme\.css"/);
  assert.match(html, /href="\.\.\/css\/components\.css"/);
  assert.match(html, /class="shared-btn primary"/);
  assert.match(html, /class="shared-modal demo-modal"/);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join("\n");
  assert.doesNotMatch(scripts, /localStorage|supabase|generateWeeklyReport/i);
});

test("训练复盘只读：不调 Edge Function、不轮询、不在页面初始化时触发生成", () => {
  const src = read("src/lib/training-review.js");
  // 只读视图 + 公开 publishable key，没有任何生成入口
  assert.match(src, /training_reports_feed/);
  assert.match(src, /apikey: config\.anonKey/);
  assert.doesNotMatch(src, /functions\/v1|generateWeeklyReport|generate-weekly-report/);
  // 不轮询：不用 setInterval / setTimeout 重拉，也不做生成中的状态机
  assert.doesNotMatch(src, /setInterval|setTimeout|isPoll/);
  // 初始化只做一次「读」，同一次页面初始化 5 分钟内复用缓存
  const start = src.indexOf("export async function initTrainingReview");
  assert.ok(start >= 0, "training-review.js 应当导出 initTrainingReview");
  const initSource = src.slice(start, src.indexOf("\n}", start) + 2);
  assert.match(initSource, /CACHE_MS/);
  assert.doesNotMatch(initSource, /exportMarkdown|\.insert|upsert/i);
  // 同步层不再保留旧的生活报入口
  const sync = read("supabase-sync.js");
  assert.doesNotMatch(sync, /reportFunction|generateWeeklyReport|generate-weekly-report/);
});

test("Vue 应用提供本地备份入口并监听同源标签页数据变化", () => {
  const app = read("src/App.vue");
  assert.match(app, /id="backup-export"/);
  assert.match(app, /id="backup-import"/);
  const store = read("src/lib/store.js");
  assert.match(store, /addEventListener\("storage"/);
});
