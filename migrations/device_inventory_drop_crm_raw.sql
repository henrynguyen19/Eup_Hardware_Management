-- Xóa cột crm_raw để tiết kiệm storage + tránh timeout khi upsert
-- (cột này lưu toàn bộ JSON từ CRM, ~2KB/row × 200k rows = 400MB không cần thiết)
ALTER TABLE device_inventory DROP COLUMN IF EXISTS crm_raw;
