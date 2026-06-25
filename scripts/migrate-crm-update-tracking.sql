-- Thêm tracking CS_UpdateTime từ CRM vào bảng ho_tro_tickets
-- Chạy trong Supabase SQL Editor

ALTER TABLE ho_tro_tickets
  ADD COLUMN IF NOT EXISTS cs_update_time  timestamptz,
  ADD COLUMN IF NOT EXISTS has_unread_update boolean NOT NULL DEFAULT false;

-- Index để query nhanh các ticket chưa đọc
CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_unread
  ON ho_tro_tickets (has_unread_update)
  WHERE has_unread_update = true;

SELECT 'Migration done: cs_update_time + has_unread_update added' AS result;
