-- ============================================================
-- Phase 1: Bộ phận Kho — Tables
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- ── 1. Phụ kiện (Accessories) ────────────────────────────────
CREATE TABLE IF NOT EXISTS accessories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  code                TEXT UNIQUE,                    -- mã phụ kiện, vd: ACC-001
  category            TEXT,                           -- 'Cáp', 'Adapter', 'Bao bì', 'Khác'
  description         TEXT,
  photo_url           TEXT,
  photo_public_id     TEXT,                           -- Cloudinary public_id
  vendor              TEXT,
  unit                TEXT DEFAULT 'cái',             -- cái / bộ / mét / cuộn
  notes               TEXT,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  created_by          TEXT                            -- email người tạo
);

-- ── 2. Phiên bản Firmware ────────────────────────────────────
CREATE TABLE IF NOT EXISTS firmware_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id        TEXT NOT NULL
                        REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  version             TEXT NOT NULL,                  -- vd: 'v2.3.1'
  release_date        DATE,
  is_latest           BOOLEAN DEFAULT false,
  changelog           TEXT,                           -- ghi chú thay đổi
  download_url        TEXT,
  release_notes_url   TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_by          TEXT,                           -- email người cập nhật
  UNIQUE(equipment_id, version)
);

-- Đảm bảo mỗi thiết bị chỉ có 1 firmware is_latest = true
CREATE UNIQUE INDEX IF NOT EXISTS firmware_one_latest_per_device
  ON firmware_versions (equipment_id)
  WHERE is_latest = true;

-- ── 3. Phụ kiện tương thích / Tiêu chuẩn xuất hàng ──────────
CREATE TABLE IF NOT EXISTS device_accessories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id        TEXT NOT NULL
                        REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  accessory_id        UUID NOT NULL
                        REFERENCES accessories(id) ON DELETE CASCADE,
  is_standard         BOOLEAN DEFAULT false,          -- TRUE = nằm trong bộ xuất hàng tiêu chuẩn
  quantity            INTEGER DEFAULT 1 CHECK (quantity > 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(equipment_id, accessory_id)
);

-- ── 4. View: Tiêu chuẩn xuất hàng ───────────────────────────
CREATE OR REPLACE VIEW shipping_standards_view AS
SELECT
  e.equipment_id,
  e.name            AS device_name,
  e.category        AS device_category,
  e.status          AS device_status,
  a.id              AS accessory_id,
  a.name            AS accessory_name,
  a.code            AS accessory_code,
  a.unit,
  da.quantity,
  da.notes
FROM device_accessories da
JOIN equipment_cards e ON e.equipment_id = da.equipment_id
JOIN accessories     a ON a.id = da.accessory_id
WHERE da.is_standard = true
ORDER BY e.equipment_id, a.name;

-- ── 5. Auto-update updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accessories_updated_at
  BEFORE UPDATE ON accessories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. Danh mục phụ kiện mặc định ───────────────────────────
INSERT INTO accessories (name, code, category, unit, is_active)
VALUES
  ('Cáp nguồn', 'ACC-PWR-001', 'Cáp', 'cái', true),
  ('Cáp HDMI', 'ACC-HDMI-001', 'Cáp', 'cái', true),
  ('Adapter nguồn', 'ACC-ADP-001', 'Adapter', 'cái', true),
  ('Hộp đựng', 'ACC-BOX-001', 'Bao bì', 'cái', true),
  ('Foam bảo vệ', 'ACC-FOAM-001', 'Bao bì', 'cái', true)
ON CONFLICT (code) DO NOTHING;
