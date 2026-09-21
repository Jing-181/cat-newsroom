// 生成 AI 训练计划；AI key 只从 Supabase Secret 读取。
// 主链路 aixluv + 兜底 SU8；默认使用 gpt-5.5（codex-auto-review 等模型会被上游拒绝）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json = (body:unknown,status=200) => new Response(JSON.stringify(body), { status, headers:{...cors,"Content-Type":"application/json"} });
const dateOnly=(v:unknown)=>typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const addDays=(date:string,n:number)=>{ const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const validKey=(value:string|undefined)=>value?.trim() && /^[\x21-\x7E]+$/.test(value.trim()) ? value.trim() : "";
function prompt(preferences:unknown,recent:unknown[],days:number){ return `你是力量训练教练。只返回合法 JSON，不要 Markdown。基于训练原则摘要：渐进超负荷、复合动作优先、训练量与恢复平衡、RPE/保留次数只作为建议、增肌通常采用中等重复次数并避免力竭、训练日之间安排恢复。请生成 ${days} 天精简训练建议。偏好：${JSON.stringify(preferences)}。近期训练：${JSON.stringify(recent)}。输出 {"days":[{"day_index":1,"date":"YYYY-MM-DD","training_day":"chest","title":"","focus":"","exercises":[{"exercise_id":"","name":"","order":1,"sets":3,"reps":"8-12","rest_seconds":120,"intensity_hint":"RPE 7-8","rationale":""}],"notes":""}]}。只能使用常见力量训练动作，不能给出医学诊断、治疗或必须执行的极限重量。`; }

async function providerError(response:Response){ let detail=""; try{ const body=await response.clone().json(); const value=body?.error?.message||body?.error||body?.message; if(typeof value==="string") detail=value.slice(0,300); }catch(_){} return detail?`AI 请求失败：${response.status}：${detail}`:`AI 请求失败：${response.status}`; }
async function fetchWithTimeout(input:string,init:RequestInit={},timeoutMs=45000){ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs); try{ return await fetch(input,{...init,signal:controller.signal}); }catch(e){ if(e instanceof Error&&e.name==="AbortError") throw new Error("AI 服务请求超时，请稍后重试"); throw e; } finally{ clearTimeout(timer); } }

// 主链路 aixluv → 兜底 SU8（SU8 网关拒绝带 temperature 的请求，按兼容模式提交）
async function generate(preferences:unknown,recent:unknown[],days:number){
  type P=[string,string,string,number|undefined,number];
  const providers:P[] = [];
  const aixluvKey=validKey(Deno.env.get("AIXLUV_API_KEY"));
  if(aixluvKey) providers.push([aixluvKey,(Deno.env.get("AIXLUV_BASE_URL")?.trim()||"https://api.aixluv.com").replace(/\/+$/,""),Deno.env.get("AIXLUV_MODEL")?.trim()||"gpt-5.5",0.4,3]);
  const su8Key=validKey(Deno.env.get("SU8_API_KEY"));
  if(su8Key) providers.push([su8Key,(Deno.env.get("SU8_BASE_URL")?.trim()||"https://www.su8.codes").replace(/\/+$/,""),Deno.env.get("SU8_MODEL")?.trim()||"gpt-5.5",undefined,2]);
  if(!providers.length) throw new Error("未配置 AI 密钥（AIXLUV_API_KEY 或 SU8_API_KEY）");
  const messages=[{role:"system",content:"你是安全、克制、具体的力量训练教练。"},{role:"user",content:prompt(preferences,recent,days)}];
  let lastError:unknown=null;
  for(const [k,base,model,temperature,attempts] of providers){
    for(let attempt=1;attempt<=attempts;attempt++){
      try{
        const payload:Record<string,unknown>={model,stream:false,messages};
        if(temperature!==undefined) payload.temperature=temperature;
        const response=await fetchWithTimeout(`${base}/v1/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${k}`,"Content-Type":"application/json"},body:JSON.stringify(payload)},60000);
        if(!response.ok) throw new Error(await providerError(response));
        const data=await response.json();
        const content=data.choices?.[0]?.message?.content;
        if(!content) throw new Error("AI 返回为空");
        const clean=String(content).replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();
        return { data:JSON.parse(clean.slice(clean.indexOf("{"),clean.lastIndexOf("}")+1)), provider:base.includes("su8")?"su8":"aixluv", model };
      }catch(e){ lastError=e; console.error(`[workout-plan] provider ${base} 第 ${attempt} 次失败:`, e instanceof Error?e.message:e); }
    }
  }
  throw lastError instanceof Error?lastError:new Error("所有 AI 通道均失败");
}

Deno.serve(async request=>{
  if(request.method === "OPTIONS") return new Response("ok",{headers:cors});
  if(request.method !== "POST") return json({error:"仅支持 POST"},405);
  try {
    const auth=request.headers.get("Authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"");
    if(!token) return json({error:"缺少登录凭据"},401);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user},error}=await supabase.auth.getUser(token);
    if(error||!user) return json({error:"登录状态无效"},401);
    if(user.is_anonymous) return json({error:"请登录正式账号后生成训练计划"},403);
    const body=await request.json().catch(()=>({}));
    const preferences=body.preferences||{};
    const recent=Array.isArray(body.recent_workouts)?body.recent_workouts.filter((x:{status?:string;deleted_at?:string})=>x?.status!=="draft"&&!x?.deleted_at).slice(0,12):[];
    const start=dateOnly(body.start_date)||new Date().toISOString().slice(0,10);
    const {data:result,provider,model}=await generate(preferences,recent,6);
    const days=Array.isArray(result.days)?result.days.slice(0,6).map((day:any,index:number)=>({...day,day_index:index+1,date:dateOnly(day.date)||addDays(start,index),exercises:Array.isArray(day.exercises)?day.exercises.filter((x:any)=>x?.exercise_id||x?.name).slice(0,8):[]})):[];
    return json({plan:{generated_at:new Date().toISOString(),goal:preferences.goal||"hypertrophy",split:preferences.split||"three_day",days},meta:{model,provider,source_count:recent.length,generated_at:new Date().toISOString()}});
  } catch(error) { return json({error:error instanceof Error?error.message:"训练计划生成失败"},500); }
});
