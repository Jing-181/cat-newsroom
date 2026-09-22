// 生成每日一卡：AI 生成一段有趣文案 / 知识讲解 / 治愈金句，通用内容、轻量稳定、不依赖用户数据。
// AI key 只从 Supabase Secret 读取；主链路 aixluv + 兜底 SU8（失败自动切换）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

function supabaseApiKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const key = keys && typeof keys === "object" ? keys.default || Object.values(keys)[0] : null;
    if (typeof key === "string" && key.trim()) return key.trim();
  } catch (_) {
    // 环境变量格式异常时统一返回配置错误。
  }
  throw new Error("Supabase 公钥未配置");
}

async function providerError(response: Response, fallback: string) {
  let detail = "";
  try {
    const body = await response.clone().json();
    const value = body?.error?.message || body?.error || body?.message;
    if (typeof value === "string") detail = value.slice(0, 300);
  } catch (_) {
    // 非 JSON 响应不影响返回统一错误。
  }
  return detail ? `${fallback}：${detail}` : fallback;
}

// ---------- AI Provider 链（主链路失败自动切换兜底） ----------
const MODEL_PREFERENCE = ["gpt-5.5", "gpt-5.4", "gpt-5.2-chat-latest", "gpt-5.2", "gpt-5", "gpt-4o"];

type Provider = { name: string; key: string; base: string; model: string; temperature?: number; attempts: number };

function buildProviders(): Provider[] {
  const list: Provider[] = [];
  const aixluvKey = Deno.env.get("AIXLUV_API_KEY")?.trim();
  if (aixluvKey) {
    list.push({
      name: "aixluv",
      key: aixluvKey,
      base: (Deno.env.get("AIXLUV_BASE_URL")?.trim() || "https://api.aixluv.com").replace(/\/+$/, ""),
      model: Deno.env.get("AIXLUV_MODEL")?.trim() || "",
      temperature: 0.8,
      attempts: 3,
    });
  }
  const su8Key = Deno.env.get("SU8_API_KEY")?.trim();
  if (su8Key) {
    list.push({
      name: "su8",
      key: su8Key,
      base: (Deno.env.get("SU8_BASE_URL")?.trim() || "https://www.su8.codes").replace(/\/+$/, ""),
      model: Deno.env.get("SU8_MODEL")?.trim() || "gpt-5.5",
      attempts: 2, // SU8 网关拒绝带 temperature 的请求，按兼容模式提交
    });
  }
  if (!list.length) throw new Error("未配置 AI 密钥（AIXLUV_API_KEY 或 SU8_API_KEY）");
  return list;
}

async function pickModel(base: string, apiKey: string, configured: string) {
  if (configured) return configured;
  const response = await fetchWithTimeout(`${base}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, 15000);
  if (!response.ok) throw new Error(await providerError(response, `读取 AI 模型失败：${response.status}`));
  const body = await response.json();
  const ids = Array.isArray(body.data)
    ? body.data.map((x: { id?: string }) => x?.id).filter((id: unknown): id is string => typeof id === "string" && id.trim())
    : [];
  for (const candidate of MODEL_PREFERENCE) {
    if (ids.includes(candidate)) return candidate;
  }
  const anyChat = ids.find((id: string) => /chat|gpt|claude|gemini/i.test(id));
  return anyChat || ids[0];
}

async function generateWithAI(provider: Provider, model: string, style: string) {
  const styleHint: Record<string, string> = {
    funny: "写一段有趣、俏皮、让人会心一笑的文案",
    knowledge: "写一个简短、准确的知识讲解或冷知识",
    quote: "写一句治愈或激励的中文金句",
  };
  const hint = styleHint[style] || "从「有趣文案、知识讲解、治愈金句、冷知识」中随机选一种风格";
  const payload: Record<string, unknown> = {
    model,
    stream: false,
    messages: [
      { role: "system", content: "你是「猫咪生活报」的每日一卡栏目编辑，笔风轻松、克制、治愈。只返回合法 JSON，不要 Markdown。输出字段：type（知识/趣味/金句）、title（栏目小标题，8 字内）、content（一段 60-130 字的中文正文）。知识类内容必须准确、不编造；普通趣味文案要生动不油腻。" },
      { role: "user", content: `请生成今天的每日一卡。要求：${hint}。` },
    ],
  };
  if (provider.temperature !== undefined) payload.temperature = provider.temperature;
  const response = await fetchWithTimeout(`${provider.base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 60000);
  if (!response.ok) throw new Error(await providerError(response, `AI 请求失败：${response.status}`));
  const body = await response.json();
  const rawContent = body.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part: { text?: unknown }) => typeof part?.text === "string" ? part.text : "").join("")
    : rawContent;
  if (!content) throw new Error("AI 返回为空");
  const clean = String(content).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(clean);
  } catch (_) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 返回格式无效");
    parsed = JSON.parse(clean.slice(start, end + 1));
  }
  parsed.type ||= "趣味";
  parsed.title ||= "每日一卡";
  parsed.content ||= "";
  return parsed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "生成失败";
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("AI 服务请求超时，请检查上游服务或稍后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "仅支持 POST" }, 405);
  // 内容通用、不依赖用户数据：仅要求 apikey（或 Authorization）存在即可调用，保持轻量稳定。
  const hasCredential = !!request.headers.get("apikey") || !!request.headers.get("Authorization");
  if (!hasCredential) return json({ error: "缺少调用凭据" }, 401);
  try {
    const body = await request.json().catch(() => ({}));
    const style = String(body.style || "").trim();
    const providers = buildProviders();
    let lastError: unknown = null;
    let item: Record<string, unknown> | null = null;
    let usedProvider = "";
    let usedModel = "";
    for (const provider of providers) {
      const model = await pickModel(provider.base, provider.key, provider.model).catch((error) => { lastError = error; return ""; });
      for (let attempt = 1; attempt <= provider.attempts; attempt++) {
        if (!model) break;
        try {
          item = await generateWithAI(provider, model, style);
          usedProvider = provider.name;
          usedModel = model;
          break;
        } catch (error) {
          lastError = error;
          console.error(`[daily-copy] provider ${provider.name} 第 ${attempt} 次失败:`, error instanceof Error ? error.message : error);
        }
      }
      if (item !== null) break;
    }
    if (item === null) throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));
    return json({ item, meta: { model: usedModel, provider: usedProvider, generated_at: new Date().toISOString() } });
  } catch (error) {
    console.error("[daily-copy]", error);
    return json({ error: errorMessage(error) }, 500);
  }
});
