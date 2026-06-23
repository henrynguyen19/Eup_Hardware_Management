-- ================================================================
-- EUP Hardware Management — New Permission System
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. DEPARTMENTS (Phòng ban)
-- ================================================================
CREATE TABLE IF NOT EXISTS departments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  code      text NOT NULL UNIQUE,
  color     text NOT NULL DEFAULT '#6b7280',
  created_at timestamptz DEFAULT now()
);

-- 2. FEATURE PAGES (Trang tính năng)
-- ================================================================
CREATE TABLE IF NOT EXISTS feature_pages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text NOT NULL UNIQUE,
  icon       text NOT NULL DEFAULT '📄',
  sort_order int  NOT NULL DEFAULT 0
);

-- 3. FEATURE SUB-PAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS feature_sub_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_page_id uuid NOT NULL REFERENCES feature_pages(id) ON DELETE CASCADE,
  name            text NOT NULL,
  code            text NOT NULL UNIQUE,
  sort_order      int  NOT NULL DEFAULT 0
);

-- 4. DEPARTMENT ↔ SUB-PAGE PERMISSIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS department_permissions (
  department_id uuid NOT NULL REFERENCES departments(id)        ON DELETE CASCADE,
  sub_page_id   uuid NOT NULL REFERENCES feature_sub_pages(id)  ON DELETE CASCADE,
  can_read      boolean NOT NULL DEFAULT false,
  can_create    boolean NOT NULL DEFAULT false,
  can_update    boolean NOT NULL DEFAULT false,
  can_delete    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (department_id, sub_page_id)
);

-- 5. USER ↔ DEPARTMENT MEMBERSHIPS
-- ================================================================
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

-- 6. VIEW: Effective permissions per user per sub-page
-- ================================================================
CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT
  ud.user_id,
  fp.code   AS page_code,
  fsp.code  AS sub_page_code,
  fsp.name  AS sub_page_name,
  fp.name   AS page_name,
  bool_or(dp.can_read)   AS can_read,
  bool_or(dp.can_create) AS can_create,
  bool_or(dp.can_update) AS can_update,
  bool_or(dp.can_delete) AS can_delete
FROM user_departments ud
JOIN department_permissions dp  ON dp.department_id  = ud.department_id
JOIN feature_sub_pages fsp      ON fsp.id            = dp.sub_page_id
JOIN feature_pages fp           ON fp.id             = fsp.feature_page_id
GROUP BY ud.user_id, fp.code, fp.name, fsp.code, fsp.name;

-- 7. SEED: Departments
-- ================================================================
INSERT INTO departments (name, code, color) VALUES
  ('Phòng Hardware',             'hardware',   '#3b82f6'),
  ('Phòng Software',             'software',   '#8b5cf6'),
  ('Phòng Hành chính tổng hợp', 'hanh_chinh', '#22c55e'),
  ('Phòng Kinh doanh',           'kinh_doanh', '#f59e0b')
ON CONFLICT (code) DO NOTHING;

-- 8. SEED: Feature pages
-- ================================================================
INSERT INTO feature_pages (name, code, icon, sort_order) VALUES
  ('Quản lý thiết bị',   'quan_ly_thiet_bi',    '📦', 1),
  ('Hỗ trợ kỹ thuật',   'ho_tro_ky_thuat',     '🎧', 2),
  ('Giấy chứng nhận',   'giay_chung_nhan',      '📜', 3),
  ('Thống kê sửa chữa', 'thong_ke_sua_chua',    '🔧', 4),
  ('Quản lý chất lượng','quan_ly_chat_luong',   '✅', 5),
  ('Thông tin giao hàng','thong_tin_giao_hang',  '🚚', 6)
ON CONFLICT (code) DO NOTHING;

-- 9. SEED: Sub-pages
-- ================================================================

-- Quản lý thiết bị
INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Danh sách thiết bị', 'thiet_bi_danh_sach', 1
FROM feature_pages WHERE code = 'quan_ly_thiet_bi'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Bảng tính năng', 'thiet_bi_tinh_nang', 2
FROM feature_pages WHERE code = 'quan_ly_thiet_bi'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Xe và thiết bị', 'thiet_bi_xe', 3
FROM feature_pages WHERE code = 'quan_ly_thiet_bi'
ON CONFLICT (code) DO NOTHING;

-- Hỗ trợ kỹ thuật
INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Bảng thống kê nhân viên', 'hotro_bang_thong_ke', 1
FROM feature_pages WHERE code = 'ho_tro_ky_thuat'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Jira Bugs', 'hotro_jira_bugs', 2
FROM feature_pages WHERE code = 'ho_tro_ky_thuat'
ON CONFLICT (code) DO NOTHING;

-- Pages với 1 sub-page "Trang chính"
INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Trang chính', 'giay_chung_nhan_main', 1
FROM feature_pages WHERE code = 'giay_chung_nhan'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Trang chính', 'sua_chua_main', 1
FROM feature_pages WHERE code = 'thong_ke_sua_chua'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Trang chính', 'chat_luong_main', 1
FROM feature_pages WHERE code = 'quan_ly_chat_luong'
ON CONFLICT (code) DO NOTHING;

INSERT INTO feature_sub_pages (feature_page_id, name, code, sort_order)
SELECT id, 'Trang chính', 'giao_hang_main', 1
FROM feature_pages WHERE code = 'thong_tin_giao_hang'
ON CONFLICT (code) DO NOTHING;

-- 10. RLS Policies (disable RLS for admin-managed tables)
-- ================================================================
ALTER TABLE departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_sub_pages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments      ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (needed for permission checks)
CREATE POLICY "departments_read"           ON departments           FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_pages_read"         ON feature_pages         FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_sub_pages_read"     ON feature_sub_pages     FOR SELECT TO authenticated USING (true);
CREATE POLICY "department_permissions_read" ON department_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_departments_read"      ON user_departments      FOR SELECT TO authenticated USING (true);

-- Only service role can write (API uses service role key)
-- No additional write policies needed since we use service_role which bypasses RLS
