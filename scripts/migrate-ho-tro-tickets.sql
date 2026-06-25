-- Migration: Bảng lưu từng ticket hỗ trợ kỹ thuật
-- Ghi đồng thời với Google Sheets khi nhân viên nhập liệu
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ho_tro_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nhân viên xử lý (colL assignee) và sheet gốc
  staff_name   text NOT NULL,
  sheet_id     text,                        -- để sau này link ngược lại Sheet nếu cần

  -- Ngày (colD) — dạng "YYYY-MM-DD" để sort / filter dễ
  ticket_date  date NOT NULL,

  -- Các cột chính từ sheet
  code         text,                        -- colA: mã khách hàng
  sos          text,                        -- colB
  company      text,                        -- colC: tên công ty
  contact      text,                        -- colE: liên hệ
  ticket_type  text,                        -- colF
  sales_alias  text,                        -- colG
  direction    text,                        -- colH: kênh liên lạc
  content      text,                        -- colI: yêu cầu từ trợ lý ← quan trọng
  reply        text,                        -- colJ: trả lời từ nhân viên hỗ trợ ← quan trọng
  status       text,                        -- colK
  sales_man    text,                        -- colM
  assistant    text,                        -- colN: tên trợ lý
  location     text,                        -- khu vực (từ VP department map)
  start_point  text,                        -- colO
  end_point    text,                        -- colP

  -- Metadata
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index cho các truy vấn phổ biến
CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_staff_date
  ON ho_tro_tickets (staff_name, ticket_date DESC);

CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_date
  ON ho_tro_tickets (ticket_date DESC);

CREATE INDEX IF NOT EXISTS idx_ho_tro_tickets_assistant
  ON ho_tro_tickets (assistant);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ho_tro_tickets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_ho_tro_tickets_updated_at ON ho_tro_tickets;
CREATE TRIGGER trg_ho_tro_tickets_updated_at
  BEFORE UPDATE ON ho_tro_tickets
  FOR EACH ROW EXECUTE FUNCTION update_ho_tro_tickets_updated_at();

-- RLS: nhân viên chỉ xem ticket của mình, admin xem tất cả
ALTER TABLE ho_tro_tickets ENABLE ROW LEVEL SECURITY;

-- Admin xem/sửa tất cả
CREATE POLICY "ho_tro_tickets_admin" ON ho_tro_tickets
  USING (
    EXISTS (
      SELECT 1 FROM user_permissions_view
      WHERE user_id = auth.uid()
        AND 'admin:users' = ANY(permissions)
    )
  );

-- Nhân viên xem ticket của mình (assignee = email prefix)
CREATE POLICY "ho_tro_tickets_own_read" ON ho_tro_tickets
  FOR SELECT
  USING (
    staff_name ILIKE split_part(
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      '@', 1
    )
  );

SELECT 'ho_tro_tickets table created' AS result;
