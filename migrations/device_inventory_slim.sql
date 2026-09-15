-- ============================================================
-- device_inventory: xóa cột thừa để giảm kích thước bảng
-- Trước: 234MB / 190k rows (~1.25KB/row)
-- Sau ước tính: ~20MB / 190k rows (~105 bytes/row)
--
-- Các cột bị xóa (hầu hết NULL hoặc không dùng trong query):
--   dest_stock       — 99.6% NULL (189,801/190,538)
--   source_stock     — không dùng trong bất kỳ query/function nào
--   transfer_action  — không dùng
--   firmware_ver     — không dùng
--   hardware_memo    — TEXT, hầu hết NULL, không dùng
--   memo             — TEXT, hầu hết NULL, không dùng
--   vendor_name      — không dùng trong function
--
-- Các cột GIỮ LẠI (cần cho JOIN và stats):
--   device_id    — unique key, dùng cho upsert ON CONFLICT
--   device_code  — IMEI/barcode, JOIN với repair_items.imei
--   product_name — dùng trong device_inventory_failure_stats()
--   imported_date — dùng cho time-based analysis
--   synced_at    — tracking
-- ============================================================

-- Bước 1: Xóa các cột thừa
ALTER TABLE device_inventory
  DROP COLUMN IF EXISTS dest_stock,
  DROP COLUMN IF EXISTS source_stock,
  DROP COLUMN IF EXISTS transfer_action,
  DROP COLUMN IF EXISTS firmware_ver,
  DROP COLUMN IF EXISTS hardware_memo,
  DROP COLUMN IF EXISTS memo,
  DROP COLUMN IF EXISTS vendor_name;

-- Bước 2: Xóa cột crm_raw nếu còn tồn tại (đã drop trước đó nhưng chạy lại an toàn)
ALTER TABLE device_inventory
  DROP COLUMN IF EXISTS crm_raw;

-- Bước 3: Thu hồi không gian vật lý ngay lập tức
-- (VACUUM FULL lock bảng ~vài phút, nên chạy vào giờ ít dùng)
VACUUM FULL device_inventory;

-- Bước 4: Cập nhật statistics
ANALYZE device_inventory;

-- Kiểm tra kết quả
SELECT
  pg_size_pretty(pg_total_relation_size('device_inventory')) AS total_size,
  pg_size_pretty(pg_relation_size('device_inventory'))       AS table_size,
  (SELECT COUNT(*) FROM device_inventory)                    AS row_count;
