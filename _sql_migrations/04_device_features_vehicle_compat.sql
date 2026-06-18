-- ============================================================
-- Migration 04: Device Features & Vehicle Compatibility
-- Tạo 3 bảng mở rộng cho module Quản lý thiết bị:
--   1. vehicle_types       — danh mục loại xe
--   2. device_vehicle_compat — ma trận xe × thiết bị (bắt buộc/tuỳ chọn)
--   3. device_features     — tính năng chi tiết từng thiết bị
--
-- Chạy từng STEP riêng biệt trong Supabase SQL Editor
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Tạo bảng vehicle_types
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vehicle_types (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    UNIQUE NOT NULL,        -- 'Xe tải chở hàng lạnh'
  category    TEXT,                           -- 'Kinh doanh vận tải' | 'Xe công trình' | 'Cá nhân & Khác'
  description TEXT,
  sort_order  INTEGER DEFAULT 99,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vehicle_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vt_select" ON vehicle_types;
CREATE POLICY "vt_select" ON vehicle_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vt_admin_all" ON vehicle_types;
CREATE POLICY "vt_admin_all" ON vehicle_types FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- STEP 2: Tạo bảng device_vehicle_compat
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS device_vehicle_compat (
  equipment_id    TEXT NOT NULL
                    REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  vehicle_type_id UUID NOT NULL
                    REFERENCES vehicle_types(id) ON DELETE CASCADE,
  requirement     TEXT NOT NULL CHECK (requirement IN ('mandatory','optional')),
  -- 'mandatory' = bắt buộc lắp (P), 'optional' = có thể lắp thêm (ok)
  group_note      TEXT,
  -- Ghi chú nhóm: vd "Chọn 1 trong: Go-168 hoặc VN88-4G"
  notes           TEXT,
  PRIMARY KEY (equipment_id, vehicle_type_id)
);

ALTER TABLE device_vehicle_compat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dvc_select" ON device_vehicle_compat;
CREATE POLICY "dvc_select" ON device_vehicle_compat FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dvc_admin_all" ON device_vehicle_compat;
CREATE POLICY "dvc_admin_all" ON device_vehicle_compat FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- STEP 3: Tạo bảng device_features
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS device_features (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id TEXT  NOT NULL
                       REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  feature_key  TEXT  NOT NULL,
  -- Keys chuẩn: qcvn06, qcvn31, nd10, rfid, cam_max, fuel_sensor,
  --             temp_sensor, concrete_sensor, collision_sensor, sos,
  --             telematics_l1, telematics_l2, dms, adas, breathalyzer
  value        TEXT  NOT NULL,   -- '✔' | '✗' | số | mô tả ngắn
  notes        TEXT,             -- ghi chú chi tiết
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (equipment_id, feature_key)
);

ALTER TABLE device_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "df_select" ON device_features;
CREATE POLICY "df_select" ON device_features FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "df_admin_all" ON device_features;
CREATE POLICY "df_admin_all" ON device_features FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- STEP 4: View tổng hợp — thiết bị kèm tính năng
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW device_features_view AS
SELECT
  e.equipment_id,
  e.name        AS device_name,
  e.category    AS device_category,
  e.status      AS device_status,
  COALESCE(
    json_object_agg(df.feature_key, json_build_object('value', df.value, 'notes', df.notes))
      FILTER (WHERE df.feature_key IS NOT NULL),
    '{}'::JSON
  ) AS features
FROM equipment_cards e
LEFT JOIN device_features df ON df.equipment_id = e.equipment_id
GROUP BY e.equipment_id, e.name, e.category, e.status;


-- ══════════════════════════════════════════════════════════════
-- STEP 5: View tổng hợp — xe kèm danh sách thiết bị tương thích
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vehicle_compat_view AS
SELECT
  vt.id              AS vehicle_type_id,
  vt.name            AS vehicle_name,
  vt.category        AS vehicle_category,
  vt.sort_order,
  dvc.requirement,
  dvc.group_note,
  dvc.notes          AS compat_notes,
  e.equipment_id,
  e.name             AS device_name,
  e.category         AS device_category
FROM vehicle_types vt
JOIN device_vehicle_compat dvc ON dvc.vehicle_type_id = vt.id
JOIN equipment_cards e         ON e.equipment_id = dvc.equipment_id
ORDER BY vt.sort_order, vt.name, dvc.requirement DESC, e.name;
