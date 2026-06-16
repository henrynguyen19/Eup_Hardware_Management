-- ============================================================
-- Phase 1: Bộ phận Kho — Row Level Security (RLS)
-- Chạy SAU file 01_phase1_kho_tables.sql
-- ============================================================

-- ── accessories ──────────────────────────────────────────────
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;

-- Tất cả user đã đăng nhập có thể xem
CREATE POLICY "accessories_select_authenticated"
  ON accessories FOR SELECT
  TO authenticated
  USING (true);

-- Chỉ admin (service_role) có thể tạo/sửa/xóa
-- (Quản lý qua API route dùng service_role key)
CREATE POLICY "accessories_insert_service_role"
  ON accessories FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "accessories_update_service_role"
  ON accessories FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "accessories_delete_service_role"
  ON accessories FOR DELETE
  TO service_role
  USING (true);

-- ── firmware_versions ────────────────────────────────────────
ALTER TABLE firmware_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firmware_select_authenticated"
  ON firmware_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "firmware_insert_service_role"
  ON firmware_versions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "firmware_update_service_role"
  ON firmware_versions FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "firmware_delete_service_role"
  ON firmware_versions FOR DELETE
  TO service_role
  USING (true);

-- ── device_accessories ───────────────────────────────────────
ALTER TABLE device_accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_acc_select_authenticated"
  ON device_accessories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "device_acc_insert_service_role"
  ON device_accessories FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "device_acc_update_service_role"
  ON device_accessories FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "device_acc_delete_service_role"
  ON device_accessories FOR DELETE
  TO service_role
  USING (true);
