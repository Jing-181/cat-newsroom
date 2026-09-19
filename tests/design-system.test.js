const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("两个 workbench 使用共享主题和组件样式", () => {
  const theme = read("css/theme.css");
  assert.match(theme, /--page-bg:\s*#f3ecd9/);
  assert.match(theme, /--page-texture:\s*url\("\.\.\/assets\/paper-texture\.jpg"\)/);
  for (const file of ["workbench-desktop.html", "workbench-mobile.html"]) {
    const html = read(file);
    assert.match(html, /href="css\/theme\.css"/);
    assert.match(html, /href="css\/components\.css"/);
    assert.equal((html.match(/:root\s*\{/g) || []).length, 0, `${file} should not own theme tokens`);
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

test("周报不会在页面初始化时自动请求或重绘运动页面", () => {
  for (const file of ["workbench-desktop.html", "workbench-mobile.html"]) {
    const html = read(file);
    assert.doesNotMatch(html, /if\(user\s*&&\s*!user\.is_anonymous\)\s*maybeGenerateWeeklyReport\(false\)/);
    assert.match(html, /function refreshWeeklyReportSlot\(\)/);
    assert.match(html, /weeklyReportTimer/);
    assert.match(html, /id=["']report-login["']/);
  }
});

test("两端提供本地备份入口并监听同源标签页数据变化", () => {
  for (const file of ["workbench-desktop.html", "workbench-mobile.html"]) {
    const html = read(file);
    assert.match(html, /js\/data-backup\.js/);
    assert.match(html, /id="backup-export"/);
    assert.match(html, /id="backup-import"/);
    assert.match(html, /addEventListener\("storage"/);
  }
});
