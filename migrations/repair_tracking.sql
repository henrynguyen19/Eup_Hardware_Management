-- ============================================================
-- Migration: repair_items — Theo dõi sửa chữa thiết bị
-- Created: 2026-06-30
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE repair_status AS ENUM (
  'cho_gui',      -- Chờ gửi sửa (đã về kho tổng, chưa gửi đi)
  'da_gui',       -- Đã gửi sửa chữa (đang ở kho sửa)
  'da_sua_xong'   -- Đã sửa xong
);

CREATE TYPE repair_finish_reason AS ENUM (
  'sua_xong',           -- Sửa chữa xong → Old Device
  'khong_loi_bt',       -- Không cần bảo trì (bình thường) → Old Device
  'loai_bo',            -- Không cần bảo trì (cần loại bỏ) → Scrap
  'loai_bo_bo_mach',    -- Không cần bảo trì (loại bỏ, NSX thay bo mạch) → Scrap
  'send_supplier'       -- Send to Supplier → Supplier
);

CREATE TYPE repair_destination AS ENUM (
  'old_device',  -- Kho Old Device (tái sử dụng)
  'scrap',       -- Kho Scrap (phế)
  'supplier'     -- Gửi về hãng
);

-- ── Bảng chính ───────────────────────────────────────────────

CREATE TABLE repair_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thông tin thiết bị
  imei             TEXT NOT NULL,
  product_name     TEXT NOT NULL,
  notes            TEXT,

  -- Trạng thái
  status           repair_status NOT NULL DEFAULT 'cho_gui',

  -- Kho sửa chữa (Repair_Hardware, Repair_Streamax, ...)
  repair_warehouse TEXT,

  -- Kết quả
  finish_reason    repair_finish_reason,
  destination      repair_destination,

  -- Timestamps cho 3 state transitions
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- về kho tổng
  sent_at          TIMESTAMPTZ,                          -- gửi sang kho sửa
  completed_at     TIMESTAMPTZ,                          -- hoàn thành sửa

  -- Người thực hiện
  receiver_id      UUID REFERENCES auth.users(id),       -- người nhận về kho
  sender_id        UUID REFERENCES auth.users(id),       -- người gửi sửa
  completer_id     UUID REFERENCES auth.users(id),       -- người hoàn thành

  -- Tên hiển thị (cache để không cần join khi report)
  receiver_name    TEXT,
  sender_name      TEXT,
  completer_name   TEXT,

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_repair_items_status      ON repair_items(status);
CREATE INDEX idx_repair_items_imei        ON repair_items(imei);
CREATE INDEX idx_repair_items_product     ON repair_items(product_name);
CREATE INDEX idx_repair_items_received    ON repair_items(received_at DESC);
CREATE INDEX idx_repair_items_sender      ON repair_items(sender_id);
CREATE INDEX idx_repair_items_completer   ON repair_items(completer_id);
CREATE INDEX idx_repair_items_destination ON repair_items(destination);

-- ── updated_at trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_repair_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repair_items_updated_at
  BEFORE UPDATE ON repair_items
  FOR EACH ROW EXECUTE FUNCTION update_repair_items_updated_at();

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE repair_items ENABLE ROW LEVEL SECURITY;

-- Đọc: mọi user đã đăng nhập
CREATE POLICY "repair_items_select"
  ON repair_items FOR SELECT
  TO authenticated
  USING (true);

-- Ghi: chỉ service role (API route dùng service role key)
CREATE POLICY "repair_items_insert"
  ON repair_items FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "repair_items_update"
  ON repair_items FOR UPDATE
  TO service_role
  USING (true);

-- ── Permission ───────────────────────────────────────────────

-- Gán permission vào role Admin (nếu có)
DO $$
DECLARE
  v_admin_role UUID;
BEGIN
  SELECT id INTO v_admin_role FROM roles WHERE name = 'Admin' LIMIT 1;
  IF v_admin_role IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission)
    VALUES
      (v_admin_role, 'repair_tracking:write'),
      (v_admin_role, 'repair_tracking:read')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── View thống kê nhanh ───────────────────────────────────────

CREATE OR REPLACE VIEW repair_stats_summary AS
SELECT
  status,
  product_name,
  COUNT(*)                                                         AS total,
  COUNT(*) FILTER (WHERE destination = 'old_device')              AS dest_old_device,
  COUNT(*) FILTER (WHERE destination = 'scrap')                   AS dest_scrap,
  COUNT(*) FILTER (WHERE destination = 'supplier')                AS dest_supplier,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (sent_at - received_at)) / 3600)
      FILTER (WHERE sent_at IS NOT NULL)::NUMERIC, 1
  )                                                                AS avg_hours_to_send,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (completed_at - sent_at)) / 86400)
      FILTER (WHERE completed_at IS NOT NULL AND sent_at IS NOT NULL)::NUMERIC, 1
  )                                                                AS avg_days_repair
FROM repair_items
GROUP BY status, product_name;
