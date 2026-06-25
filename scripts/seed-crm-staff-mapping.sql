-- CRM Staff ID mapping cho Hardware Dept
-- Chạy trong Supabase SQL Editor sau khi tạo bảng user_crm_mapping
-- Email matching dùng ILIKE (không phân biệt hoa thường)

INSERT INTO user_crm_mapping (user_id, crm_staff_id, crm_staff_name, crm_nick_name, crm_account)
SELECT u.id, v.crm_staff_id, v.crm_staff_name, v.crm_nick_name, v.crm_account
FROM auth.users u
JOIN (VALUES
  (2894, $$Nguyễn Văn Hùng$$, $$Henry$$, $$nvhung$$, $$henry@eup.net.vn$$),
  (9268, $$Trần Thanh Tùng$$, $$Blue$$, $$Tttung$$, $$Blue@eup.net.vn$$),
  (9267, $$Hoàng Việt Dũng$$, $$Bob$$, $$Hvdung$$, $$Bob@eup.net.vn$$),
  (9133, $$Hoàng Văn Cường$$, $$Chen$$, $$Hvcuong$$, $$Chen@eup.net.vn$$),
  (9226, $$Lê Huy Hiếu$$, $$Cop$$, $$Lhhieu$$, $$Cop@eup.net.vn$$),
  (9113, $$Nguyễn Thế Đạt$$, $$Galvin$$, $$Ntdat$$, $$Galvin@eup.net.vn$$),
  (9168, $$Hoàng Kim Xuyến$$, $$Irene$$, $$Hkxuyen$$, $$Irene@eup.net.vn$$),
  (6772, $$Nguyễn Thu Hiền$$, $$Julie$$, $$nthien$$, $$julie@eup.net.vn$$),
  (8869, $$Trần Như Tư$$, $$Kai$$, $$tntu$$, $$kai@eup.net.vn$$),
  (9141, $$Lỗ Văn Ninh$$, $$Kane$$, $$Lvninh$$, $$Kane@eup.net.vn$$),
  (9167, $$Dương Tử Quỳnh$$, $$Kris$$, $$Dtquynh$$, $$Kris@eup.net.vn$$),
  (9205, $$Nguyễn Bá Đức Anh$$, $$Nick$$, $$nbdanh$$, $$Nick@eup.net.vn$$),
  (9147, $$Lê Đặng Tuấn Kiệt$$, $$Peter$$, $$Ldtkiet$$, $$Peter@eup.net.vn$$),
  (9146, $$Nguyễn Thành Đạt$$, $$Shiro$$, $$Nthdat$$, $$Shiro@eup.net.vn$$),
  (9090, $$Trịnh Huy Thương$$, $$Stefan$$, $$Ththuong$$, $$Stefan@eup.net.vn$$),
  (9263, $$Nguyễn Đạt Công Tài$$, $$Thor$$, $$Ndctai$$, $$Thor@eup.net.vn$$),
  (9105, $$Đoàn Văn Lực$$, $$Zeus$$, $$Dvluc$$, $$Zeus@eup.net.vn$$)
) AS v(crm_staff_id, crm_staff_name, crm_nick_name, crm_account, crm_email)
  ON LOWER(u.email) = LOWER(v.crm_email)
ON CONFLICT (user_id) DO UPDATE SET
  crm_staff_id   = EXCLUDED.crm_staff_id,
  crm_staff_name = EXCLUDED.crm_staff_name,
  crm_nick_name  = EXCLUDED.crm_nick_name,
  crm_account    = EXCLUDED.crm_account,
  updated_at     = now();

-- Kiểm tra kết quả
SELECT 
  m.crm_nick_name,
  m.crm_staff_id,
  m.crm_staff_name,
  u.email
FROM user_crm_mapping m
JOIN auth.users u ON u.id = m.user_id
ORDER BY m.crm_nick_name;

