-- ============================================================
-- Migration 03b: Sửa lỗi bảng user_groups đã tồn tại thiếu cột
-- Chạy file này nếu 03 bị lỗi "column does not exist"
-- ============================================================

-- Thêm các cột còn thiếu vào bảng user_groups hiện có
ALTER TABLE user_groups
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS permissions  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS color        TEXT DEFAULT '#6B7280';

-- Tạo bảng user_group_members nếu chưa có
CREATE TABLE IF NOT EXISTS user_group_members (
  user_id   UUID NOT NULL,
  group_id  UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_ugm_user_id ON user_group_members(user_id);

-- RLS
ALTER TABLE user_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_authenticated" ON user_groups;
CREATE POLICY "groups_select_authenticated"
  ON user_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "groups_all_service_role" ON user_groups;
CREATE POLICY "groups_all_service_role"
  ON user_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ugm_select_authenticated" ON user_group_members;
CREATE POLICY "ugm_select_authenticated"
  ON user_group_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ugm_all_service_role" ON user_group_members;
CREATE POLICY "ugm_all_service_role"
  ON user_group_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed 3 nhóm mặc định
INSERT INTO user_groups (name, description, permissions, color) VALUES
  (
    'R&D Phần cứng',
    'Bộ phận kỹ thuật phần cứng - Hardware team',
    ARRAY['ho_tro:read', 'ho_tro:write'],
    '#2563EB'
  ),
  (
    'Kinh doanh',
    'Phòng kinh doanh - salesmen và trợ lý',
    ARRAY[]::TEXT[],
    '#16A34A'
  ),
  (
    'Hành chính',
    'Phòng hành chính tổng hợp',
    ARRAY[]::TEXT[],
    '#9333EA'
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  color       = EXCLUDED.color;

-- Cập nhật user_permissions_view (gộp role + group permissions)
CREATE OR REPLACE VIEW user_permissions_view AS
SELECT
  ur.user_id,
  ur.user_email,
  r.id   AS role_id,
  r.name AS role_name,
  ARRAY(
    SELECT DISTINCT perm
    FROM (
      SELECT rp.permission_key AS perm
      FROM   role_permissions rp
      WHERE  rp.role_id = ur.role_id

      UNION ALL

      SELECT unnest(ug.permissions) AS perm
      FROM   user_group_members ugm
      JOIN   user_groups ug ON ug.id = ugm.group_id
      WHERE  ugm.user_id = ur.user_id
    ) sub
    WHERE perm IS NOT NULL AND perm <> ''
  ) AS permissions
FROM user_roles ur
LEFT JOIN roles r ON r.id = ur.role_id;

-- View chi tiết nhóm kèm thành viên
CREATE OR REPLACE VIEW user_groups_view AS
SELECT
  g.id,
  g.name,
  g.description,
  g.permissions,
  g.color,
  g.created_at,
  COUNT(ugm.user_id) AS member_count,
  COALESCE(
    ARRAY_AGG(ur.user_email ORDER BY ur.user_email)
      FILTER (WHERE ur.user_email IS NOT NULL),
    '{}'::TEXT[]
  ) AS member_emails
FROM   user_groups g
LEFT JOIN user_group_members ugm ON ugm.group_id = g.id
LEFT JOIN user_roles ur          ON ur.user_id   = ugm.user_id
GROUP BY g.id, g.name, g.description, g.permissions, g.color, g.created_at;
