/**
 * auth-helpers.ts — Hệ thống phân quyền 2 cấp
 *
 * Cấp 1: Phòng ban (department) → được gán 1 role → role xác định ceiling
 * Cấp 2: Nhân viên trong phòng → user_dept_permissions (subset của role phòng)
 *
 * Admin = user thuộc phòng 'hardware' HOẶC được gán role 'Admin' qua user_roles
 *
 * Sub-page codes:
 *   'sua_chua_main'        → Sửa chữa / Repair tracking
 *   'giao_hang_main'       → Giao nhận
 *   'hotro_bang_thong_ke'  → Hỗ trợ kỹ thuật
 *   'chat_luong_main'      → Chất lượng
 *   'giay_chung_nhan_main' → Chứng nhận
 *   'thiet_bi_danh_sach'   → Kho - Danh sách
 *   'thiet_bi_tinh_nang'   → Kho - Tính năng
 *   'thiet_bi_xe'          → Kho - Xe & thiết bị
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Lấy user đang đăng nhập từ session cookie */
export async function getAuthUser() {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  return user
}

/**
 * Kiểm tra admin:
 * 1. User thuộc phòng 'hardware' (hardware dept = admin phòng phần cứng)
 * 2. HOẶC user được gán role 'Admin' qua user_roles (admin gán từ UI)
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const db = adminDb()

  const [deptResult, roleResult] = await Promise.all([
    db.from('user_departments').select('departments(code)').eq('user_id', userId),
    db.from('user_roles').select('roles(name)').eq('user_id', userId),
  ])

  if ((deptResult.data ?? []).some(
    (r: { departments: { code: string } | null }) => r.departments?.code === 'hardware'
  )) return true

  return (roleResult.data ?? []).some(
    (r: { roles: { name: string } | null }) => r.roles?.name === 'Admin'
  )
}

/**
 * Lấy tất cả permission_key của user từ bảng user_dept_permissions
 * (hệ thống mới — employee permissions within departments)
 */
export async function getUserPermKeys(userId: string): Promise<Set<string>> {
  const { data } = await adminDb()
    .from('user_dept_permissions')
    .select('permission_key')
    .eq('user_id', userId)
  return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key))
}

/**
 * Map permission_key → sub_page_codes + actions được phép
 * Dùng để check hasSubPagePerm từ hệ thống mới
 */
const PERM_TO_SUB_ACCESS: Record<string, Array<{ code: string; actions: string[] }>> = {
  'kho:read': [
    { code: 'thiet_bi_danh_sach', actions: ['can_read'] },
    { code: 'thiet_bi_tinh_nang', actions: ['can_read'] },
    { code: 'thiet_bi_xe',        actions: ['can_read'] },
  ],
  'kho:write': [
    { code: 'thiet_bi_danh_sach', actions: ['can_create', 'can_update'] },
    { code: 'thiet_bi_tinh_nang', actions: ['can_create', 'can_update'] },
    { code: 'thiet_bi_xe',        actions: ['can_create', 'can_update'] },
  ],
  'kho:delete': [
    { code: 'thiet_bi_danh_sach', actions: ['can_delete'] },
    { code: 'thiet_bi_tinh_nang', actions: ['can_delete'] },
    { code: 'thiet_bi_xe',        actions: ['can_delete'] },
  ],
  'ho_tro:read':   [{ code: 'hotro_bang_thong_ke', actions: ['can_read'] }, { code: 'hotro_jira_bugs', actions: ['can_read'] }],
  'ho_tro:write':  [{ code: 'hotro_bang_thong_ke', actions: ['can_create', 'can_update'] }],
  'ho_tro:admin':  [
    { code: 'hotro_bang_thong_ke', actions: ['can_create', 'can_update', 'can_delete'] },
    { code: 'hotro_jira_bugs',     actions: ['can_read', 'can_create', 'can_update', 'can_delete'] },
  ],
  'ho_tro:delete': [{ code: 'hotro_bang_thong_ke', actions: ['can_delete'] }],
  'sua_chua:read':   [{ code: 'sua_chua_main', actions: ['can_read'] }],
  'sua_chua:write':  [{ code: 'sua_chua_main', actions: ['can_create', 'can_update'] }],
  'sua_chua:delete': [{ code: 'sua_chua_main', actions: ['can_delete'] }],
  'gui_hang:read':   [{ code: 'giao_hang_main', actions: ['can_read'] }],
  'gui_hang:write':  [{ code: 'giao_hang_main', actions: ['can_create', 'can_update'] }],
  'gui_hang:delete': [{ code: 'giao_hang_main', actions: ['can_delete'] }],
  'chat_luong:read':  [{ code: 'chat_luong_main', actions: ['can_read'] }],
  'chat_luong:write': [{ code: 'chat_luong_main', actions: ['can_create', 'can_update'] }],
  'chung_nhan:read':  [{ code: 'giay_chung_nhan_main', actions: ['can_read'] }],
  'chung_nhan:write': [{ code: 'giay_chung_nhan_main', actions: ['can_create', 'can_update'] }],
}

/**
 * Kiểm tra user có quyền CRUD cụ thể trên một sub-page.
 * Kiểm tra cả 2 hệ thống (cũ + mới).
 */
export async function hasSubPagePerm(
  userId: string,
  subPageCode: string,
  action: 'can_read' | 'can_create' | 'can_update' | 'can_delete' = 'can_read'
): Promise<boolean> {
  // Check hệ thống cũ
  const { data } = await adminDb()
    .from('user_effective_permissions')
    .select(action)
    .eq('user_id', userId)
    .eq('sub_page_code', subPageCode)
    .maybeSingle()

  if ((data as Record<string, boolean> | null)?.[action]) return true

  // Check hệ thống mới (user_dept_permissions)
  const permKeys = await getUserPermKeys(userId)
  for (const [key, accesses] of Object.entries(PERM_TO_SUB_ACCESS)) {
    if (!permKeys.has(key)) continue
    for (const access of accesses) {
      if (access.code === subPageCode && access.actions.includes(action)) return true
    }
  }
  return false
}

/**
 * Yêu cầu user là admin. Trả về user hoặc error response.
 */
export async function requireAdmin(): Promise<
  { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> } |
  { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  if (!(await isAdminUser(user.id))) {
    return { ok: false, response: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true, user }
}

/**
 * Yêu cầu admin HOẶC có quyền cụ thể trên sub-page.
 */
export async function requirePermOrAdmin(
  subPageCode: string,
  action: 'can_read' | 'can_create' | 'can_update' | 'can_delete' = 'can_read'
): Promise<
  { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; isAdmin: boolean } |
  { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  const [admin, hasPerm] = await Promise.all([
    isAdminUser(user.id),
    hasSubPagePerm(user.id, subPageCode, action),
  ])
  if (!admin && !hasPerm) {
    return { ok: false, response: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true, user, isAdmin: admin }
}

/**
 * Xây dựng mảng permission strings cho AppShell (sidebar visibility).
 * Admin → full access.
 * Non-admin → đọc từ user_dept_permissions + user_effective_permissions (backward compat)
 */
const ADMIN_LEGACY = [
  'admin:users',
  'kho:read', 'kho:write', 'kho:delete',
  'sua_chua:read', 'sua_chua:write', 'sua_chua:delete',
  'ho_tro:read', 'ho_tro:write', 'ho_tro:admin', 'ho_tro:delete',
  'chat_luong:read', 'chat_luong:write',
  'chung_nhan:read', 'chung_nhan:write',
  'gui_hang:read', 'gui_hang:write', 'gui_hang:delete',
  'kho_daily:read', 'kho_daily:write',
  'tai_lieu:read', 'tai_lieu:write',
  'huong_dan:read', 'huong_dan:write',
]

const SUB_TO_LEGACY: Record<string, string> = {
  thiet_bi_danh_sach:  'kho:read',
  thiet_bi_tinh_nang:  'kho:read',
  thiet_bi_xe:         'kho:read',
  sua_chua_main:       'sua_chua:read',
  hotro_bang_thong_ke: 'ho_tro:read',
  hotro_jira_bugs:     'ho_tro:read',
  chat_luong_main:     'chat_luong:read',
  giay_chung_nhan_main:'chung_nhan:read',
  giao_hang_main:      'gui_hang:read',
}

export async function buildAppShellPerms(userId: string): Promise<string[]> {
  const admin = await isAdminUser(userId)
  if (admin) return ADMIN_LEGACY

  const result = new Set<string>()

  // Hệ thống mới: user_dept_permissions
  const permKeys = await getUserPermKeys(userId)
  for (const key of permKeys) result.add(key)

  // Hệ thống cũ: user_effective_permissions (backward compat)
  const { data } = await adminDb()
    .from('user_effective_permissions')
    .select('sub_page_code, can_read, can_create, can_update, can_delete')
    .eq('user_id', userId)

  for (const row of data ?? []) {
    if (!row.can_read) continue
    const legacy = SUB_TO_LEGACY[row.sub_page_code]
    if (legacy) result.add(legacy)
    if (row.can_create) {
      const writeVariant = legacy?.replace(':read', ':write')
      if (writeVariant) result.add(writeVariant)
    }
  }

  return Array.from(result)
}
