-- ============================================================
-- Migration: Module Thống kê Sửa chữa
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- Bảng 1: Mỗi tuần sửa chữa
CREATE TABLE IF NOT EXISTS public.repair_weeks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year         int  NOT NULL,
  week_number  int  NOT NULL,
  week_label   text NOT NULL,   -- "Tuan 21 - 2026"
  date_start   date,
  date_end     date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(year, week_number)
);

-- Bảng 2: Chi tiết từng ô thống kê (loại lỗi × loại thiết bị × trạng thái)
CREATE TABLE IF NOT EXISTS public.repair_stats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id     uuid NOT NULL REFERENCES public.repair_weeks(id) ON DELETE CASCADE,
  status_type text NOT NULL,  -- 'da_sua' | 'gui_bao_hanh' | 'khong_loi' | 'hong_han' | 'cho_sua'
  fault_type  text NOT NULL,  -- 'POWER' | 'POWER connector' | 'GSM' | 'GPS' | 'RFID' | ...
  device_type text NOT NULL,  -- '4G' | '4GH' | 'GO' | 'SBOX' | 'MT99' | ...
  quantity    int  NOT NULL DEFAULT 0,
  UNIQUE(week_id, status_type, fault_type, device_type)
);

-- Bảng 3: Tổng thiết bị bàn giao mỗi tuần theo loại
CREATE TABLE IF NOT EXISTS public.repair_totals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id      uuid NOT NULL REFERENCES public.repair_weeks(id) ON DELETE CASCADE,
  device_type  text NOT NULL,  -- '4G' | '4GH' | 'GO' | ...
  total_received int NOT NULL DEFAULT 0,
  UNIQUE(week_id, device_type)
);

-- RLS
ALTER TABLE public.repair_weeks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_totals ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read all
CREATE POLICY "Authenticated read repair_weeks"
  ON public.repair_weeks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read repair_stats"
  ON public.repair_stats FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read repair_totals"
  ON public.repair_totals FOR SELECT TO authenticated USING (true);

-- Admin: full manage
CREATE POLICY "Admin manage repair_weeks"
  ON public.repair_weeks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_permissions_view
    WHERE user_id = auth.uid() AND 'admin:users' = ANY(permissions)
  ));

CREATE POLICY "Admin manage repair_stats"
  ON public.repair_stats FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_permissions_view
    WHERE user_id = auth.uid() AND 'admin:users' = ANY(permissions)
  ));

CREATE POLICY "Admin manage repair_totals"
  ON public.repair_totals FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_permissions_view
    WHERE user_id = auth.uid() AND 'admin:users' = ANY(permissions)
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repair_stats_week_id   ON public.repair_stats(week_id);
CREATE INDEX IF NOT EXISTS idx_repair_stats_status    ON public.repair_stats(status_type);
CREATE INDEX IF NOT EXISTS idx_repair_stats_device    ON public.repair_stats(device_type);
CREATE INDEX IF NOT EXISTS idx_repair_totals_week_id  ON public.repair_totals(week_id);
CREATE INDEX IF NOT EXISTS idx_repair_weeks_year_week ON public.repair_weeks(year, week_number);
