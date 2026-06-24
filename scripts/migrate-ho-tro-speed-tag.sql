-- Thêm speed_tag và sheet_row_key vào ho_tro_tickets
-- Chạy trong Supabase SQL Editor

ALTER TABLE ho_tro_tickets
  ADD COLUMN IF NOT EXISTS speed_tag     text,
  ADD COLUMN IF NOT EXISTS sheet_row_key text;

-- Unique index để upsert từ sheet parse không bị trùng
CREATE UNIQUE INDEX IF NOT EXISTS idx_ho_tro_tickets_sheet_row_key
  ON ho_tro_tickets (sheet_row_key)
  WHERE sheet_row_key IS NOT NULL;

-- Index để query pending nhanh
CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_speed_tag
  ON ho_tro_tickets (speed_tag)
  WHERE speed_tag IS NOT NULL;

-- Check
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ho_tro_tickets'
ORDER BY ordinal_position;
