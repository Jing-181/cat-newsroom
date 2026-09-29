// 周报云函数补历史周能力的关键逻辑回归检查（静态断言，Deno 函数无法在 Node 直接执行）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fn = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/generate-weekly-report/index.ts"), "utf8");

test("list 接口返回最早记录周并纳入生成失败状态", () => {
  assert.match(fn, /earliest_week_start/);
  assert.match(fn, /\.in\("status", \["ready", "error"\]\)/);
  assert.match(fn, /order\("created_at", \{ ascending: true \}\)\.limit\(1\)/);
});

test("generate 拒绝生成未来周的生活报", () => {
  assert.match(fn, /start > weekStartFor\(today\)/);
  assert.match(fn, /不能生成未来周的生活报/);
});

test("快照构建按创建时间归属无日期记录，避免跨周重复", () => {
  assert.match(fn, /\.select\("module_key,data,deleted_at,created_at"\)/);
  assert.match(fn, /inRange = date \? \(date >= start && date <= end\) : \(createdAt >= start && createdAt <= end\)/);
});
