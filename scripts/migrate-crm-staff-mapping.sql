-- Bảng lưu mapping user app <-> CRM Staff_ID
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_crm_mapping (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_staff_id     integer NOT NULL UNIQUE,
  crm_staff_name   text,       -- Staff_Name từ CRM
  crm_nick_name    text,       -- Staff_NickName từ CRM (Kane, Stefan, ...)
  crm_account      text,       -- Staff_Account từ CRM
  updated_at       timestamptz DEFAULT now()
);

-- Chỉ admin được đọc/ghi
ALTER TABLE user_crm_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON user_crm_mapping
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_permissions_view
      WHERE user_id = auth.uid()
        AND 'admin:users' = ANY(permissions)
    )
  );

-- Index để tìm nhanh theo crm_staff_id
CREATE INDEX IF NOT EXISTS idx_user_crm_mapping_staff_id
  ON user_crm_mapping (crm_staff_id);

-- Xem kết quả
SELECT 'user_crm_mapping created' AS result;
