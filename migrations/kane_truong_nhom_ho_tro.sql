-- Migration: Thêm quyền Trưởng nhóm Hỗ trợ cho Kane (kane@eup.net.vn)
-- Chạy file này trong Supabase SQL Editor

DO $$
DECLARE
  v_role_id   UUID;
  v_user_id   UUID;
BEGIN

  -- 1. Tạo role "Truong nhom Ho tro" nếu chưa có
  INSERT INTO roles (name, is_system)
  VALUES ('Truong nhom Ho tro', false)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_role_id FROM roles WHERE name = 'Truong nhom Ho tro';

  -- 2. Gán các permissions cho role này (cột đúng là "permission", không phải "permission_key")
  INSERT INTO role_permissions (role_id, permission) VALUES
    (v_role_id, 'ho_tro:read'),
    (v_role_id, 'ho_tro:write'),
    (v_role_id, 'ho_tro:admin'),
    (v_role_id, 'kho_daily:read'),
    (v_role_id, 'sua_chua:read'),
    (v_role_id, 'kho:read')
  ON CONFLICT DO NOTHING;

  -- 3. Tìm user_id của Kane
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'kane@eup.net.vn';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản kane@eup.net.vn';
  END IF;

  -- 4. Gán role cho Kane (DELETE + INSERT vì không có unique constraint trên user_id)
  DELETE FROM user_roles WHERE user_id = v_user_id;
  INSERT INTO user_roles (user_id, user_email, role_id)
  VALUES (v_user_id, 'kane@eup.net.vn', v_role_id);

  RAISE NOTICE 'Đã gán role "Truong nhom Ho tro" cho Kane (user_id: %)', v_user_id;

END $$;
