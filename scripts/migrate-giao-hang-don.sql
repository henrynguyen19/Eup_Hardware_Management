-- ============================================================
-- Đơn đặt hàng qua web — header mỗi lần đặt
-- ============================================================
CREATE TABLE IF NOT EXISTS giao_hang_don_hang (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code    TEXT    NOT NULL,              -- Mã đơn tự sinh: DH-YYYYMMDD-NNN
  orderer_email TEXT    NOT NULL,              -- Email tài khoản đăng nhập
  orderer_name  TEXT    NOT NULL,              -- Tên người đặt (user nhập)
  office        TEXT    NOT NULL,              -- Văn phòng
  expected_date TEXT,                          -- TG dự kiến lắp đặt
  recipient_info TEXT,                         -- Địa chỉ / SĐT người nhận
  notes         TEXT,                          -- Ghi chú thêm
  status        TEXT    NOT NULL DEFAULT 'cho_xu_ly',
  -- cho_xu_ly | dang_xu_ly | da_gui | hoan_thanh | da_huy
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Từng dòng thiết bị trong đơn
-- ============================================================
CREATE TABLE IF NOT EXISTS giao_hang_don_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID    NOT NULL REFERENCES giao_hang_don_hang(id) ON DELETE CASCADE,
  device_name TEXT    NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  sheet_row   INTEGER                          -- Hàng đã ghi vào Google Sheet
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_don_hang_email  ON giao_hang_don_hang(orderer_email);
CREATE INDEX IF NOT EXISTS idx_don_hang_status ON giao_hang_don_hang(status);
CREATE INDEX IF NOT EXISTS idx_don_hang_created ON giao_hang_don_hang(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_don_items_order ON giao_hang_don_items(order_id);

-- RLS
ALTER TABLE giao_hang_don_hang  ENABLE ROW LEVEL SECURITY;
ALTER TABLE giao_hang_don_items ENABLE ROW LEVEL SECURITY;

-- Policies don_hang
DROP POLICY IF EXISTS "don_hang_select" ON giao_hang_don_hang;
CREATE POLICY "don_hang_select" ON giao_hang_don_hang
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "don_hang_insert" ON giao_hang_don_hang;
CREATE POLICY "don_hang_insert" ON giao_hang_don_hang
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "don_hang_update" ON giao_hang_don_hang;
CREATE POLICY "don_hang_update" ON giao_hang_don_hang
  FOR UPDATE USING (true);

-- Policies don_items
DROP POLICY IF EXISTS "don_items_select" ON giao_hang_don_items;
CREATE POLICY "don_items_select" ON giao_hang_don_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "don_items_insert" ON giao_hang_don_items;
CREATE POLICY "don_items_insert" ON giao_hang_don_items
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "don_items_update" ON giao_hang_don_items;
CREATE POLICY "don_items_update" ON giao_hang_don_items
  FOR UPDATE USING (true);
