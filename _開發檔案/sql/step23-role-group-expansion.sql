-- Step 23: 角色群組擴充
-- 執行前提：Step 19 的 add-roles-permissions.sql 已執行完畢

-- 1. roles 表擴充欄位
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS dept_group TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'viewer'
    CHECK (level IN ('super_admin', 'dept_admin', 'member', 'viewer'));

-- 2. 更新現有兩個系統角色
UPDATE roles SET dept_group = 'admin', level = 'super_admin' WHERE name = '管理員';
UPDATE roles SET dept_group = null,    level = 'viewer'      WHERE name = '一般使用者';

-- 3. 新增 10 個系統角色
INSERT INTO roles (name, is_system, dept_group, level) VALUES
  ('管理員(技師)',   true, 'tech',         'dept_admin'),
  ('管理員(採購)',   true, 'purchasing',   'dept_admin'),
  ('管理員(供應鏈)', true, 'supply_chain', 'dept_admin'),
  ('管理員(工程)',   true, 'engineering',  'dept_admin'),
  ('管理員(業務)',   true, 'sales',        'dept_admin'),
  ('採購',          true, 'purchasing',   'member'),
  ('供應鏈',        true, 'supply_chain', 'member'),
  ('工程',          true, 'engineering',  'member'),
  ('業務',          true, 'sales',        'member'),
  ('技師',          true, 'tech',         'member')
ON CONFLICT (name) DO NOTHING;

-- 4. 舊 crud_cards → 新 create_delete_cards + edit_card_*
INSERT INTO role_permissions (role_id, permission_key)
SELECT rp.role_id, new_key
FROM role_permissions rp
CROSS JOIN unnest(ARRAY[
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos'
]) AS new_key
WHERE rp.permission_key = 'crud_cards'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions WHERE permission_key = 'crud_cards';

-- 5. dept_admin 角色的 permissions 種子
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor', 'read_updated_by', 'read_updated_content',
  'use_bookmarks',
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
  'manage_users',
  'view_tracker', 'view_my_tasks', 'create_issues', 'tracker_edit_issue'
]) AS key
WHERE r.name IN ('管理員(技師)', '管理員(採購)', '管理員(供應鏈)', '管理員(工程)', '管理員(業務)')
ON CONFLICT DO NOTHING;

-- 6. 管理員（super_admin）補追蹤板 + create_delete_cards + edit_card_*
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
  'view_tracker', 'view_my_tasks', 'create_issues', 'tracker_edit_issue'
]) AS key
WHERE r.name = '管理員'
ON CONFLICT DO NOTHING;

-- 7. member 角色種子
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY[
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks',
  'view_tracker', 'view_my_tasks'
]) AS key
WHERE r.name IN ('採購', '供應鏈', '工程', '業務', '技師')
ON CONFLICT DO NOTHING;

-- 8. issues 加 dept_group 欄位
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dept_group TEXT;

-- 回填現有議題的 dept_group（依建立者角色推導）
UPDATE issues ti
SET dept_group = r.dept_group
FROM profiles p
JOIN roles r ON r.name = p.role
WHERE ti.created_by = p.id::text
  AND ti.dept_group IS NULL;

-- 9. issues RLS 更新（group-scoped）
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group scoped tracker" ON issues;
CREATE POLICY "group scoped tracker"
  ON issues FOR ALL
  USING (
    dept_group IS NOT DISTINCT FROM (
      SELECT r.dept_group
      FROM profiles p
      JOIN roles r ON r.name = p.role
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    dept_group IS NOT DISTINCT FROM (
      SELECT r.dept_group
      FROM profiles p
      JOIN roles r ON r.name = p.role
      WHERE p.id = auth.uid()
    )
  );
