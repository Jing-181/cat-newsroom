-- 同步底座与 AI 周报迁移；执行前请备份 workbench_records。
ALTER TABLE IF EXISTS public.workbench_records ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE IF EXISTS public.workbench_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workbench_records_pkey') THEN
    ALTER TABLE public.workbench_records DROP CONSTRAINT workbench_records_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workbench_records_user_id_id_key') THEN
    ALTER TABLE public.workbench_records ADD CONSTRAINT workbench_records_user_id_id_key PRIMARY KEY (user_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  user_id UUID NOT NULL DEFAULT auth.uid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'error')),
  payload JSONB NOT NULL DEFAULT '{}',
  source_snapshot JSONB NOT NULL DEFAULT '{}',
  model TEXT,
  generated_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE public.workbench_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workbench_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "records_all" ON public.workbench_records;
DROP POLICY IF EXISTS "meta_all" ON public.workbench_meta;
DROP POLICY IF EXISTS "anon_select_own" ON public.workbench_records;
DROP POLICY IF EXISTS "anon_insert_own" ON public.workbench_records;
DROP POLICY IF EXISTS "anon_update_own" ON public.workbench_records;
DROP POLICY IF EXISTS "anon_delete_own" ON public.workbench_records;
DROP POLICY IF EXISTS "meta_select_own" ON public.workbench_meta;
DROP POLICY IF EXISTS "meta_insert_own" ON public.workbench_meta;
DROP POLICY IF EXISTS "meta_update_own" ON public.workbench_meta;
DROP POLICY IF EXISTS "meta_delete_own" ON public.workbench_meta;
DROP POLICY IF EXISTS "reports_all_own" ON public.weekly_reports;

CREATE POLICY "records_all" ON public.workbench_records FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY "meta_all" ON public.workbench_meta FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY "reports_all_own" ON public.weekly_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  WITH CHECK (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workbench_records, public.workbench_meta TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reports TO authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workbench_records_updated ON public.workbench_records;
CREATE TRIGGER trg_workbench_records_updated
  BEFORE UPDATE ON public.workbench_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_workbench_meta_updated ON public.workbench_meta;
CREATE TRIGGER trg_workbench_meta_updated
  BEFORE UPDATE ON public.workbench_meta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_reports_updated ON public.weekly_reports;
CREATE TRIGGER trg_weekly_reports_updated
  BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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
