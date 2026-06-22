-- Migration: Cache dữ liệu Hỗ trợ kỹ thuật từ Google Sheets vào Supabase
-- Mục đích: Load nhanh — truy vấn DB thay vì gọi Google Sheets API mỗi lần
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.ho_tro_daily_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Định danh
  sheet_id        TEXT        NOT NULL,  -- Google Sheet ID (unique per staff)
  staff_name      TEXT,                  -- Tên hiển thị (Kane, Stefan, …)
  sort_key        TEXT        NOT NULL,  -- "YYYY-MM-DD" — dùng để sort/filter

  -- Dữ liệu gốc
  date_display    TEXT        NOT NULL,  -- "DD/MM/YYYY" — hiển thị
  total_requests  INTEGER     NOT NULL DEFAULT 0,
  avg_time        INTEGER     NOT NULL DEFAULT 0,
  max_time        INTEGER     NOT NULL DEFAULT 0,

  -- Dữ liệu JSONB (Record<string, number>)
  devices         JSONB       NOT NULL DEFAULT '{}',
  resolution      JSONB       NOT NULL DEFAULT '{}',
  locations       JSONB       NOT NULL DEFAULT '{}',
  channels        JSONB       NOT NULL DEFAULT '{}',
  errors          JSONB       NOT NULL DEFAULT '{}',

  -- Metadata cache
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Mỗi (sheet_id, ngày) chỉ lưu 1 bản
  CONSTRAINT ho_tro_daily_records_unique UNIQUE (sheet_id, sort_key)
);

-- Index tìm kiếm nhanh theo sheet + tháng
CREATE INDEX IF NOT EXISTS idx_ho_tro_sheet_sortkey
  ON public.ho_tro_daily_records (sheet_id, sort_key);

-- RLS: cho phép service role đọc/ghi; user thường không truy cập trực tiếp
ALTER TABLE public.ho_tro_daily_records ENABLE ROW LEVEL SECURITY;

-- Policy: service role (API) full access
CREATE POLICY "service role full access"
  ON public.ho_tro_daily_records
  FOR ALL
  USING (true)
  WITH CHECK (true);
