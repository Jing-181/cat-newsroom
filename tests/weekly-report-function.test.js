// 周报云函数补历史周能力的关键逻辑回归检查（静态断言，Deno 函数无法在 Node 直接执行）
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fn = fs.readFileSync(path.join(root, "supabase/functions/generate-weekly-report/index.ts"), "utf8");

test("list 接口返回最早记录周并纳入生成失败与生成中状态", () => {
  assert.match(fn, /earliest_week_start/);
  assert.match(fn, /\.in\("status", \["ready", "error", "generating"\]\)/);
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
