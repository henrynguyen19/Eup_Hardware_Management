-- Bảng mapping giữa tên thiết bị trong đơn hàng và tên trong CRM
-- order_name : tên người dùng gõ trong đơn (ví dụ "GO-168 V3", "Router WiFi 6")
-- crm_name   : product_name trong bảng device_inventory (= Device_TypeName từ SOAP)
-- crm_device_type_id: Device_Type numeric từ CRM (optional, để filter nhanh hơn)

CREATE TABLE IF NOT EXISTS device_type_mapping (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_name          text NOT NULL,          -- tên trong đơn hàng
  crm_name            text NOT NULL,          -- tên trong CRM (device_inventory.product_name)
  crm_device_type_id  integer,               -- Device_Type ID (optional)
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT device_type_mapping_order_name_unique UNIQUE (order_name)
);

-- Index để lookup nhanh theo order_name (dùng khi xử lý đơn hàng)
CREATE INDEX IF NOT EXISTS idx_device_type_mapping_order_name
  ON device_type_mapping (lower(order_name));

CREATE INDEX IF NOT EXISTS idx_device_type_mapping_crm_name
  ON device_type_mapping (crm_name);

-- RLS: chỉ admin mới có thể thay đổi, tất cả user đăng nhập có thể đọc
ALTER TABLE device_type_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_type_mapping_select" ON device_type_mapping
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "device_type_mapping_insert" ON device_type_mapping
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- kiểm soát qua API layer (isAdminUser)

CREATE POLICY "device_type_mapping_update" ON device_type_mapping
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "device_type_mapping_delete" ON device_type_mapping
  FOR DELETE TO authenticated USING (true);

-- Trigger tự cập nhật updated_at
CREATE OR REPLACE FUNCTION update_device_type_mapping_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_device_type_mapping_updated_at
  BEFORE UPDATE ON device_type_mapping
  FOR EACH ROW EXECUTE FUNCTION update_device_type_mapping_updated_at();
