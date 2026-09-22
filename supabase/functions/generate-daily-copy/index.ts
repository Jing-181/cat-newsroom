// 每日一卡批次生成：一次生成 N 条（7/14）有趣文案/知识/金句，存入 daily_cards，供首页顺序循环轮换。
// 仅正式账号可调用；读取不经过本函数（前端直接查表）。AI key 只从 Supabase Secret 读取。
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
      temperature: 0.85,
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

async function generateBatch(provider: Provider, model: string, count: number) {
  const payload: Record<string, unknown> = {
    model,
    stream: false,
    messages: [
      { role: "system", content: `你是「猫咪生活报」的每日一卡栏目编辑，笔风轻松、克制、治愈。只返回合法 JSON，不要 Markdown。输出字段：items（数组，恰好 ${count} 个对象，每个对象含 type（知识/趣味/金句）、title（栏目小标题，8 字内）、content（一段 60-130 字的中文正文））。${count} 条内容互不重复、风格尽量多样（知识、趣味、金句混合穿插）。知识类内容必须准确、不编造；普通趣味文案要生动不油腻。` },
      { role: "user", content: `请一次生成 ${count} 条每日一卡文案，组成一整周的轮换内容。` },
    ],
  };
  if (provider.temperature !== undefined) payload.temperature = provider.temperature;
  const response = await fetchWithTimeout(`${provider.base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 90000);
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
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = items.slice(0, count).map((item: Record<string, unknown>, index: number) => ({
    type: String(item?.type || "趣味").slice(0, 8),
    title: String(item?.title || `每日一卡 ${index + 1}`).slice(0, 16),
    content: String(item?.content || "").slice(0, 300),
  }));
  if (!normalized.length) throw new Error("AI 返回内容为空");
  return normalized;
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
  let activeUserId: string | null = null;
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "缺少登录凭据" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, supabaseApiKey(), { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "登录状态无效" }, 401);
    if (user.is_anonymous) return json({ error: "请登录正式账号后生成每日一卡" }, 403);
    activeUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const rawCount = Number(body.count);
    const count = rawCount === 14 ? 14 : 7; // 首页首批 7 条，个人配置页重新生成 14 条

    // 生成中锁
    await supabase.from("daily_cards").upsert({ user_id: user.id, item_count: 0, items: [], status: "generating", error: null }, { onConflict: "user_id" });

    const providers = buildProviders();
    let lastError: unknown = null;
    let items: Array<Record<string, unknown>> | null = null;
    let usedProvider = "";
    let usedModel = "";
    for (const provider of providers) {
      const model = await pickModel(provider.base, provider.key, provider.model).catch((error) => { lastError = error; return ""; });
      for (let attempt = 1; attempt <= provider.attempts; attempt++) {
        if (!model) break;
        try {
          items = await generateBatch(provider, model, count);
          usedProvider = provider.name;
          usedModel = model;
          break;
        } catch (error) {
          lastError = error;
          console.error(`[daily-copy] provider ${provider.name} 第 ${attempt} 次失败:`, error instanceof Error ? error.message : error);
        }
      }
      if (items !== null) break;
    }
    if (items === null) throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));

    const now = new Date().toISOString();
    const { error: saveError } = await supabase.from("daily_cards")
      .update({ item_count: items.length, items, status: "ready", model: usedModel, provider: usedProvider, generated_at: now, error: null })
      .eq("user_id", user.id);
    if (saveError) throw saveError;
    return json({ items, count: items.length, meta: { model: usedModel, provider: usedProvider, generated_at: now } });
  } catch (error) {
    console.error("[daily-copy]", error);
    const message = errorMessage(error);
    if (activeUserId) {
      try {
        const markClient = createClient(Deno.env.get("SUPABASE_URL")!, supabaseApiKey(), {
          global: { headers: { Authorization: `Bearer ${request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || ""}` } },
        });
        await markClient.from("daily_cards").update({ status: "error", error: message }).eq("user_id", activeUserId);
      } catch (markError) {
        console.error("[daily-copy] 标记失败状态时出错:", markError);
      }
    }
    return json({ error: message }, 500);
  }
});
