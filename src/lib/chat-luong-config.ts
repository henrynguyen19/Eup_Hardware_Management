// ============================================================
// Cấu hình Google Sheets cho module Quản lý chất lượng
// ============================================================

export interface RegionConfig {
  code:      string   // 'HN', 'HP', 'DN', 'HCM', 'BD'
  name:      string   // 'Hà Nội', ...
  sheetTab:  string   // Tên tab trong Google Sheet (để dùng ?sheet=...)
  color:     string   // Màu hiển thị
}

// Spreadsheet ID của sheet Quản lý chất lượng
export const QUALITY_SHEET_ID = '1d2QXWXDu2P_ea4v9aY4jlImXZRCzRXjThJVQjSGW54Q'

// Danh sách khu vực + tên tab trong spreadsheet
// Ghi chú: nếu sheetTab = '' thì sẽ fetch tab đầu tiên (mặc định)
export const QUALITY_REGIONS: RegionConfig[] = [
  { code: 'HN',  name: 'Hà Nội',    sheetTab: 'HN',  color: '#3b82f6' },
  { code: 'HP',  name: 'Hải Phòng', sheetTab: 'HP',  color: '#8b5cf6' },
  { code: 'DN',  name: 'Đà Nẵng',   sheetTab: 'DN',  color: '#22c55e' },
  { code: 'HCM', name: 'HCM',       sheetTab: 'HCM', color: '#f59e0b' },
  { code: 'BD',  name: 'Bình Dương',sheetTab: 'BD',  color: '#ec4899' },
]

// Giá trị "Nguyên nhân điều phối" — dùng để phân nhóm thống kê
export const NGUYEN_NHAN_TYPES = [
  'Đơn hàng mới',
  'Bảo trì',
  'Lắp đặt',
  'Hàng nhập vào',
  'Sau sửa chữa',
]

// Tab tổng hợp tất cả regions
export const THONGKE_SHEET_TAB = 'Thống kê'

// Màu theo tình trạng
export const TINH_TRANG_CONFIG = {
  OK:    { label: 'Đạt',              color: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
  NG:    { label: 'Lỗi — cần KT lại', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  blank: { label: 'Chưa kiểm tra',    color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
}

export function getTinhTrangKey(val: string): 'OK' | 'NG' | 'blank' {
  const v = val.trim().toUpperCase()
  if (v === 'OK') return 'OK'
  if (v === 'NG') return 'NG'
  return 'blank'
}
