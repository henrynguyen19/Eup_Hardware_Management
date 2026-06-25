-- Assign assistants to VP departments based on known mapping
-- Run in Supabase SQL Editor

WITH assistant_map(username, dept_name) AS (
  VALUES
    -- VP Hà Nội
    ('zenda',   'VP Hà Nội'),
    ('canary',  'VP Hà Nội'),
    ('min',     'VP Hà Nội'),
    ('anna',    'VP Hà Nội'),
    ('lee',     'VP Hà Nội'),
    ('elsa',    'VP Hà Nội'),
    ('wendy',   'VP Hà Nội'),
    ('soda',    'VP Hà Nội'),
    ('jeny',    'VP Hà Nội'),
    ('abbey',   'VP Hà Nội'),
    -- VP Hồ Chí Minh
    ('bell',    'VP Hồ Chí Minh'),
    ('jade',    'VP Hồ Chí Minh'),
    ('zoey',    'VP Hồ Chí Minh'),
    ('vivian',  'VP Hồ Chí Minh'),
    ('alice',   'VP Hồ Chí Minh'),
    ('dani',    'VP Hồ Chí Minh'),
    ('selina',  'VP Hồ Chí Minh'),
    ('vanessa', 'VP Hồ Chí Minh'),
    ('winter',  'VP Hồ Chí Minh'),
    ('clara',   'VP Hồ Chí Minh'),
    -- VP Hải Phòng
    ('tina',    'VP Hải Phòng'),
    ('ellie',   'VP Hải Phòng'),
    ('mimi',    'VP Hải Phòng'),
    ('jin',     'VP Hải Phòng'),
    ('envy',    'VP Hải Phòng'),
    -- VP Bình Dương
    ('iris',    'VP Bình Dương'),
    ('tansy',   'VP Bình Dương'),
    ('vera',    'VP Bình Dương'),
    ('alina',   'VP Bình Dương'),
    ('an',      'VP Bình Dương'),
    ('mei',     'VP Bình Dương'),
    ('lucy',    'VP Bình Dương'),
    ('ella',    'VP Bình Dương'),
    -- VP Đà Nẵng
    ('vivi',    'VP Đà Nẵng'),
    ('gina',    'VP Đà Nẵng'),
    ('mango',   'VP Đà Nẵng')
),
user_lookup AS (
  SELECT
    u.id   AS user_id,
    lower(split_part(u.email, '@', 1)) AS username
  FROM auth.users u
  WHERE lower(split_part(u.email, '@', 1)) IN (SELECT username FROM assistant_map)
),
vp_depts AS (
  SELECT id, name FROM departments WHERE name LIKE 'VP %'
)
INSERT INTO user_departments (user_id, department_id)
SELECT ul.user_id, vp.id
FROM assistant_map am
JOIN user_lookup ul ON ul.username = am.username
JOIN vp_depts    vp ON vp.name     = am.dept_name
ON CONFLICT DO NOTHING;

-- Kiểm tra kết quả:
SELECT
  d.name AS vp_dept,
  count(ud.user_id) AS so_nguoi,
  string_agg(split_part(u.email, '@', 1), ', ' ORDER BY u.email) AS thanh_vien
FROM departments d
JOIN user_departments ud ON ud.department_id = d.id
JOIN auth.users u ON u.id = ud.user_id
WHERE d.name LIKE 'VP %'
GROUP BY d.name
ORDER BY d.name;
