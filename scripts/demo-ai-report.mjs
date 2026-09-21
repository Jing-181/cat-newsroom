// 本地 AI 周报生成 demo：复刻 Edge Function 的完整链路（选模型 → chat → 解析 JSON）
// 网络层使用 curl（本机 node fetch 与部分代理网络不兼容；curl 与生产 Deno 网络行为更接近）
// 密钥从环境变量或项目根目录 .env.local 读取（.env.local 已被 gitignore，不会提交）
// 运行：node scripts/demo-ai-report.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 加载 .env.local（若存在）
try {
  for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
    const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch (_) { /* 无 .env.local 时仅用环境变量 */ }

const MODEL_PREFERENCE = ["gpt-5.5", "gpt-5.4", "gpt-5.2-chat-latest", "gpt-5.2", "gpt-5", "gpt-4o"];

async function curlJson(url, headers, body, timeoutSec = 60) {
  const args = ["-sS", "--max-time", String(timeoutSec), "-w", "\n%{http_code}", url];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  if (body) args.push("-d", JSON.stringify(body));
  let stdout = "";
  try {
    ({ stdout } = await exec("curl", args, { maxBuffer: 10 * 1024 * 1024 }));
  } catch (e) {
    throw new Error(`网络请求失败：${e.stderr?.trim() || e.message}`);
  }
  const newline = stdout.lastIndexOf("\n");
  const code = Number(stdout.slice(newline + 1).trim());
  const text = stdout.slice(0, newline);
  if (code !== 200) {
    let detail = "";
    try { detail = JSON.parse(text).error?.message || ""; } catch (_) { /* ignore */ }
    throw new Error(`AI 请求失败：${code}${detail ? "：" + detail : ""}`);
  }
  return JSON.parse(text);
}

async function pickModel(base, apiKey, configured) {
  if (configured) return configured;
  const body = await curlJson(`${base}/v1/models`, { Authorization: `Bearer ${apiKey}` }, null, 15);
  const ids = (body.data || []).map((x) => x?.id).filter((id) => typeof id === "string" && id.trim());
  for (const c of MODEL_PREFERENCE) if (ids.includes(c)) return c;
  return ids.find((id) => /chat|gpt|claude|gemini/i.test(id)) || ids[0];
}

function snapshot() {
  return {
    week_start: "2026-09-14", week_end: "2026-09-20",
    modules: {
      todo: [
        { id: "t1", title: "整理周报模板", type: "todo", done: true, date: "2026-09-15" },
        { id: "t2", title: "预约牙医", type: "todo", done: false, date: "2026-09-17" },
      ],
      checkin: [{ id: "c1", title: "晨跑", type: "checkin", done: true, current: 4, target: 5, unit: "次", date: "2026-09-16" }],
      note: [{ id: "n1", title: "灵感", content: "周末去看了新开的书店，想写一篇随笔。", date: "2026-09-19" }],
    },
    summary: { record_count: 4, todo_done: 1, todo_total: 2, income: 0, expenses: 0, balance: 0, note_count: 1, checkin_count: 1, workout_count: 0 },
  };
}

async function generateWithAI(base, apiKey, model, data, temperature) {
  const payload = {
    model, stream: false,
    messages: [
      { role: "system", content: "你是温柔、具体、克制的生活报主编与分析师。只返回合法 JSON，不要 Markdown。输出字段必须是 daily、review、insight、editor_note。daily 是 7 项数组，每项包含 date、title、summary、quote、reminder。review 包含 overview、highlights、unfinished、suggestions。insight 包含 patterns、risks、next_actions。所有结论都必须基于输入数据，不要编造。" },
      { role: "user", content: `请根据以下本周数据生成七日生活报、周复盘和分析洞察。不要编造数据；没有数据的日期写成轻量的鼓励。数据：${JSON.stringify(data)}` },
    ],
  };
  if (temperature !== undefined) payload.temperature = temperature;
  const body = await curlJson(`${base}/v1/chat/completions`, { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, payload, 90);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空");
  const clean = String(content).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch (_) {
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("AI 返回格式无效");
    parsed = JSON.parse(clean.slice(s, e + 1));
  }
  return parsed;
}

const providers = [];
const aixluvKey = process.env.AIXLUV_API_KEY?.trim();
if (aixluvKey) providers.push({ name: "aixluv", key: aixluvKey, base: (process.env.AIXLUV_BASE_URL?.trim() || "https://api.aixluv.com").replace(/\/+$/, ""), model: process.env.AIXLUV_MODEL?.trim() || "", temperature: 0.6, attempts: 3 });
const su8Key = process.env.SU8_API_KEY?.trim();
if (su8Key) providers.push({ name: "su8", key: su8Key, base: (process.env.SU8_BASE_URL?.trim() || "https://www.su8.codes").replace(/\/+$/, ""), model: process.env.SU8_MODEL?.trim() || "gpt-5.5", temperature: undefined, attempts: 2 });

if (!providers.length) {
  console.log("未配置任何密钥：请在项目根目录创建 .env.local（参考 scripts/demo-ai-report.mjs 注释）或设置环境变量。");
  process.exit(1);
}

console.log(`共 ${providers.length} 条 AI 通道：${providers.map(p => p.name).join(" → ")}\n`);
let lastError = null;
for (const p of providers) {
  for (let attempt = 1; attempt <= p.attempts; attempt++) {
    try {
      const model = await pickModel(p.base, p.key, p.model);
      console.log(`[${p.name}] 使用模型 ${model}，生成中…`);
      const report = await generateWithAI(p.base, p.key, model, snapshot(), p.temperature);
      console.log(`[${p.name}] ✅ 成功（${model}）`);
      console.log(`  editor_note: ${(report.editor_note || "").slice(0, 80)}`);
      console.log(`  daily: ${(report.daily || []).length} 天 | review.highlights: ${(report.review?.highlights || []).length} 条 | insight.patterns: ${(report.insight?.patterns || []).length} 条`);
      console.log(`  review: ${JSON.stringify(report.review).slice(0, 160)}`);
      console.log(`  insight: ${JSON.stringify(report.insight).slice(0, 160)}`);
      process.exit(0);
    } catch (e) {
      lastError = e;
      console.log(`[${p.name}] 第 ${attempt} 次 ❌ 失败：${e.message}`);
    }
  }
  console.log("");
}
console.log(`所有通道均失败：${lastError?.message || "未知错误"}`);
process.exit(1);
