-- Cho phép 1 order_name map với nhiều CRM types
-- Đổi unique constraint từ (order_name) sang (order_name, crm_name)

ALTER TABLE device_type_mapping
  DROP CONSTRAINT IF EXISTS device_type_mapping_order_name_unique;

ALTER TABLE device_type_mapping
  ADD CONSTRAINT device_type_mapping_order_crm_unique UNIQUE (order_name, crm_name);

-- Cập nhật index
DROP INDEX IF EXISTS idx_device_type_mapping_order_name;
CREATE INDEX IF NOT EXISTS idx_device_type_mapping_order_name
  ON device_type_mapping (lower(order_name));
