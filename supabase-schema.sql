-- ============================================================
-- 猫咪生活报 · Supabase 数据表建表脚本 v2
-- 修复 RLS 策略 + 简化权限模型
-- 在 Supabase Dashboard > SQL Editor 中执行此脚本
-- ============================================================

-- 1. 创建统一数据表
CREATE TABLE IF NOT EXISTS workbench_records (
  id          TEXT NOT NULL,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  module_key  TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE workbench_records ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE workbench_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 兼容旧表：记录 ID 只在用户范围内唯一，避免不同用户互相覆盖。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workbench_records_pkey') THEN
    ALTER TABLE workbench_records DROP CONSTRAINT workbench_records_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workbench_records_user_id_id_key') THEN
    ALTER TABLE workbench_records ADD CONSTRAINT workbench_records_user_id_id_key PRIMARY KEY (user_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workbench_user_module ON workbench_records(user_id, module_key);

-- 3. 每周 AI 生活报
CREATE TABLE IF NOT EXISTS weekly_reports (
  user_id        UUID NOT NULL DEFAULT auth.uid(),
  week_start     DATE NOT NULL,
  week_end       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'error')),
  payload        JSONB NOT NULL DEFAULT '{}',
  source_snapshot JSONB NOT NULL DEFAULT '{}',
  model          TEXT,
  generated_at   TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

-- 2. 用户元数据表
CREATE TABLE IF NOT EXISTS workbench_meta (
  user_id     UUID PRIMARY KEY DEFAULT auth.uid(),
  avatar      TEXT,
  pomo_stats  JSONB DEFAULT '{"count":0,"min":0}',
  trend_data  JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 重建 RLS 策略（先删旧策略再建新的，避免冲突）
ALTER TABLE workbench_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "anon_select_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_insert_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_update_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_delete_own" ON workbench_records;
DROP POLICY IF EXISTS "meta_select_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_insert_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_update_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_delete_own" ON workbench_meta;
DROP POLICY IF EXISTS "reports_all_own" ON weekly_reports;

-- 新策略：用 auth.uid() IS NOT NULL 确保登录用户才能操作，且只能操作自己的数据
CREATE POLICY "records_all" ON workbench_records
  FOR ALL USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "meta_all" ON workbench_meta
  FOR ALL USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "reports_all_own" ON weekly_reports
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON workbench_records, workbench_meta TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_reports TO authenticated;

-- 5. 自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workbench_records_updated ON workbench_records;
CREATE TRIGGER trg_workbench_records_updated
  BEFORE UPDATE ON workbench_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_workbench_meta_updated ON workbench_meta;
CREATE TRIGGER trg_workbench_meta_updated
  BEFORE UPDATE ON workbench_meta
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_reports_updated ON weekly_reports;
CREATE TRIGGER trg_weekly_reports_updated
  BEFORE UPDATE ON weekly_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 开启记录与周报的跨设备实时通知。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.oid = 'workbench_records'::regclass
    ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE workbench_records; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.oid = 'workbench_meta'::regclass
    ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE workbench_meta; END IF;
  END IF;
END $$;
