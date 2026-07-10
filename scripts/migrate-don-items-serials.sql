-- Migration: device_serials per order item (mã thiết bị khi gửi)
ALTER TABLE giao_hang_don_items
  ADD COLUMN IF NOT EXISTS device_serials TEXT[] DEFAULT '{}';
