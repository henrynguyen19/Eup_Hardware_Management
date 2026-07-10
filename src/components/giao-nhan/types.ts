// Shared types & helpers for GiaoHang feature
export interface Equipment    { equipment_id: string; name: string; device_type?: string; category?: string }
export interface ComboItem    { device_name: string; quantity: number; notes?: string; sort_order?: number }
export interface Combo        { id: string; name: string; description?: string; device_combo_items: ComboItem[] }
export interface Recipient    { id: string; name: string; type: string; office?: string; address?: string; phone?: string; contact_name?: string; notes?: string }
export interface CartItem     { device_name: string; quantity: number; customer_codes: string[]; expected_receipt: string }
export interface DonItem      { id: string; device_name: string; quantity: number; customer_codes?: string[]; expected_receipt?: string; sheet_row?: number }
export interface DonHang      { id: string; order_code: string; orderer_email: string; orderer_name: string; office: string; expected_date?: string; expected_ship_date?: string; recipient_info?: string; notes?: string; status: string; created_at: string; giao_hang_don_items: DonItem[] }
export interface SheetOrder   { id: string; sheet_row: number; stt: string; order_time: string; office: string; orderer: string; device_type: string; quantity: string; expected_date: string; recipient_info: string; synced_at: string }

export const STATUS_LABEL: Record<string, string> = {
  cho_xu_ly: 'Chờ xử lý', dang_xu_ly: 'Đang xử lý',
  da_gui: 'Đã gửi', hoan_thanh: 'Hoàn thành', da_huy: 'Đã hủy',
}
export const STATUS_COLOR: Record<string, string> = {
  cho_xu_ly: 'bg-yellow-100 text-yellow-700', dang_xu_ly: 'bg-blue-100 text-blue-700',
  da_gui: 'bg-purple-100 text-purple-700', hoan_thanh: 'bg-green-100 text-green-700',
  da_huy: 'bg-gray-100 text-gray-500',
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
