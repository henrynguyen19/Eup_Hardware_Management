-- Migration: repair_fault_configs
-- Stores per-status fault type lists for the Sửa chữa module.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS repair_fault_configs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_type TEXT NOT NULL,
  fault_type  TEXT NOT NULL,
  sort_order  INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(status_type, fault_type)
);

-- RLS
ALTER TABLE repair_fault_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fault configs" ON repair_fault_configs;
CREATE POLICY "Authenticated users can read fault configs"
  ON repair_fault_configs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access on fault configs" ON repair_fault_configs;
CREATE POLICY "Service role full access on fault configs"
  ON repair_fault_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default fault types (matching Google Sheets exactly)
INSERT INTO repair_fault_configs (status_type, fault_type, sort_order) VALUES
  ('da_sua', 'POWER', 0),
  ('da_sua', 'POWER connector', 1),
  ('da_sua', 'GSM', 2),
  ('da_sua', 'GPS', 3),
  ('da_sua', 'RFID', 4),
  ('da_sua', 'BUZZER', 5),
  ('da_sua', 'ACC', 6),
  ('da_sua', 'RS232', 7),
  ('da_sua', 'I/O', 8),
  ('da_sua', 'UPDATE', 9),
  ('da_sua', 'Lỗi cấu hình', 10),
  ('da_sua', 'Lỗi Sim', 11),
  ('da_sua', 'Lỗi audio', 12),
  ('da_sua', 'Lỗi IR', 13),
  ('da_sua', 'Lỗi thấu kính', 14),
  ('da_sua', 'Lỗi video cable', 15),
  ('da_sua', 'Lỗi thẻ nhớ', 16),
  ('da_sua', 'Lỗi màn hình hiển thị', 17),
  ('da_sua', 'Lost camera signal', 18),

  ('gui_bao_hanh', 'POWER', 0),
  ('gui_bao_hanh', 'GSM', 1),
  ('gui_bao_hanh', 'GPS', 2),
  ('gui_bao_hanh', 'RFID', 3),
  ('gui_bao_hanh', 'BUZZER', 4),
  ('gui_bao_hanh', 'ACC', 5),
  ('gui_bao_hanh', 'RS232', 6),
  ('gui_bao_hanh', 'I/O', 7),
  ('gui_bao_hanh', 'UPDATE', 8),
  ('gui_bao_hanh', 'Lỗi cấu hình', 9),
  ('gui_bao_hanh', 'Lỗi Sim', 10),
  ('gui_bao_hanh', 'Lỗi audio', 11),
  ('gui_bao_hanh', 'Lỗi IR', 12),
  ('gui_bao_hanh', 'Lỗi thấu kính', 13),
  ('gui_bao_hanh', 'Lỗi video cable', 14),
  ('gui_bao_hanh', 'Lỗi thẻ nhớ', 15),
  ('gui_bao_hanh', 'Lỗi màn hình hiển thị', 16),
  ('gui_bao_hanh', 'Lost camera signal', 17),
  ('gui_bao_hanh', 'Lỗi Loa', 18),
  ('gui_bao_hanh', 'không xác định', 19),

  ('khong_loi', 'Installation (lắp đặt)', 0),
  ('khong_loi', 'Power', 1),
  ('khong_loi', 'Unuse (xóa xe)', 2),
  ('khong_loi', 'RS232', 3),
  ('khong_loi', 'Buzzer', 4),
  ('khong_loi', 'Change vehicles', 5),
  ('khong_loi', 'ACC', 6),
  ('khong_loi', 'RFID', 7),
  ('khong_loi', 'GSM', 8),
  ('khong_loi', 'GPS', 9),
  ('khong_loi', 'Roaming', 10),
  ('khong_loi', 'Temperature', 11),
  ('khong_loi', 'Config', 12),
  ('khong_loi', 'Sim-card', 13),
  ('khong_loi', 'audio', 14),
  ('khong_loi', 'IR', 15),
  ('khong_loi', 'Lens', 16),
  ('khong_loi', 'video cable', 17),
  ('khong_loi', 'SD card', 18),
  ('khong_loi', 'Lỗi màn hình hiển thị', 19),
  ('khong_loi', 'Lost camera signal', 20),

  ('hong_han', 'burnt components', 0),
  ('hong_han', 'RS232', 1),
  ('hong_han', 'POWER', 2),
  ('hong_han', 'Không nhận thẻ', 3),
  ('hong_han', 'Oxidation', 4),
  ('hong_han', 'Broken', 5),
  ('hong_han', 'Lỗi nhiệt', 6),

  ('cho_sua', 'POWER', 0),
  ('cho_sua', 'POWER connector', 1),
  ('cho_sua', 'GSM', 2),
  ('cho_sua', 'GPS', 3),
  ('cho_sua', 'RFID', 4),
  ('cho_sua', 'BUZZER', 5),
  ('cho_sua', 'ACC', 6),
  ('cho_sua', 'RS232', 7),
  ('cho_sua', 'I/O', 8),
  ('cho_sua', 'UPDATE', 9),
  ('cho_sua', 'Lỗi cấu hình', 10),
  ('cho_sua', 'Lỗi Sim', 11),
  ('cho_sua', 'Lỗi audio', 12),
  ('cho_sua', 'Lỗi IR', 13),
  ('cho_sua', 'Lỗi thấu kính', 14),
  ('cho_sua', 'Lỗi video cable', 15),
  ('cho_sua', 'Lỗi thẻ nhớ', 16),
  ('cho_sua', 'Lỗi màn hình hiển thị', 17),
  ('cho_sua', 'Lost camera signal', 18),
  ('cho_sua', 'Không xác định', 19)
ON CONFLICT (status_type, fault_type) DO NOTHING;
