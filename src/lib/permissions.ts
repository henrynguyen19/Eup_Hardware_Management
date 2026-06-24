// ============================================================
// Permission helpers — EUP Hardware Management
// ============================================================

// ── Legacy (kept for admin:users check) ──────────────────────
export const MODULES = ['kho', 'gui_hang', 'sua_chua', 'ho_tro'] as const
export const ACTIONS = ['read', 'write', 'edit', 'delete'] as const

export const MODULE_LABELS: Record<string, string> = {
  kho:       'Kho',
  gui_hang:  'Giao nhận',
  sua_chua:  'Sửa chữa',
  ho_tro:    'Hỗ trợ kỹ thuật',
}

export const ACTION_LABELS: Record<string, string> = {
  read:   'Xem',
  write:  'Thêm/Sửa',
  edit:   'Chỉnh sửa',
  delete: 'Xóa',
}
export type Module = typeof MODULES[number]
export type Action = typeof ACTIONS[number]
export type Permission = `${Module}:${Action}` | 'admin:users' | 'admin:roles'

export function isAdmin(permissions: string[]): boolean {
  return permissions.includes('admin:users')
}

// ── New department-based permission system ────────────────────

export type CrudPerm = {
  can_read:   boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

// Map of sub_page_code → CrudPerm
export type EffectivePermissions = Record<string, CrudPerm>

// Sub-page codes
export const SUB_PAGES = {
  // Quản lý thiết bị
  THIET_BI_DANH_SACH: 'thiet_bi_danh_sach',
  THIET_BI_TINH_NANG: 'thiet_bi_tinh_nang',
  THIET_BI_XE:   