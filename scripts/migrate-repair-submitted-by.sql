-- Migration: Thêm cột submitted_by + submitted_at vào repair_stats
-- Mục đích: theo dõi ai nhập từng ô số liệu; không ghi đè nếu ô bỏ trống
-- Chạy trong Supabase SQL Editor

ALTER TABLE public.repair_stats
  ADD COLUMN IF NOT EXISTS submitted_by   TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ;
