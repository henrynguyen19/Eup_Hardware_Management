-- Them speed_tag va sheet_row_key vao ho_tro_tickets
-- Chay trong Supabase SQL Editor

ALTER TABLE ho_tro_tickets
  ADD COLUMN IF NOT EXISTS speed_tag     text,
  ADD COLUMN IF NOT EXISTS sheet_row_key text;

-- Unique index de upsert khong bi trung
CREATE UNIQUE INDEX IF NOT EXISTS idx_ho_tro_tickets_sheet_row_key
  ON ho_tro_tickets (sheet_row_key)
  WHERE sheet_row_key IS NOT NULL;

-- Index de query pending nhanh
CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_speed_tag
  ON ho_tro_tickets (speed_tag)
  WHERE speed_tag IS NOT NULL;

-- Kiem tra ket qua
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ho_tro_tickets'
  AND column_name IN ('speed_tag', 'sheet_row_key', 'sheet_id')
ORDER BY column_name;
