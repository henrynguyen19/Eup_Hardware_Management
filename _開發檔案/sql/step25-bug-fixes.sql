-- Step 25 Bug Fixes
-- 需在 Supabase Dashboard 手動執行

-- 1. 確保 issues 表有 dept_group 欄位（若已存在則無影響）
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dept_group TEXT;

-- 2. Backfill：依建立者 email → allowed_emails.role → roles.dept_group
UPDATE issues i
SET dept_group = r.dept_group
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND i.dept_group IS NULL;

-- 3. 新增 read_tags / read_weight / read_created_at 到管理員系列角色
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY['read_tags', 'read_weight', 'read_created_at']) AS key
WHERE r.name IN (
  '管理員', '管理員(技師)', '管理員(採購)', '管理員(供應鏈)', '管理員(工程)', '管理員(業務)'
)
ON CONFLICT DO NOTHING;

-- 4. 新增 read_tags / read_weight / read_created_at 到 member / viewer 角色
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY['read_tags', 'read_weight', 'read_created_at']) AS key
WHERE r.name IN ('一般使用者', '採購', '供應鏈', '工程', '業務', '技師')
ON CONFLICT DO NOTHING;
