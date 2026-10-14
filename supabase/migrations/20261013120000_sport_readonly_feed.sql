-- 只读运动数据出口：public.sport_feed
-- ============================================================
-- 给个人志（jing-portfolio）的构建读。用公开的 publishable key 即可，
-- 不需要任何秘密密钥，所以它的 CI 里不用放 SUPABASE_KEY。
--
-- 为什么是视图，而不是「换一把只读 key」：
--   Supabase 只有两档 key —— publishable（公开、受 RLS 限制）与
--   secret（service-role，可读写全库），没有现成的只读 key。
--   基表的 RLS 策略是 auth.uid() = user_id，公开/匿名都读不到任何行；
--   所以这里用一个视图，把「只读、只给 sport」一次做完。
--
-- 口径：按 Jing 的决定，data 原文照出，含手写备注。这条视图是公开读的，
-- 所以备注也会公开；若要收回，把 data 换成 (data - 'note') 那一套即可。
--
-- security_invoker = false：视图以创建者（postgres）身份执行，绕开基表 RLS，
-- 由 WHERE 里固定的 user_id 兜底。只授 anon SELECT，别的一律不给。
-- Supabase 的 linter 会对 security definer 视图报警，此处是刻意为之。
--
-- 执行：Supabase SQL Editor 直接跑，或 supabase db push。
-- 建完后 PostgREST 需要重载一次 schema（脚本末尾已带）。

create or replace view public.sport_feed
with (security_invoker = false) as
select
  r.id,
  r.updated_at,
  r.data
from workbench_records r
where r.module_key = 'sport'
  and r.deleted_at is null
  and r.user_id = '98468eac-04e1-49cd-b0c6-4ec34f3cb653';

comment on view public.sport_feed is
  '只读：sport 记录原文（含备注），供 jing-portfolio 构建读取';

grant select on public.sport_feed to anon, authenticated;

notify pgrst, 'reload schema';
