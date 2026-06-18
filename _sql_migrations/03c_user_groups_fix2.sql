-- ============================================================
-- Migration 03c: Fix lỗi ON CONFLICT (name) không có constraint
-- Chạy file này sau 03b nếu gặp lỗi "no unique constraint"
-- ============================================================

-- 1. Thêm UNIQUE constraint vào cột name (nếu chưa có)
ALTER TABLE user_groups
  ADD CONSTRAINT IF NOT EXISTS user_groups_name_key UNIQUE (name);

-- 2. Seed nhóm mặc định (dùng ON CONFLICT sau khi đã có constraint)
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

-- 3. Cập nhật user_permissions_view
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

-- 4. View chi tiết nhóm kèm thành viên
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
