-- ===================================================
-- Bảng device_inventory: lưu danh sách thiết bị từ CRM
-- ===================================================

CREATE TABLE IF NOT EXISTS device_inventory (
  id               SERIAL PRIMARY KEY,
  device_id        INTEGER NOT NULL,                -- Device_ID từ CRM (unique per transfer)
  device_code      VARCHAR(100),                    -- Device_Code (IMEI / serial)
  product_name     VARCHAR(200),                    -- Tên loại thiết bị
  vendor_name      VARCHAR(200),                    -- Hãng sản xuất
  imported_date    DATE,                            -- Device_Date / Device_TransferTime
  source_stock     VARCHAR(200),                    -- Device_SourceStockName
  dest_stock       VARCHAR(200),                    -- Device_DestStockName
  transfer_action  VARCHAR(200),                    -- Device_TransferActionName
  firmware_ver     VARCHAR(100),                    -- Device_FirewareVer
  hardware_memo    TEXT,                            -- Device_HardwareMemo
  memo             TEXT,                            -- Device_Memo
  crm_raw          JSONB,                           -- Raw JSON từ CRM để debug
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

-- device_id + imported_date unique (cùng thiết bị có thể nhập nhiều đợt)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_inventory_device_id
  ON device_inventory(device_id);

CREATE INDEX IF NOT EXISTS idx_device_inventory_code
  ON device_inventory(device_code);

CREATE INDEX IF NOT EXISTS idx_device_inventory_date
  ON device_inventory(imported_date);

CREATE INDEX IF NOT EXISTS idx_device_inventory_product
  ON device_inventory(product_name);

-- View permission (nếu cần)
-- GRANT SELECT ON device_inventory TO authenticated;
