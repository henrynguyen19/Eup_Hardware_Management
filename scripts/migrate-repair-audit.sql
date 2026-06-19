-- ============================================================
-- Migration: Repair audit log + sua_chua:write permission
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột audit vào repair_weeks
ALTER TABLE repair_weeks
  ADD COLUMN IF NOT EXISTS entered_by  TEXT,        -- email người nhập
  ADD COLUMN IF NOT EXISTS entered_at  TIMESTAMPTZ; -- thời điểm nhập

-- 2. Bảng audit log chi tiết
CREATE TABLE IF NOT EXISTS repair_entry_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id     UUID NOT NULL REFERENCES repair_weeks(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('create', 'update', 'import')),
  entered_by  TEXT NOT NULL,   -- email người thực hiện
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS repair_entry_logs_week_id_idx ON repair_entry_logs(week_id);
CREATE INDEX IF NOT EXISTS repair_entry_logs_entered_by_idx ON repair_entry_logs(entered_by);

-- RLS
ALTER TABLE repair_entry_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read logs" ON repair_entry_logs;
DROP POLICY IF EXISTS "authenticated insert logs" ON repair_entry_logs;
CREATE POLICY "authenticated read logs"   ON repair_entry_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert logs" ON repair_entry_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Tạo bảng user_group_members nếu chưa có
CREATE TABLE IF NOT EXISTS user_group_members (
  user_id   UUID NOT NULL,
  group_id  UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_ugm_user_id ON user_group_members(user_id);

ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ugm_select_authenticated" ON user_group_members;
DROP POLICY IF EXISTS "ugm_all_service_role"     ON user_group_members;
CREATE POLICY "ugm_select_authenticated" ON user_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "ugm_all_service_role"     ON user_group_members FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- 4. Thêm sua_chua:write vào role_permissions của Galvin và Zeus
-- (Cách trực tiếp nhất: thêm vào role hiện tại của mỗi người)
-- Thay email thực tế nếu khác galvin@/zeus@eup.net.vn
DO $$
DECLARE
  galvin_role_id UUID;
  zeus_role_id   UUID;
BEGIN
  SELECT role_id INTO galvin_role_id
  FROM user_roles WHERE user_email = 'galvin@eup.net.vn';

  SELECT role_id INTO zeus_role_id
  FROM user_roles WHERE user_email = 'zeus@eup.net.vn';

  -- role_permissions schema: (id uuid PK, role_id uuid, permission text)
  IF galvin_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission)
    SELECT galvin_role_id, 'sua_chua:write'
    WHERE NOT EXISTS (
      SELECT 1 FROM role_permissions
      WHERE role_id = galvin_role_id AND permission = 'sua_chua:write'
    );
    RAISE NOTICE 'Da them sua_chua:write cho role cua Galvin (role_id=%)', galvin_role_id;
  ELSE
    RAISE NOTICE 'Khong tim thay galvin@eup.net.vn trong user_roles';
  END IF;

  IF zeus_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission)
    SELECT zeus_role_id, 'sua_chua:write'
    WHERE NOT EXISTS (
      SELECT 1 FROM role_permissions
      WHERE role_id = zeus_role_id AND permission = 'sua_chua:write'
    );
    RAISE NOTICE 'Da them sua_chua:write cho role cua Zeus (role_id=%)', zeus_role_id;
  ELSE
    RAISE NOTICE 'Khong tim thay zeus@eup.net.vn trong user_roles';
  END IF;
END $$;
