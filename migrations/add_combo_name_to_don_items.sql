-- Thêm cột combo_name vào giao_hang_don_items
-- Dùng để nhóm các item thuộc cùng 1 combo khi hiển thị đơn hàng
ALTER TABLE giao_hang_don_items
  ADD COLUMN IF NOT EXISTS combo_name TEXT DEFAULT NULL;
