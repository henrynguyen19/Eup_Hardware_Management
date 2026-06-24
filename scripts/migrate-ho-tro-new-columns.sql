-- Thêm 2 cột mới vào ho_tro_daily_records
-- Chạy trong Supabase SQL Editor

ALTER TABLE ho_tro_daily_records
  ADD COLUMN IF NOT EXISTS pm_types           JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS device_error_pairs JSONB DEFAULT '{}';

-- Xóa cache cũ để reparse với logic mới
-- (Chỉ chạy dòng này sau khi đã deploy code mới)
-- DELETE FROM ho_tro_daily_records;

-- Kiểm tra
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ho_tro_daily_records'
ORDER BY ordinal_position;
