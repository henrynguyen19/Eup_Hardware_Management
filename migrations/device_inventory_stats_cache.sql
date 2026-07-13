-- ===================================================
-- Bảng cache kết quả thống kê tỉ lệ lỗi
-- Singleton row (id = 'singleton'), TTL kiểm soát ở API (30 phút)
-- Được refresh sau mỗi lần sync CRM hoặc khi gọi /api/device-inventory/stats?refresh=1
-- ===================================================
CREATE TABLE IF NOT EXISTS device_inventory_stats_cache (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  data        JSONB        NOT NULL,
  computed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
