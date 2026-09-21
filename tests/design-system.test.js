const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
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

test("周报只在用户点击或轮询时生成，不在页面初始化时自动请求", () => {
  const src = read("src/lib/weekly-report.js");
  assert.match(src, /if \(!force && !isPoll\) return;/);
  assert.match(src, /maybeGenerateWeeklyReport\(false, true\)/);
  assert.match(src, /weeklyReportPolls < 4/);
});

test("Vue 应用提供本地备份入口并监听同源标签页数据变化", () => {
  const app = read("src/App.vue");
  assert.match(app, /id="backup-export"/);
  assert.match(app, /id="backup-import"/);
  const store = read("src/lib/store.js");
  assert.match(store, /addEventListener\("storage"/);
});
