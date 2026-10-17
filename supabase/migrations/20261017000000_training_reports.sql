-- 训练周复盘的云端存储与只读出口
-- ============================================================
-- 周复盘由 Hana 的定时任务（每周一 07:30）生成，落一份 markdown 到
-- OH-媒体库/training-reviews/，同时把结构化 payload upsert 到这里，
-- cat-newsroom 前端直接读，不做第二次生成。
--
-- 与 20261013120000_sport_readonly_feed.sql 同构：
--   security_invoker = false，视图以创建者（postgres）身份执行，绕开基表 RLS，
--   由 WHERE 里固定的 user_id 兜底；只授 anon SELECT，别的一律不给。
--   Supabase 的 linter 会对 security definer 视图报警，此处是刻意为之。
--
-- 为什么不走 git 自动提交：仓库是公开的，每周推一次训练数据既污染提交历史，
-- 也把身体数据写进公开记录；数据库这条路的暴露面与 sport_feed 一致。
--
-- 口径：payload 的数值来自 sport_feed 的原始记录，算法在 Hana 侧；
-- 本表只存结果，不参与计算。
--
-- 执行：Supabase SQL Editor 直接跑，或 supabase db push。
-- 建完后 PostgREST 需要重载一次 schema（脚本末尾已带）。

create table if not exists public.training_reports (
  user_id      uuid not null default auth.uid(),
  week_start   date not null,
  week_end     date not null,
  -- 结构化结果，供前端渲染：{ conclusion, metrics[], sections[], suggestions[] }
  payload      jsonb not null default '{}',
  -- 归档原文，供导出与校对
  markdown     text not null default '',
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.training_reports enable row level security;

drop policy if exists "training_reports_all_own" on public.training_reports;
create policy "training_reports_all_own" on public.training_reports
  for all to authenticated
  using (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

grant select, insert, update, delete on public.training_reports to authenticated;

drop trigger if exists trg_training_reports_updated on public.training_reports;
create trigger trg_training_reports_updated
  before update on public.training_reports
  for each row execute function public.update_updated_at();

-- 只读出口：anon 可读，前端用现有的 publishable key 即可，无需登录态
create or replace view public.training_reports_feed
with (security_invoker = false) as
select
  week_start,
  week_end,
  payload,
  markdown,
  generated_at,
  updated_at
from public.training_reports
where user_id = '98468eac-04e1-49cd-b0c6-4ec34f3cb653';

comment on view public.training_reports_feed is
  '只读：训练周复盘，供 cat-newsroom 前端无密钥读取';

grant select on public.training_reports_feed to anon, authenticated;

notify pgrst, 'reload schema';
