-- ============================================================
-- MIGRATION: Roles v2 — 2-level permission system
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- ============================================================
-- BƯỚC 1: Tạo 6 role chuẩn (nếu chưa có)
-- ============================================================
INSERT INTO roles (name, is_system) VALUES
  ('Admin',             true),
  ('Kho',               true),
  ('Sửa chữa',         true),
  ('Hỗ trợ kỹ thuật',  true),
  ('Kinh doanh',        true),
  ('Hành chính',        true)
ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system;

-- ============================================================
-- BƯỚC 2: Merge duplicate roles → role chuẩn
-- ============================================================

-- 2a. hanh_chinh / Hành chính tổng hợp → Hành chính
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Hành chính' LIMIT 1;
  -- Chuyển user_roles từ các role trùng sang canonical (bỏ qua nếu đã có)
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('hanh_chinh', 'Hành chính tổng hợp') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  -- Xóa role trùng
  DELETE FROM roles WHERE name IN ('hanh_chinh', 'Hành chính tổng hợp') AND id != v_canonical;
END $$;

-- 2b. kinh_doanh / van_phong / Văn phòng → Kinh doanh
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Kinh doanh' LIMIT 1;
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('kinh_doanh', 'van_phong', 'Văn phòng', 'Kinh Doanh') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  DELETE FROM roles WHERE name IN ('kinh_doanh', 'van_phong', 'Văn phòng', 'Kinh Doanh') AND id != v_canonical;
END $$;

-- 2c. Kỹ thuật / ky_thuat / Kỹ Thuật → Hỗ trợ kỹ thuật
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Hỗ trợ kỹ thuật' LIMIT 1;
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('Kỹ thuật', 'ky_thuat', 'Kỹ Thuật', 'ky thuật') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  DELETE FROM roles WHERE name IN ('Kỹ thuật', 'ky_thuat', 'Kỹ Thuật', 'ky thuật') AND id != v_canonical;
END $$;

-- 2d. kho → Kho
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Kho' LIMIT 1;
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('kho') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  DELETE FROM roles WHERE name IN ('kho') AND id != v_canonical;
END $$;

-- 2e. sua_chua → Sửa chữa
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Sửa chữa' LIMIT 1;
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('sua_chua') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  DELETE FROM roles WHERE name IN ('sua_chua') AND id != v_canonical;
END $$;

-- 2f. admin / Quản trị viên → Admin
DO $$
DECLARE v_canonical UUID;
BEGIN
  SELECT id INTO v_canonical FROM roles WHERE name = 'Admin' LIMIT 1;
  UPDATE user_roles ur SET role_id = v_canonical
  WHERE ur.role_id IN (SELECT id FROM roles WHERE name IN ('admin', 'Quản trị viên') AND id != v_canonical)
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ur.user_id AND role_id = v_canonical);
  DELETE FROM roles WHERE name IN ('admin', 'Quản trị viên') AND id != v_canonical;
END $$;

-- ============================================================
-- BƯỚC 3: Xóa sạch và set lại permissions cho 6 role chuẩn
-- ============================================================
DELETE FROM role_permissions
WHERE role_id IN (
  SELECT id FROM roles
  WHERE name IN ('Admin', 'Kho', 'Sửa chữa', 'Hỗ trợ kỹ thuật', 'Kinh doanh', 'Hành chính')
);

-- Admin: full tất cả
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('admin:users'),
  ('kho:read'), ('kho:write'), ('kho:delete'),
  ('kho_daily:read'), ('kho_daily:write'),
  ('gui_hang:read'), ('gui_hang:write'), ('gui_hang:delete'),
  ('ho_tro:read'), ('ho_tro:write'), ('ho_tro:admin'), ('ho_tro:delete'),
  ('sua_chua:read'), ('sua_chua:write'), ('sua_chua:delete'),
  ('chat_luong:read'), ('chat_luong:write'),
  ('chung_nhan:read'), ('chung_nhan:write'),
  ('tai_lieu:read'), ('tai_lieu:write'),
  ('huong_dan:read'), ('huong_dan:write')
) AS p(key) WHERE r.name = 'Admin';

-- Kho: full kho + gui_hang + đọc phần còn lại
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('kho:read'), ('kho:write'), ('kho:delete'),
  ('kho_daily:read'), ('kho_daily:write'),
  ('gui_hang:read'), ('gui_hang:write'), ('gui_hang:delete'),
  ('ho_tro:read'),
  ('sua_chua:read'),
  ('chat_luong:read'),
  ('tai_lieu:read'),
  ('chung_nhan:read'),
  ('huong_dan:read')
) AS p(key) WHERE r.name = 'Kho';

-- Sửa chữa: full sua_chua + đọc phần còn lại
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('sua_chua:read'), ('sua_chua:write'), ('sua_chua:delete'),
  ('kho:read'),
  ('kho_daily:read'),
  ('gui_hang:read'),
  ('ho_tro:read'),
  ('chat_luong:read'),
  ('tai_lieu:read'),
  ('chung_nhan:read'),
  ('huong_dan:read')
) AS p(key) WHERE r.name = 'Sửa chữa';

-- Hỗ trợ kỹ thuật: full ho_tro + đọc phần còn lại
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('ho_tro:read'), ('ho_tro:write'), ('ho_tro:admin'), ('ho_tro:delete'),
  ('kho:read'),
  ('kho_daily:read'),
  ('gui_hang:read'),
  ('sua_chua:read'),
  ('chat_luong:read'),
  ('tai_lieu:read'),
  ('chung_nhan:read'),
  ('huong_dan:read')
) AS p(key) WHERE r.name = 'Hỗ trợ kỹ thuật';

-- Kinh doanh: đọc kho + đọc/tạo gui_hang + đọc tài liệu
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('kho:read'),
  ('gui_hang:read'), ('gui_hang:write'),
  ('tai_lieu:read'),
  ('chung_nhan:read'),
  ('huong_dan:read')
) AS p(key) WHERE r.name = 'Kinh doanh';

-- Hành chính: full tài liệu group + đọc phần còn lại (không có ho_tro, sua_chua)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
CROSS JOIN (VALUES
  ('tai_lieu:read'), ('tai_lieu:write'),
  ('chung_nhan:read'), ('chung_nhan:write'),
  ('huong_dan:read'), ('huong_dan:write'),
  ('kho:read'),
  ('kho_daily:read'),
  ('gui_hang:read'),
  ('chat_luong:read')
) AS p(key) WHERE r.name = 'Hành chính';

-- ============================================================
-- BƯỚC 4: Thêm cột role_id vào departments
-- ============================================================
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE SET NULL;

-- ============================================================
-- BƯỚC 5: Tạo bảng user_dept_permissions
-- (Lưu quyền cá nhân của nhân viên trong phòng — subset của role phòng)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_dept_permissions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, department_id, permission_key)
);

ALTER TABLE user_dept_permissions ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "service_role_all" ON user_dept_permissions;
CREATE POLICY "service_role_all" ON user_dept_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- KIỂM TRA KẾT QUẢ
-- ============================================================
SELECT r.name, count(rp.permission_key) AS perm_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
WHERE r.name IN ('Admin', 'Kho', 'Sửa chữa', 'Hỗ trợ kỹ thuật', 'Kinh doanh', 'Hành chính')
GROUP BY r.name ORDER BY r.name;
