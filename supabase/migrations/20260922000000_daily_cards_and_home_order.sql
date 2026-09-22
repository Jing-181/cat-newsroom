-- ============================================================
-- 每日一卡批次 + 首页排序配置
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

-- 1. 每日一卡批次表：每用户一行，保存当前一批文案（7 或 14 条），顺序循环轮换
CREATE TABLE IF NOT EXISTS daily_cards (
  user_id        UUID PRIMARY KEY DEFAULT auth.uid(),
  item_count     INTEGER NOT NULL DEFAULT 0,
  items          JSONB NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'error')),
  model          TEXT,
  generated_at   TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_cards_all_own" ON daily_cards;
CREATE POLICY "daily_cards_all_own" ON daily_cards
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON daily_cards TO authenticated;

-- 2. 首页排序配置列：复用 workbench_meta（每用户一行，home_order 存卡片 key 数组）
ALTER TABLE workbench_meta ADD COLUMN IF NOT EXISTS home_order JSONB DEFAULT '[]';

-- 3. 开启 daily_cards 的跨设备实时通知
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.oid = 'daily_cards'::regclass
    ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE daily_cards; END IF;
  END IF;
END $$;
