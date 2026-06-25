-- Bảng cache CRM session (tự động refresh, không cần update thủ công)
CREATE TABLE IF NOT EXISTS crm_session_cache (
  id          int PRIMARY KEY DEFAULT 1,  -- chỉ 1 row
  session_id  text NOT NULL,
  owner_id    int  NOT NULL,              -- Staff_ID của account login (Henry = 2894)
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz DEFAULT now()
);

-- Không cần RLS vì chỉ service_role mới access
SELECT 'crm_session_cache created' AS result;
