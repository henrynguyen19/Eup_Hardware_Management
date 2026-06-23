-- ================================================================
-- Assign users to departments + set default permissions
-- Run AFTER 20240623_new_permission_system.sql
-- ================================================================

-- 1. Assign users to departments
INSERT INTO user_departments (user_id, department_id)
SELECT u.id, d.id
FROM auth.users u
JOIN departments d ON d.code = CASE u.email
  WHEN 'sunny@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'katie@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'ruby@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'jennie@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'lily@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'cindy@eup.net.vn' THEN 'hanh_chinh'
  WHEN 'henry@eup.net.vn' THEN 'hardware'
  WHEN 'julie@eup.net.vn' THEN 'hardware'
  WHEN 'kai@eup.net.vn' THEN 'hardware'
  WHEN 'shiro@eup.net.vn' THEN 'hardware'
  WHEN 'irene@eup.net.vn' THEN 'hardware'
  WHEN 'peter@eup.net.vn' THEN 'hardware'
  WHEN 'kane@eup.net.vn' THEN 'hardware'
  WHEN 'thor@eup.net.vn' THEN 'hardware'
  WHEN 'kris@eup.net.vn' THEN 'hardware'
  WHEN 'nick@eup.net.vn' THEN 'hardware'
  WHEN 'galvin@eup.net.vn' THEN 'hardware'
  WHEN 'stefan@eup.net.vn' THEN 'hardware'
  WHEN 'cop@eup.net.vn' THEN 'hardware'
  WHEN 'zeus@eup.net.vn' THEN 'hardware'
  WHEN 'martin@eup.net.vn' THEN 'software'
  WHEN 'harvey@eup.net.vn' THEN 'software'
  WHEN 'simba@eup.net.vn' THEN 'software'
  WHEN 'alberto@eup.net.vn' THEN 'software'
  WHEN 'alan@eup.net.vn' THEN 'software'
  WHEN 'yorn@eup.net.vn' THEN 'software'
  WHEN 'xavia@eup.net.vn' THEN 'software'
  WHEN 'tracy@eup.net.vn' THEN 'software'
  WHEN 'cahi@eup.net.vn' THEN 'software'
  WHEN 'drake@eup.net.vn' THEN 'software'
  WHEN 'amy@eup.net.vn' THEN 'software'
  WHEN 'rosabella@eup.net.vn' THEN 'software'
  WHEN 'lucas@eup.net.vn' THEN 'software'
  WHEN 'maya@eup.net.vn' THEN 'software'
  WHEN 'aero@eup.net.vn' THEN 'software'
  WHEN 'owen@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'hawk@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'titan@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'leo@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'ben@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'zenda@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'dily@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'canary@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'min@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'anna@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'lee@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'elsa@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'jeny@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'abbey@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'soda@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'jena@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'helen@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'hana@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'mina@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'luna@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'lita@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'dylan@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'alvin@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'roger@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'arnold@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'lionel@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'bell@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'jade@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'zoey@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'vivian@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'dani@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'selina@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'vanessa@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'winter@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'alice@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'clara@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'eric@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'steven@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'tansy@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'lucy@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'ella@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'vera@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'brian@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'alex@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'cris@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'tina@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'ellie@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'mimi@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'jin@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'adam@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'maika@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'vivi@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'gina@eup.net.vn' THEN 'kinh_doanh'
  WHEN 'mango@eup.net.vn' THEN 'kinh_doanh'
  ELSE NULL END
WHERE d.id IS NOT NULL
  AND u.email IN (
  'sunny@eup.net.vn',
  'katie@eup.net.vn',
  'ruby@eup.net.vn',
  'jennie@eup.net.vn',
  'lily@eup.net.vn',
  'cindy@eup.net.vn',
  'henry@eup.net.vn',
  'julie@eup.net.vn',
  'kai@eup.net.vn',
  'shiro@eup.net.vn',
  'irene@eup.net.vn',
  'peter@eup.net.vn',
  'kane@eup.net.vn',
  'thor@eup.net.vn',
  'kris@eup.net.vn',
  'nick@eup.net.vn',
  'galvin@eup.net.vn',
  'stefan@eup.net.vn',
  'cop@eup.net.vn',
  'zeus@eup.net.vn',
  'martin@eup.net.vn',
  'harvey@eup.net.vn',
  'simba@eup.net.vn',
  'alberto@eup.net.vn',
  'alan@eup.net.vn',
  'yorn@eup.net.vn',
  'xavia@eup.net.vn',
  'tracy@eup.net.vn',
  'cahi@eup.net.vn',
  'drake@eup.net.vn',
  'amy@eup.net.vn',
  'rosabella@eup.net.vn',
  'lucas@eup.net.vn',
  'maya@eup.net.vn',
  'aero@eup.net.vn',
  'owen@eup.net.vn',
  'hawk@eup.net.vn',
  'titan@eup.net.vn',
  'leo@eup.net.vn',
  'ben@eup.net.vn',
  'zenda@eup.net.vn',
  'dily@eup.net.vn',
  'canary@eup.net.vn',
  'min@eup.net.vn',
  'anna@eup.net.vn',
  'lee@eup.net.vn',
  'elsa@eup.net.vn',
  'jeny@eup.net.vn',
  'abbey@eup.net.vn',
  'soda@eup.net.vn',
  'jena@eup.net.vn',
  'helen@eup.net.vn',
  'hana@eup.net.vn',
  'mina@eup.net.vn',
  'luna@eup.net.vn',
  'lita@eup.net.vn',
  'dylan@eup.net.vn',
  'alvin@eup.net.vn',
  'roger@eup.net.vn',
  'arnold@eup.net.vn',
  'lionel@eup.net.vn',
  'bell@eup.net.vn',
  'jade@eup.net.vn',
  'zoey@eup.net.vn',
  'vivian@eup.net.vn',
  'dani@eup.net.vn',
  'selina@eup.net.vn',
  'vanessa@eup.net.vn',
  'winter@eup.net.vn',
  'alice@eup.net.vn',
  'clara@eup.net.vn',
  'eric@eup.net.vn',
  'steven@eup.net.vn',
  'tansy@eup.net.vn',
  'lucy@eup.net.vn',
  'ella@eup.net.vn',
  'vera@eup.net.vn',
  'brian@eup.net.vn',
  'alex@eup.net.vn',
  'cris@eup.net.vn',
  'tina@eup.net.vn',
  'ellie@eup.net.vn',
  'mimi@eup.net.vn',
  'jin@eup.net.vn',
  'adam@eup.net.vn',
  'maika@eup.net.vn',
  'vivi@eup.net.vn',
  'gina@eup.net.vn',
  'mango@eup.net.vn'
)
ON CONFLICT (user_id, department_id) DO NOTHING;

-- 2. Hardware dept: ALL permissions on ALL sub-pages
INSERT INTO department_permissions (department_id, sub_page_id, can_read, can_create, can_update, can_delete)
SELECT d.id, fsp.id, true, true, true, true
FROM departments d, feature_sub_pages fsp
WHERE d.code = 'hardware'
ON CONFLICT (department_id, sub_page_id) DO UPDATE
  SET can_read=true, can_create=true, can_update=true, can_delete=true;

-- 3. Kinh doanh: read-only on Quan ly thiet bi sub-pages
INSERT INTO department_permissions (department_id, sub_page_id, can_read, can_create, can_update, can_delete)
SELECT d.id, fsp.id, true, false, false, false
FROM departments d
JOIN feature_sub_pages fsp ON fsp.code IN ('thiet_bi_danh_sach','thiet_bi_tinh_nang','thiet_bi_xe')
WHERE d.code = 'kinh_doanh'
ON CONFLICT (department_id, sub_page_id) DO UPDATE
  SET can_read=true, can_create=false, can_update=false, can_delete=false;

-- Done. Check results:
SELECT d.name, count(ud.user_id) as members
FROM departments d
LEFT JOIN user_departments ud ON ud.department_id = d.id
GROUP BY d.id, d.name ORDER BY d.name;