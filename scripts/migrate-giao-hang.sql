-- Bảng lưu đơn đặt hàng từ Google Sheet "Order hàng VP- Kho"
CREATE TABLE IF NOT EXISTS giao_hang_orders (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_row      INTEGER NOT NULL,       -- Số hàng trong Google Sheet (1-indexed)
  stt            TEXT,                   -- Cột A: STT / mã đơn
  order_time     TEXT,                   -- Cột B: Thời gian đặt hàng
  office         TEXT,                   -- Cột C: Office / văn phòng
  orderer        TEXT,                   -- Cột D: Người đặt hàng
  device_type    TEXT,                   -- Cột E: Loại TB
  quantity       TEXT,                   -- Cột F: Số lượng đặt hàng
  expected_date  TEXT,                   -- Cột G: TG Dự kiến lắp đặt
  recipient_info TEXT,                   -- Cột H: Thông tin người nhận
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint để upsert theo sheet_row
ALTER TABLE giao_hang_orders
  DROP CONSTRAINT IF EXISTS giao_hang_orders_sheet_row_key;
ALTER TABLE giao_hang_orders
  ADD CONSTRAINT giao_hang_orders_sheet_row_key UNIQUE (sheet_row);

-- RLS
ALTER TABLE giao_hang_orders ENABLE ROW LEVEL SECURITY;

-- Chỉ user đã đăng nhập mới đọc được
CREATE POLICY IF NOT EXISTS "giao_hang_orders_select" ON giao_hang_orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Chỉ service role mới insert/update (API dùng service role key)
CREATE POLICY IF NOT EXISTS "giao_hang_orders_service_insert" ON giao_hang_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "giao_hang_orders_service_update" ON giao_hang_orders
  FOR UPDATE USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_giao_hang_orders_office ON giao_hang_orders(office);
CREATE INDEX IF NOT EXISTS idx_giao_hang_orders_sheet_row ON giao_hang_orders(sheet_row);
