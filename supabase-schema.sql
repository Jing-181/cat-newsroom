-- ============================================================
-- 猫咪生活报 · Supabase 数据表建表脚本
-- 在 Supabase Dashboard > SQL Editor 中执行此脚本
-- ============================================================

-- 1. 创建统一数据表（所有模块共用一张表，JSONB 存储字段）
CREATE TABLE IF NOT EXISTS workbench_records (
  id          BIGINT PRIMARY KEY,          -- 客户端生成的 Date.now() ID
  user_id     UUID NOT NULL DEFAULT auth.uid(),  -- 用户隔离
  module_key  TEXT NOT NULL,               -- 模块键名: todo/checkin/read/sport/money/note/hot
  data        JSONB NOT NULL DEFAULT '{}', -- 记录的完整 JSON 内容
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 用户隔离索引
CREATE INDEX IF NOT EXISTS idx_workbench_user_module ON workbench_records(user_id, module_key);

-- 3. 行级安全策略（RLS）：用户只能读写自己的数据
ALTER TABLE workbench_records ENABLE ROW LEVEL SECURITY;

-- 匿名用户策略（匿名登录后也能使用）
CREATE POLICY "anon_select_own" ON workbench_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "anon_insert_own" ON workbench_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "anon_update_own" ON workbench_records FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "anon_delete_own" ON workbench_records FOR DELETE USING (auth.uid() = user_id);

-- 4. 用户元数据表（头像、番茄钟统计等非记录型数据）
CREATE TABLE IF NOT EXISTS workbench_meta (
  user_id     UUID PRIMARY KEY DEFAULT auth.uid(),
  avatar      TEXT,                         -- 头像 base64 或 URL
  pomo_stats  JSONB DEFAULT '{"count":0,"min":0}',  -- 番茄钟统计
  trend_data  JSONB DEFAULT '[]',           -- 本周状态趋势
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workbench_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_select_own" ON workbench_meta FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meta_insert_own" ON workbench_meta FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meta_update_own" ON workbench_meta FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meta_delete_own" ON workbench_meta FOR DELETE USING (auth.uid() = user_id);

-- 5. 自动更新 updated_at 触发器
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

-- 6. 启用匿名认证（在 Dashboard > Authentication > Providers 中开启 Anonymous）
-- 完成后匿名用户会自动获得 auth.uid()，RLS 策略即可生效
