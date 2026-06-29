-- Migration: Tạo role "Xem toàn bộ (Read-only)" và gán cho demo@eup.net.vn
-- Chạy trong Supabase SQL Editor

DO $$
DECLARE
  v_role_id UUID;
  v_user_id UUID;
BEGIN

  -- 1. Tạo role nếu chưa có
  INSERT INTO roles (name, is_system)
  VALUES ('Xem toan bo', false)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_id FROM roles WHERE name = 'Xem toan bo';

  -- 2. Gán tất cả quyền đọc (không có quyền write/admin hệ thống)
  INSERT INTO role_permissions (role_id, permission) VALUES
    (v_role_id, 'kho:read'),
    (v_role_id, 'kho_daily:read'),
    (v_role_id, 'ho_tro:read'),
    (v_role_id, 'ho_tro:admin'),
    (v_role_id, 'sua_chua:read'),
    (v_role_id, 'chat_luong:read'),
    (v_role_id, 'chung_nhan:read')
  ON CONFLICT DO NOTHING;

  -- 3. Tìm user demo@eup.net.vn
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'demo@eup.net.vn';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản demo@eup.net.vn — hãy tạo user này trong Supabase Auth trước';
  END IF;

  -- 4. Gán role
  DELETE FROM user_roles WHERE user_id = v_user_id;
  INSERT INTO user_roles (user_id, user_email, role_id)
  VALUES (v_user_id, 'demo@eup.net.vn', v_role_id);

  RAISE NOTICE 'Đã gán role "Xem toan bo" cho demo@eup.net.vn (user_id: %)', v_user_id;

END $$;
