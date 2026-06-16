-- ============================================================
-- Step 20：追蹤板（議題追蹤系統）
-- 前置條件：add-roles-permissions.sql 必須已執行
-- ============================================================

-- ── 1. 議題主表 ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS issues (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,        -- '缺貨'|'韌體'|'維修'|'客戶反應'|'其他'
  priority    TEXT NOT NULL DEFAULT 'medium',  -- 'high'|'medium'|'low'
  status      TEXT NOT NULL DEFAULT '待處理',  -- '待處理'|'進行中'|'等待中'|'已完成'
  due_date    DATE,
  description TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  TEXT NOT NULL,        -- user email
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2. 議題負責人（多人） ─────────────────────────────────

CREATE TABLE IF NOT EXISTS issue_assignees (
  issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  PRIMARY KEY (issue_id, user_email)
);

-- ── 3. 議題更新紀錄 ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS issue_updates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_by TEXT NOT NULL,  -- user email
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. updated_at 自動觸發器 ─────────────────────────────

CREATE OR REPLACE FUNCTION update_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_updated_at ON issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_issues_updated_at();

-- ── 5. RLS 政策 ───────────────────────────────────────────
-- 誰能做什麼：
--   authenticated 使用者：可讀三張表（SELECT）
--   寫入（INSERT/UPDATE/DELETE）：全部由 API Route 透過 Service Role 執行，前端不直接寫入

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_updates ENABLE ROW LEVEL SECURITY;

-- issues：登入者可讀
DROP POLICY IF EXISTS "authenticated read issues" ON issues;
CREATE POLICY "authenticated read issues" ON issues
  FOR SELECT USING (auth.role() = 'authenticated');

-- issue_assignees：登入者可讀
DROP POLICY IF EXISTS "authenticated read assignees" ON issue_assignees;
CREATE POLICY "authenticated read assignees" ON issue_assignees
  FOR SELECT USING (auth.role() = 'authenticated');

-- issue_updates：登入者可讀
DROP POLICY IF EXISTS "authenticated read updates" ON issue_updates;
CREATE POLICY "authenticated read updates" ON issue_updates
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 6. app_settings seed ─────────────────────────────────

INSERT INTO app_settings (key, value) VALUES
  ('issueTypes', '["缺貨", "韌體", "維修", "客戶反應", "其他"]'::jsonb),
  ('issueTags', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 7. role_permissions seed ──────────────────────────────

-- 管理員：加 4 項新權限（view_tracker / view_my_tasks / show_login_banner / create_issues）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'view_tracker', 'view_my_tasks', 'show_login_banner', 'create_issues'
]) FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;

-- 一般使用者：加 2 項（追蹤板可看、我的任務可看）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, unnest(ARRAY[
  'view_tracker', 'view_my_tasks'
]) FROM roles WHERE name = '一般使用者'
ON CONFLICT DO NOTHING;
