// ============================================================
// Permission helpers — EUP Hardware Management
// ============================================================

export const MODULES = ['kho', 'gui_hang', 'sua_chua', 'ho_tro'] as const
export const ACTIONS = ['read', 'write', 'edit', 'delete'] as const

export type Module = typeof MODULES[number]
export type Action = typeof ACTIONS[number]
export type Permission = `${Module}:${Action}` | 'admin:users' | 'admin:roles'

export const MODULE_LABELS: Record<Module, string> = {
  kho: '🗄️ Kho',
  gui_hang: '📦 Gửi hàng',
  sua_chua: '🔧 Sửa chữa',
  ho_tro: '📋 Hỗ trợ kỹ thuật',
}

export const ACTION_LABELS: Record<Action, string> = {
  read: 'Xem',
  write: 'Thêm',
  edit: 'Sửa',
  delete: 'Xóa',
}

export function can(permissions: string[], module: Module, action: Action): boolean {
  return permissions.includes(`${module}:${action}`)
}

export function isAdmin(permissions: string[]): boolean {
  return permissions.includes('admin:users')
}

export function canAccessModule(permissions: string[], module: Module): boolean {
  return ACTIONS.some(action => permissions.includes(`${module}:${action}`))
}
