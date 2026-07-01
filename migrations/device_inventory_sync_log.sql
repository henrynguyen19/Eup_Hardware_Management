-- ===================================================
-- Bảng track tháng nào đã sync xong device_inventory
-- ===================================================

CREATE TABLE IF NOT EXISTS device_inventory_sync_log (
  month        VARCHAR(7) PRIMARY KEY,   -- YYYY-MM
  record_count INTEGER DEFAULT 0,
  has_error    BOOLEAN DEFAULT FALSE,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate từ dữ liệu hiện có trong device_inventory
-- (đánh dấu tất cả tháng đang có data là "đã sync")
INSERT INTO device_inventory_sync_log (month, record_count, synced_at)
SELECT
  TO_CHAR(imported_date, 'YYYY-MM') AS month,
  COUNT(*)                          AS record_count,
  NOW()                             AS synced_at
FROM device_inventory
WHERE imported_date IS NOT NULL
GROUP BY TO_CHAR(imported_date, 'YYYY-MM')
ON CONFLICT (month) DO UPDATE
  SET record_count = EXCLUDED.record_count,
      synced_at    = NOW();

-- Xóa 2 tháng bị lỗi để chúng được sync lại
-- (thêm tháng khác nếu cần)
DELETE FROM device_inventory_sync_log
WHERE month IN ('2025-03', '2025-05');
