CREATE TABLE IF NOT EXISTS kho_daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name TEXT NOT NULL,
  entry_date DATE NOT NULL,
  week_label TEXT,
  thanh_pham_total INTEGER DEFAULT 0,
  hang_gui_vp_total INTEGER DEFAULT 0,
  xuat_kho_total INTEGER DEFAULT 0,
  thu_hoi_total INTEGER DEFAULT 0,
  other_total INTEGER DEFAULT 0,
  thu_hoi_details JSONB DEFAULT '[]'::jsonb,
  other_tasks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(person_name, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_kho_daily_person ON kho_daily_records(person_name);
CREATE INDEX IF NOT EXISTS idx_kho_daily_date ON kho_daily_records(entry_date DESC);
