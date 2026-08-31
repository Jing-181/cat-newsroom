// 生成每周 AI 生活报；AI key 只从 Supabase Secret 读取。
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

function dateOnly(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStartFor(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function trimRecord(value: Record<string, unknown>) {
  const exercises = Array.isArray(value.exercises) ? value.exercises as Array<Record<string, unknown>> : [];
  const completedSets = exercises.flatMap(exercise => Array.isArray(exercise.sets) ? exercise.sets as Array<Record<string, unknown>> : [])
    .filter(set => set.completed === true);
  const workout = value.kind === "workout_session" ? {
    training_day: value.training_day,
    duration_min: value.duration_min,
    exercise_count: exercises.length,
    exercise_names: exercises.map(exercise => String(exercise.name || "")).filter(Boolean),
    set_count: completedSets.length,
    reps: completedSets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
    volume_kg: completedSets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0),
  } : undefined;
  return {
    id: value.id,
    title: String(value.title || ""),
    type: value.type,
    done: value.done,
    current: value.current,
    target: value.target,
    unit: value.unit,
    category: value.category,
    amount: value.amount,
    mood: value.mood,
    date: value.date,
    note: String(value.note || "").slice(0, 500),
    content: String(value.content || "").slice(0, 800),
    log: value.log,
    workout,
  };
}

function buildSnapshot(rows: Array<{ module_key: string; data: Record<string, unknown>; deleted_at?: string | null }>, start: string, end: string) {
  const modules: Record<string, unknown[]> = {};
  rows.forEach(row => {
    if (row.deleted_at || row.data?.status === "draft") return;
    const item = trimRecord(row.data || {});
    const date = typeof item.date === "string" ? item.date : "";
    const inRange = !date || (date >= start && date <= end);
    if (inRange) (modules[row.module_key] ||= []).push(item);
  });
  const all = Object.values(modules).flat() as Array<Record<string, unknown>>;
  const expenses = all.filter(x => x.type === "expense").reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const income = all.filter(x => x.type === "income").reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const todos = (modules.todo || []) as Array<Record<string, unknown>>;
  const done = todos.filter(x => x.done).length;
  return {
    week_start: start,
    week_end: end,
    modules,
    summary: {
      record_count: all.length,
      todo_done: done,
      todo_total: todos.length,
      income,
      expenses,
      balance: income - expenses,
    },
  };
}

async function chooseModel(apiKey: string) {
  const configured = Deno.env.get("AIXLUV_MODEL");
  if (configured) return configured;
  const response = await fetch("https://api.aixluv.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error("无法读取 AI 模型列表");
  const body = await response.json();
  const ids = Array.isArray(body.data) ? body.data.map((x: { id?: string }) => x.id).filter(Boolean) : [];
  return ids.find((id: string) => /gpt|claude|gemini/i.test(id)) || ids[0];
}

async function generateWithAI(apiKey: string, model: string, snapshot: unknown) {
  const response = await fetch("https://api.aixluv.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: "你是温柔、具体、克制的生活报主编。只返回合法 JSON，不要 Markdown。输出字段必须是 daily、review、editor_note。daily 是 7 项数组，每项包含 date、title、summary、quote、reminder。review 包含 overview、highlights、unfinished、suggestions。" },
        { role: "user", content: `请根据以下本周数据生成七日生活报和周复盘。不要编造数据；没有数据的日期写成轻量的鼓励。数据：${JSON.stringify(snapshot)}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI 请求失败：${response.status}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空");
  const clean = String(content).replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "仅支持 POST" }, 405);
  let activeUserId: string | null = null;
  let activeWeekStart: string | null = null;
  let dbClient: ReturnType<typeof createClient> | null = null;
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "缺少登录凭据" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    dbClient = supabase;
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "登录状态无效" }, 401);
    if (user.is_anonymous) return json({ error: "请登录正式账号后生成 AI 生活报" }, 403);
    activeUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);
    const start = weekStartFor(dateOnly(body.week_start) || today);
    const end = addDays(start, 6);
    activeWeekStart = start;
    const force = body.force === true;
    const { data: existing } = await supabase.from("weekly_reports").select("*").eq("user_id", user.id).eq("week_start", start).maybeSingle();
    if (existing && !force && existing.status === "ready") return json({ report: existing.payload, meta: existing });
    if (existing && !force && existing.status === "generating") return json({ status: "generating", meta: existing }, 202);
    if (existing && !force && existing.status === "error") return json({ status: "error", error: existing.error || "上次生成失败", meta: existing }, 409);
    // 非强制生成使用忽略冲突插入，只有真正插入的一方负责调用模型。
    if (!force) {
      const { data: claimed, error: claimError } = await supabase.from("weekly_reports")
        .upsert({ user_id: user.id, week_start: start, week_end: end, status: "generating", payload: {}, source_snapshot: {} }, { onConflict: "user_id,week_start", ignoreDuplicates: true })
        .select("*").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        const { data: locked } = await supabase.from("weekly_reports").select("*").eq("user_id", user.id).eq("week_start", start).maybeSingle();
        return json({ status: "generating", meta: locked }, 202);
      }
    } else {
      const { error: lockError } = await supabase.from("weekly_reports").upsert({ user_id: user.id, week_start: start, week_end: end, status: "generating", payload: {}, source_snapshot: {} }, { onConflict: "user_id,week_start" });
      if (lockError) throw lockError;
    }

    const { data: rows, error: rowsError } = await supabase.from("workbench_records").select("module_key,data,deleted_at").eq("user_id", user.id);
    if (rowsError) throw rowsError;
    const snapshot = buildSnapshot(rows || [], start, end);
    const apiKey = Deno.env.get("AIXLUV_API_KEY");
    if (!apiKey) throw new Error("未配置 AIXLUV_API_KEY");
    const model = await chooseModel(apiKey);
    const report = await generateWithAI(apiKey, model, snapshot);
    const { error: saveError } = await supabase.from("weekly_reports").update({ status: "ready", payload: report, source_snapshot: snapshot, model, generated_at: new Date().toISOString(), error: null }).eq("user_id", user.id).eq("week_start", start);
    if (saveError) throw saveError;
    return json({ report, meta: { week_start: start, week_end: end, model, generated_at: new Date().toISOString() } });
  } catch (error) {
    console.error("[weekly-report]", error);
    if (activeUserId && activeWeekStart) {
      await dbClient?.from("weekly_reports").update({ status: "error", error: error instanceof Error ? error.message : "生成失败" }).eq("user_id", activeUserId).eq("week_start", activeWeekStart);
    }
    return json({ error: error instanceof Error ? error.message : "生成失败" }, 500);
  }
});
