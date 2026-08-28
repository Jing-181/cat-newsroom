-- ============================================================
-- 猫咪生活报 · Supabase 数据表建表脚本 v2
-- 修复 RLS 策略 + 简化权限模型
-- 在 Supabase Dashboard > SQL Editor 中执行此脚本
-- ============================================================

-- 1. 创建统一数据表
CREATE TABLE IF NOT EXISTS workbench_records (
  id          BIGINT PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  module_key  TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workbench_user_module ON workbench_records(user_id, module_key);

-- 2. 用户元数据表
CREATE TABLE IF NOT EXISTS workbench_meta (
  user_id     UUID PRIMARY KEY DEFAULT auth.uid(),
  avatar      TEXT,
  pomo_stats  JSONB DEFAULT '{"count":0,"min":0}',
  trend_data  JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 重建 RLS 策略（先删旧策略再建新的，避免冲突）
ALTER TABLE workbench_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_meta ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "anon_select_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_insert_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_update_own" ON workbench_records;
DROP POLICY IF EXISTS "anon_delete_own" ON workbench_records;
DROP POLICY IF EXISTS "meta_select_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_insert_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_update_own" ON workbench_meta;
DROP POLICY IF EXISTS "meta_delete_own" ON workbench_meta;

-- 新策略：用 auth.uid() IS NOT NULL 确保登录用户才能操作，且只能操作自己的数据
CREATE POLICY "records_all" ON workbench_records
  FOR ALL USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "meta_all" ON workbench_meta
  FOR ALL USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- 4. 自动更新触发器
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
