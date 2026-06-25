-- Migration: thêm crm_password vào user_crm_mapping
-- và đổi crm_session_cache thành per-user

-- 1. Thêm cột password
ALTER TABLE user_crm_mapping
  ADD COLUMN IF NOT EXISTS crm_password text;

-- 2. Đổi crm_session_cache thành per-user
DROP TABLE IF EXISTS crm_session_cache;
CREATE TABLE crm_session_cache (
  staff_id   int PRIMARY KEY,       -- CRM Staff_ID (1 row per user)
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now()
);
-- Chỉ service role được đọc/ghi
ALTER TABLE crm_session_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON crm_session_cache
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
