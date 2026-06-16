-- ====================================================
-- Step 19：角色與權限系統
-- 執行環境：Supabase Dashboard → SQL Editor
-- ====================================================

-- 1. 角色表
CREATE TABLE IF NOT EXISTS roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 角色權限關聯表
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

-- 3. 種子資料：系統預設角色（先移除再插入，確保冪等）
DELETE FROM roles WHERE is_system = true;
INSERT INTO roles (name, is_system) VALUES
  ('管理員', true),
  ('一般使用者', true);

-- 管理員：11 項（read_all_cards，不含 read_active_only）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'crud_cards',
  'manage_users', 'manage_roles', 'use_groups'
]) FROM roles WHERE name = '管理員';

-- 一般使用者：6 項
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks', 'use_groups'
]) FROM roles WHERE name = '一般使用者';

-- 4. 移除舊 CHECK 約束（若存在）
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE allowed_emails DROP CONSTRAINT IF EXISTS allowed_emails_role_check;

-- 5. 更新 allowed_emails 的舊角色值
UPDATE allowed_emails SET role = '管理員' WHERE role = 'admin';
UPDATE allowed_emails SET role = '一般使用者' WHERE role = 'viewer';
