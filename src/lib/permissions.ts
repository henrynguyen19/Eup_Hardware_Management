// ============================================================
// Permission helpers — EUP Hardware Management
// ============================================================

// ── Legacy (kept for admin:users check) ──────────────────────
export const MODULES = ['kho', 'gui_hang', 'sua_chua', 'ho_tro'] as const
export const ACTIONS = ['read', 'write', 'edit', 'delete'] as const
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
  THIET_BI_XE:        'thiet_bi_xe',
  // Hỗ trợ kỹ thuật
  HOTRO_BANG_THONG_KE:'hotro_bang_thong_ke',
  HOTRO_JIRA_BUGS:    'hotro_jira_bugs',
  // Single-page features
  GIAY_CHUNG_NHAN:    'giay_chung_nhan_main',
  SUA_CHUA:           'sua_chua_main',
  CHAT_LUONG:         'chat_luong_main',
  GIAO_HANG:          'giao_hang_main',
} as const

// Feature page codes (for sidebar visibility check)
export const PAGES = {
  THIET_BI:   'quan_ly_thiet_bi',
  HO_TRO:     'ho_tro_ky_thuat',
  CHUNG_NHAN: 'giay_chung_nhan',
  SUA_CHUA:   'thong_ke_sua_chua',
  CHAT_LUONG: 'quan_ly_chat_luong',
  GIAO_HANG:  'thong_tin_giao_hang',
} as const

export function canRead(perms: EffectivePermissions, subPage: string): boolean {
  return perms[subPage]?.can_read ?? false
}

export function canCreate(perms: EffectivePermissions, subPage: string): boolean {
  return perms[subPage]?.can_create ?? false
}

export function canUpdate(perms: EffectivePermissions, subPage: string): boolean {
  return perms[subPage]?.can_update ?? false
}

export function canDelete(perms: EffectivePermissions, subPage: string): boolean {
  return perms[subPage]?.can_delete ?? false
}

// Check if user can access a feature page (has read on at least one sub-page)
export function canAccessPage(perms: EffectivePermissions, pageCode: string): boolean {
  return Object.entries(perms).some(([, p]) => p.can_read)
    // Fallback: if no new perms, check legacy
    ?? false
}
