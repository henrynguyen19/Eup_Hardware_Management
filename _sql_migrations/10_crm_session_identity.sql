-- Migration: thêm cột identity vào crm_session_cache
-- Mỗi staff login bằng tài khoản riêng → CRM trả về SESSION_ID + IDENTITY riêng
-- IDENTITY phải được dùng đúng với SESSION_ID khi gọi SOAP API

ALTER TABLE crm_session_cache
  ADD COLUMN IF NOT EXISTS identity TEXT;

-- Comment giải thích
COMMENT ON COLUMN crm_session_cache.identity IS
  'IDENTITY từ CRM login response — phải dùng cùng SESSION_ID khi gọi SOAP. Fallback = crm_staff_id::text nếu CRM không trả về.';
