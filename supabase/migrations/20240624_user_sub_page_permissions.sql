-- ================================================================
-- User-level sub-page permissions (override/extend dept permissions)
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. New table: individual user permissions per sub-page
CREATE TABLE IF NOT EXISTS user_sub_page_permissions (
  user_id     uuid NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  sub_page_id uuid NOT NULL REFERENCES feature_sub_pages(id) ON DELETE CASCADE,
  can_read    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_update  boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, sub_page_id)
);

ALTER TABLE user_sub_page_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usp_read" ON user_sub_page_permissions FOR SELECT TO authenticated USING (true);

-- 2. Update view: effective = OR(dept permissions, individual permissions)
CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT
  user_id, page_code, sub_page_code, sub_page_name, page_name,
  bool_or(can_read)   AS can_read,
  bool_or(can_create) AS can_create,
  bool_or(can_update) AS can_update,
  bool_or(can_delete) AS can_delete
FROM (
  -- Department-level
  SELECT
    ud.user_id,
    fp.code   AS page_code,
    fsp.code  AS sub_page_code,
    fsp.name  AS sub_page_name,
    fp.name   AS page_name,
    dp.can_read, dp.can_create, dp.can_update, dp.can_delete
  FROM user_departments ud
  JOIN department_permissions dp ON dp.department_id = ud.department_id
  JOIN feature_sub_pages fsp     ON fsp.id = dp.sub_page_id
  JOIN feature_pages fp          ON fp.id  = fsp.feature_page_id

  UNION ALL

  -- Individual user-level
  SELECT
    usp.user_id,
    fp.code, fsp.code, fsp.name, fp.name,
    usp.can_read, usp.can_create, usp.can_update, usp.can_delete
  FROM user_sub_page_permissions usp
  JOIN feature_sub_pages fsp ON fsp.id = usp.sub_page_id
  JOIN feature_pages fp      ON fp.id  = fsp.feature_page_id
) combined
GROUP BY user_id, page_code, sub_page_code, sub_page_name, page_name;
